package gsc

import (
	"errors"
	"fmt"
	"strings"
)

// ErrorCode classifies Search Console client failures for callers.
type ErrorCode string

const (
	ErrorCodeAuthFailed          ErrorCode = "gsc_auth_failed"
	ErrorCodeRateLimited         ErrorCode = "gsc_rate_limited"
	ErrorCodeNotFound            ErrorCode = "gsc_not_found"
	ErrorCodeUpstreamUnavailable ErrorCode = "gsc_upstream_unavailable"
	ErrorCodeValidation          ErrorCode = "gsc_validation_error"
	ErrorCodeAPI                 ErrorCode = "gsc_api_error"
)

// Error is a typed Search Console client error.
type Error struct {
	Code       ErrorCode
	Message    string
	StatusCode int
	Path       string
	Body       string
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

func newError(code ErrorCode, message, path string, statusCode int, body string) *Error {
	return &Error{
		Code:       code,
		Message:    message,
		StatusCode: statusCode,
		Path:       path,
		Body:       body,
	}
}

func httpError(statusCode int, path, body string) *Error {
	message := messageForStatus(statusCode, body)

	switch {
	case statusCode == 401 || statusCode == 403:
		return newError(ErrorCodeAuthFailed, message, path, statusCode, body)
	case statusCode == 404:
		return newError(ErrorCodeNotFound, message, path, statusCode, body)
	case statusCode == 429:
		return newError(ErrorCodeRateLimited, message, path, statusCode, body)
	case statusCode >= 500:
		return newError(ErrorCodeUpstreamUnavailable, message, path, statusCode, body)
	default:
		return newError(ErrorCodeAPI, message, path, statusCode, body)
	}
}

func messageForStatus(status int, body string) string {
	switch status {
	case 401, 403:
		return "Search Console denied access to this property (no verified permission, or the connection was revoked)."
	case 429:
		return "Search Console rate limit reached. Retry shortly."
	case 404:
		return "Search Console property not found. It may have been removed in Search Console."
	default:
		snippet := truncate(body, 300)
		if snippet == "" {
			return fmt.Sprintf("Search Console API error (%d)", status)
		}
		return fmt.Sprintf("Search Console API error (%d): %s", status, snippet)
	}
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
