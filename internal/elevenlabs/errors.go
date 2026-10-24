package elevenlabs

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

// ErrorCode classifies ElevenLabs client failures for callers.
type ErrorCode string

const (
	ErrorCodeAuthFailed          ErrorCode = "elevenlabs_auth_failed"
	ErrorCodeRateLimited         ErrorCode = "elevenlabs_rate_limited"
	ErrorCodeValidation          ErrorCode = "elevenlabs_validation_error"
	ErrorCodeUpstreamUnavailable ErrorCode = "elevenlabs_upstream_unavailable"
	ErrorCodeUpstream            ErrorCode = "elevenlabs_upstream_error"
	ErrorCodeInvalidResponse     ErrorCode = "elevenlabs_invalid_response"
)

// Error is a typed ElevenLabs client error.
type Error struct {
	Code       ErrorCode
	Message    string
	StatusCode int
	Path       string
}

func (e *Error) Error() string {
	if e == nil {
		return "<nil>"
	}
	if e.Path != "" {
		return fmt.Sprintf("%s: %s (%s)", e.Code, e.Message, e.Path)
	}
	return fmt.Sprintf("%s: %s", e.Code, e.Message)
}

func newError(code ErrorCode, message, path string, statusCode int) *Error {
	return &Error{
		Code:       code,
		Message:    message,
		StatusCode: statusCode,
		Path:       path,
	}
}

func httpError(statusCode int, path, body string) *Error {
	message := messageFromBody(statusCode, body)
	switch {
	case statusCode == 401 || statusCode == 403:
		return newError(ErrorCodeAuthFailed, message, path, statusCode)
	case statusCode == 429:
		return newError(ErrorCodeRateLimited, message, path, statusCode)
	case statusCode == 400 || statusCode == 422:
		return newError(ErrorCodeValidation, message, path, statusCode)
	case statusCode >= 500:
		return newError(ErrorCodeUpstreamUnavailable, message, path, statusCode)
	default:
		return newError(ErrorCodeUpstream, message, path, statusCode)
	}
}

func messageFromBody(statusCode int, body string) string {
	trimmed := strings.TrimSpace(body)
	if trimmed != "" {
		var payload struct {
			Detail any `json:"detail"`
		}
		if err := json.Unmarshal([]byte(trimmed), &payload); err == nil {
			switch detail := payload.Detail.(type) {
			case string:
				if strings.TrimSpace(detail) != "" {
					return strings.TrimSpace(detail)
				}
			case map[string]any:
				if message, _ := detail["message"].(string); strings.TrimSpace(message) != "" {
					return strings.TrimSpace(message)
				}
			}
		}
	}
	snippet := truncate(trimmed, 300)
	if snippet == "" {
		return fmt.Sprintf("ElevenLabs HTTP %d", statusCode)
	}
	return fmt.Sprintf("ElevenLabs HTTP %d: %s", statusCode, snippet)
}

func truncate(value string, max int) string {
	trimmed := strings.TrimSpace(value)
	if len(trimmed) <= max {
		return trimmed
	}
	return trimmed[:max] + "..."
}

// AsError unwraps a *Error from err.
func AsError(err error) (*Error, bool) {
	var typed *Error
	if errors.As(err, &typed) {
		return typed, true
	}
	return nil, false
}
