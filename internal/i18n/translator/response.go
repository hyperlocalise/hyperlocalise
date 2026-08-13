package translator

import (
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/openai/openai-go/v3"
)

func responseText(resp *openai.ChatCompletion) (string, error) {
	if resp == nil {
		return "", fmt.Errorf("response is nil")
	}
	if len(resp.Choices) == 0 {
		return "", fmt.Errorf("no text generated")
	}

	choice := resp.Choices[0]
	if err := incompleteChoiceError(choice); err != nil {
		return "", err
	}

	text := sanitizeGeneratedText(choice.Message.Content)
	if text == "" {
		return "", fmt.Errorf("no text generated")
	}

	return text, nil
}

// incompleteChoiceError rejects completions that must not be written as successful
// translations. OpenRouter (and some OpenAI-compatible proxies) can return HTTP 200
// with finish_reason=error and partial content when an upstream provider fails after
// generation starts; accepting that content would silently corrupt locale files.
func incompleteChoiceError(choice openai.ChatCompletionChoice) error {
	if field, ok := choice.JSON.ExtraFields["error"]; ok {
		return errors.New(formatChoiceProviderError(field.Raw()))
	}

	switch strings.ToLower(strings.TrimSpace(choice.FinishReason)) {
	case "", "stop":
		return nil
	case "length":
		return fmt.Errorf("completion truncated (finish_reason=length)")
	case "content_filter":
		return fmt.Errorf("completion blocked by content filter")
	case "error":
		return fmt.Errorf("completion failed (finish_reason=error)")
	case "tool_calls", "function_call":
		return fmt.Errorf("completion returned %s instead of text", strings.TrimSpace(choice.FinishReason))
	default:
		return nil
	}
}

func formatChoiceProviderError(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "provider reported an error in the completion choice"
	}

	var payload struct {
		Code    json.RawMessage `json:"code"`
		Message string          `json:"message"`
	}
	if err := json.Unmarshal([]byte(raw), &payload); err != nil {
		return "provider reported an error in the completion choice: " + raw
	}

	message := strings.TrimSpace(payload.Message)
	code := parseFlexibleStatusCode(payload.Code)
	switch {
	case code != "" && message != "":
		// Include "status code NNN" so runsvc retry heuristics can treat transient
		// upstream failures (502/503/504) as retryable.
		return fmt.Sprintf("provider reported an error in the completion choice (status code %s): %s", code, message)
	case code != "":
		return fmt.Sprintf("provider reported an error in the completion choice (status code %s)", code)
	case message != "":
		return "provider reported an error in the completion choice: " + message
	default:
		return "provider reported an error in the completion choice: " + raw
	}
}

func parseFlexibleStatusCode(raw json.RawMessage) string {
	raw = json.RawMessage(strings.TrimSpace(string(raw)))
	if len(raw) == 0 || string(raw) == "null" {
		return ""
	}

	var asNumber float64
	if err := json.Unmarshal(raw, &asNumber); err == nil {
		if asNumber <= 0 {
			return ""
		}
		return strconv.FormatInt(int64(asNumber), 10)
	}

	var asString string
	if err := json.Unmarshal(raw, &asString); err == nil {
		asString = strings.TrimSpace(asString)
		if asString == "" {
			return ""
		}
		if n, err := strconv.Atoi(asString); err == nil && n > 0 {
			return strconv.Itoa(n)
		}
		return asString
	}

	return ""
}

func sanitizeGeneratedText(text string) string {
	trimmed := strings.TrimSpace(text)
	if trimmed == "" {
		return ""
	}

	// Some local model/chat templates append control markers to the assistant text.
	// Strip known trailing markers so they are not written into translation files.
	trailingMarkers := []string{
		"<|END_RESPONSE|>",
		"<|end_response|>",
		"<|eot_id|>",
		"<|end_of_text|>",
		"</s>",
	}

	// Remove marker occurrences even when they are embedded in the text.
	for _, marker := range trailingMarkers {
		trimmed = strings.ReplaceAll(trimmed, marker, "")
	}
	return strings.TrimSpace(trimmed)
}
