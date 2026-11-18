package translationfileparser

import "testing"

func TestParsedDocumentKeyLinesMatchLineForKey(t *testing.T) {
	t.Parallel()

	markdown := []byte("---\ntitle: Guide\n---\n# Title\n\nHello world.\n\n- one\n- two\n\nHello world.\n\n| a | b |\n|---|---|\n| c | d |\n")
	for _, mdx := range []bool{false, true} {
		doc := ParseMarkdownDocument(markdown, mdx)
		lines := doc.KeyLines()
		if len(lines) == 0 {
			t.Fatalf("mdx=%v: no key lines", mdx)
		}
		for key, line := range lines {
			if want := LineForMarkdownKey(markdown, mdx, key); line != want {
				t.Errorf("mdx=%v key %q line = %d, want %d", mdx, key, line, want)
			}
		}
	}

	asciiDoc := []byte("= Title\n\nHello.\n\n== Section\n\n* one\n* two\n")
	lines := ParseAsciiDocDocument(asciiDoc).KeyLines()
	if len(lines) == 0 {
		t.Fatal("asciidoc: no key lines")
	}
	for key, line := range lines {
		if want := LineForAsciiDocKey(asciiDoc, key); line != want {
			t.Errorf("asciidoc key %q line = %d, want %d", key, line, want)
		}
	}
}

func TestParsedDocumentAlignMatchesAlignFunctions(t *testing.T) {
	t.Parallel()

	source := []byte("# Title\n\nHello world.\n\nSecond paragraph.\n")
	target := []byte("# Titre\n\nBonjour le monde.\n")
	want := AlignMarkdownTargetToSource(source, target, false)
	got := ParseMarkdownDocument(source, false).AlignTargetDocument(ParseMarkdownDocument(target, false))
	if len(got) != len(want) {
		t.Fatalf("aligned = %v, want %v", got, want)
	}
	for key, value := range want {
		if got[key] != value {
			t.Fatalf("aligned[%q] = %q, want %q", key, got[key], value)
		}
	}
}
