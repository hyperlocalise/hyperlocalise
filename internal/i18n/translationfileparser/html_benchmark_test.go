package translationfileparser

import (
	"fmt"
	"strings"
	"testing"
)

const htmlBenchmarkSections = 200

func BenchmarkHTMLParser(b *testing.B) {
	content := generateLargeHTML(htmlBenchmarkSections)
	benchmarkFixtureValues(b, HTMLParser{}.Parse, content, htmlBenchmarkSections)
	benchmarkParse(b, HTMLParser{}.Parse, content)
}

func BenchmarkHTMLMarshal(b *testing.B) {
	content := generateLargeHTML(htmlBenchmarkSections)
	values := benchmarkFixtureValues(b, HTMLParser{}.Parse, content, htmlBenchmarkSections)

	b.SetBytes(int64(len(content)))
	b.ReportAllocs()
	for b.Loop() {
		_, _ = MarshalHTML(content, values)
	}
}

func BenchmarkHTMLMarshalWithTargetFallback(b *testing.B) {
	content := generateLargeHTML(htmlBenchmarkSections)
	values := benchmarkFixtureValues(b, HTMLParser{}.Parse, content, htmlBenchmarkSections)

	b.SetBytes(int64(len(content)))
	b.ReportAllocs()
	for b.Loop() {
		_, _ = MarshalHTMLWithTargetFallback(content, content, values)
	}
}

// generateLargeHTML builds a page mixing headings, inline markup, translatable
// attributes, and non-translatable script/style blocks.
func generateLargeHTML(n int) []byte {
	var sb strings.Builder
	sb.WriteString("<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n<title>Benchmark page</title>\n")
	sb.WriteString("<style>body { font-family: sans-serif; }</style>\n</head>\n<body>\n")
	for i := 0; i < n; i++ {
		fmt.Fprintf(&sb, "<section id=\"s%d\">\n", i)
		fmt.Fprintf(&sb, "  <h2>Section heading %d</h2>\n", i)
		fmt.Fprintf(&sb, "  <p>Paragraph %d with <strong>bold</strong> and <a href=\"/docs/%d\" title=\"Read docs %d\">a link</a>.</p>\n", i, i, i)
		fmt.Fprintf(&sb, "  <img src=\"/img/%d.png\" alt=\"Illustration %d\">\n", i, i)
		fmt.Fprintf(&sb, "  <button aria-label=\"Close panel %d\">Close</button>\n", i)
		sb.WriteString("</section>\n")
	}
	sb.WriteString("<script>window.analytics = { enabled: true };</script>\n</body>\n</html>\n")
	return []byte(sb.String())
}
