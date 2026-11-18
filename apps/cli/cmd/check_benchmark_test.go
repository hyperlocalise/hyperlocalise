package cmd

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// writeCheckPerfFixture writes a nested JSON source with keyCount keys and empty targets for
// each locale, so every key is a not_localized finding: the worst case for location lookups.
func writeCheckPerfFixture(tb testing.TB, keyCount int, locales []string) string {
	tb.Helper()
	dir := tb.TempDir()
	source := map[string]map[string]string{}
	for i := range keyCount {
		section := fmt.Sprintf("section%d", i/50)
		if source[section] == nil {
			source[section] = map[string]string{}
		}
		source[section][fmt.Sprintf("key%d", i)] = fmt.Sprintf("Hello world %d", i)
	}
	content, err := json.MarshalIndent(source, "", "  ")
	if err != nil {
		tb.Fatalf("marshal source: %v", err)
	}
	sourcePath := filepath.Join(dir, "en.json")
	if err := os.WriteFile(sourcePath, content, 0o600); err != nil {
		tb.Fatalf("write source: %v", err)
	}
	for _, locale := range locales {
		if err := os.MkdirAll(filepath.Join(dir, "dist", locale), 0o755); err != nil {
			tb.Fatalf("mkdir target: %v", err)
		}
		if err := os.WriteFile(filepath.Join(dir, "dist", locale, "en.json"), []byte("{}"), 0o600); err != nil {
			tb.Fatalf("write target: %v", err)
		}
	}
	return writeCheckPerfConfig(tb, dir, sourcePath, filepath.Join(dir, "dist", "[locale]", "en.json"), locales)
}

// writeCheckPerfMarkdownFixture writes a markdown source with paragraphCount paragraphs and an
// untranslated target per locale.
func writeCheckPerfMarkdownFixture(tb testing.TB, paragraphCount int, locales []string) string {
	tb.Helper()
	dir := tb.TempDir()
	var source strings.Builder
	source.WriteString("# Guide\n\n")
	for i := range paragraphCount {
		fmt.Fprintf(&source, "Paragraph number %d explains a feature in detail.\n\n", i)
	}
	sourcePath := filepath.Join(dir, "guide.md")
	if err := os.WriteFile(sourcePath, []byte(source.String()), 0o600); err != nil {
		tb.Fatalf("write source: %v", err)
	}
	for _, locale := range locales {
		if err := os.MkdirAll(filepath.Join(dir, "dist", locale), 0o755); err != nil {
			tb.Fatalf("mkdir target: %v", err)
		}
		if err := os.WriteFile(filepath.Join(dir, "dist", locale, "guide.md"), []byte("# Guide\n"), 0o600); err != nil {
			tb.Fatalf("write target: %v", err)
		}
	}
	return writeCheckPerfConfig(tb, dir, sourcePath, filepath.Join(dir, "dist", "[locale]", "guide.md"), locales)
}

func writeCheckPerfConfig(tb testing.TB, dir, sourcePath, targetPattern string, locales []string) string {
	tb.Helper()
	targets, err := json.Marshal(locales)
	if err != nil {
		tb.Fatalf("marshal locales: %v", err)
	}
	content := `{
	  "locales": {"source":"en","targets":` + string(targets) + `},
	  "buckets": {"ui":{"files":[{"from":"` + filepath.ToSlash(sourcePath) + `","to":"` + filepath.ToSlash(targetPattern) + `"}]}},
	  "groups": {"default":{"targets":` + string(targets) + `,"buckets":["ui"]}},
	  "llm": {"profiles":{"default":{"provider":"openai","model":"gpt-4.1-mini","prompt":"Translate {{input}}"}}}
	}`
	configPath := filepath.Join(dir, "i18n.jsonc")
	if err := os.WriteFile(configPath, []byte(content), 0o600); err != nil {
		tb.Fatalf("write config: %v", err)
	}
	return configPath
}

func benchmarkRunCheck(b *testing.B, configPath string, wantFindings int) {
	b.Helper()
	o := defaultCheckOptions()
	o.configPath = configPath
	b.ReportAllocs()
	for b.Loop() {
		report, err := runCheck(context.Background(), o)
		if err != nil {
			b.Fatalf("runCheck: %v", err)
		}
		if wantFindings >= 0 && len(report.Findings) != wantFindings {
			b.Fatalf("findings = %d, want %d", len(report.Findings), wantFindings)
		}
	}
}

func BenchmarkRunCheckUntranslatedJSON(b *testing.B) {
	for _, keyCount := range []int{1000, 10000, 40000} {
		b.Run(fmt.Sprintf("keys=%d", keyCount), func(b *testing.B) {
			benchmarkRunCheck(b, writeCheckPerfFixture(b, keyCount, []string{"fr"}), keyCount)
		})
	}
}

func BenchmarkRunCheckUntranslatedJSONManyLocales(b *testing.B) {
	locales := []string{"fr", "de", "es", "it", "ja", "ko", "pt", "zh"}
	benchmarkRunCheck(b, writeCheckPerfFixture(b, 10000, locales), 10000*len(locales))
}

func BenchmarkRunCheckUntranslatedMarkdown(b *testing.B) {
	for _, paragraphCount := range []int{200, 2000} {
		b.Run(fmt.Sprintf("paragraphs=%d", paragraphCount), func(b *testing.B) {
			benchmarkRunCheck(b, writeCheckPerfMarkdownFixture(b, paragraphCount, []string{"fr", "de"}), -1)
		})
	}
}
