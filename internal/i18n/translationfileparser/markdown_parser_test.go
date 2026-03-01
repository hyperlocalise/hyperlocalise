package translationfileparser

import (
	"strings"
	"testing"
)

func TestMarkdownParserParseKeepsFrontmatterAndCodeFencesOut(t *testing.T) {
	content := []byte("---\ntitle: Hello\n---\n\n# Heading\n\nParagraph with [link text](https://example.com).\n\n```go\nfmt.Println(\"hi\")\n```\n")

	got, err := (MarkdownParser{}).Parse(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	if len(got) == 0 {
		t.Fatalf("expected extracted entries")
	}

	for _, value := range got {
		if strings.Contains(value, "title:") || strings.Contains(value, "fmt.Println") {
			t.Fatalf("unexpected extracted non-translatable value: %q", value)
		}
	}
}

func TestMarshalMarkdownRoundTripReplacesOnlyExtractedSegments(t *testing.T) {
	template := []byte("# Heading\n\n- First item\n- Second item\n\nSee [docs](https://example.com).\n> Quote\n| Name | Value |\n| ---- | ----- |\n| Alpha | Beta |\n")

	entries, err := (MarkdownParser{}).Parse(template)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	updates := map[string]string{}
	for k, v := range entries {
		updates[k] = strings.ToUpper(v)
	}

	output := string(MarshalMarkdown(template, updates))
	if !strings.Contains(output, "https://example.com") {
		t.Fatalf("expected link destination preserved, got %q", output)
	}
	if strings.Contains(output, "First item") {
		t.Fatalf("expected translated text output, got %q", output)
	}
	if !strings.Contains(output, "```") && strings.Contains(string(template), "```") {
		t.Fatalf("expected markdown structure to be preserved")
	}
}

func TestMarshalMarkdownPreservesLinkDestinationsWithParentheses(t *testing.T) {
	template := []byte("See [URL docs](https://en.wikipedia.org/wiki/URL_(disambiguation)) now.\n")

	entries, err := (MarkdownParser{}).Parse(template)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	updates := map[string]string{}
	for k, v := range entries {
		updates[k] = strings.ToUpper(v)
	}

	output := string(MarshalMarkdown(template, updates))
	if !strings.Contains(output, "https://en.wikipedia.org/wiki/URL_(disambiguation)") {
		t.Fatalf("expected full link destination preserved, got %q", output)
	}
	if !strings.Contains(output, "[URL DOCS]") {
		t.Fatalf("expected link text translated, got %q", output)
	}
}

func TestStrategyParsesMarkdown(t *testing.T) {
	s := NewDefaultStrategy()
	content := []byte("# Welcome\n\nHello world\n")

	got, err := s.Parse("fr.md", content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(got) < 2 {
		t.Fatalf("expected markdown entries parsed, got %d", len(got))
	}
}
