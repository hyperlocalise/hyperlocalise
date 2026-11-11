package translationfileparser

import "testing"

// These fuzz targets cover formats users upload directly. Each checks that
// parsing never panics and that writing the parsed values back into the same
// template also never panics.

func FuzzAsciiDocParseMarshal(f *testing.F) {
	f.Add([]byte(generateLargeAsciiDoc(2)))
	f.Add([]byte("= Title\n\n|===\n|a |b\n"))
	f.Add([]byte("link:x[y\n+mono+ pass:[x] image::a.png[b]\n"))
	f.Fuzz(func(t *testing.T, content []byte) {
		values, err := AsciiDocParser{}.Parse(content)
		if err != nil {
			return
		}
		_ = MarshalAsciiDoc(content, values)
		_ = ParseAsciiDocDocumentIR(content)
	})
}

func FuzzHTMLParseMarshal(f *testing.F) {
	f.Add(generateLargeHTML(2))
	f.Add([]byte("<p>Hi <b>there</p><img alt=x>"))
	f.Add([]byte("<script><p>not text</p></script><!-- <p>c</p> -->"))
	f.Fuzz(func(t *testing.T, content []byte) {
		values, err := HTMLParser{}.Parse(content)
		if err != nil {
			return
		}
		_, _ = MarshalHTML(content, values)
	})
}

func FuzzQtLinguistParseMarshal(f *testing.F) {
	f.Add([]byte(qtLinguistSample))
	f.Add(generateLargeQtLinguist(3))
	f.Fuzz(func(t *testing.T, content []byte) {
		values, err := QtLinguistParser{}.Parse(content)
		if err != nil {
			return
		}
		_, _ = MarshalQtLinguist(content, values, "en", "fr_FR")
	})
}
