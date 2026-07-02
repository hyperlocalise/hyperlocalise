package translationfileparser

import (
	"fmt"
	"strings"
	"testing"
)

func BenchmarkGenericXMLParser_Parse(b *testing.B) {
	content := generateLargeGenericXML(1000)
	parser := GenericXMLParser{}

	b.ResetTimer()
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		_, _ = parser.Parse(content)
	}
}

func BenchmarkMarshalGenericXML(b *testing.B) {
	n := 1000
	content := generateLargeGenericXML(n)
	values := map[string]string{}
	for i := 0; i < n; i++ {
		values[fmt.Sprintf("u%d", i)] = fmt.Sprintf("translated value %d", i)
	}

	b.ResetTimer()
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		_, _ = MarshalGenericXML(content, values)
	}
}

func generateLargeGenericXML(n int) []byte {
	var sb strings.Builder
	sb.WriteString(`<?xml version="1.0" encoding="UTF-8"?>
<locale code="en-US">
`)
	for i := 0; i < n; i++ {
		fmt.Fprintf(&sb, "  <message key=\"u%d\">source value %d</message>\n", i, i)
	}
	sb.WriteString("</locale>")
	return []byte(sb.String())
}
