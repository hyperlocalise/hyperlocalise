package srx

import (
	"regexp"
	"slices"
	"strings"
	"testing"
)

func TestParseRejectsTruncatedDocuments(t *testing.T) {
	t.Parallel()
	// Each prefix stops inside a different decoder level, so every level must
	// surface the underlying EOF instead of returning a partial document.
	full := `<srx><header cascade="no"><x/></header><body><languagerules>` +
		`<languagerule languagename="A"><rule break="yes"><beforebreak>\.</beforebreak>` +
		`<afterbreak>\s</afterbreak></rule></languagerule></languagerules>` +
		`<maprules><languagemap languagepattern="en" languagerulename="A"/></maprules></body></srx>`
	cuts := map[string]string{
		"srx":           `<srx>`,
		"header":        `<srx><header cascade="no"><x/>`,
		"body":          `<srx><header/><body>`,
		"languagerules": `<srx><body><languagerules>`,
		"languagerule":  `<srx><body><languagerules><languagerule languagename="A">`,
		"rule":          `<srx><body><languagerules><languagerule languagename="A"><rule break="yes">`,
		"beforebreak":   `<srx><body><languagerules><languagerule languagename="A"><rule><beforebreak>\.`,
		"maprules":      `<srx><body><languagerules><languagerule languagename="A"/></languagerules><maprules>`,
		"languagemap":   `<srx><body><languagerules><languagerule languagename="A"/></languagerules><maprules><languagemap languagepattern="en" languagerulename="A">`,
	}
	if _, err := Parse([]byte(full)); err != nil {
		t.Fatalf("full document should parse: %v", err)
	}
	for name, input := range cuts {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			_, err := Parse([]byte(input))
			if err == nil || !strings.Contains(err.Error(), "srx decode") {
				t.Fatalf("Parse(%q) err = %v, want srx decode error", input, err)
			}
		})
	}
}

func TestParseRejectsMissingMapAttributesAndWrongRoot(t *testing.T) {
	t.Parallel()
	cases := map[string]struct {
		input   string
		wantErr string
	}{
		"wrong root": {
			input:   `<segmentation><body><languagerules><languagerule languagename="A"/></languagerules></body></segmentation>`,
			wantErr: "root element must be srx",
		},
		"missing language pattern": {
			input:   `<srx><body><languagerules><languagerule languagename="A"/></languagerules><maprules><languagemap languagerulename="A"/></maprules></body></srx>`,
			wantErr: "languagepattern is required",
		},
		"missing language rule name": {
			input:   `<srx><body><languagerules><languagerule languagename="A"/></languagerules><maprules><languagemap languagepattern="en"/></maprules></body></srx>`,
			wantErr: "languagerulename is required",
		},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			_, err := Parse([]byte(tc.input))
			if err == nil || !strings.Contains(err.Error(), tc.wantErr) {
				t.Fatalf("err = %v, want substring %q", err, tc.wantErr)
			}
		})
	}
}

func TestParseSkipsUnknownElements(t *testing.T) {
	t.Parallel()
	input := `<srx version="2.0">
  <header segmentsubflows="yes" cascade="YES"><formathandle type="start" include="no"/></header>
  <extension><anything deep="true"><child/></anything></extension>
  <body>
    <comment>ignored</comment>
    <languagerules>
      <note>ignored</note>
      <languagerule languagename=" English ">
        <note>ignored</note>
        <rule break=" YES ">
          <beforebreak>[.]<ignored>junk</ignored></beforebreak>
          <afterbreak>\s</afterbreak>
          <unknown>ignored</unknown>
        </rule>
      </languagerule>
    </languagerules>
    <maprules>
      <note>ignored</note>
      <languagemap languagepattern="en.*" languagerulename="English"><child/></languagemap>
    </maprules>
  </body>
</srx>`
	doc, err := Parse([]byte(input))
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if !doc.cascade {
		t.Fatal("expected cascade=YES to be case-insensitive")
	}
	if len(doc.languageRules) != 1 || doc.languageRules[0].name != "English" {
		t.Fatalf("language rules = %+v", doc.languageRules)
	}
	if got := spanTexts(doc.Segment("One. Two.", "en-US")); !slices.Equal(got, []string{"One.", " Two."}) {
		t.Fatalf("spans = %q", got)
	}
}

func TestFingerprintNilDocument(t *testing.T) {
	t.Parallel()
	var doc *Document
	if got := doc.Fingerprint(); got != "" {
		t.Fatalf("nil Fingerprint = %q", got)
	}
}

func TestFingerprintStableForSameInput(t *testing.T) {
	t.Parallel()
	a, err := Parse([]byte(twoLangSRX))
	if err != nil {
		t.Fatal(err)
	}
	b, err := Parse([]byte(twoLangSRX))
	if err != nil {
		t.Fatal(err)
	}
	if a.Fingerprint() != b.Fingerprint() || len(a.Fingerprint()) != 32 {
		t.Fatalf("fingerprints = %q, %q", a.Fingerprint(), b.Fingerprint())
	}
}

