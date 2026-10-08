package translationfileparser

import (
	"strings"
	"testing"
)

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

func TestRecoverMarkdownInternalPlaceholdersIntercomLinks(t *testing.T) {
	source := "For a public article to be enabled for Fin, it must be published, part of a live [Help Center](https://www.intercom.com/help/en/articles/1970126-get-started-with-help-center) and in a [collection.](https://www.intercom.com/help/en/articles/56647-create-collections-in-your-help-center)"
	protected, _, _ := protectStandardMarkdownInlineSyntax(source)
	tokens := MarkdownInternalPlaceholderTokens(protected)
	if len(tokens) != 4 {
		t.Fatalf("expected 4 tokens, got %d in %q", len(tokens), protected)
	}

	recovered, err := RecoverMarkdownInternalPlaceholders(protected, source)
	if err != nil {
		t.Fatalf("recover: %v", err)
	}
	if !markdownInternalPlaceholdersMatch(protected, recovered) {
		t.Fatalf("recovered tokens do not match source")
	}

	translated := "Pour qu'un article public soit activé pour Fin, il doit être publié, faire partie d'un [Help Center](https://www.intercom.com/help/en/articles/1970126-get-started-with-help-center) et d'une [collection.](https://www.intercom.com/help/en/articles/56647-create-collections-in-your-help-center)"
	recoveredFR, err := RecoverMarkdownInternalPlaceholders(protected, translated)
	if err != nil {
		t.Fatalf("recover translated: %v", err)
	}
	if err := ValidateMarkdownInternalPlaceholders(protected, recoveredFR); err != nil {
		t.Fatalf("validate recovered: %v", err)
	}

	dropped := "For a public article to be enabled for Fin, it must be published, part of a live [Help Center](https://www.intercom.com/help/en/articles/1970126-get-started-with-help-center) and in a collection."
	if _, err := RecoverMarkdownInternalPlaceholders(protected, dropped); err == nil {
		t.Fatal("expected dropped URL to fail recovery")
	}
}

func TestRecoverMarkdownInternalPlaceholdersIntercomHeadingID(t *testing.T) {
	source := "Build a comprehensive knowledge base {#h_61bff2dd7a}"
	protected, _, _ := protectStandardMarkdownInlineSyntax(source)
	if len(MarkdownInternalPlaceholderTokens(protected)) != 1 {
		t.Fatalf("expected heading id token, got %q", protected)
	}
	recovered, err := RecoverMarkdownInternalPlaceholders(protected, "Base de connaissances {#h_61bff2dd7a}")
	if err != nil {
		t.Fatalf("recover: %v", err)
	}
	if !strings.Contains(recovered, "\x1eHLMDPH_") {
		t.Fatalf("expected recovered heading id token, got %q", recovered)
	}
}
