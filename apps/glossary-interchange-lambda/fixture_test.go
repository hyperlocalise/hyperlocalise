package main

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func glossaryInterchangeFixturePath(name string) string {
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		return filepath.Join("..", "go-svc", "testdata", "glossary-interchange", name)
	}
	return filepath.Join(filepath.Dir(file), "..", "go-svc", "testdata", "glossary-interchange", name)
}

func countInterchangeTerms(concepts []interchangeConcept) int {
	total := 0
	for _, concept := range concepts {
		total += len(concept.Terms)
	}
	return total
}

func TestDecodeTBX_CrowdinAndHyperlocaliseFixtures(t *testing.T) {
	tests := []struct {
		name     string
		filename string
		concepts int
		terms    int
	}{
		{name: "crowdin", filename: "crowdin-export.tbx", concepts: 52, terms: 274},
		{name: "hyperlocalise", filename: "hyperlocalise-export.tbx", concepts: 52, terms: 66},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			data, err := os.ReadFile(glossaryInterchangeFixturePath(test.filename))
			if err != nil {
				t.Fatal(err)
			}
			concepts, diagnostics, err := decodeTBX(data)
			if err != nil {
				t.Fatalf("decodeTBX() error = %v", err)
			}
			if len(diagnostics) > 0 {
				t.Fatalf("decodeTBX() diagnostics = %v", diagnostics)
			}
			if len(concepts) != test.concepts {
				t.Fatalf("decodeTBX() concepts = %d, want %d", len(concepts), test.concepts)
			}
			if got := countInterchangeTerms(concepts); got != test.terms {
				t.Fatalf("decodeTBX() terms = %d, want %d", got, test.terms)
			}
		})
	}
}

func TestCrowdinExportFixture_LocaleMappingMatchesWorker(t *testing.T) {
	data, err := os.ReadFile(glossaryInterchangeFixturePath("crowdin-export.tbx"))
	if err != nil {
		t.Fatal(err)
	}
	concepts, diagnostics, err := decodeTBX(data)
	if err != nil {
		t.Fatalf("decodeTBX() error = %v", err)
	}
	if len(diagnostics) > 0 {
		t.Fatalf("decodeTBX() diagnostics = %v", diagnostics)
	}

	configuredLocales := []string{"en-US"}
	for _, concept := range concepts {
		for _, term := range concept.Terms {
			rawLocale := normalizeGlossaryLocale(term.Locale)
			locale, _ := mappedImportLocale(rawLocale, configuredLocales, nil)
			if locale == "" {
				t.Fatalf("empty locale raw=%q", rawLocale)
			}
			if rawLocale == "de" && locale != "de-DE" {
				t.Fatalf("crowdin de mapped to %q, want de-DE", locale)
			}
		}
	}
}
