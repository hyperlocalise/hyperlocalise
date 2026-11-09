package entrysplit

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/srx"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/translationfileparser"
)

func TestCompileSpecVariants(t *testing.T) {
	t.Parallel()
	if doc, err := CompileSpec("   "); err != nil || doc != nil {
		t.Fatalf("blank spec = %v, %v; want nil, nil", doc, err)
	}
	for _, spec := range []string{"default", "HTML", " Markdown "} {
		doc, err := CompileSpec(spec)
		if err != nil || doc == nil {
			t.Fatalf("CompileSpec(%q) = %v, %v", spec, doc, err)
		}
	}

	if _, err := CompileSpec(filepath.Join(t.TempDir(), "missing.srx")); err == nil || !strings.Contains(err.Error(), "read srx") {
		t.Fatalf("missing file err = %v", err)
	}

	invalid := filepath.Join(t.TempDir(), "invalid.srx")
	if err := os.WriteFile(invalid, []byte("<srx><body></body></srx>"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := CompileSpec(invalid); err == nil || !strings.Contains(err.Error(), "compile srx") {
		t.Fatalf("invalid file err = %v", err)
	}
}

func TestApplyToIngestEntriesPassThrough(t *testing.T) {
	t.Parallel()
	doc := mustCompile(t, "default")
	entries := map[string]translationfileparser.IngestEntry{"a": {Text: "One. Two."}}

	if got, warnings, err := ApplyToIngestEntries(nil, "en.json", "", "en", entries); err != nil || warnings != nil || len(got) != 1 || got["a"].Text != "One. Two." {
		t.Fatalf("nil doc = %v, %v, %v", got, warnings, err)
	}
	empty := map[string]translationfileparser.IngestEntry{}
	if got, warnings, err := ApplyToIngestEntries(doc, "en.json", "", "en", empty); err != nil || warnings != nil || len(got) != 0 {
		t.Fatalf("empty entries = %v, %v, %v", got, warnings, err)
	}
}

func TestApplyToIngestEntriesIgnoresSegmentedFormats(t *testing.T) {
	t.Parallel()
	doc := mustCompile(t, "default")
	entries := map[string]translationfileparser.IngestEntry{"a": {Text: "One. Two."}}
	cases := []struct{ path, mode string }{
		{path: "messages.xliff", mode: ""},
		{path: "messages.po", mode: ""},
		{path: "en.json", mode: "formatjs"},
		{path: "app_en.arb", mode: "arb"},
	}
	for _, tc := range cases {
		got, warnings, err := ApplyToIngestEntries(doc, tc.path, tc.mode, "en", entries)
		if err != nil {
			t.Fatalf("%s/%s: %v", tc.path, tc.mode, err)
		}
		if len(warnings) != 1 || !strings.Contains(warnings[0], "srx ignored for "+tc.path) {
			t.Fatalf("%s/%s warnings = %v", tc.path, tc.mode, warnings)
		}
		if len(got) != 1 || got["a"].Text != "One. Two." {
			t.Fatalf("%s/%s entries changed: %v", tc.path, tc.mode, got)
		}
	}
}

func TestApplyToIngestEntriesRejectsReservedKeys(t *testing.T) {
	t.Parallel()
	doc := mustCompile(t, "default")
	entries := map[string]translationfileparser.IngestEntry{
		"intro#srx.0": {Text: "Already split."},
		"plain":       {Text: "One. Two."},
	}
	_, _, err := ApplyToIngestEntries(doc, "en.json", "", "en", entries)
	if err == nil || !strings.Contains(err.Error(), "reserved srx span keys") || !strings.Contains(err.Error(), "intro#srx.0") {
		t.Fatalf("err = %v", err)
	}
}

func TestApplyToIngestEntriesSkipsAndCopiesMetadata(t *testing.T) {
	t.Parallel()
	doc := mustCompile(t, "default")
	entries := map[string]translationfileparser.IngestEntry{
		"single":  {Text: "Just one sentence."},
		"blank":   {Text: "   "},
		"icu":     {Text: "{count, plural, one {One file.} other {# files.}}"},
		"multi":   {Text: "First sentence. Second sentence.", MaxLength: 80, Fingerprint: "fp", Path: "a.b", Kind: "string", Format: "json", Context: "header"},
		"another": {Text: "Hi! Bye."},
	}
	got, warnings, err := ApplyToIngestEntries(doc, "en.json", "", "en-US", entries)
	if err != nil || len(warnings) != 0 {
		t.Fatalf("err = %v, warnings = %v", err, warnings)
	}
	for _, key := range []string{"single", "blank", "icu"} {
		if got[key] != entries[key] {
			t.Fatalf("%s should pass through unchanged, got %+v", key, got[key])
		}
	}
	if _, ok := got["multi"]; ok {
		t.Fatal("split entry should be replaced by span keys")
	}
	first, second := got["multi#srx.0"], got["multi#srx.1"]
	if first.Text != "First sentence." || second.Text != " Second sentence." {
		t.Fatalf("spans = %q, %q", first.Text, second.Text)
	}
	for _, span := range []translationfileparser.IngestEntry{first, second} {
		if span.MaxLength != 80 || span.Fingerprint != "fp" || span.Path != "a.b" || span.Kind != "string" || span.Format != "json" || span.Context != "header" {
			t.Fatalf("span metadata not copied: %+v", span)
		}
	}
	if got["another#srx.0"].Text+got["another#srx.1"].Text != "Hi! Bye." {
		t.Fatalf("another spans = %+v", got)
	}
}

func BenchmarkApplyToIngestEntries(b *testing.B) {
	doc, err := CompileSpec("default")
	if err != nil {
		b.Fatal(err)
	}
	entries := make(map[string]translationfileparser.IngestEntry, 1000)
	for i := 0; i < 1000; i++ {
		key := "section." + strconv.Itoa(i%50) + ".key" + strconv.Itoa(i)
		switch i % 4 {
		case 0:
			entries[key] = translationfileparser.IngestEntry{Text: "Save"}
		case 1:
			entries[key] = translationfileparser.IngestEntry{Text: "{count, plural, one {# file} other {# files}}"}
		default:
			entries[key] = translationfileparser.IngestEntry{Text: "Your changes were saved. Dr. Smith will review them soon! Do you want to continue? Click next."}
		}
	}
	split, _, err := ApplyToIngestEntries(doc, "en.json", "", "en-US", entries)
	if err != nil || len(split) <= len(entries) {
		b.Fatalf("fixture did not split: %d -> %d entries, err %v", len(entries), len(split), err)
	}
	b.ReportAllocs()
	for b.Loop() {
		if _, _, err := ApplyToIngestEntries(doc, "en.json", "", "en-US", entries); err != nil {
			b.Fatal(err)
		}
	}
}

func mustCompile(t *testing.T, spec string) *srx.Document {
	t.Helper()
	doc, err := CompileSpec(spec)
	if err != nil {
		t.Fatal(err)
	}
	return doc
}
