package translationfileparser

import (
	"reflect"
	"testing"
)

func TestJSONKeyPathMatching(t *testing.T) {
	t.Parallel()

	cases := []struct {
		key, pattern string
		want         bool
	}{
		{"messages.title", "messages.title", true},
		{"messages.title", "messages.*", true},
		{"messages.title.sub", "messages.*", false},
		{"messages.title.sub", "messages.**", true},
		{"errors.notFound", "*.notFound", true},
		{"home[0].title", "home.*.title", true},
		{"debug.secret", "debug.**", true},
		{"welcome.text", "welcome.text", true},
		{"welcome.text", "other.**", false},
	}
	for _, tc := range cases {
		if got := jsonKeyMatches(tc.key, tc.pattern); got != tc.want {
			t.Fatalf("jsonKeyMatches(%q, %q)=%v want %v", tc.key, tc.pattern, got, tc.want)
		}
	}
}

func TestLooksLikeICUAndHTML(t *testing.T) {
	t.Parallel()

	if !looksLikeICU("Hello {name}") {
		t.Fatal("expected ICU argument")
	}
	if !looksLikeICU("{count, plural, one {# item} other {# items}}") {
		t.Fatal("expected ICU plural")
	}
	if looksLikeICU("no placeholders here") {
		t.Fatal("did not expect ICU")
	}
	if !looksLikeHTML(`Hello <b>world</b>`) {
		t.Fatal("expected HTML")
	}
	if looksLikeHTML("plain text") {
		t.Fatal("did not expect HTML")
	}
}

func TestJSONParserKeyPathAndSiblingMetadata(t *testing.T) {
	t.Parallel()

	content := []byte(`{
  "welcome": {
    "text": "Hello {name}",
    "description": "Home greeting",
    "maxLength": 40
  },
  "debug": {
    "text": "secret"
  },
  "about": {
    "html": "<p>About us</p>",
    "note": "footer"
  }
}`)

	entries, err := (JSONParser{}).ParseIngestEntries(content, JSONImportOptions{
		KeyPaths:             []string{"*.text", "*.html"},
		ExcludeKeyPaths:      []string{"debug.**"},
		ContextFields:        []string{"description", "note"},
		CharacterLimitFields: []string{"maxLength"},
		HTMLSubfilter:        true,
		ICUSubfilter:         true,
	})
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	if _, ok := entries["debug.text"]; ok {
		t.Fatal("excluded debug.text")
	}
	if _, ok := entries["welcome.description"]; ok {
		t.Fatal("description must stay metadata")
	}

	welcome := entries["welcome.text"]
	if welcome.Text != "Hello {name}" {
		t.Fatalf("welcome.text=%q", welcome.Text)
	}
	if welcome.Context != "Home greeting" {
		t.Fatalf("welcome context=%q", welcome.Context)
	}
	if welcome.MaxLength != 40 {
		t.Fatalf("welcome maxLength=%d", welcome.MaxLength)
	}
	if welcome.Format != "icu" {
		t.Fatalf("welcome format=%q", welcome.Format)
	}

	about := entries["about.html"]
	if about.Context != "footer" {
		t.Fatalf("about context=%q", about.Context)
	}
	if about.Format != "html" {
		t.Fatalf("about format=%q", about.Format)
	}
}

func TestJSONParserSiblingNumberDoesNotFailParse(t *testing.T) {
	t.Parallel()

	content := []byte(`{"home":{"title":"Welcome","characterLimit":12}}`)
	entries, err := (JSONParser{}).ParseIngestEntries(content, JSONImportOptions{
		CharacterLimitFields: []string{"characterLimit"},
	})
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if entries["home.title"].MaxLength != 12 {
		t.Fatalf("maxLength=%d", entries["home.title"].MaxLength)
	}
}

func TestHTMLExcludedElementsAndICUSubfilter(t *testing.T) {
	t.Parallel()

	content := []byte(`<html><body>
<nav>Skip me</nav>
<p>Hello {name}</p>
<footer>Also skip</footer>
</body></html>`)

	entries, err := parseHTMLIngestEntries(content, HTMLImportOptions{
		ExcludedElements: []string{"nav", "footer"},
		ICUSubfilter:     true,
	})
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	foundSkip := false
	foundHello := false
	for _, entry := range entries {
		if entry.Text == "Skip me" || entry.Text == "Also skip" {
			foundSkip = true
		}
		if entry.Text == "Hello {name}" {
			foundHello = true
			if entry.Format != "icu" {
				t.Fatalf("format=%q", entry.Format)
			}
		}
	}
	if foundSkip {
		t.Fatal("excluded nav/footer text was imported")
	}
	if !foundHello {
		t.Fatal("expected paragraph text")
	}
}

func TestExcelColumnsByPositionWithoutHeaderRow(t *testing.T) {
	t.Parallel()

	identifier, source, context, maxLength := 0, 1, 2, 3
	headerless := false
	content := buildXLSX(t, map[string][]xlsxTestCell{
		"Copy": {
			{cell: "A1", value: "home.title"},
			{cell: "B1", value: "Home"},
			{cell: "C1", value: "Nav label"},
			{cell: "D1", value: 12},
			{cell: "A2", value: "home.cta"},
			{cell: "B2", value: "Start now"},
		},
	}, []string{"Copy"})

	entries, err := ReadXLSXEntriesWithOptions(content, "en", "en", ExcelImportOptions{
		FirstLineContainsHeader: &headerless,
		Columns: ExcelColumnScheme{
			Identifier: &identifier,
			Source:     &source,
			Context:    &context,
			MaxLength:  &maxLength,
		},
	})
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	if len(entries) != 2 {
		t.Fatalf("entries=%d %#v", len(entries), entries)
	}
	if entries[0].Key != "home.title" || entries[0].Text != "Home" {
		t.Fatalf("first=%+v", entries[0])
	}
	if entries[0].Comment != "Nav label" || entries[0].MaxLength != 12 {
		t.Fatalf("first metadata=%+v", entries[0])
	}
	if entries[1].Key != "home.cta" || entries[1].Text != "Start now" {
		t.Fatalf("second=%+v", entries[1])
	}
}

func TestParseImportOptionsJSON(t *testing.T) {
	t.Parallel()

	opts, err := ParseImportOptionsJSON([]byte(`{
  "html": {"excludedElements":["nav"],"icuSubfilter":true},
  "json": {"keyPaths":["*.text"],"contextFields":["description"]}
}`))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if !reflect.DeepEqual(opts.HTML.ExcludedElements, []string{"nav"}) {
		t.Fatalf("html=%+v", opts.HTML)
	}
	if !opts.JSON.active() {
		t.Fatal("expected json options")
	}
}
