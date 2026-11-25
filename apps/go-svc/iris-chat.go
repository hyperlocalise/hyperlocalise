package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/autumn"
)

const (
	// irisChatEventOpen tells the handler the gateway accepted the turn, so
	// its input is paid for even if the stream ends early. It is never sent
	// to the client.
	irisChatEventOpen = "open"

	irisChatModelID   = "hyperlocalise-ai-iris"
	irisChatGatewayID = "anthropic/claude-opus-4.5"
	irisChatMaxMsgs   = 80
)

type irisChatBody struct {
	Model    string            `json:"model"`
	Messages []irisChatMessage `json:"messages"`
	Tools    []irisChatTool    `json:"tools,omitempty"`
}

type irisChatMessage struct {
	Role       string             `json:"role"`
	Content    any                `json:"content,omitempty"`
	ToolCallID string             `json:"tool_call_id,omitempty"`
	Name       string             `json:"name,omitempty"`
	ToolCalls  []irisChatToolCall `json:"tool_calls,omitempty"`
}

type irisChatToolCall struct {
	ID       string `json:"id"`
	Type     string `json:"type,omitempty"`
	Index    int    `json:"index,omitempty"`
	Function struct {
		Name      string `json:"name"`
		Arguments string `json:"arguments"`
	} `json:"function"`
}

type irisChatTool struct {
	Type     string `json:"type"`
	Function struct {
		Name        string `json:"name"`
		Description string `json:"description,omitempty"`
		Parameters  any    `json:"parameters,omitempty"`
	} `json:"function"`
}

type irisChatStreamEvent struct {
	Type      string         `json:"type"`
	Text      string         `json:"text,omitempty"`
	ID        string         `json:"id,omitempty"`
	Name      string         `json:"name,omitempty"`
	Arguments string         `json:"arguments,omitempty"`
	Usage     *irisChatUsage `json:"usage,omitempty"`
	Code      string         `json:"code,omitempty"`
	Message   string         `json:"message,omitempty"`
}

type irisChatUsage struct {
	InputTokens  int `json:"inputTokens"`
	OutputTokens int `json:"outputTokens"`
}

type irisChatStreamRequest struct {
	GatewayModel string
	Messages     []map[string]any
	Tools        []map[string]any
}

type irisChatStreamer interface {
	StreamChat(ctx context.Context, req irisChatStreamRequest, emit func(irisChatStreamEvent) error) error
}

func (api *irisGenerationAPI) registerChat(mux *http.ServeMux, verifier SessionVerifier) {
	registerAuthenticated(mux, verifier, "POST "+irisGenerationPath+"/chat", http.HandlerFunc(api.chat))
}

func irisChatModelAccepted(id string) bool {
	switch strings.TrimSpace(id) {
	case "", irisChatModelID:
		return true
	default:
		return false
	}
}

func (api *irisGenerationAPI) chat(w http.ResponseWriter, r *http.Request) {
	scope, ok := api.scope(w, r)
	if !ok {
		return
	}
	var body irisChatBody
	if !decodeIrisBody(w, r, &body) {
		return
	}
	if !irisChatModelAccepted(body.Model) {
		writeJSON(w, http.StatusBadRequest, map[string]string{
			"error":   "invalid_input",
			"message": "Unknown chat model",
		})
		return
	}
	messages, err := irisChatGatewayMessages(body.Messages)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_input", "message": err.Error()})
		return
	}
	if status, code, message, allowed := api.ensureAIAllowed(r.Context(), scope.OrganizationID); !allowed {
		writeJSON(w, status, map[string]string{"error": code, "message": message})
		return
	}
	if api.text == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{
			"error":   "service_unavailable",
			"message": "Chat is not configured",
		})
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		writeJSON(w, http.StatusInternalServerError, map[string]string{
			"error":   "internal_error",
			"message": "Streaming is not available",
		})
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	emit := func(event irisChatStreamEvent) error {
		payload, err := json.Marshal(event)
		if err != nil {
			return err
		}
		if _, err := fmt.Fprintf(w, "data: %s\n\n", payload); err != nil {
			return err
		}
		flusher.Flush()
		return nil
	}

	usage := irisChatReply{Model: irisChatGatewayID}
	opened := false
	emittedChars := 0
	record := func(event irisChatStreamEvent) error {
		switch event.Type {
		case irisChatEventOpen:
			opened = true
			return nil
		case "done":
			if event.Usage != nil {
				usage.InputTokens = event.Usage.InputTokens
				usage.OutputTokens = event.Usage.OutputTokens
			}
		default:
			emittedChars += len(event.Text) + len(event.Name) + len(event.Arguments)
		}
		return emit(event)
	}

	tools := irisChatGatewayTools(body.Tools)
	streamErr := api.streamChat(r.Context(), irisChatStreamRequest{
		GatewayModel: irisChatGatewayID,
		Messages:     messages,
		Tools:        tools,
	}, record)
	// The gateway bills a turn that was stopped or failed after it started,
	// but reports usage only at the end, so such a turn is charged on an
	// estimate from what was sent and what came back.
	estimated := false
	if usage.InputTokens+usage.OutputTokens == 0 && opened {
		usage.InputTokens = irisEstimatedTokens(len(mustJSON(messages)) + len(mustJSON(tools)))
		usage.OutputTokens = irisEstimatedTokens(emittedChars)
		estimated = true
	}
	api.trackChat(r.Context(), scope, usage, estimated)
	if streamErr != nil {
		slog.WarnContext(r.Context(), "iris_chat_failed", "organization_id", scope.OrganizationID, "error", streamErr)
		_ = emit(irisChatStreamEvent{
			Type:    "error",
			Code:    "chat_failed",
			Message: "Could not complete the turn",
		})
	}
}

