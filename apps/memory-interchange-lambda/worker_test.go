package main

import (
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/memoryinterchange"
)

func TestMemoryImportPreviewSamples(t *testing.T) {
	candidates := []memoryinterchange.Candidate{
		{SourceLocale: "en", TargetLocale: "fr", SourceText: "Hello", TargetText: "Bonjour"},
		{SourceLocale: "en", TargetLocale: "fr", SourceText: "Goodbye", TargetText: "Au revoir"},
		{SourceLocale: "en", TargetLocale: "es", SourceText: "Hello", TargetText: "Hola"},
	}

	samples := memoryImportPreviewSamples(candidates, 2)
	if len(samples) != 2 {
		t.Fatalf("memoryImportPreviewSamples() len = %d, want 2", len(samples))
	}
	if samples[0]["sourceText"] != "Hello" || samples[0]["targetText"] != "Bonjour" {
		t.Fatalf("memoryImportPreviewSamples()[0] = %v, want Hello/Bonjour", samples[0])
	}
	if samples[1]["sourceLocale"] != "en" || samples[1]["targetLocale"] != "fr" {
		t.Fatalf("memoryImportPreviewSamples()[1] = %v, want en/fr", samples[1])
	}

	if got := memoryImportPreviewSamples(candidates, 10); len(got) != len(candidates) {
		t.Fatalf("memoryImportPreviewSamples() with large limit len = %d, want %d", len(got), len(candidates))
	}
	if got := memoryImportPreviewSamples(nil, 5); len(got) != 0 {
		t.Fatalf("memoryImportPreviewSamples() with no candidates len = %d, want 0", len(got))
	}
}
