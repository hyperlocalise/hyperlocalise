package main

import (
	"errors"
	"strings"
	"testing"
)

func TestDecodeMemoryInterchangeMessage(t *testing.T) {
	tests := []struct {
		name    string
		body    string
		wantErr bool
	}{
		{name: "import", body: `{"schemaVersion":1,"attemptId":"attempt-1","operation":"import"}`},
		{name: "export", body: `{"schemaVersion":1,"attemptId":"attempt-1","operation":"export"}`},
		{name: "invalid json", body: `{`, wantErr: true},
		{name: "unsupported schema", body: `{"schemaVersion":2,"attemptId":"attempt-1","operation":"import"}`, wantErr: true},
		{name: "missing attempt", body: `{"schemaVersion":1,"operation":"import"}`, wantErr: true},
		{name: "unsupported operation", body: `{"schemaVersion":1,"attemptId":"attempt-1","operation":"sync"}`, wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var message memoryInterchangeMessage
			err := decodeMemoryInterchangeMessage(tt.body, &message)
			if (err != nil) != tt.wantErr {
				t.Fatalf("decodeMemoryInterchangeMessage() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestPermanentMemoryInterchangeFailure(t *testing.T) {
	permanent := permanentMemoryInterchangeFailure(errors.New("invalid format"))
	if !isPermanentMemoryInterchangeFailure(permanent) {
		t.Fatal("expected wrapped permanent failure to be classified as permanent")
	}
	if isPermanentMemoryInterchangeFailure(errors.New("temporary storage failure")) {
		t.Fatal("expected unwrapped failure to remain retryable")
	}
}

func TestExportSlug(t *testing.T) {
	tests := []struct {
		name string
		want string
	}{
		{name: "Product TM", want: "Product-TM"},
		{name: "  already_ok-Name  ", want: "already_ok-Name"},
		{name: "@@@", want: "translation-memory"},
		{name: "   ", want: "translation-memory"},
		{name: "Mémoire 2026!", want: "M-moire-2026"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := exportSlug(tt.name); got != tt.want {
				t.Fatalf("exportSlug(%q) = %q, want %q", tt.name, got, tt.want)
			}
		})
	}
}

func TestSafeFailureMessage(t *testing.T) {
	if got := safeFailureMessage(errors.New("  boom  ")); got != "boom" {
		t.Fatalf("safeFailureMessage trim = %q", got)
	}
	long := errors.New(strings.Repeat("x", 600))
	if got := safeFailureMessage(long); len(got) != 500 {
		t.Fatalf("safeFailureMessage length = %d, want 500", len(got))
	}
}
