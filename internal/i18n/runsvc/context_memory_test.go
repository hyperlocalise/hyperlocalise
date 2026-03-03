package runsvc

import (
	"testing"
	"unicode/utf8"
)

func TestNormalizeContextMemoryPreservesUTF8WhenTruncating(t *testing.T) {
	in := "  Xin chào 👋 thế giới  "
	out := normalizeContextMemory(in, 9)

	if !utf8.ValidString(out) {
		t.Fatalf("expected valid UTF-8 output, got %q", out)
	}
	if got := len([]rune(out)); got > 9 {
		t.Fatalf("expected at most 9 runes, got %d (%q)", got, out)
	}
}
