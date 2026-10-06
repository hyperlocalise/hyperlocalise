package main

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/stretchr/testify/require"
)

func glossaryInterchangeFixturePath(name string) string {
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		return filepath.Join("testdata", "glossary-interchange", name)
	}
	return filepath.Join(filepath.Dir(file), "testdata", "glossary-interchange", name)
}

func countGlossaryImportTerms(concepts []glossaryImportConcept) int {
	total := 0
	for _, concept := range concepts {
		total += len(concept.Terms)
	}
	return total
}

func TestParseGlossaryTBX_CrowdinExportFixture(t *testing.T) {
	content, err := os.ReadFile(glossaryInterchangeFixturePath("crowdin-export.tbx"))
	require.NoError(t, err)

	concepts, diagnostics := parseGlossaryTBX(string(content))
	require.Empty(t, diagnostics)
	require.Len(t, concepts, 52)
	require.Equal(t, 274, countGlossaryImportTerms(concepts))
}

func TestParseGlossaryTBX_HyperlocaliseExportFixture(t *testing.T) {
	content, err := os.ReadFile(glossaryInterchangeFixturePath("hyperlocalise-export.tbx"))
	require.NoError(t, err)

	concepts, diagnostics := parseGlossaryTBX(string(content))
	require.Empty(t, diagnostics)
	require.Len(t, concepts, 52)
	require.Equal(t, 66, countGlossaryImportTerms(concepts))
	require.NotEmpty(t, concepts[0].Subject)
}

func TestApplyGlossaryImportLocaleOptions_CrowdinExportFixture(t *testing.T) {
	content, err := os.ReadFile(glossaryInterchangeFixturePath("crowdin-export.tbx"))
	require.NoError(t, err)
	concepts, diagnostics := parseGlossaryTBX(string(content))
	require.Empty(t, diagnostics)

	strict := true
	g := glossaryRecord{
		SourceLocale:   "en-US",
		LocaleCoverage: []string{"de-DE", "ja-JP", "ko-KR", "vi-VN"},
	}
	out, applyDiagnostics := applyGlossaryImportLocaleOptions(g, glossaryImportPayload{
		Format:       "tbx",
		StrictLocale: &strict,
	}, concepts, nil)
	require.Len(t, out, 52)
	require.Equal(t, 274, countGlossaryImportTerms(out))

	for _, diagnostic := range applyDiagnostics {
		require.NotEqual(t, "unknown_locale", diagnostic.Code, "unexpected locale rejection: %+v", diagnostic)
	}
	require.True(t, len(applyDiagnostics) > 0, "expected locale_mapped warnings")
	hasMapped := false
	for _, diagnostic := range applyDiagnostics {
		if diagnostic.Code == "locale_mapped" {
			hasMapped = true
			break
		}
	}
	require.True(t, hasMapped)

	var sawEnglish, sawGerman bool
	for _, concept := range out {
		for _, term := range concept.Terms {
			switch term.Locale {
			case "en-US":
				sawEnglish = true
			case "de-DE":
				sawGerman = true
			}
		}
	}
	require.True(t, sawEnglish)
	require.True(t, sawGerman)
}

func TestApplyGlossaryImportLocaleOptions_HyperlocaliseExportFixture(t *testing.T) {
	content, err := os.ReadFile(glossaryInterchangeFixturePath("hyperlocalise-export.tbx"))
	require.NoError(t, err)
	concepts, diagnostics := parseGlossaryTBX(string(content))
	require.Empty(t, diagnostics)

	strict := true
	g := glossaryRecord{SourceLocale: "en-US", LocaleCoverage: []string{}}
	out, applyDiagnostics := applyGlossaryImportLocaleOptions(g, glossaryImportPayload{
		Format:       "tbx",
		StrictLocale: &strict,
	}, concepts, nil)
	require.Len(t, out, 52)

	for _, diagnostic := range applyDiagnostics {
		require.NotEqual(t, "unknown_locale", diagnostic.Code)
	}
	for _, concept := range out {
		for _, term := range concept.Terms {
			require.Equal(t, "en-US", term.Locale)
		}
	}
}
