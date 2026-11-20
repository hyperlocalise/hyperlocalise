package exa

import (
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"
)

// ErrorCode classifies Exa client failures for callers.
type ErrorCode string

const (
	ErrorCodeAuthFailed          ErrorCode = "exa_auth_failed"
	ErrorCodePaymentRequired     ErrorCode = "exa_payment_required"
	ErrorCodeRateLimited         ErrorCode = "exa_rate_limited"
	ErrorCodeValidation          ErrorCode = "exa_validation_error"
	ErrorCodeUpstreamUnavailable ErrorCode = "exa_upstream_unavailable"
	ErrorCodeUpstream            ErrorCode = "exa_upstream_error"
	ErrorCodeInvalidResponse     ErrorCode = "exa_invalid_response"
)

// Error is a typed Exa client error.
type Error struct {
	Code       ErrorCode
	Message    string
	StatusCode int
	Path       string
	RequestID  string
	Tag        string
	RetryAfter time.Duration
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

func httpError(statusCode int, path, body, requestID, retryAfter string) *Error {
	parsed := parseErrorBody(body)
	message := parsed.Error
	if message == "" {
		message = messageFromBody(statusCode, body)
	}
	code := errorCodeForStatus(statusCode)
	err := newError(code, message, path, statusCode)
	err.RequestID = firstNonEmpty(parsed.RequestID, requestID)
	err.Tag = parsed.Tag
	if seconds, convErr := strconv.Atoi(strings.TrimSpace(retryAfter)); convErr == nil && seconds > 0 {
		err.RetryAfter = time.Duration(seconds) * time.Second
	}
	return err
}

func errorCodeForStatus(statusCode int) ErrorCode {
	switch {
	case statusCode == 401 || statusCode == 403:
		return ErrorCodeAuthFailed
	case statusCode == 402:
		return ErrorCodePaymentRequired
	case statusCode == 429:
		return ErrorCodeRateLimited
	case statusCode == 400 || statusCode == 422:
		return ErrorCodeValidation
	case statusCode >= 500:
		return ErrorCodeUpstreamUnavailable
	default:
		return ErrorCodeUpstream
	}
}

type errorEnvelope struct {
	RequestID string `json:"requestId"`
	Error     string `json:"error"`
	Tag       string `json:"tag"`
}

func parseErrorBody(body string) errorEnvelope {
	trimmed := strings.TrimSpace(body)
	if trimmed == "" {
		return errorEnvelope{}
	}
	var payload errorEnvelope
	if err := json.Unmarshal([]byte(trimmed), &payload); err != nil {
		return errorEnvelope{}
	}
	payload.RequestID = strings.TrimSpace(payload.RequestID)
	payload.Error = strings.TrimSpace(payload.Error)
	payload.Tag = strings.TrimSpace(payload.Tag)
	return payload
}

func messageFromBody(statusCode int, body string) string {
	snippet := truncate(body, 300)
	if snippet == "" {
		return fmt.Sprintf("Exa HTTP %d", statusCode)
	}
	return fmt.Sprintf("Exa HTTP %d: %s", statusCode, snippet)
}

func truncate(value string, max int) string {
	trimmed := strings.TrimSpace(value)
	if len(trimmed) <= max {
		return trimmed
	}
	return trimmed[:max] + "..."
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

// AsError unwraps a *Error from err.
func AsError(err error) (*Error, bool) {
	var typed *Error
	if errors.As(err, &typed) {
		return typed, true
	}
	return nil, false
}
