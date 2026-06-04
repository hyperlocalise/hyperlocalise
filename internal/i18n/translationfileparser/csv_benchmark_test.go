package translationfileparser

import (
	"fmt"
	"strings"
	"testing"
)

func BenchmarkCSVParser(b *testing.B) {
	content := generateLargeCSV(10000)
	parser := CSVParser{}

	b.ResetTimer()
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		_, _ = parser.Parse(content)
	}
}

func BenchmarkCSVMarshal(b *testing.B) {
	content := generateLargeCSV(10000)
	values := map[string]string{}
	for i := 0; i < 10000; i++ {
		values[fmt.Sprintf("key%d", i)] = fmt.Sprintf("value%d-translated", i)
	}

	b.ResetTimer()
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		_, _ = MarshalCSV(content, values, CSVParser{})
	}
}

func generateLargeCSV(n int) []byte {
	var sb strings.Builder
	sb.WriteString("key,en,fr\n")
	for i := 0; i < n; i++ {
		fmt.Fprintf(&sb, "key%d,value%d,valeur%d\n", i, i, i)
	}
	return []byte(sb.String())
}
