package translationfileparser

import (
	"strings"
	"testing"
)

func TestPlainTextParserParagraphsAndRoundTrip(t *testing.T) {
	source := []byte("First paragraph line one.\nLine two.\n\nSecond paragraph.\n")
	entries, err := PlainTextParser{}.Parse(source)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 2 {
		t.Fatalf("entries=%d, want 2: %#v", len(entries), entries)
	}
	got := string(MarshalPlainText(source, map[string]string{
		"txt.0001": "Premier paragraphe.\nDeuxième ligne.",
		"txt.0002": "Deuxième paragraphe.",
	}))
	want := "Premier paragraphe.\nDeuxième ligne.\n\nDeuxième paragraphe.\n"
	if got != want {
		t.Fatalf("marshal=%q, want %q", got, want)
	}
}

func TestPlainTextParserCRLFAndTrailingNewline(t *testing.T) {
	source := []byte("Alpha\r\n\r\nBeta\r\n")
	entries, err := PlainTextParser{}.Parse(source)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 2 {
		t.Fatalf("entries=%d, want 2", len(entries))
	}
	partial := map[string]string{"txt.0002": "Bêta"}
	got := string(MarshalPlainText(source, partial))
	if !strings.Contains(got, "Alpha\r\n\r\n") {
		t.Fatalf("preserved CRLF layout: %q", got)
	}
	if !strings.HasSuffix(got, "Bêta\r\n") {
		t.Fatalf("suffix=%q", got)
	}
}

func TestPlainTextParserSingleParagraphNoTrailingNewline(t *testing.T) {
	source := []byte("Only line")
	entries, err := PlainTextParser{}.Parse(source)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 || entries["txt.0001"] != "Only line" {
		t.Fatalf("entries=%#v", entries)
	}
	got := string(MarshalPlainText(source, map[string]string{"txt.0001": "Seule ligne"}))
	if got != "Seule ligne" {
		t.Fatalf("got=%q", got)
	}
}

func TestPlainTextIngestEntries(t *testing.T) {
	entries := plainTextIngestEntries([]byte("One\n\nTwo\n"))
	if len(entries) != 2 {
		t.Fatalf("len=%d", len(entries))
	}
	if entries["txt.0001"].Text != "One" {
		t.Fatalf("first=%q", entries["txt.0001"].Text)
	}
}

func TestAlignPlainTextTargetToSourceDoesNotShiftWhenParagraphInserted(t *testing.T) {
	t.Parallel()

	source := []byte("Existing intro.\n\nNew section added.\n\nExisting outro.\n")
	target := []byte("Existing intro.\n\nExisting outro.\n")
	aligned := AlignPlainTextTargetToSource(source, target)
	if aligned["txt.0001"] != "Existing intro." {
		t.Fatalf("intro=%q, want Existing intro.", aligned["txt.0001"])
	}
	if aligned["txt.0003"] != "Existing outro." {
		t.Fatalf("outro=%q, want Existing outro.", aligned["txt.0003"])
	}
	if aligned["txt.0002"] == "Existing outro." || aligned["txt.0002"] == "Existing intro." {
		t.Fatalf("inserted paragraph stole a neighbor translation: %#v", aligned)
	}
}

func TestIsPlainTextDocumentExtension(t *testing.T) {
	if !IsPlainTextDocumentExtension("notes.txt") {
		t.Fatal("expected .txt")
	}
	if IsPlainTextDocumentExtension("readme.md") {
		t.Fatal("md should not match")
	}
}
