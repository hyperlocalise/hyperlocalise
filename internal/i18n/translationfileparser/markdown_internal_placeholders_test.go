package translationfileparser

import "testing"

func TestValidateMarkdownInternalPlaceholdersEmpty(t *testing.T) {
	if err := ValidateMarkdownInternalPlaceholders("hello", "bonjour"); err != nil {
		t.Fatalf("expected nil, got %v", err)
	}
}

func TestValidateMarkdownInternalPlaceholdersMismatch(t *testing.T) {
	a := "before \x1eHLMDPH_ABCDEF0123456789_1\x1f after"
	b := "before after"
	if err := ValidateMarkdownInternalPlaceholders(a, b); err == nil {
		t.Fatal("expected error")
	}
}

func TestValidateMarkdownInternalPlaceholdersMatch(t *testing.T) {
	tok := "\x1eHLMDPH_ABCDEF0123456789_1\x1f"
	a := "x " + tok + " y"
	b := "a " + tok + " b"
	if err := ValidateMarkdownInternalPlaceholders(a, b); err != nil {
		t.Fatalf("expected nil, got %v", err)
	}
}
