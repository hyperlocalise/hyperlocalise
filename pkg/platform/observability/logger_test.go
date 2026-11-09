package observability

import (
	"bytes"
	"io"
	"log"
	"os"
	"testing"
)

func TestWrap(t *testing.T) {
	var buf bytes.Buffer
	base := log.New(&buf, "old ", 0)

	logger := Wrap(base, "api")
	if logger.Logger != base {
		t.Fatal("Wrap did not reuse the base logger")
	}
	if got := logger.Prefix(); got != "api " {
		t.Fatalf("Prefix() = %q, want %q", got, "api ")
	}

	logger.Print("hello")
	if got := buf.String(); got != "api hello\n" {
		t.Fatalf("output = %q, want %q", got, "api hello\n")
	}
}

func TestNewLogger(t *testing.T) {
	logger := NewLogger("svc")
	if logger.Writer() != os.Stdout {
		t.Fatal("NewLogger does not write to stdout")
	}
	if got := logger.Prefix(); got != "svc " {
		t.Fatalf("Prefix() = %q, want %q", got, "svc ")
	}
	if got := logger.Flags(); got != log.LstdFlags {
		t.Fatalf("Flags() = %d, want %d", got, log.LstdFlags)
	}
}

func TestDiscard(t *testing.T) {
	logger := Discard("svc")
	if logger.Writer() != io.Discard {
		t.Fatal("Discard does not write to io.Discard")
	}
	if got := logger.Prefix(); got != "svc " {
		t.Fatalf("Prefix() = %q, want %q", got, "svc ")
	}
	if got := logger.Flags(); got != 0 {
		t.Fatalf("Flags() = %d, want 0", got)
	}
	logger.Printf("ignored %d", 1)
}
