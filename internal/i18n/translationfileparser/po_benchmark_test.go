package translationfileparser

import (
	"fmt"
	"strings"
	"testing"
)

func BenchmarkPOParser(b *testing.B) {
	content := generateLargePO(1000)
	parser := POFileParser{}

	b.ResetTimer()
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		_, _ = parser.Parse(content)
	}
}

func BenchmarkPOMarshal(b *testing.B) {
	content := generateLargePO(1000)
	values := map[string]string{}
	for i := 0; i < 1000; i++ {
		values[fmt.Sprintf("key%d", i)] = fmt.Sprintf("value%d-translated", i)
	}

	b.ResetTimer()
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		_, _ = MarshalPOFile(content, values)
	}
}

func generateLargePO(n int) []byte {
	var sb strings.Builder
	sb.WriteString("msgid \"\"\nmsgstr \"\"\n\"Content-Type: text/plain; charset=UTF-8\\n\"\n\n")
	for i := 0; i < n; i++ {
		sb.WriteString(fmt.Sprintf("msgid \"key%d\"\n", i))
		sb.WriteString(fmt.Sprintf("msgstr \"value%d\"\n\n", i))
	}
	return []byte(sb.String())
}
