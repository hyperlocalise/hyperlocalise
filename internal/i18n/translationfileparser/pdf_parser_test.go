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
