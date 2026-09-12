package srx

import (
	"strings"
	"testing"
)

const twoLangSRX = `<?xml version="1.0"?>
<srx xmlns="http://www.lisa.org/srx20" version="2.0">
  <body>
    <languagerules>
      <languagerule languagename="English">
        <rule break="no">
          <beforebreak>Mr\.</beforebreak>
          <afterbreak>\s</afterbreak>
        </rule>
        <rule break="yes">
          <beforebreak>[\.!\?]</beforebreak>
          <afterbreak>\s</afterbreak>
        </rule>
      </languagerule>
      <languagerule languagename="French">
        <rule break="yes">
          <beforebreak>!</beforebreak>
          <afterbreak>\s</afterbreak>
        </rule>
      </languagerule>
    </languagerules>
    <maprules>
      <languagemap languagepattern="en.*" languagerulename="English"/>
      <languagemap languagepattern="fr.*" languagerulename="French"/>
    </maprules>
  </body>
</srx>`

func TestParseRejectsEmptyAndInvalid(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name    string
		input   string
		wantErr string
	}{
		{name: "empty", input: "  ", wantErr: "empty document"},
		{name: "not xml", input: "hello", wantErr: "srx decode"},
		{name: "no language rules", input: `<srx><body></body></srx>`, wantErr: "languagerules must not be empty"},
		{name: "missing language name", input: `<srx><body><languagerules><languagerule><rule break="yes"><beforebreak>\.</beforebreak></rule></languagerule></languagerules></body></srx>`, wantErr: "languagename is required"},
		{name: "duplicate language", input: `<srx><body><languagerules><languagerule languagename="A"/><languagerule languagename="A"/></languagerules></body></srx>`, wantErr: "duplicate languagerule"},
		{name: "invalid break", input: `<srx><body><languagerules><languagerule languagename="A"><rule break="maybe"><beforebreak>\.</beforebreak></rule></languagerule></languagerules></body></srx>`, wantErr: "invalid break"},
		{name: "empty rule", input: `<srx><body><languagerules><languagerule languagename="A"><rule break="yes"></rule></languagerule></languagerules></body></srx>`, wantErr: "beforebreak or afterbreak is required"},
		{name: "invalid before regex", input: `<srx><body><languagerules><languagerule languagename="A"><rule break="yes"><beforebreak>(</beforebreak></rule></languagerule></languagerules></body></srx>`, wantErr: "invalid beforebreak"},
		{name: "invalid after regex", input: `<srx><body><languagerules><languagerule languagename="A"><rule break="yes"><afterbreak>(</afterbreak></rule></languagerule></languagerules></body></srx>`, wantErr: "invalid afterbreak"},
		{name: "unknown map target", input: `<srx><body><languagerules><languagerule languagename="A"/></languagerules><maprules><languagemap languagepattern=".*" languagerulename="Missing"/></maprules></body></srx>`, wantErr: "unknown languagerulename"},
		{name: "invalid language pattern", input: `<srx><body><languagerules><languagerule languagename="A"/></languagerules><maprules><languagemap languagepattern="(" languagerulename="A"/></maprules></body></srx>`, wantErr: "invalid languagepattern"},
		{name: "invalid cascade", input: `<srx><header cascade="maybe"/><body><languagerules><languagerule languagename="A"/></languagerules></body></srx>`, wantErr: "cascade must be yes or no"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			_, err := Parse([]byte(tc.input))
			if err == nil {
				t.Fatalf("expected error containing %q", tc.wantErr)
			}
			if !strings.Contains(err.Error(), tc.wantErr) {
				t.Fatalf("error %q does not contain %q", err.Error(), tc.wantErr)
			}
		})
	}
}

func TestParseNamespacedDocument(t *testing.T) {
	t.Parallel()
	doc, err := Parse([]byte(twoLangSRX))
	if err != nil {
		t.Fatalf("parse namespaced srx: %v", err)
	}
	if doc.Fingerprint() == "" {
		t.Fatal("expected fingerprint")
	}
}

func TestSegmentSplitsSentencesAndKeepsAbbreviations(t *testing.T) {
	t.Parallel()
	doc, err := Parse([]byte(twoLangSRX))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	text := "Mr. Smith arrived. Hello world! Done?"
	spans := doc.Segment(text, "en-US")
	got := spanTexts(spans)
	want := []string{"Mr. Smith arrived.", " Hello world!", " Done?"}
	if !equalStrings(got, want) {
		t.Fatalf("spans = %#v, want %#v", got, want)
	}
	if joined := Join(spans, got); joined != text {
		t.Fatalf("join original = %q, want %q", joined, text)
	}
}

