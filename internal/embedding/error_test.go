package embedding

import (
	"strings"
	"testing"
)

func TestHTTPErrorString(t *testing.T) {
	var unset *httpError
	if got := unset.Error(); got != "<nil>" {
		t.Fatalf("nil = %q", got)
	}
	if got := (&httpError{status: 500}).Error(); got != "embedding: AI Gateway HTTP 500" {
		t.Fatalf("empty body = %q", got)
	}
	long := strings.Repeat("x", 400)
	got := (&httpError{status: 400, body: long}).Error()
	if !strings.Contains(got, "HTTP 400") || !strings.HasSuffix(got, "...") {
		t.Fatalf("truncated = %q", got)
	}
	if truncate("ab", 5) != "ab" || truncate("abcdef", 3) != "abc..." {
		t.Fatal("truncate")
	}
}
