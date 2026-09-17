package aisdk

import (
	"context"
	"errors"
	"fmt"
	"strings"
)

// ErrorCode classifies evaluation client failures.
type ErrorCode string

const (
	ErrorCodeInvalidArgument ErrorCode = "invalid_argument"
	ErrorCodeInvalidResponse ErrorCode = "invalid_response"
	ErrorCodeUnsupportedType ErrorCode = "unsupported_question_type"
	ErrorCodeAuthFailed      ErrorCode = "auth_failed"
	ErrorCodeRateLimited     ErrorCode = "rate_limited"
	ErrorCodeUpstream        ErrorCode = "upstream_error"
)

// Error is a typed evaluation failure.
type Error struct {
	Code       ErrorCode
	Message    string
	StatusCode int
	QuestionID string
}

func (e *Error) Error() string {
	if e == nil {
		return "<nil>"
	}
	if e.QuestionID != "" {
		return fmt.Sprintf("aisdk: %s: %s (question %s)", e.Code, e.Message, e.QuestionID)
	}
	return fmt.Sprintf("aisdk: %s: %s", e.Code, e.Message)
}

func newError(code ErrorCode, message string) *Error {
	return &Error{Code: code, Message: message}
}

func invalidArgument(message string) *Error {
	return newError(ErrorCodeInvalidArgument, message)
}

func invalidResponse(message string) *Error {
	return newError(ErrorCodeInvalidResponse, message)
}

func httpError(statusCode int, body string) *Error {
	message := fmt.Sprintf("AI Gateway HTTP %d", statusCode)
	if trimmed := truncate(body, 300); trimmed != "" {
		message = fmt.Sprintf("%s: %s", message, trimmed)
	}

	switch {
	case statusCode == 401 || statusCode == 403:
		return &Error{Code: ErrorCodeAuthFailed, Message: message, StatusCode: statusCode}
	case statusCode == 429:
		return &Error{Code: ErrorCodeRateLimited, Message: message, StatusCode: statusCode}
	case statusCode >= 500:
		return &Error{Code: ErrorCodeUpstream, Message: message, StatusCode: statusCode}
	default:
		return &Error{Code: ErrorCodeUpstream, Message: message, StatusCode: statusCode}
	}
}

func truncate(value string, max int) string {
	trimmed := strings.TrimSpace(value)
	if len(trimmed) <= max {
		return trimmed
	}
	return trimmed[:max] + "..."
}

func isTransient(err error) bool {
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		return false
	}
	var typed *Error
	if errors.As(err, &typed) {
		return typed.Code == ErrorCodeRateLimited || (typed.Code == ErrorCodeUpstream && typed.StatusCode >= 500)
	}
	return true
}
