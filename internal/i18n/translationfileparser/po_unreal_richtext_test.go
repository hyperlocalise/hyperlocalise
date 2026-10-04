package translationfileparser

import (
	"strings"
	"testing"
)

func TestProtectUnrealRichTextPairsAndDecorators(t *testing.T) {
	tests := []struct {
		name        string
		in          string
		wantPlain   []string
		wantHidden  []string
		wantIntact  []string
		wantCount   int
	}{
		{
			name:       "style pair and attributed pair",
			in:         `This <{string}>is</> the <text size="12">Display Name</>`,
			wantPlain:  []string{"This ", "is", " the ", "Display Name"},
			wantHidden: []string{`<{string}>`, `</>`, `<text size="12">`},
			wantCount:  4,
		},
		{
			name:       "empty pair is kept",
			in:         `Ready <Highlight></> now`,
			wantPlain:  []string{"Ready ", " now"},
			wantHidden: []string{"<Highlight>", "</>"},
			wantCount:  2,
		},
		{
			name:       "lone close is a single tag",
			in:         `oops </> leftover`,
			wantPlain:  []string{"oops ", " leftover"},
			wantHidden: []string{"</>"},
			wantCount:  1,
		},
		{
			name:       "self-closing decorator",
			in:         `Icon <img id="Health"/> here`,
			wantPlain:  []string{"Icon ", " here"},
			wantHidden: []string{`<img id="Health"/>`},
			wantCount:  1,
		},
		{
			name:       "img pair is not treated as a decorator",
			in:         `<img>portrait</> shown`,
			wantHidden: []string{"<img>", "</>"},
			wantPlain:  []string{"portrait", " shown"},
			wantCount:  2,
		},
		{
			name:       "dotted style name",
			in:         `<Font.Emph>bold</> text`,
			wantHidden: []string{"<Font.Emph>", "</>"},
			wantPlain:  []string{"bold", " text"},
			wantCount:  2,
		},
		{
			name:       "placeholder stays outside the tag",
			in:         `<Highlight>{ItemName}</> out of energy`,
			wantPlain:  []string{"{ItemName}", " out of energy"},
			wantHidden: []string{"<Highlight>", "</>"},
			wantCount:  2,
		},
		{
			name:       "named html close is not a pair",
			in:         `<span>text</span> and <Highlight>more</>`,
			wantIntact: []string{`<span>text</span>`},
			wantHidden: []string{"<Highlight>", "</>"},
			wantCount:  2,
		},
		{
			name:       "html-named pair still converts when closed with </>",
			in:         `<i>italic</> please`,
			wantHidden: []string{"<i>", "</>"},
			wantPlain:  []string{"italic", " please"},
			wantCount:  2,
		},
		{
			name:       "prose angle brackets stay text",
			in:         `<war cry> and < bot noises >`,
			wantIntact: []string{`<war cry>`, `< bot noises >`},
			wantCount:  0,
		},
		{
			name:       "opening without close stays text",
			in:         `see <Highlight> this`,
			wantIntact: []string{"<Highlight>"},
			wantCount:  0,
		},
		{
			name:       "single-quoted attributes are not tags",
			in:         `<text size='12'>Name</>`,
			wantIntact: []string{`<text size='12'>Name`},
			wantHidden: []string{"</>"},
			wantCount:  1,
		},
		{
			name:       "unclosed tag yields to the next pair",
			in:         `<Old>keep <New>text</>`,
			wantIntact: []string{"<Old>keep "},
			wantHidden: []string{"<New>", "</>"},
			wantCount:  2,
		},
		{
			name:      "plain text",
			in:        "Welcome back",
			wantCount: 0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, placeholders := protectUnrealRichTextLimited(tt.in, unrealRichTextTagLimit)
			if len(placeholders) != tt.wantCount {
				t.Fatalf("placeholder count = %d, want %d; got %q map=%v", len(placeholders), tt.wantCount, got, placeholders)
			}
			for _, part := range tt.wantPlain {
				if !strings.Contains(got, part) {
					t.Fatalf("protected text %q missing %q", got, part)
				}
			}
			for _, hidden := range tt.wantHidden {
				if strings.Contains(got, hidden) {
					t.Fatalf("protected text %q still contains tag %q", got, hidden)
				}
				found := false
				for _, literal := range placeholders {
					if literal == hidden {
						found = true
						break
					}
				}
				if !found {
					t.Fatalf("placeholders %v missing literal %q", placeholders, hidden)
				}
			}
			for _, intact := range tt.wantIntact {
				if !strings.Contains(got, intact) {
					t.Fatalf("protected text %q should keep %q", got, intact)
				}
			}
			if tt.wantCount > 0 && !strings.Contains(got, unrealRichTextSentinelMarker) {
				t.Fatalf("expected sentinels in %q", got)
			}
			if expanded := expandUnrealRichTextPlaceholders(got, placeholders); expanded != tt.in {
				t.Fatalf("expand = %q, want original %q", expanded, tt.in)
			}
		})
	}
}

