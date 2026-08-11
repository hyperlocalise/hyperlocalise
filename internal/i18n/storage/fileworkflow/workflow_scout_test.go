package fileworkflow

import (
	"context"
	"errors"
	"fmt"
	"testing"
	"time"
)

func TestError_FormattingAndUnwrap(t *testing.T) {
	t.Run("nil error", func(t *testing.T) {
		var err *Error
		if got := err.Error(); got != "" {
			t.Errorf("expected empty string for nil error, got %q", got)
		}
	})

	t.Run("error with code only", func(t *testing.T) {
		err := &Error{
			Code: ErrorCodeTimeout,
		}
		want := "timeout"
		if got := err.Error(); got != want {
			t.Errorf("err.Error() = %q, want %q", got, want)
		}
	})

	t.Run("error with code and message", func(t *testing.T) {
		err := &Error{
			Code:    ErrorCodeRemoteRejected,
			Message: "server is busy",
		}
		want := "remote_rejected: server is busy"
		if got := err.Error(); got != want {
			t.Errorf("err.Error() = %q, want %q", got, want)
		}
	})

	t.Run("unwrap error with cause", func(t *testing.T) {
		cause := errors.New("underlying socket error")
		err := &Error{
			Code:  ErrorCodeTimeout,
			Cause: cause,
		}
		if got := err.Unwrap(); got != cause {
			t.Errorf("err.Unwrap() = %v, want %v", got, cause)
		}
	})

	t.Run("unwrap error without cause", func(t *testing.T) {
		err := &Error{
			Code: ErrorCodeTimeout,
		}
		if got := err.Unwrap(); got != nil {
			t.Errorf("err.Unwrap() = %v, want nil", got)
		}
	})
}

func TestIsCode(t *testing.T) {
	customErr := &Error{
		Code:    ErrorCodeTimeout,
		Message: "poll timeout reached",
	}

	t.Run("nil error", func(t *testing.T) {
		if IsCode(nil, ErrorCodeTimeout) {
			t.Error("IsCode(nil) should be false")
		}
	})

	t.Run("standard error with non-matching type", func(t *testing.T) {
		stdErr := errors.New("standard error")
		if IsCode(stdErr, ErrorCodeTimeout) {
			t.Errorf("IsCode(%v) with non-matching type should be false", stdErr)
		}
	})

	t.Run("direct match", func(t *testing.T) {
		if !IsCode(customErr, ErrorCodeTimeout) {
			t.Errorf("expected IsCode to match %v with Code %s", customErr, ErrorCodeTimeout)
		}
	})

	t.Run("wrapped match", func(t *testing.T) {
		wrapped := fmt.Errorf("additional context: %w", customErr)
		if !IsCode(wrapped, ErrorCodeTimeout) {
			t.Errorf("expected IsCode to match wrapped error %v with Code %s", wrapped, ErrorCodeTimeout)
		}
	})

	t.Run("different error code", func(t *testing.T) {
		if IsCode(customErr, ErrorCodeRemoteRejected) {
			t.Errorf("IsCode matched code %s, but expected code %s", ErrorCodeRemoteRejected, ErrorCodeTimeout)
		}
	})
}

func TestRetryConfig_Normalize(t *testing.T) {
	t.Run("zero and negative values should be normalized", func(t *testing.T) {
		cfg := RetryConfig{
			MaxAttempts:  -5,
			InitialDelay: 0,
			MaxDelay:     -10 * time.Second,
			Multiplier:   0.5,
		}

		normalized := cfg.normalize()

		if normalized.MaxAttempts != 0 {
			t.Errorf("expected MaxAttempts to normalize to 0, got %d", normalized.MaxAttempts)
		}
		if normalized.InitialDelay != defaultRetryBase {
			t.Errorf("expected InitialDelay to normalize to defaultRetryBase (%v), got %v", defaultRetryBase, normalized.InitialDelay)
		}
		if normalized.MaxDelay != defaultRetryMax {
			t.Errorf("expected MaxDelay to normalize to defaultRetryMax (%v), got %v", defaultRetryMax, normalized.MaxDelay)
		}
		if normalized.Multiplier != defaultMultiplier {
			t.Errorf("expected Multiplier to normalize to defaultMultiplier (%v), got %v", defaultMultiplier, normalized.Multiplier)
		}
	})

	t.Run("positive custom values should be preserved", func(t *testing.T) {
		cfg := RetryConfig{
			MaxAttempts:  3,
			InitialDelay: 500 * time.Millisecond,
			MaxDelay:     10 * time.Second,
			Multiplier:   3.0,
		}

		normalized := cfg.normalize()

		if normalized.MaxAttempts != 3 {
			t.Errorf("expected MaxAttempts to be 3, got %d", normalized.MaxAttempts)
		}
		if normalized.InitialDelay != 500*time.Millisecond {
			t.Errorf("expected InitialDelay to be 500ms, got %v", normalized.InitialDelay)
		}
		if normalized.MaxDelay != 10*time.Second {
			t.Errorf("expected MaxDelay to be 10s, got %v", normalized.MaxDelay)
		}
		if normalized.Multiplier != 3.0 {
			t.Errorf("expected Multiplier to be 3.0, got %v", normalized.Multiplier)
		}
	})
}

