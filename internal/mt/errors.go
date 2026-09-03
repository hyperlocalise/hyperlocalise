package mt

import (
	"errors"
	"fmt"
)

type ErrorCode string

const (
	ErrorCodeAuthFailed              ErrorCode = "mt_auth_failed"
	ErrorCodeRateLimited             ErrorCode = "mt_rate_limited"
	ErrorCodeUnsupportedLanguagePair ErrorCode = "mt_unsupported_language_pair"
	ErrorCodeValidation              ErrorCode = "mt_validation_error"
	ErrorCodeUpstreamUnavailable     ErrorCode = "mt_upstream_unavailable"
	ErrorCodeUpstream                ErrorCode = "mt_upstream_error"
)

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

func AsError(err error) (*Error, bool) {
	var typed *Error
	if errors.As(err, &typed) {
		return typed, true
	}
	return nil, false
}
