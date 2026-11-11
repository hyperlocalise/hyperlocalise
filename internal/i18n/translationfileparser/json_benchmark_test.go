package translationfileparser

import (
	"fmt"
	"strings"
	"testing"
)

const jsonBenchmarkEntries = 1000

func BenchmarkJSONParser(b *testing.B) {
	content := generateLargeJSON(jsonBenchmarkEntries)
	benchmarkFixtureValues(b, JSONParser{}.Parse, content, jsonBenchmarkEntries)
	benchmarkParse(b, JSONParser{}.Parse, content)
}

func BenchmarkJSONParserParseWithContext(b *testing.B) {
	content := generateLargeJSON(jsonBenchmarkEntries)
	parse := func(content []byte) (map[string]string, error) {
		values, _, err := JSONParser{}.ParseWithContext(content)
		return values, err
	}
	benchmarkParse(b, parse, content)
}

func BenchmarkJSONMarshal(b *testing.B) {
	content := generateLargeJSON(jsonBenchmarkEntries)
	values := benchmarkFixtureValues(b, JSONParser{}.Parse, content, jsonBenchmarkEntries)

	b.SetBytes(int64(len(content)))
	b.ReportAllocs()
	for b.Loop() {
		if _, err := MarshalJSON(content, values); err != nil {
			b.Fatal(err)
		}
	}
}

// generateLargeJSON builds a nested locale file with ten keys per section.
func generateLargeJSON(n int) []byte {
	var sb strings.Builder
	sb.WriteString("{\n")
	sections := (n + 9) / 10
	for s := 0; s < sections; s++ {
		fmt.Fprintf(&sb, "  \"section%d\": {\n", s)
		for k := 0; k < 10; k++ {
			i := s*10 + k
			sep := ","
			if k == 9 {
				sep = ""
			}
			fmt.Fprintf(&sb, "    \"key%d\": \"Hello {name}, you have %d new messages\"%s\n", i, i, sep)
		}
		sep := ","
		if s == sections-1 {
			sep = ""
		}
		fmt.Fprintf(&sb, "  }%s\n", sep)
	}
	sb.WriteString("}\n")
	return []byte(sb.String())
}
