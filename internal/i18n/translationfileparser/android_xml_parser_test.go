package translationfileparser

import (
	"reflect"
	"strings"
	"testing"
)

func TestAndroidXMLResourcesParserParsesStringsAndPlurals(t *testing.T) {
	content := []byte(`<?xml version="1.0" encoding="utf-8"?>
<resources xmlns:xliff="urn:oasis:names:tc:xliff:document:1.2">
  <!-- App-facing text -->
  <string name="app_name">Hyperlocalise</string>
  <string name="welcome" formatted="true">Hello <xliff:g id="user">%1$s</xliff:g></string>
  <string name="debug_only" translatable="false">Do not translate</string>
  <plurals name="item_count">
    <item quantity="one">%d item</item>
    <item quantity="other">%d items</item>
  </plurals>
</resources>`)

	got, err := (AndroidXMLResourcesParser{}).Parse(content)
	if err != nil {
		t.Fatalf("parse android resources: %v", err)
	}

	want := map[string]string{
		"app_name":         "Hyperlocalise",
		"welcome":          `Hello <xliff:g id="user">%1$s</xliff:g>`,
		"item_count.one":   "%d item",
		"item_count.other": "%d items",
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("parsed entries mismatch\n got: %#v\nwant: %#v", got, want)
	}
	if _, ok := got["debug_only"]; ok {
		t.Fatalf("translatable=false string should be skipped")
	}
}

func TestMarshalAndroidXMLResourcesPreservesCommentsMetadataAndPlaceholders(t *testing.T) {
	template := []byte(`<?xml version="1.0" encoding="utf-8"?>
<resources xmlns:tools="http://schemas.android.com/tools" xmlns:xliff="urn:oasis:names:tc:xliff:document:1.2">
  <!-- keep this comment -->
  <string name="welcome" formatted="true" tools:ignore="TypographyDashes">Hello <xliff:g id="user">%1$s</xliff:g></string>
  <string name="debug_only" translatable="false">Debug only</string>
  <plurals name="item_count">
    <item quantity="one">%d item</item>
    <item quantity="other">%d items</item>
  </plurals>
</resources>
`)

	out, err := MarshalAndroidXMLResources(template, map[string]string{
		"welcome":          `Bonjour <xliff:g id="user">%1$s</xliff:g>`,
		"item_count.one":   "%d article",
		"item_count.other": "%d articles",
	})
	if err != nil {
		t.Fatalf("marshal android resources: %v", err)
	}
	content := string(out)

	for _, want := range []string{
		"<!-- keep this comment -->",
		`formatted="true" tools:ignore="TypographyDashes"`,
		`<string name="debug_only" translatable="false">Debug only</string>`,
		`Bonjour <xliff:g id="user">%1$s</xliff:g>`,
		`<item quantity="one">%d article</item>`,
		`<item quantity="other">%d articles</item>`,
	} {
		if !strings.Contains(content, want) {
			t.Fatalf("expected output to contain %q, got %q", want, content)
		}
	}
}

func TestMarshalAndroidXMLResourcesEscapesInvalidXMLText(t *testing.T) {
	template := []byte(`<resources>
  <string name="math">Math</string>
</resources>`)

	out, err := MarshalAndroidXMLResources(template, map[string]string{"math": "2 < 3 & 4"})
	if err != nil {
		t.Fatalf("marshal android resources: %v", err)
	}
	if !strings.Contains(string(out), `<string name="math">2 &lt; 3 &amp; 4</string>`) {
		t.Fatalf("expected invalid xml text to be escaped, got %q", string(out))
	}
}

func TestEncodeAndroidResourceValueEscapesFastPathRejects(t *testing.T) {
	namespaceAttrs := ` xmlns:xliff="urn:oasis:names:tc:xliff:document:1.2"`
	tests := []struct {
		name string
		val  string
		want string
	}{
		{
			name: "whitespace after self-closing slash",
			val:  `<img src="foo.png" /  >`,
			want: `&lt;img src="foo.png" /  &gt;`,
		},
		{
			name: "invalid element name",
			val:  `<1a>x</1a>`,
			want: `&lt;1a&gt;x&lt;/1a&gt;`,
		},
		{
			name: "forbidden cdata terminator",
			val:  `hello ]]> world`,
			want: `hello ]]&gt; world`,
		},
		{
			name: "illegal character reference",
			val:  `&#0;`,
			want: `&amp;#0;`,
		},
		{
			name: "uppercase hex character reference",
			val:  `&#X41;`,
			want: `&amp;#X41;`,
		},
		{
			name: "well formed markup unchanged",
			val:  `<b>Hello</b>`,
			want: `<b>Hello</b>`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := encodeAndroidResourceValue(tt.val, namespaceAttrs); got != tt.want {
				t.Fatalf("encodeAndroidResourceValue(%q) = %q, want %q", tt.val, got, tt.want)
			}
		})
	}
}

