package main

import (
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/memoryinterchange"
)

func TestMemoryImportReportSamples(t *testing.T) {
	candidates := []memoryinterchange.Candidate{
		{SourceLocale: "en", TargetLocale: "fr", SourceText: "Hello", TargetText: "Bonjour"},
		{SourceLocale: "en", TargetLocale: "fr", SourceText: "Goodbye", TargetText: "Au revoir"},
		{SourceLocale: "en", TargetLocale: "es", SourceText: "Hello", TargetText: "Hola"},
	}

	samples := memoryImportReportSamples(candidates, 2)
	if len(samples) != 2 {
		t.Fatalf("memoryImportReportSamples() len = %d, want 2", len(samples))
	}
	if samples[0]["sourceText"] != "Hello" || samples[0]["targetText"] != "Bonjour" {
		t.Fatalf("memoryImportReportSamples()[0] = %v, want Hello/Bonjour", samples[0])
	}
	if samples[1]["sourceLocale"] != "en" || samples[1]["targetLocale"] != "fr" {
		t.Fatalf("memoryImportReportSamples()[1] = %v, want en/fr", samples[1])
	}

	if got := memoryImportReportSamples(candidates, 10); len(got) != len(candidates) {
		t.Fatalf("memoryImportReportSamples() with large limit len = %d, want %d", len(got), len(candidates))
	}
	if got := memoryImportReportSamples(nil, 5); len(got) != 0 {
		t.Fatalf("memoryImportReportSamples() with no candidates len = %d, want 0", len(got))
	}
}