func TestSegmentLanguageMapSelectsFrenchRules(t *testing.T) {
	t.Parallel()
	doc, err := Parse([]byte(twoLangSRX))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	text := "Bonjour. Merci! Encore."
	fr := spanTexts(doc.Segment(text, "fr-FR"))
	if !equalStrings(fr, []string{"Bonjour. Merci!", " Encore."}) {
		t.Fatalf("french spans = %#v", fr)
	}
	en := spanTexts(doc.Segment(text, "en"))
	if !equalStrings(en, []string{"Bonjour.", " Merci!", " Encore."}) {
		t.Fatalf("english spans = %#v", en)
	}
}

func TestSegmentFallsBackWhenLanguageUnmapped(t *testing.T) {
	t.Parallel()
	doc, err := Parse([]byte(`<srx><body><languagerules>
      <languagerule languagename="Default">
        <rule break="yes"><beforebreak>\.</beforebreak><afterbreak>\s</afterbreak></rule>
      </languagerule>
    </languagerules></body></srx>`))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	got := spanTexts(doc.Segment("One. Two.", "zh-CN"))
	if !equalStrings(got, []string{"One.", " Two."}) {
		t.Fatalf("fallback spans = %#v", got)
	}
}

func TestSegmentFirstMatchingRuleWins(t *testing.T) {
	t.Parallel()
	doc, err := Parse([]byte(`<srx><body><languagerules>
      <languagerule languagename="Default">
        <rule break="no"><beforebreak>Dr\.</beforebreak><afterbreak>\s</afterbreak></rule>
        <rule break="yes"><beforebreak>\.</beforebreak><afterbreak>\s</afterbreak></rule>
      </languagerule>
    </languagerules></body></srx>`))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	got := spanTexts(doc.Segment("Dr. Lee left. Next.", "en"))
	if !equalStrings(got, []string{"Dr. Lee left.", " Next."}) {
		t.Fatalf("spans = %#v", got)
	}
}

func TestSegmentDecimalDoesNotBreakWhenRuled(t *testing.T) {
	t.Parallel()
	doc, err := LoadTemplate(TemplateDefault)
	if err != nil {
		t.Fatalf("load default: %v", err)
	}
	got := spanTexts(doc.Segment("Version 1.2 shipped. Next.", "en"))
	if !equalStrings(got, []string{"Version 1.2 shipped.", " Next."}) {
		t.Fatalf("spans = %#v", got)
	}
}

func TestSegmentEmptyAndSingleSentence(t *testing.T) {
	t.Parallel()
	doc, err := LoadTemplate(TemplateDefault)
	if err != nil {
		t.Fatalf("load default: %v", err)
	}
	if spans := doc.Segment("", "en"); spans != nil {
		t.Fatalf("empty text spans = %#v", spans)
	}
	text := "Just one sentence"
	got := spanTexts(doc.Segment(text, "en"))
	if !equalStrings(got, []string{text}) {
		t.Fatalf("single sentence spans = %#v", got)
	}
}

func TestSegmentNilDocumentReturnsWholeText(t *testing.T) {
	t.Parallel()
	var doc *Document
	got := spanTexts(doc.Segment("Hello. World.", "en"))
	if !equalStrings(got, []string{"Hello. World."}) {
		t.Fatalf("nil document spans = %#v", got)
	}
}

func TestJoinRestoresLeadingWhitespace(t *testing.T) {
	t.Parallel()
	spans := []Span{
		{Text: "Hello."},
		{Text: " World."},
	}
	got := Join(spans, []string{"Bonjour.", "Monde."})
	if got != "Bonjour. Monde." {
		t.Fatalf("join = %q", got)
	}
}

func TestJoinFallsBackToSourceWhenTranslationMissing(t *testing.T) {
	t.Parallel()
	spans := []Span{{Text: "Hello."}, {Text: " World."}}
	got := Join(spans, []string{"Bonjour."})
	if got != "Bonjour. World." {
		t.Fatalf("join = %q", got)
	}
}