func TestAndroidXMLResourcesParserRejectsUnsupportedTranslatableConstructs(t *testing.T) {
	content := []byte(`<resources>
  <string-array name="tabs">
    <item>Home</item>
  </string-array>
</resources>`)

	_, err := (AndroidXMLResourcesParser{}).Parse(content)
	if err == nil {
		t.Fatalf("expected unsupported construct error")
	}
	if !strings.Contains(err.Error(), "unsupported <string-array> resource") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestFastIsXMLFragmentWellFormed(t *testing.T) {
	namespaceAttrs := ` xmlns:xliff="urn:oasis:names:tc:xliff:document:1.2" xmlns:tools="http://schemas.android.com/tools"`

	tests := []struct {
		name   string
		val    string
		expect bool
	}{
		{"plain text", "Hello World", true},
		{"simple bold", "<b>Hello</b>", true},
		{"multiple tags", "<b><i>Hello</i></b>", true},
		{"xliff declared", `<xliff:g id="user">%1$s</xliff:g>`, true},
		{"xliff undeclared", `<foo:g id="user">%1$s</foo:g>`, false},
		{"attribute double quotes", `<a href="url">link</a>`, true},
		{"attribute single quotes", `<a href='url'>link</a>`, true},
		{"self closing tag", `<img src="foo.png" />`, true},
		{"self closing tag without space", `<img src="foo.png"/>`, true},
		{"self closing tag with space between slash and bracket", `<img src="foo.png"  /  >`, false},
		{"trailing space inside tag", `<b >hello</b>`, true},
		{"valid entity", "hello &amp; world", true},
		{"valid numeric entity", "hello &#32; world", true},
		{"valid hex entity", "hello &#xA0; world", true},
		{"uppercase hex entity marker", "hello &#X41; world", false},
		{"invalid entity", "hello &unknown; world", false},
		{"null character reference", "&#0;", false},
		{"noncharacter reference", "&#xFFFE;", false},
		{"out of range character reference", "&#x110000;", false},
		{"forbidden cdata terminator", "hello ]]> world", false},
		{"forbidden cdata terminator in markup", "<b>]]></b>", false},
		{"nul in text", "hello\x00world", false},
		{"control char in text", "hello\x01world", false},
		{"noncharacter in text", "<b>\uFFFE</b>", false},
		{"name starting with digit", "<1a>x</1a>", false},
		{"name with multiple colons", "<a:b:c>x</a:b:c>", false},
		{"name starting with hyphen", "<-a>x</-a>", false},
		{"name starting with dot", "<.a>x</.a>", false},
		{"unclosed tag", "<b>hello", false},
		{"mismatched tag name", "<b>hello</i>", false},
		{"mismatched tag case", "<b>hello</B>", false},
		{"unclosed quote", `<a href="url>link</a>`, false},
		{"missing quote", `<a href=url>link</a>`, false},
		{"ampersand in attribute value", `<a href="url&amp;x">link</a>`, false},
		{"unclosed entity reference", "hello &amp world", false},
		{"unclosed element tag", "<b", false},
		{"empty element name", "<>", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := fastIsXMLFragmentWellFormed(tt.val, namespaceAttrs)
			if got != tt.expect {
				t.Errorf("fastIsXMLFragmentWellFormed(%q) = %v, want %v", tt.val, got, tt.expect)
			}
		})
	}
}

func TestIsAndroidStringResourcePath(t *testing.T) {
	for _, tc := range []struct {
		path string
		want bool
	}{
		{"res/values/strings.xml", true},
		{"app/src/main/res/values-en-rUS/strings.xml", true},
		{"strings.xml", true},
		{"  strings.xml  ", true},
		{"STRINGS.XML", true},
		{"res/values/STRINGS.XML", true},
		{"res/layout/activity_main.xml", false},
		{"strings.xml.bak", false},
		{"not-strings.xml", false},
		{"s.xml", false},
	} {
		if got := IsAndroidStringResourcePath(tc.path); got != tc.want {
			t.Errorf("IsAndroidStringResourcePath(%q) = %v, want %v", tc.path, got, tc.want)
		}
	}
}

func TestAndroidXMLResourcesParserRejectsInvalidPlurals(t *testing.T) {
	content := []byte(`<resources>
  <plurals name="item_count">
    <item quantity="one">%d item</item>
  </plurals>
</resources>`)

	_, err := (AndroidXMLResourcesParser{}).Parse(content)
	if err == nil {
		t.Fatalf("expected missing other plural error")
	}
	if !strings.Contains(err.Error(), `quantity="other"`) {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestStrategyParsesAndroidStringResourcesByPath(t *testing.T) {
	s := NewDefaultStrategy()
	content := []byte(`<resources>
  <string name="app_name">Hyperlocalise</string>
</resources>`)

	got, err := s.Parse("app/src/main/res/values/strings.xml", content)
	if err != nil {
		t.Fatalf("parse android resources through strategy: %v", err)
	}
	if got["app_name"] != "Hyperlocalise" {
		t.Fatalf("unexpected app_name: %#v", got)
	}

	_, err = s.Parse("app/src/main/res/layout/activity_main.xml", content)
	if err == nil {
		t.Fatalf("expected non-Android string XML path to be rejected")
	}
	if !strings.Contains(err.Error(), "require a specialized parser") {
		t.Fatalf("unexpected error: %v", err)
	}
}