func TestOptions_Normalize(t *testing.T) {
	t.Run("zero and nil values should be normalized with defaults", func(t *testing.T) {
		opts := Options{
			Timeout:      0,
			PollInterval: -1 * time.Second,
		}

		normalized := opts.normalize()

		if normalized.Timeout != defaultTimeout {
			t.Errorf("expected Timeout to normalize to defaultTimeout (%v), got %v", defaultTimeout, normalized.Timeout)
		}
		if normalized.PollInterval != defaultPollInterval {
			t.Errorf("expected PollInterval to normalize to defaultPollInterval (%v), got %v", defaultPollInterval, normalized.PollInterval)
		}
		if normalized.IsRetryable == nil {
			t.Error("expected IsRetryable to be non-nil helper function")
		} else {
			// Verify IsRetryable default always returns false
			if normalized.IsRetryable(errors.New("any error")) {
				t.Error("default IsRetryable function should return false")
			}
		}
		if normalized.Sleep == nil {
			t.Error("expected Sleep function to be non-nil")
		}
	})

	t.Run("custom values should be preserved", func(t *testing.T) {
		customSleep := func(ctx context.Context, d time.Duration) error {
			return nil
		}
		customIsRetryable := func(err error) bool {
			return true
		}

		opts := Options{
			Timeout:      10 * time.Second,
			PollInterval: 2 * time.Second,
			Sleep:        customSleep,
			IsRetryable:  customIsRetryable,
		}

		normalized := opts.normalize()

		if normalized.Timeout != 10*time.Second {
			t.Errorf("expected Timeout to be 10s, got %v", normalized.Timeout)
		}
		if normalized.PollInterval != 2*time.Second {
			t.Errorf("expected PollInterval to be 2s, got %v", normalized.PollInterval)
		}
		if normalized.IsRetryable == nil || !normalized.IsRetryable(errors.New("any")) {
			t.Error("expected custom IsRetryable function to be preserved")
		}
	})
}

func TestRetryDelay_CalculationAndCap(t *testing.T) {
	cfg := RetryConfig{
		InitialDelay: 100 * time.Millisecond,
		MaxDelay:     500 * time.Millisecond,
		Multiplier:   2.0,
	}

	t.Run("attempt 0", func(t *testing.T) {
		got := retryDelay(cfg, 0)
		want := 100 * time.Millisecond
		if got != want {
			t.Errorf("retryDelay(attempt 0) = %v, want %v", got, want)
		}
	})

	t.Run("attempt 1", func(t *testing.T) {
		got := retryDelay(cfg, 1)
		want := 200 * time.Millisecond
		if got != want {
			t.Errorf("retryDelay(attempt 1) = %v, want %v", got, want)
		}
	})

	t.Run("attempt 2", func(t *testing.T) {
		got := retryDelay(cfg, 2)
		want := 400 * time.Millisecond
		if got != want {
			t.Errorf("retryDelay(attempt 2) = %v, want %v", got, want)
		}
	})

	t.Run("attempt 3 (capped at MaxDelay)", func(t *testing.T) {
		got := retryDelay(cfg, 3)
		want := 500 * time.Millisecond // 800ms calculated, but capped at 500ms
		if got != want {
			t.Errorf("retryDelay(attempt 3) = %v, want capped %v", got, want)
		}
	})
}
