package translationfileparser

import "testing"

// benchmarkFixtureValues parses content once and returns a translated value for
// every key, failing fast when the generated fixture does not parse into the
// expected number of entries.
func benchmarkFixtureValues(b *testing.B, parse func([]byte) (map[string]string, error), content []byte, minEntries int) map[string]string {
	b.Helper()
	parsed, err := parse(content)
	if err != nil {
		b.Fatalf("parse fixture: %v", err)
	}
	if len(parsed) < minEntries {
		b.Fatalf("fixture parsed into %d entries, want at least %d", len(parsed), minEntries)
	}
	values := make(map[string]string, len(parsed))
	for key, value := range parsed {
		values[key] = value + " (translated)"
	}
	return values
}

// benchmarkParse runs parse over content, reporting throughput and allocations.
func benchmarkParse(b *testing.B, parse func([]byte) (map[string]string, error), content []byte) {
	b.Helper()
	b.SetBytes(int64(len(content)))
	b.ReportAllocs()
	for b.Loop() {
		if _, err := parse(content); err != nil {
			b.Fatal(err)
		}
	}
}
