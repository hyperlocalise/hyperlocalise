package evalsvc

import (
	"strings"
	"testing"
	"unicode/utf8"
)

func TestSanitizeEvalCaseContextNormalizesWhitespace(t *testing.T) {
	in := "  line1\nline2\rline3  "
	got := sanitizeEvalCaseContext(in)

	if got != "line1 line2 line3" {
		t.Fatalf("sanitizeEvalCaseContext() = %q, want %q", got, "line1 line2 line3")
	}
}

func TestSanitizeEvalCaseContextTruncatesByRunesAndPreservesUTF8(t *testing.T) {
	in := strings.Repeat("界", maxEvalCaseContextLen+9)
	got := sanitizeEvalCaseContext(in)

	if !utf8.ValidString(got) {
		t.Fatalf("expected valid UTF-8 output, got %q", got)
	}
	if count := len([]rune(got)); count != maxEvalCaseContextLen {
		t.Fatalf("expected %d runes after truncation, got %d", maxEvalCaseContextLen, count)
	}
}
