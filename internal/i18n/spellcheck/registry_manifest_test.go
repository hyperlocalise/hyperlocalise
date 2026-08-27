package spellcheck

import (
	_ "embed"
	"fmt"
	"regexp"
	"strings"
	"testing"
)

// manifestMarkdown is embedded here, in a test file, purely so this test can
// compare the approved manifest against supportedDictionaries. Production
// code never embeds or parses this file: locale resolution at runtime is a
// static Go map (see registry.go). If a future edit to DICTIONARIES.md is
// not mirrored into supportedDictionaries, this test fails.
//
//go:embed DICTIONARIES.md
var manifestMarkdown string

var manifestHeadingPattern = regexp.MustCompile(`^## Supported locales \((\d+)\)`)

// parseManifestDictionaries parses the "Supported locales" table out of the
// dictionary manifest, mirroring the awk parsing in
// apps/go-svc/build/fetch-dictionaries.sh (BCP 47 in column 2, .aff in
// column 3, .dic in column 4). It is test-only: nothing in the service
// depends on this parser at runtime.
func parseManifestDictionaries(markdown string) (map[string]DictionaryFiles, error) {
	dictionaries := make(map[string]DictionaryFiles)

	var declaredCount int
	var haveDeclaredCount bool
	inTable := false

	for _, line := range strings.Split(markdown, "\n") {
		if m := manifestHeadingPattern.FindStringSubmatch(line); m != nil {
			if _, err := fmt.Sscanf(m[1], "%d", &declaredCount); err != nil {
				return nil, fmt.Errorf("parse declared locale count from heading %q: %w", line, err)
			}
			haveDeclaredCount = true
			inTable = true
			continue
		}

		if inTable && strings.HasPrefix(line, "## ") {
			inTable = false
			continue
		}

		if !inTable || !strings.HasPrefix(strings.TrimSpace(line), "| `") {
			continue
		}

		fields := strings.Split(line, "|")
		if len(fields) < 4 {
			return nil, fmt.Errorf("manifest row has fewer than 4 pipe-delimited fields: %q", line)
		}

		locale := cleanManifestCell(fields[1])
		aff := cleanManifestCell(fields[2])
		dic := cleanManifestCell(fields[3])

		if _, exists := dictionaries[locale]; exists {
			return nil, fmt.Errorf("duplicate locale %q in manifest", locale)
		}
		dictionaries[locale] = DictionaryFiles{AffFile: aff, DicFile: dic}
	}

	if !haveDeclaredCount {
		return nil, fmt.Errorf("could not find '## Supported locales (N)' heading in manifest")
	}
	if len(dictionaries) != declaredCount {
		return nil, fmt.Errorf("parsed %d locale row(s) but manifest heading declares %d; manifest format changed?", len(dictionaries), declaredCount)
	}

	return dictionaries, nil
}

func cleanManifestCell(field string) string {
	return strings.Trim(strings.TrimSpace(field), "`")
}

func TestSupportedDictionariesMatchesManifest(t *testing.T) {
	parsed, err := parseManifestDictionaries(manifestMarkdown)
	if err != nil {
		t.Fatalf("parseManifestDictionaries() error = %v", err)
	}

	if len(parsed) != len(supportedDictionaries) {
		t.Fatalf("manifest declares %d supported locale(s), supportedDictionaries has %d; keep internal/i18n/spellcheck/registry.go in sync with DICTIONARIES.md", len(parsed), len(supportedDictionaries))
	}

	for locale, wantFiles := range parsed {
		gotFiles, ok := supportedDictionaries[locale]
		if !ok {
			t.Errorf("manifest declares %q as supported, but supportedDictionaries has no entry for it", locale)
			continue
		}
		if gotFiles != wantFiles {
			t.Errorf("supportedDictionaries[%q] = %+v, want %+v (from DICTIONARIES.md)", locale, gotFiles, wantFiles)
		}
	}

	for locale := range supportedDictionaries {
		if _, ok := parsed[locale]; !ok {
			t.Errorf("supportedDictionaries has %q, but DICTIONARIES.md does not declare it as supported", locale)
		}
	}
}

func TestParseManifestDictionariesRejectsHeadingCountMismatch(t *testing.T) {
	markdown := "## Supported locales (2)\n" +
		"\n" +
		"| BCP 47 | `.aff` | `.dic` |\n" +
		"|---|---|---|\n" +
		"| `de-DE` | `de_DE_frami.aff` | `de_DE_frami.dic` |\n" +
		"\n" +
		"## Unsupported for the initial release (0)\n"

	if _, err := parseManifestDictionaries(markdown); err == nil {
		t.Fatal("parseManifestDictionaries() error = nil, want error for row count / heading mismatch")
	}
}

func TestParseManifestDictionariesRejectsDuplicateLocale(t *testing.T) {
	markdown := "## Supported locales (2)\n" +
		"\n" +
		"| BCP 47 | `.aff` | `.dic` |\n" +
		"|---|---|---|\n" +
		"| `de-DE` | `de_DE_frami.aff` | `de_DE_frami.dic` |\n" +
		"| `de-DE` | `de_DE_frami.aff` | `de_DE_frami.dic` |\n"

	if _, err := parseManifestDictionaries(markdown); err == nil {
		t.Fatal("parseManifestDictionaries() error = nil, want error for a duplicate locale row")
	}
}

func TestParseManifestDictionariesStopsAtNextHeading(t *testing.T) {
	markdown := "## Supported locales (1)\n" +
		"\n" +
		"| BCP 47 | `.aff` | `.dic` |\n" +
		"|---|---|---|\n" +
		"| `de-DE` | `de_DE_frami.aff` | `de_DE_frami.dic` |\n" +
		"\n" +
		"## Unsupported for the initial release (1)\n" +
		"\n" +
		"| Locale | Reason |\n" +
		"|---|---|\n" +
		"| `en-SG` | not part of the supported-locales table |\n"

	got, err := parseManifestDictionaries(markdown)
	if err != nil {
		t.Fatalf("parseManifestDictionaries() error = %v, want nil", err)
	}
	if _, ok := got["en-SG"]; ok {
		t.Error("parseManifestDictionaries() picked up a row from the unsupported-locales table")
	}
	if len(got) != 1 {
		t.Errorf("parseManifestDictionaries() returned %d row(s), want 1", len(got))
	}
}
