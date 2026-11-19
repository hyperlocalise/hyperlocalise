package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/autumn"
	"github.com/stretchr/testify/require"
)

type stubIrisChatStream struct {
	reply   string
	request irisChatStreamRequest
	calls   []irisChatToolCall
	usage   irisChatUsage
	err     error
}

func (s *stubIrisChatStream) Complete(context.Context, irisChatRequest) (irisChatReply, error) {
	return irisChatReply{}, nil
}

func (s *stubIrisChatStream) StreamChat(_ context.Context, req irisChatStreamRequest, emit func(irisChatStreamEvent) error) error {
	s.request = req
	if s.err != nil {
		return s.err
	}
	if s.reply != "" {
		if err := emit(irisChatStreamEvent{Type: "delta", Text: s.reply}); err != nil {
			return err
		}
	}
	for _, call := range s.calls {
		if err := emit(irisChatStreamEvent{
			Type:      "tool_call",
			ID:        call.ID,
			Name:      call.Function.Name,
			Arguments: call.Function.Arguments,
		}); err != nil {
			return err
		}
	}
	return emit(irisChatStreamEvent{Type: "done", Usage: &s.usage})
}

func irisChatAPI(t *testing.T, text irisTextModel, meter *stubIrisMeter) *irisGenerationAPI {
	t.Helper()
	api := newIrisGenerationFixture(t, &stubIrisProvider{})
	api.text = text
	api.meter = meter
	return api
}

func readIrisChatSSE(t *testing.T, rec *httptest.ResponseRecorder) []irisChatStreamEvent {
	t.Helper()
	scanner := bufio.NewScanner(bytes.NewReader(rec.Body.Bytes()))
	var events []irisChatStreamEvent
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		var event irisChatStreamEvent
		require.NoError(t, json.Unmarshal([]byte(strings.TrimSpace(strings.TrimPrefix(line, "data:"))), &event))
		events = append(events, event)
	}
	require.NoError(t, scanner.Err())
	return events
}

func TestIrisChatRequiresPaidAI(t *testing.T) {
	meter := &stubIrisMeter{features: false, tokens: true}
	api := irisChatAPI(t, &stubIrisChatStream{reply: "hi"}, meter)
	rec := irisRequest(api, http.MethodPost, irisTestPath+"/chat", map[string]any{
		"model":    irisChatModelID,
		"messages": []map[string]any{{"role": "user", "content": "hello"}},
	})
	require.Equal(t, http.StatusForbidden, rec.Code)
	var body map[string]string
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Equal(t, "ai_features_required", body["error"])
}

func TestIrisChatRequiresCredit(t *testing.T) {
	meter := &stubIrisMeter{features: true, tokens: false}
	api := irisChatAPI(t, &stubIrisChatStream{reply: "hi"}, meter)
	rec := irisRequest(api, http.MethodPost, irisTestPath+"/chat", map[string]any{
		"messages": []map[string]any{{"role": "user", "content": "hello"}},
	})
	require.Equal(t, http.StatusPaymentRequired, rec.Code)
	var body map[string]string
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Equal(t, "ai_credit_exhausted", body["error"])
}

func TestIrisChatRejectsUnknownModel(t *testing.T) {
	meter := &stubIrisMeter{features: true, tokens: true}
	api := irisChatAPI(t, &stubIrisChatStream{reply: "hi"}, meter)
	rec := irisRequest(api, http.MethodPost, irisTestPath+"/chat", map[string]any{
		"model":    "other",
		"messages": []map[string]any{{"role": "user", "content": "hello"}},
	})
	require.Equal(t, http.StatusBadRequest, rec.Code)
	var body map[string]string
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Equal(t, "invalid_input", body["error"])
}

