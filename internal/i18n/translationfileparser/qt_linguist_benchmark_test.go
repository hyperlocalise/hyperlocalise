package translationfileparser

import (
	"fmt"
	"strings"
	"testing"
)

const qtLinguistBenchmarkEntries = 1000

func BenchmarkQtLinguistParser(b *testing.B) {
	content := generateLargeQtLinguist(qtLinguistBenchmarkEntries)
	benchmarkFixtureValues(b, QtLinguistParser{}.Parse, content, qtLinguistBenchmarkEntries)
	benchmarkParse(b, QtLinguistParser{}.Parse, content)
}

func BenchmarkQtLinguistMarshal(b *testing.B) {
	content := generateLargeQtLinguist(qtLinguistBenchmarkEntries)
	values := benchmarkFixtureValues(b, QtLinguistParser{}.Parse, content, qtLinguistBenchmarkEntries)

	b.SetBytes(int64(len(content)))
	b.ReportAllocs()
	for b.Loop() {
		if _, err := MarshalQtLinguist(content, values, "en", "fr_FR"); err != nil {
			b.Fatal(err)
		}
	}
}

// generateLargeQtLinguist builds a .ts file with 20 messages per context and a
// plural message in every context.
func generateLargeQtLinguist(n int) []byte {
	var sb strings.Builder
	sb.WriteString("<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<!DOCTYPE TS>\n<TS version=\"2.1\" language=\"fr_FR\" sourcelanguage=\"en\">\n")
	for i := 0; i < n; i++ {
		if i%20 == 0 {
			if i > 0 {
				sb.WriteString("</context>\n")
			}
			fmt.Fprintf(&sb, "<context>\n    <name>Window%d</name>\n", i/20)
		}
		if i%20 == 19 {
			fmt.Fprintf(&sb, "    <message numerus=\"yes\">\n        <source>%%n file(s) in folder %d</source>\n        <translation>\n            <numerusform>%%n file</numerusform>\n            <numerusform>%%n files</numerusform>\n        </translation>\n    </message>\n", i)
			continue
		}
		fmt.Fprintf(&sb, "    <message>\n        <location filename=\"window.cpp\" line=\"%d\"/>\n        <source>Action label %d</source>\n        <comment>button %d</comment>\n        <translation type=\"unfinished\"></translation>\n    </message>\n", i, i, i)
	}
	sb.WriteString("</context>\n</TS>\n")
	return []byte(sb.String())
}
