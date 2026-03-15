package tmsgrpc

import (
	"testing"

	"github.com/quiet-circles/hyperlocalise/domains/translation"
)

func TestMapStatus(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		in   string
		want string
	}{
		{name: "queued", in: translation.StatusQueued, want: "pending"},
		{name: "running", in: translation.StatusRunning, want: "running"},
		{name: "finalize queued", in: translation.StatusFinalizeQueued, want: "running"},
		{name: "completed", in: translation.StatusCompleted, want: "succeeded"},
		{name: "failed", in: translation.StatusFailed, want: "failed"},
		{name: "canceled", in: translation.StatusCanceled, want: "canceled"},
		{name: "cancel requested", in: translation.StatusCancelRequested, want: "canceled"},
		{name: "unknown", in: "mystery", want: "pending"},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if got := mapStatus(tc.in); got != tc.want {
				t.Fatalf("mapStatus(%q) = %q, want %q", tc.in, got, tc.want)
			}
		})
	}
}