func TestIrisChatRejectsInvalidMessagesBeforeBilling(t *testing.T) {
	meter := &stubIrisMeter{features: false, tokens: false}
	api := irisChatAPI(t, &stubIrisChatStream{reply: "hi"}, meter)

	tooMany := make([]map[string]any, irisChatMaxMsgs+1)
	for i := range tooMany {
		tooMany[i] = map[string]any{"role": "user", "content": "x"}
	}

	cases := []struct {
		name     string
		messages any
		message  string
	}{
		{name: "missing", messages: []map[string]any{}, message: "messages are required"},
		{name: "too many", messages: tooMany, message: "too many messages"},
		{name: "unknown role", messages: []map[string]any{{"role": "developer", "content": "hi"}}, message: "unsupported message role"},
		{
			name: "tool call without id",
			messages: []map[string]any{{
				"role": "assistant",
				"tool_calls": []map[string]any{{
					"function": map[string]any{"name": "capture"},
				}},
			}},
			message: "tool calls need an id and name",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rec := irisRequest(api, http.MethodPost, irisTestPath+"/chat", map[string]any{
				"messages": tc.messages,
			})
			require.Equal(t, http.StatusBadRequest, rec.Code, rec.Body.String())
			var body map[string]string
			require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
			require.Equal(t, "invalid_input", body["error"])
			require.Equal(t, tc.message, body["message"])
			require.Empty(t, meter.tokenTracks)
		})
	}
}

func TestIrisChatGatewayMessagesAndTools(t *testing.T) {
	_, err := irisChatGatewayMessages(nil)
	require.EqualError(t, err, "messages are required")

	call := irisChatToolCall{ID: " call_1 "}
	call.Function.Name = " capture "
	call.Function.Arguments = `{"ok":true}`
	messages, err := irisChatGatewayMessages([]irisChatMessage{
		{Role: " USER ", Content: "hello", Name: " writer "},
		{Role: "assistant", ToolCalls: []irisChatToolCall{call}},
	})
	require.NoError(t, err)
	require.Equal(t, "user", messages[0]["role"])
	require.Equal(t, "writer", messages[0]["name"])
	require.Equal(t, []map[string]any{{
		"id":   "call_1",
		"type": "function",
		"function": map[string]any{
			"name":      "capture",
			"arguments": `{"ok":true}`,
		},
	}}, messages[1]["tool_calls"])

	require.Nil(t, irisChatGatewayTools(nil))
	named := irisChatTool{}
	named.Function.Name = " capture "
	named.Function.Description = " Preview "
	named.Function.Parameters = map[string]any{"type": "object"}
	blank := irisChatTool{}
	blank.Function.Name = "   "
	require.Equal(t, []map[string]any{{
		"type": "function",
		"function": map[string]any{
			"name":        "capture",
			"description": "Preview",
			"parameters":  map[string]any{"type": "object"},
		},
	}}, irisChatGatewayTools([]irisChatTool{named, blank}))
}

func TestIrisChatUnavailableWhenTextModelMissing(t *testing.T) {
	api := irisChatAPI(t, nil, &stubIrisMeter{features: true, tokens: true})
	rec := irisRequest(api, http.MethodPost, irisTestPath+"/chat", map[string]any{
		"messages": []map[string]any{{"role": "user", "content": "hello"}},
	})
	require.Equal(t, http.StatusServiceUnavailable, rec.Code)
	var body map[string]string
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Equal(t, "service_unavailable", body["error"])
}

func TestIrisChatStreamsProductModel(t *testing.T) {
	meter := &stubIrisMeter{features: true, tokens: true}
	stream := &stubIrisChatStream{
		reply: "edited",
		usage: irisChatUsage{InputTokens: 11, OutputTokens: 4},
	}
	api := irisChatAPI(t, stream, meter)
	rec := irisRequest(api, http.MethodPost, irisTestPath+"/chat", map[string]any{
		"model": irisChatModelID,
		"messages": []map[string]any{
			{"role": "system", "content": "stay on the creative"},
			{"role": "user", "content": "tighten the headline"},
		},
		"tools": []map[string]any{
			{"type": "function", "function": map[string]any{"name": "capture", "description": "Preview"}},
		},
	})
	require.Equal(t, http.StatusOK, rec.Code)
	require.Equal(t, "text/event-stream", rec.Header().Get("Content-Type"))
	events := readIrisChatSSE(t, rec)
	require.Equal(t, []irisChatStreamEvent{
		{Type: "delta", Text: "edited"},
		{Type: "done", Usage: &irisChatUsage{InputTokens: 11, OutputTokens: 4}},
	}, events)
	require.Equal(t, irisChatGatewayID, stream.request.GatewayModel)
	require.Len(t, stream.request.Messages, 2)
	require.Len(t, stream.request.Tools, 1)
	require.NotContains(t, rec.Body.String(), irisChatGatewayID)
	require.Len(t, meter.tokenTracks, 1)
	require.Equal(t, autumn.AITokens, meter.tokenTracks[0].FeatureID)
	require.Equal(t, irisChatGatewayID, meter.tokenTracks[0].ModelID)
	require.Equal(t, 11, meter.tokenTracks[0].InputTokens)
	require.Equal(t, 4, meter.tokenTracks[0].OutputTokens)
	require.Equal(t, irisChatModelID, meter.tokenTracks[0].Properties["product_model"])
}

