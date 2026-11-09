package translationfileparser

import (
	"fmt"
	"strings"
	"testing"
)

const tomlBenchmarkEntries = 1000

func BenchmarkTOMLParser(b *testing.B) {
	content := generateLargeTOML(tomlBenchmarkEntries)
	benchmarkFixtureValues(b, TOMLParser{}.Parse, content, tomlBenchmarkEntries)
	benchmarkParse(b, TOMLParser{}.Parse, content)
}

func BenchmarkTOMLMarshal(b *testing.B) {
	content := generateLargeTOML(tomlBenchmarkEntries)
	values := benchmarkFixtureValues(b, TOMLParser{}.Parse, content, tomlBenchmarkEntries)

	b.SetBytes(int64(len(content)))
	b.ReportAllocs()
	for b.Loop() {
		if _, err := MarshalTOML(content, values); err != nil {
			b.Fatal(err)
		}
	}
}

// generateLargeTOML builds a go-i18n style file with ten keys per table.
func generateLargeTOML(n int) []byte {
	var sb strings.Builder
	for i := 0; i < n; i++ {
		if i%10 == 0 {
			fmt.Fprintf(&sb, "\n[section%d]\n# Strings for section %d\n", i/10, i/10)
		}
		fmt.Fprintf(&sb, "key%d = \"Hello {{.Name}}, item %d\"\n", i, i)
	}
	return []byte(sb.String())
}
