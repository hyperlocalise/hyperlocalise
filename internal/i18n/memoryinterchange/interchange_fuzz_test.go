package memoryinterchange

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"unicode/utf8"
)

func addFixtureSeeds(f *testing.F, ext string) {
	f.Helper()
	paths, _ := filepath.Glob(filepath.Join("fixtures", "testdata", "*."+ext))
	for _, path := range paths {
		data, err := os.ReadFile(path)
		if err == nil {
			f.Add(string(data))
		}
	}
}

// FuzzParseTMX checks that malformed TMX never panics and that every candidate
// it returns is complete enough to import.
func FuzzParseTMX(f *testing.F) {
	addFixtureSeeds(f, "tmx")
	f.Add(generateBenchmarkTMX(2))
	f.Add(`<tmx><body><tu tuid="1"><tuv xml:lang="en"><seg>a</seg></tuv></tu></body></tmx>`)
	f.Fuzz(func(t *testing.T, content string) {
		candidates, _, _ := ParseTMX(content)
		for _, candidate := range candidates {
			if candidate.TargetLocale == "" {
				t.Fatalf("candidate without target locale: %+v", candidate)
			}
			if candidate.ExternalKey != nil && candidate.Tuid == nil {
				t.Fatalf("external key without tuid: %+v", candidate)
			}
		}
	})
}

// FuzzCSVRoundTrip checks that any candidate CSV can serialize survives a
// serialize-then-parse round trip, including formula escaping.
//
// Text containing '\r' is excluded: encoding/csv drops carriage returns inside
// quoted fields on read, so "0\r" comes back as "0". That loss is a known
// encoding/csv limitation, tracked separately from this fuzz target.
func FuzzCSVRoundTrip(f *testing.F) {
	f.Add("Save", "Enregistrer", 100)
	f.Add("=SUM(A1:A2)", "+cmd", 90)
	f.Add("line\nbreak, \"quoted\"", FormulaEscapePrefix+"@x", 0)
	f.Fuzz(func(t *testing.T, source, target string, score int) {
		if strings.TrimSpace(source) == "" || strings.TrimSpace(target) == "" ||
			!utf8.ValidString(source+target) || strings.ContainsRune(source+target, '\r') {
			return
		}
		rows := []Candidate{{SourceLocale: "en", TargetLocale: "fr-FR", SourceText: source, TargetText: target, MatchScore: score}}
		data, err := SerializeCSV(rows)
		if err != nil {
			t.Fatal(err)
		}
		parsed, issues := ParseCSV(string(data))
		if len(issues) != 0 || len(parsed) != 1 {
			t.Fatalf("round trip produced %d candidates, issues %+v", len(parsed), issues)
		}
		got := parsed[0]
		if got.SourceText != source || got.TargetText != target || got.MatchScore != score {
			t.Fatalf("round trip = %+v, want source %q target %q score %d", got, source, target, score)
		}
	})
}

// FuzzNormalizeSourceText checks that normalizing twice equals normalizing once
// for valid UTF-8. Invalid UTF-8 is skipped: NFKC passes the rune after an
// invalid byte through unnormalized, so a second pass can still change it.
func FuzzNormalizeSourceText(f *testing.F) {
	for _, seed := range []string{"", "save", "  Save  Now ", "Ｓａｖｅ", "a b", "Ä\tö"} {
		f.Add(seed)
	}
	f.Fuzz(func(t *testing.T, value string) {
		if !utf8.ValidString(value) {
			return
		}
		once := NormalizeSourceText(value)
		if twice := NormalizeSourceText(once); twice != once {
			t.Fatalf("NormalizeSourceText not idempotent: %q -> %q -> %q", value, once, twice)
		}
	})
}
