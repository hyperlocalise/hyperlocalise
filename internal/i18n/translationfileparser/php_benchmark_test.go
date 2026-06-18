package translationfileparser

import (
	"fmt"
	"strings"
	"testing"
)

func BenchmarkPHPArrayParser(b *testing.B) {
	content := generateLargePHPArray(1000)
	parser := PHPArrayParser{}

	b.ResetTimer()
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		_, _ = parser.Parse(content)
	}
}

func BenchmarkPHPArrayMarshal(b *testing.B) {
	content := generateLargePHPArray(1000)
	values := map[string]string{}
	for i := 0; i < 1000; i++ {
		values[fmt.Sprintf("key%d", i)] = fmt.Sprintf("value%d-translated", i)
	}

	b.ResetTimer()
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		_, _ = MarshalPHPArrayLocale(content, values)
	}
}

func generateLargePHPArray(n int) []byte {
	var sb strings.Builder
	sb.WriteString("<?php\nreturn [\n")
	for i := 0; i < n; i++ {
		fmt.Fprintf(&sb, "  'key%d' => 'value %d',\n", i, i)
	}
	sb.WriteString("];\n")
	return []byte(sb.String())
}
