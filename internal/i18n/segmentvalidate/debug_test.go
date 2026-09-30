package segmentvalidate

import "testing"

func TestElideDebugString(t *testing.T) {
	if got := ElideDebugString("abc", 10); got != "abc" {
		t.Fatalf("short = %q", got)
	}
	if got := ElideDebugString("abcd", 1); got != "a" {
		t.Fatalf("single rune = %q", got)
	}
	if got := ElideDebugString("abcd", 3); got != "ab…" {
		t.Fatalf("truncated = %q", got)
	}
}
