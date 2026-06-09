package translationfileparser

import (
	"fmt"
	"strings"
	"testing"
)

func BenchmarkAndroidXMLParser(b *testing.B) {
	content := generateLargeAndroidXML(1000)
	parser := AndroidXMLResourcesParser{}

	b.ResetTimer()
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		_, _ = parser.Parse(content)
	}
}

func BenchmarkAndroidXMLMarshal(b *testing.B) {
	content := generateLargeAndroidXML(1000)
	values := map[string]string{}
	for i := 0; i < 1000; i++ {
		values[fmt.Sprintf("key_%d", i)] = fmt.Sprintf("value_%d_translated", i)
	}

	b.ResetTimer()
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		_, _ = MarshalAndroidXMLResources(content, values)
	}
}

func BenchmarkAndroidXMLMarshalWithMarkup(b *testing.B) {
	content := generateLargeAndroidXML(1000)
	values := map[string]string{}
	for i := 0; i < 1000; i++ {
		// Include some markup to trigger the expensive path
		values[fmt.Sprintf("key_%d", i)] = fmt.Sprintf("value <b>%d</b> translated &amp; more", i)
	}

	b.ResetTimer()
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		_, _ = MarshalAndroidXMLResources(content, values)
	}
}

func generateLargeAndroidXML(n int) []byte {
	var sb strings.Builder
	sb.WriteString(`<?xml version="1.0" encoding="utf-8"?>
<resources xmlns:xliff="urn:oasis:names:tc:xliff:document:1.2">
`)
	for i := 0; i < n; i++ {
		fmt.Fprintf(&sb, "  <string name=\"key_%d\">value %d</string>\n", i, i)
	}
	sb.WriteString("</resources>")
	return []byte(sb.String())
}
