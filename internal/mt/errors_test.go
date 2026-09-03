package mt

import (
	"fmt"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestErrorErrorNilReceiver(t *testing.T) {
	var err *Error

	require.Equal(t, "<nil>", err.Error())
}

func TestErrorErrorFormatting(t *testing.T) {
	withPath := &Error{Code: ErrorCodeAuthFailed, Message: "invalid credentials", Path: "/translate"}
	require.Equal(t, "mt_auth_failed: invalid credentials (/translate)", withPath.Error())

	withoutPath := &Error{Code: ErrorCodeRateLimited, Message: "too many requests"}
	require.Equal(t, "mt_rate_limited: too many requests", withoutPath.Error())
}

func TestAsErrorDirectMatch(t *testing.T) {
	original := &Error{Code: ErrorCodeValidation, Message: "bad request"}

	typed, ok := AsError(original)

	require.True(t, ok)
	require.Same(t, original, typed)
}

func TestAsErrorThroughWrap(t *testing.T) {
	original := &Error{Code: ErrorCodeUpstreamUnavailable, Message: "service down"}
	wrapped := fmt.Errorf("vendor request failed: %w", original)

	typed, ok := AsError(wrapped)

	require.True(t, ok)
	require.Same(t, original, typed)
}

func TestAsErrorNoMatch(t *testing.T) {
	typed, ok := AsError(fmt.Errorf("plain error"))

	require.False(t, ok)
	require.Nil(t, typed)
}