func TestSpanKeyRoundTrip(t *testing.T) {
	t.Parallel()
	key := SpanKey("home.title", 2)
	if key != "home.title#srx.2" {
		t.Fatalf("span key = %q", key)
	}
	fileKey, index, ok := SplitSpanKey(key)
	if !ok || fileKey != "home.title" || index != 2 {
		t.Fatalf("split = %q %d %v", fileKey, index, ok)
	}
	if FileKey(key) != "home.title" {
		t.Fatalf("file key = %q", FileKey(key))
	}
	if FileKey("plain") != "plain" {
		t.Fatalf("plain file key = %q", FileKey("plain"))
	}
	if _, _, ok := SplitSpanKey("home#srx."); ok {
		t.Fatal("expected invalid empty index to fail")
	}
	if _, _, ok := SplitSpanKey("#srx.1"); ok {
		t.Fatal("expected missing file key to fail")
	}
}

func TestSegmentCascadesMatchingLanguageMaps(t *testing.T) {
	t.Parallel()
	const rules = `
    <languagerules>
      <languagerule languagename="FrenchExceptions">
        <rule break="no"><beforebreak>M\.</beforebreak><afterbreak>\s</afterbreak></rule>
      </languagerule>
      <languagerule languagename="Default">
        <rule break="yes"><beforebreak>[\.!\?]</beforebreak><afterbreak>\s</afterbreak></rule>
      </languagerule>
    </languagerules>
    <maprules>
      <languagemap languagepattern="fr.*" languagerulename="FrenchExceptions"/>
      <languagemap languagepattern=".*" languagerulename="Default"/>
    </maprules>`
	cascade, err := Parse([]byte(`<srx><header segmentsubflows="yes" cascade="yes"/><body>` + rules + `</body></srx>`))
	if err != nil {
		t.Fatalf("parse cascade yes: %v", err)
	}
	noCascade, err := Parse([]byte(`<srx><header cascade="no"/><body>` + rules + `</body></srx>`))
	if err != nil {
		t.Fatalf("parse cascade no: %v", err)
	}

	text := "M. Dupont partit. Ensuite."
	if got := spanTexts(cascade.Segment(text, "fr-FR")); !equalStrings(got, []string{"M. Dupont partit.", " Ensuite."}) {
		t.Fatalf("cascade yes spans = %#v", got)
	}
	if got := spanTexts(noCascade.Segment(text, "fr-FR")); !equalStrings(got, []string{text}) {
		t.Fatalf("cascade no should use only the first map, got %#v", got)
	}
	if got := spanTexts(cascade.Segment(text, "en")); !equalStrings(got, []string{"M.", " Dupont partit.", " Ensuite."}) {
		t.Fatalf("english cascade spans = %#v", got)
	}
}

func TestReservedSpanKeys(t *testing.T) {
	t.Parallel()
	got := ReservedSpanKeys(map[string]string{
		"hello":      "Hello",
		"foo#srx.0":  "span",
		"bar#srx.10": "later",
	})
	want := []string{"bar#srx.10", "foo#srx.0"}
	if !equalStrings(got, want) {
		t.Fatalf("reserved = %#v, want %#v", got, want)
	}
	if IsReservedSpanKey("hello") || !IsReservedSpanKey("hello#srx.0") {
		t.Fatal("IsReservedSpanKey mismatch")
	}
}

func TestFingerprintChangesWhenRulesChange(t *testing.T) {
	t.Parallel()
	a, err := Parse([]byte(`<srx><body><languagerules><languagerule languagename="A"><rule break="yes"><beforebreak>\.</beforebreak></rule></languagerule></languagerules></body></srx>`))
	if err != nil {
		t.Fatalf("parse a: %v", err)
	}
	b, err := Parse([]byte(`<srx><body><languagerules><languagerule languagename="A"><rule break="yes"><beforebreak>!</beforebreak></rule></languagerule></languagerules></body></srx>`))
	if err != nil {
		t.Fatalf("parse b: %v", err)
	}
	if a.Fingerprint() == b.Fingerprint() {
		t.Fatal("expected fingerprints to differ")
	}
}

func spanTexts(spans []Span) []string {
	out := make([]string, len(spans))
	for i, span := range spans {
		out[i] = span.Text
	}
	return out
}

func equalStrings(got, want []string) bool {
	if len(got) != len(want) {
		return false
	}
	for i := range got {
		if got[i] != want[i] {
			return false
		}
	}
	return true
}
