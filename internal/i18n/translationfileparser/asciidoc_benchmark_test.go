package translationfileparser

import (
	"fmt"
	"strings"
	"testing"
)

const asciiDocBenchmarkSections = 200

func BenchmarkAsciiDocParser(b *testing.B) {
	content := generateLargeAsciiDoc(asciiDocBenchmarkSections)
	benchmarkFixtureValues(b, AsciiDocParser{}.Parse, content, asciiDocBenchmarkSections)
	benchmarkParse(b, AsciiDocParser{}.Parse, content)
}

func BenchmarkAsciiDocMarshal(b *testing.B) {
	content := generateLargeAsciiDoc(asciiDocBenchmarkSections)
	values := benchmarkFixtureValues(b, AsciiDocParser{}.Parse, content, asciiDocBenchmarkSections)

	b.SetBytes(int64(len(content)))
	b.ReportAllocs()
	for b.Loop() {
		_ = MarshalAsciiDoc(content, values)
	}
}

func BenchmarkAsciiDocDocumentIR(b *testing.B) {
	content := generateLargeAsciiDoc(asciiDocBenchmarkSections)

	b.SetBytes(int64(len(content)))
	b.ReportAllocs()
	for b.Loop() {
		_ = ParseAsciiDocDocumentIR(content)
	}
}

// generateLargeAsciiDoc builds a document mixing sections, inline formatting,
// macros, lists, tables, admonitions, and source blocks that must be skipped.
func generateLargeAsciiDoc(n int) []byte {
	var sb strings.Builder
	sb.WriteString("= Benchmark Guide\n:toc:\n:icons: font\n\n")
	for i := 0; i < n; i++ {
		fmt.Fprintf(&sb, "== Section %d\n\n", i)
		fmt.Fprintf(&sb, "This is paragraph %d with *bold*, _italic_, `+code+` and a link:https://example.com/%d[docs link].\n\n", i, i)
		fmt.Fprintf(&sb, "* First item %d\n* Second item with image:icon-%d.png[Icon %d]\n\n", i, i, i)
		fmt.Fprintf(&sb, "NOTE: Remember to save your work in step %d.\n\n", i)
		sb.WriteString("[cols=\"1,2\"]\n|===\n|Name |Description\n\n")
		fmt.Fprintf(&sb, "|Option %d |Controls feature %d\n|===\n\n", i, i)
		fmt.Fprintf(&sb, "[source,go]\n----\nfmt.Println(\"section %d\")\n----\n\n", i)
	}
	return []byte(sb.String())
}