func (api *irisGenerationAPI) streamChat(ctx context.Context, req irisChatStreamRequest, emit func(irisChatStreamEvent) error) error {
	if streamer, ok := api.text.(irisChatStreamer); ok {
		return streamer.StreamChat(ctx, req, emit)
	}
	content, err := irisChatPlainContent(req.Messages)
	if err != nil {
		return err
	}
	reply, err := api.text.Complete(ctx, irisChatRequest{
		Model: req.GatewayModel,
		User:  content,
	})
	if err != nil {
		return err
	}
	if strings.TrimSpace(reply.Text) != "" {
		if err := emit(irisChatStreamEvent{Type: "delta", Text: reply.Text}); err != nil {
			return err
		}
	}
	return emit(irisChatStreamEvent{
		Type: "done",
		Usage: &irisChatUsage{
			InputTokens:  reply.InputTokens,
			OutputTokens: reply.OutputTokens,
		},
	})
}

func (api *irisGenerationAPI) trackChat(ctx context.Context, scope irisOrgScope, usage irisChatReply, estimated bool) {
	dimensions := map[string]any{"product_model": irisChatModelID}
	if estimated {
		dimensions["usage_estimated"] = true
	}
	api.charge(ctx, scope, irisCharge{
		OperationKey: irisOperationKey("iris-chat"),
		Source:       irisSourceChat,
		Track: autumn.TrackTokensRequest{
			ModelID:      usage.Model,
			InputTokens:  usage.InputTokens,
			OutputTokens: usage.OutputTokens,
			Properties:   map[string]any{"feature": "iris_chat", "user_id": scope.UserID, "product_model": irisChatModelID},
		},
		Dimensions: dimensions,
	})
}

func irisChatGatewayMessages(messages []irisChatMessage) ([]map[string]any, error) {
	if len(messages) == 0 {
		return nil, fmt.Errorf("messages are required")
	}
	if len(messages) > irisChatMaxMsgs {
		return nil, fmt.Errorf("too many messages")
	}
	out := make([]map[string]any, 0, len(messages))
	for _, message := range messages {
		role := strings.ToLower(strings.TrimSpace(message.Role))
		switch role {
		case "system", "user", "assistant", "tool":
		default:
			return nil, fmt.Errorf("unsupported message role")
		}
		entry := map[string]any{"role": role}
		if message.Content != nil {
			entry["content"] = message.Content
		}
		if id := strings.TrimSpace(message.ToolCallID); id != "" {
			entry["tool_call_id"] = id
		}
		if name := strings.TrimSpace(message.Name); name != "" {
			entry["name"] = name
		}
		if len(message.ToolCalls) > 0 {
			calls := make([]map[string]any, 0, len(message.ToolCalls))
			for _, call := range message.ToolCalls {
				id := strings.TrimSpace(call.ID)
				name := strings.TrimSpace(call.Function.Name)
				if id == "" || name == "" {
					return nil, fmt.Errorf("tool calls need an id and name")
				}
				kind := strings.TrimSpace(call.Type)
				if kind == "" {
					kind = "function"
				}
				calls = append(calls, map[string]any{
					"id":   id,
					"type": kind,
					"function": map[string]any{
						"name":      name,
						"arguments": call.Function.Arguments,
					},
				})
			}
			entry["tool_calls"] = calls
		}
		out = append(out, entry)
	}
	return out, nil
}