func TestMatchBreakPositions(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name string
		text string
		rule rule
		want []int
	}{
		{name: "no patterns", text: "a. b", rule: rule{}, want: nil},
		{
			name: "after only skips position zero",
			text: " a b",
			rule: rule{after: regexp.MustCompile(`\s`)},
			want: []int{2},
		},
		{
			name: "before only",
			text: "a. b. c",
			rule: rule{before: regexp.MustCompile(`\.`)},
			want: []int{2, 5},
		},
		{
			name: "before at end of text",
			text: "a.",
			rule: rule{before: regexp.MustCompile(`\.`)},
			want: []int{2},
		},
		{
			name: "after must match immediately",
			text: "a.x b.  c",
			rule: rule{before: regexp.MustCompile(`\.`), after: regexp.MustCompile(`\s`)},
			want: []int{6},
		},
		{
			name: "after missing at end",
			text: "a.",
			rule: rule{before: regexp.MustCompile(`\.`), after: regexp.MustCompile(`\s`)},
			want: []int{},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			got := matchBreakPositions(tt.text, tt.rule)
			if !slices.Equal(got, tt.want) {
				t.Fatalf("matchBreakPositions(%q) = %v, want %v", tt.text, got, tt.want)
			}
		})
	}
}

func TestRulesForLanguageFallbacks(t *testing.T) {
	t.Parallel()
	const rulePattern = `<rule><beforebreak>%s</beforebreak><afterbreak>\s</afterbreak></rule>`
	makeRule := func(name, before string) string {
		return `<languagerule languagename="` + name + `">` + strings.Replace(rulePattern, "%s", before, 1) + `</languagerule>`
	}
	tests := []struct {
		name     string
		rules    string
		maps     string
		language string
		text     string
		want     []string
	}{
		{
			name:     "single rule used without maps",
			rules:    makeRule("Only", `!`),
			language: "ja",
			text:     "a! b",
			want:     []string{"a!", " b"},
		},
		{
			name:     "Default rule preferred when unmapped",
			rules:    makeRule("First", `!`) + makeRule("Default", `\?`),
			language: "ja",
			text:     "a! b? c",
			want:     []string{"a! b?", " c"},
		},
		{
			name:     "lowercase default template name",
			rules:    makeRule("First", `!`) + makeRule("default", `\?`),
			language: "ja",
			text:     "a! b? c",
			want:     []string{"a! b?", " c"},
		},
		{
			name:     "first rule when no Default",
			rules:    makeRule("First", `!`) + makeRule("Second", `\?`),
			language: "ja",
			text:     "a! b? c",
			want:     []string{"a!", " b? c"},
		},
		{
			name:     "underscore locale normalized for maps",
			rules:    makeRule("Default", `!`) + makeRule("Portuguese", `\?`),
			maps:     `<languagemap languagepattern="pt-BR" languagerulename="Portuguese"/>`,
			language: "pt_BR",
			text:     "a! b? c",
			want:     []string{"a! b?", " c"},
		},
		{
			name:     "base language matches map",
			rules:    makeRule("Default", `!`) + makeRule("German", `\?`),
			maps:     `<languagemap languagepattern="de" languagerulename="German"/>`,
			language: "de-AT",
			text:     "a! b? c",
			want:     []string{"a! b?", " c"},
		},
		{
			name:     "map patterns are case-insensitive",
			rules:    makeRule("Default", `!`) + makeRule("German", `\?`),
			maps:     `<languagemap languagepattern="DE" languagerulename="German"/>`,
			language: "de",
			text:     "a! b? c",
			want:     []string{"a! b?", " c"},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			input := `<srx><body><languagerules>` + tt.rules + `</languagerules>`
			if tt.maps != "" {
				input += `<maprules>` + tt.maps + `</maprules>`
			}
			input += `</body></srx>`
			doc, err := Parse([]byte(input))
			if err != nil {
				t.Fatalf("Parse: %v", err)
			}
			if got := spanTexts(doc.Segment(tt.text, tt.language)); !slices.Equal(got, tt.want) {
				t.Fatalf("Segment(%q, %q) = %q, want %q", tt.text, tt.language, got, tt.want)
			}
		})
	}
}

func TestSegmentNonCascadeStopsAtRepeatedRule(t *testing.T) {
	t.Parallel()
	input := `<srx><header cascade="no"/><body><languagerules>
<languagerule languagename="Default"><rule><beforebreak>!</beforebreak><afterbreak>\s</afterbreak></rule></languagerule>
<languagerule languagename="Q"><rule><beforebreak>\?</beforebreak><afterbreak>\s</afterbreak></rule></languagerule>
</languagerules><maprules>
<languagemap languagepattern="en.*" languagerulename="Q"/>
<languagemap languagepattern="en.*" languagerulename="Default"/>
</maprules></body></srx>`
	doc, err := Parse([]byte(input))
	if err != nil {
		t.Fatal(err)
	}
	// Without cascade only the first matching map applies.
	if got := spanTexts(doc.Segment("a! b? c", "en")); !slices.Equal(got, []string{"a! b?", " c"}) {
		t.Fatalf("spans = %q", got)
	}
}

func TestSegmentSpansCoverTextExactly(t *testing.T) {
	t.Parallel()
	doc, err := Parse([]byte(twoLangSRX))
	if err != nil {
		t.Fatal(err)
	}
	texts := []string{
		"Hello Mr. Smith. How are you? Fine!",
		"No break here",
		"Trailing space. ",
		"Unicode — ça va? Oui. ",
	}
	for _, text := range texts {
		spans := doc.Segment(text, "en")
		var joined strings.Builder
		prevEnd := 0
		for _, span := range spans {
			if span.Start != prevEnd || span.End <= span.Start || text[span.Start:span.End] != span.Text {
				t.Fatalf("invalid span %+v for %q (prev end %d)", span, text, prevEnd)
			}
			joined.WriteString(span.Text)
			prevEnd = span.End
		}
		if joined.String() != text {
			t.Fatalf("spans do not reassemble %q: %q", text, joined.String())
		}
	}
}
