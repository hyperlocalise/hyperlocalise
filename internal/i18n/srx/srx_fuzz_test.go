package srx

import (
	"strings"
	"testing"
)

// FuzzParseAndSegment checks that arbitrary SRX documents never panic, and
// that any document that parses segments text into spans that exactly cover
// the input.
func FuzzParseAndSegment(f *testing.F) {
	f.Add([]byte(twoLangSRX), "Hello Mr. Smith. How are you? Fine!", "en-US")
	f.Add([]byte(`<srx><body><languagerules><languagerule languagename="A"><rule><afterbreak>\s</afterbreak></rule></languagerule></languagerules></body></srx>`), "a b  c", "fr")
	f.Add([]byte(`<srx><header cascade="yes"/><body><languagerules><languagerule languagename="A"><rule break="no"><beforebreak>x</beforebreak></rule></languagerule></languagerules></body></srx>`), "xxx", "")
	f.Fuzz(func(t *testing.T, data []byte, text, language string) {
		doc, err := Parse(data)
		if err != nil {
			return
		}
		spans := doc.Segment(text, language)
		var joined strings.Builder
		prevEnd := 0
		for _, span := range spans {
			if span.Start != prevEnd || span.End <= span.Start || span.End > len(text) || text[span.Start:span.End] != span.Text {
				t.Fatalf("invalid span %+v (prev end %d) for %q", span, prevEnd, text)
			}
			joined.WriteString(span.Text)
			prevEnd = span.End
		}
		if joined.String() != text {
			t.Fatalf("spans reassemble to %q, want %q", joined.String(), text)
		}
	})
}