func irisChatGatewayTools(tools []irisChatTool) []map[string]any {
	if len(tools) == 0 {
		return nil
	}
	out := make([]map[string]any, 0, len(tools))
	for _, tool := range tools {
		name := strings.TrimSpace(tool.Function.Name)
		if name == "" {
			continue
		}
		kind := strings.TrimSpace(tool.Type)
		if kind == "" {
			kind = "function"
		}
		fn := map[string]any{"name": name}
		if desc := strings.TrimSpace(tool.Function.Description); desc != "" {
			fn["description"] = desc
		}
		if tool.Function.Parameters != nil {
			fn["parameters"] = tool.Function.Parameters
		}
		out = append(out, map[string]any{"type": kind, "function": fn})
	}
	return out
}

func irisChatPlainContent(messages []map[string]any) (string, error) {
	var parts []string
	for _, message := range messages {
		role, _ := message["role"].(string)
		if role != "user" && role != "system" {
			continue
		}
		switch content := message["content"].(type) {
		case string:
			if trimmed := strings.TrimSpace(content); trimmed != "" {
				parts = append(parts, trimmed)
			}
		}
	}
	if len(parts) == 0 {
		return "", fmt.Errorf("messages are required")
	}
	return strings.Join(parts, "\n\n"), nil
}

func (p *irisGatewayProvider) StreamChat(ctx context.Context, req irisChatStreamRequest, emit func(irisChatStreamEvent) error) error {
	payload := map[string]any{
		"model":          p.modelID(req.GatewayModel),
		"messages":       req.Messages,
		"stream":         true,
		"stream_options": map[string]any{"include_usage": true},
	}
	if len(req.Tools) > 0 {
		payload["tools"] = req.Tools
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, p.baseURL+"/chat/completions", bytes.NewReader(mustJSON(payload)))
	if err != nil {
		return err
	}
	httpReq.Header.Set("Authorization", "Bearer "+p.apiKey)
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Accept", "text/event-stream")
	resp, err := p.httpClient.Do(httpReq)
	if err != nil {
		return err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 400))
		return fmt.Errorf("gateway chat failed: %s", truncate(string(body), 400))
	}
	if err := emit(irisChatStreamEvent{Type: irisChatEventOpen}); err != nil {
		return err
	}
	return readIrisChatGatewayStream(resp.Body, emit)
}

func readIrisChatGatewayStream(body io.Reader, emit func(irisChatStreamEvent) error) error {
	scanner := bufio.NewScanner(body)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	calls := map[int]*irisChatToolCall{}
	usage := irisChatUsage{}
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if data == "[DONE]" {
			break
		}
		var chunk struct {
			Choices []struct {
				Delta struct {
					Content   *string            `json:"content"`
					ToolCalls []irisChatToolCall `json:"tool_calls"`
				} `json:"delta"`
			} `json:"choices"`
			Usage struct {
				PromptTokens     int `json:"prompt_tokens"`
				CompletionTokens int `json:"completion_tokens"`
			} `json:"usage"`
		}
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			continue
		}
		if chunk.Usage.PromptTokens != 0 || chunk.Usage.CompletionTokens != 0 {
			usage.InputTokens = chunk.Usage.PromptTokens
			usage.OutputTokens = chunk.Usage.CompletionTokens
		}
		if len(chunk.Choices) == 0 {
			continue
		}
		delta := chunk.Choices[0].Delta
		if delta.Content != nil && *delta.Content != "" {
			if err := emit(irisChatStreamEvent{Type: "delta", Text: *delta.Content}); err != nil {
				return err
			}
		}
		for _, call := range delta.ToolCalls {
			current := calls[call.Index]
			if current == nil {
				copied := call
				calls[call.Index] = &copied
				continue
			}
			if call.ID != "" {
				current.ID = call.ID
			}
			if call.Function.Name != "" {
				current.Function.Name = call.Function.Name
			}
			current.Function.Arguments += call.Function.Arguments
		}
	}
	if err := scanner.Err(); err != nil {
		return err
	}
	indexes := make([]int, 0, len(calls))
	for index := range calls {
		indexes = append(indexes, index)
	}
	for i := 0; i < len(indexes); i++ {
		for j := i + 1; j < len(indexes); j++ {
			if indexes[j] < indexes[i] {
				indexes[i], indexes[j] = indexes[j], indexes[i]
			}
		}
	}
	for _, index := range indexes {
		call := calls[index]
		if call == nil || strings.TrimSpace(call.ID) == "" || strings.TrimSpace(call.Function.Name) == "" {
			continue
		}
		if err := emit(irisChatStreamEvent{
			Type:      "tool_call",
			ID:        call.ID,
			Name:      call.Function.Name,
			Arguments: call.Function.Arguments,
		}); err != nil {
			return err
		}
	}
	return emit(irisChatStreamEvent{Type: "done", Usage: &usage})
}
