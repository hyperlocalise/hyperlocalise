package translationfileparser

import (
	"errors"
	"strings"
	"testing"
)

func TestReadPDFEntriesSingleBlock(t *testing.T) {
	t.Parallel()
	pdf, err := buildTestPDFDocument([]string{"Hello PDF segment test"})
	if err != nil {
		t.Fatalf("build pdf: %v", err)
	}
	entries, err := ReadPDFEntries(pdf)
	if err != nil {
		t.Fatalf("ReadPDFEntries: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("entries: got %d want 1", len(entries))
	}
	if entries[0].Key != "page-1#1" {
		t.Fatalf("key: got %q", entries[0].Key)
	}
	if !strings.Contains(entries[0].Text, "Hello PDF") {
		t.Fatalf("text: got %q", entries[0].Text)
	}
}

func TestReadPDFEntriesNoTextLayer(t *testing.T) {
	t.Parallel()
	pdf, err := buildTestPDFDocument([]string{" "})
	if err != nil {
		t.Fatalf("build pdf: %v", err)
	}
	_, err = ReadPDFEntries(pdf)
	if !errors.Is(err, ErrPDFNoTextLayer) {
		t.Fatalf("expected ErrPDFNoTextLayer, got %v", err)
	}
}

func TestMarshalPDFRoundTrip(t *testing.T) {
	t.Parallel()
	sourceLine := "Translate this PDF block"
	pdf, err := buildTestPDFDocument([]string{sourceLine})
	if err != nil {
		t.Fatalf("build pdf: %v", err)
	}
	entries, err := ReadPDFEntries(pdf)
	if err != nil {
		t.Fatalf("ReadPDFEntries: %v", err)
	}
	key := entries[0].Key
	translated := "Bonjour bloc PDF"
	out, overflow, err := MarshalPDF(pdf, map[string]string{key: translated}, "fr-FR")
	if err != nil {
		t.Fatalf("MarshalPDF: %v", err)
	}
	if len(overflow) != 0 {
		t.Fatalf("overflow keys: %v", overflow)
	}
	reRead, err := ReadPDFEntries(out)
	if err != nil {
		t.Fatalf("re-read: %v", err)
	}
	found := false
	for _, entry := range reRead {
		if entry.Key == key && strings.Contains(entry.Text, "Bonjour") {
			found = true
		}
	}
	if !found {
		t.Fatalf("translated text not found in %v", reRead)
	}
}

func TestGroupPDFSpansSplitsSameBaselineColumns(t *testing.T) {
	t.Parallel()
	blocks := groupPDFSpansIntoBlocks([]pdfTextSpan{
		{text: "Name", left: 72, right: 110, top: 700, bottom: 688, fontSize: 12},
		{text: "Amount", left: 320, right: 380, top: 700, bottom: 688, fontSize: 12},
	})
	if len(blocks) != 2 {
		t.Fatalf("blocks: got %d want 2 (%v)", len(blocks), blockTexts(blocks))
	}
	if blocks[0].text != "Name" || blocks[1].text != "Amount" {
		t.Fatalf("texts: %v", blockTexts(blocks))
	}
}

func TestGroupPDFSpansKeepsAdjacentWordsOnOneLine(t *testing.T) {
	t.Parallel()
	blocks := groupPDFSpansIntoBlocks([]pdfTextSpan{
		{text: "Hello", left: 72, right: 102, top: 700, bottom: 688, fontSize: 12},
		{text: "world", left: 108, right: 140, top: 700, bottom: 688, fontSize: 12},
	})
	if len(blocks) != 1 {
		t.Fatalf("blocks: got %d want 1 (%v)", len(blocks), blockTexts(blocks))
	}
	if blocks[0].text != "Hello world" {
		t.Fatalf("text: %q", blocks[0].text)
	}
}

func TestWrapPDFTextUsesActualBlockHeight(t *testing.T) {
	t.Parallel()
	_, _, overflow := wrapPDFText("one two three four five six seven eight", 80, 14, 12, 8.4)
	if !overflow {
		t.Fatal("expected overflow against a one-line block height")
	}
	_, _, overflow = wrapPDFText("Short", 200, 48, 12, 8.4)
	if overflow {
		t.Fatal("short text should fit a tall block")
	}
}

func TestWrapPDFLinesSplitsOversizedToken(t *testing.T) {
	t.Parallel()
	lines := wrapPDFLines("https://example.com/very/long/path/segment", 40, 12)
	if len(lines) < 2 {
		t.Fatalf("expected split lines, got %v", lines)
	}
	_, _, overflow := wrapPDFText("https://example.com/very/long/path/segment", 40, 14, 12, 8.4)
	if !overflow {
		t.Fatal("expected overflow when a token is wider than a one-line block")
	}
}

func blockTexts(blocks []pdfTextBlock) []string {
	out := make([]string, len(blocks))
	for i, block := range blocks {
		out[i] = block.text
	}
	return out
}

func TestStrategyParsePDFIngest(t *testing.T) {
	t.Parallel()
	pdf, err := buildTestPDFDocument([]string{"Strategy ingest PDF line"})
	if err != nil {
		t.Fatalf("build pdf: %v", err)
	}
	s := NewDefaultStrategy()
	entries, err := s.ParseIngestEntries("doc.pdf", pdf, "")
	if err != nil {
		t.Fatalf("ParseIngestEntries: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("entries: got %d", len(entries))
	}
	for key, entry := range entries {
		if key != "page-1#1" {
			t.Fatalf("key: %q", key)
		}
		if entry.Context == "" {
			t.Fatalf("expected context")
		}
	}
}
