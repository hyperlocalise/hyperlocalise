package translationfileparser

import (
	"strings"
	"testing"
)

func TestMarkdownASTParityWarningsNone(t *testing.T) {
	src := []byte("# Title\n\nHello world.\n")
	out, _ := MarshalMarkdownWithDiagnostics(src, map[string]string{}, false)
	w := MarkdownASTParityWarnings(src, out, "/en/page.md", "/fr/page.md")
	if len(w) != 0 {
		t.Fatalf("expected no warnings, got %v", w)
	}
}

func TestMarkdownASTParityWarningsMissingPath(t *testing.T) {
	src := []byte("# One\n\n## Two\n")
	// Drop heading structure by using empty translations that might collapse — use wrong staged map
	// Minimal: marshal with values that remove a segment — simpler to compare divergent content directly.
	out := []byte("plain text only\n")
	w := MarkdownASTParityWarnings(src, out, "/a.md", "/b.md")
	if len(w) == 0 {
		t.Fatal("expected AST parity warnings")
	}
	if !strings.Contains(w[0], "markdown AST parity") {
		t.Fatalf("unexpected warning: %q", w[0])
	}
}