func TestIrisChatIsNotAGenerationModel(t *testing.T) {
	_, ok := irisModelByID(irisChatModelID)
	require.False(t, ok)
	api := newIrisGenerationFixture(t, &stubIrisProvider{})
	rec := irisRequest(api, http.MethodGet, irisTestPath+"/models", nil)
	require.Equal(t, http.StatusOK, rec.Code)
	require.NotContains(t, rec.Body.String(), irisChatModelID)
}

func TestReadIrisChatGatewayStream(t *testing.T) {
	body := strings.Join([]string{
		`data: {"choices":[{"delta":{"content":"Hel"}}]}`,
		`data: {"choices":[{"delta":{"content":"lo"}}]}`,
		`data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"capture","arguments":"{"}}]}}]}`,
		`data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"}"}}]}}]}`,
		`data: {"choices":[],"usage":{"prompt_tokens":3,"completion_tokens":2}}`,
		`data: [DONE]`,
		"",
	}, "\n")
	var events []irisChatStreamEvent
	require.NoError(t, readIrisChatGatewayStream(strings.NewReader(body), func(event irisChatStreamEvent) error {
		events = append(events, event)
		return nil
	}))
	require.Equal(t, []irisChatStreamEvent{
		{Type: "delta", Text: "Hel"},
		{Type: "delta", Text: "lo"},
		{Type: "tool_call", ID: "call_1", Name: "capture", Arguments: "{}"},
		{Type: "done", Usage: &irisChatUsage{InputTokens: 3, OutputTokens: 2}},
	}, events)
}

func TestIrisGatewayStreamChatPostsManagedWriter(t *testing.T) {
	var payloads []map[string]any
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "/chat/completions", r.URL.Path)
		raw, err := io.ReadAll(r.Body)
		require.NoError(t, err)
		var payload map[string]any
		require.NoError(t, json.Unmarshal(raw, &payload))
		payloads = append(payloads, payload)
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = io.WriteString(w, "data: {\"choices\":[{\"delta\":{\"content\":\"ok\"}}]}\n\n")
		_, _ = io.WriteString(w, "data: {\"usage\":{\"prompt_tokens\":1,\"completion_tokens\":1}}\n\n")
		_, _ = io.WriteString(w, "data: [DONE]\n\n")
	}))
	t.Cleanup(server.Close)
	provider := &irisGatewayProvider{baseURL: server.URL, apiKey: "test-key", httpClient: server.Client()}
	var events []irisChatStreamEvent
	err := provider.StreamChat(context.Background(), irisChatStreamRequest{
		GatewayModel: irisChatGatewayID,
		Messages:     []map[string]any{{"role": "user", "content": "hi"}},
	}, func(event irisChatStreamEvent) error {
		events = append(events, event)
		return nil
	})
	require.NoError(t, err)
	require.Len(t, payloads, 1)
	require.Equal(t, irisChatGatewayID, payloads[0]["model"])
	require.Equal(t, true, payloads[0]["stream"])
	require.Equal(t, []irisChatStreamEvent{
		{Type: "delta", Text: "ok"},
		{Type: "done", Usage: &irisChatUsage{InputTokens: 1, OutputTokens: 1}},
	}, events)
}
