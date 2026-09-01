package dataforseo

import (
	"errors"
	"fmt"
	"strings"
)

// ErrorCode classifies DataForSEO client failures for callers.
type ErrorCode string

const (
	ErrorCodeAuthFailed          ErrorCode = "dataforseo_auth_failed"
	ErrorCodeRateLimited         ErrorCode = "dataforseo_rate_limited"
	ErrorCodeUpstreamUnavailable ErrorCode = "dataforseo_upstream_unavailable"
	ErrorCodeValidation          ErrorCode = "dataforseo_validation_error"
	ErrorCodeTaskFailed          ErrorCode = "dataforseo_task_failed"
	ErrorCodeInvalidResponse     ErrorCode = "dataforseo_invalid_response"
)

// Error is a typed DataForSEO client error.
type Error struct {
	Code       ErrorCode
	Message    string
	StatusCode int
	Path       string
	Billing    *APICallCost
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
	message := fmt.Sprintf("DataForSEO HTTP %d", statusCode)
	if trimmed := truncate(body, 300); trimmed != "" {
		message = fmt.Sprintf("%s: %s", message, trimmed)
	}

	switch {
	case statusCode == 401:
		return newError(ErrorCodeAuthFailed, message, path, statusCode)
	case statusCode == 429:
		return newError(ErrorCodeRateLimited, message, path, statusCode)
	case statusCode >= 500:
		return newError(ErrorCodeUpstreamUnavailable, message, path, statusCode)
	default:
		return newError(ErrorCodeTaskFailed, message, path, statusCode)
	}
}

func truncate(value string, max int) string {
	trimmed := strings.TrimSpace(value)
	if len(trimmed) <= max {
		return trimmed
	}
	return trimmed[:max] + "..."
}

// IsNoResultsTask reports whether DataForSEO returned a billed empty result set.
func IsNoResultsTask(task *Task) bool {
	if task == nil {
		return false
	}
	return strings.Contains(strings.ToLower(task.StatusMessage), "no search results")
}

// IsTaskInProgress reports whether a queued task is still pending collection.
func IsTaskInProgress(task *Task) bool {
	if task == nil || task.StatusCode == 0 {
		return false
	}
	switch task.StatusCode {
	case 20100, 40601, 40602:
		return true
	default:
		return false
	}
}

// AsError unwraps a *Error from err.
func AsError(err error) (*Error, bool) {
	var typed *Error
	if errors.As(err, &typed) {
		return typed, true
	}
	return nil, false
}
