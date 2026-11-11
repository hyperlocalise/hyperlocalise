package fal

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

// ErrorCode classifies fal.ai client failures for callers.
type ErrorCode string

const (
	ErrorCodeAuthFailed          ErrorCode = "fal_auth_failed"
	ErrorCodeRateLimited         ErrorCode = "fal_rate_limited"
	ErrorCodeValidation          ErrorCode = "fal_validation_error"
	ErrorCodeUpstreamUnavailable ErrorCode = "fal_upstream_unavailable"
	ErrorCodeUpstream            ErrorCode = "fal_upstream_error"
	ErrorCodeInvalidResponse     ErrorCode = "fal_invalid_response"
)

// Error is a typed fal.ai client error.
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
			Detail  string `json:"detail"`
			Message string `json:"message"`
			Error   string `json:"error"`
		}
		if err := json.Unmarshal([]byte(trimmed), &payload); err == nil {
			for _, value := range []string{payload.Detail, payload.Message, payload.Error} {
				if strings.TrimSpace(value) != "" {
					return strings.TrimSpace(value)
				}
			}
		}
	}
	snippet := truncate(trimmed, 300)
	if snippet == "" {
		return fmt.Sprintf("fal HTTP %d", statusCode)
	}
	return fmt.Sprintf("fal HTTP %d: %s", statusCode, snippet)
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