func TestProtectUnrealRichTextTagLimit(t *testing.T) {
	in := `<A>one</><B>two</><C>three</>`
	got, placeholders := protectUnrealRichTextLimited(in, 3)
	if len(placeholders) != 2 {
		t.Fatalf("limited convert count = %d, want 2 (pairs stay atomic); got %q", len(placeholders), got)
	}
	if !strings.Contains(got, "<B>") || !strings.Contains(got, "<C>") {
		t.Fatalf("expected leftover pairs to stay text, got %q", got)
	}
}

func TestPOParserProtectsUnrealRichTextValues(t *testing.T) {
	content := []byte(`msgid ""
msgstr ""
"Language: en\n"

msgid "This <{string}>is</> the <text size=\"12\">Display Name</>"
msgstr "This <{string}>is</> the <text size=\"12\">Display Name</>"

msgid "plain"
msgstr "Welcome"
`)

	got, err := (POFileParser{}).Parse(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	sourceKey := `This <{string}>is</> the <text size="12">Display Name</>`
	value, ok := got[sourceKey]
	if !ok {
		t.Fatalf("missing msgid key, got %#v", got)
	}
	if strings.Contains(value, "</>") || strings.Contains(value, "<{string}>") {
		t.Fatalf("expected UE tags to be placeholdered, got %q", value)
	}
	if !strings.Contains(value, "is") || !strings.Contains(value, "Display Name") {
		t.Fatalf("expected translatable text to remain, got %q", value)
	}
	if got["plain"] != "Welcome" {
		t.Fatalf("plain entry changed: %#v", got)
	}
}

func TestMarshalPOFileRestoresUnrealRichText(t *testing.T) {
	template := []byte(`msgid ""
msgstr ""
"Language: en\n"

msgid "This <{string}>is</> the name"
msgstr "This <{string}>is</> the name"

msgid "energy"
msgstr "<Highlight>{ItemName}</> out of energy"
`)

	parsed, err := (POFileParser{}).Parse(template)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	sourceKey := "This <{string}>is</> the name"
	parsed[sourceKey] = strings.Replace(parsed[sourceKey], "\x1fis\x1e", "\x1fest\x1e", 1)
	parsed["energy"] = strings.Replace(parsed["energy"], "out of energy", "sans énergie", 1)

	out, err := MarshalPOFile(template, parsed)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	content := string(out)
	if strings.Contains(content, "HLUEPH_") || strings.Contains(content, "\x1e") {
		t.Fatalf("marshal leaked sentinels:\n%s", content)
	}
	if !strings.Contains(content, `msgstr "This <{string}>est</> the name"`) {
		t.Fatalf("expected restored UE markup in translated msgstr, got:\n%s", content)
	}
	if !strings.Contains(content, `msgstr "<Highlight>{ItemName}</> sans énergie"`) {
		t.Fatalf("expected restored energy string, got:\n%s", content)
	}
}

func TestValidateUnrealRichTextPlaceholders(t *testing.T) {
	protected, placeholders := protectUnrealRichTextLimited(`<Highlight>Go</>`, unrealRichTextTagLimit)
	if len(placeholders) != 2 {
		t.Fatalf("expected 2 placeholders, got %d", len(placeholders))
	}
	if err := ValidateUnrealRichTextPlaceholders(protected, strings.Replace(protected, "Go", "Va", 1)); err != nil {
		t.Fatalf("matching tokens: %v", err)
	}
	if err := ValidateUnrealRichTextPlaceholders(protected, "Va"); err == nil {
		t.Fatal("expected mismatch")
	}
	if err := ValidateUnrealRichTextPlaceholders("hello", "bonjour"); err != nil {
		t.Fatalf("plain text: %v", err)
	}
}

func TestPOParserPluralUnrealRichText(t *testing.T) {
	content := []byte(`msgid "one <Gold>coin</>"
msgid_plural "many <Gold>coins</>"
msgstr[0] "one <Gold>coin</>"
msgstr[1] "many <Gold>coins</>"
`)
	got, err := (POFileParser{}).Parse(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	value := got["one <Gold>coin</>"]
	if strings.Contains(value, "<Gold>") || strings.Contains(value, "</>") {
		t.Fatalf("expected plural msgstr[0] tags placeholdered, got %q", value)
	}
	if !strings.Contains(value, "coin") {
		t.Fatalf("expected coin text, got %q", value)
	}
}
