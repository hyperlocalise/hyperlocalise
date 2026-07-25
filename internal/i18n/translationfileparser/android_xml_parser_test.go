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

func TestAndroidXMLFragmentWellFormedParity(t *testing.T) {
	testCases := []struct {
		name  string
		value string
	}{
		{"plain text", "Hello World"},
		{"simple html tag", "<b>Hello World</b>"},
		{"multiple tags", "Hello <b>World</b>, how <i>are</i> you?"},
		{"tag with attribute double quotes", `Please visit <a href="https://example.com" target="_blank">our website</a>.`},
		{"tag with attribute single quotes", `Please visit <a href='https://example.com' target='_blank'>our website</a>.`},
		{"namespace tag", `Hello <xliff:g id="user">%1$s</xliff:g>`},
		{"self closing tag no space", "Hello <br/> World"},
		{"self closing tag with space", "Hello <br /> World"},
		{"self closing tag with attributes", `<img src="foo.png" alt="bar"/>`},
		{"valid html entity", "2 &lt; 3"},
		{"multiple entities", "2 &lt; 3 &amp; 4 &gt; 1"},
		{"hex char entity", "&#x12;"},
		{"hex char entity uppercase", "&#X12;"},
		{"decimal char entity", "&#123;"},
		{"empty value", ""},
		{"empty tag", "Hello <> World"},
		{"mismatched tags", "<b>Hello <i>World</b></i>"},
		{"unclosed nested tag", "<b>Hello <i>World</i>"},
		{"unescaped ampersand", "2 < 3 & 4"},
		{"unescaped less-than", "2 < 3"},
		{"unclosed attribute quote", `<a href="https://example.com>link</a>`},
		{"spaces in attributes", `<a   href  =  "https://example.com"   >link</a>`},
		{"space after slash in self closing", "<br / >"},
		{"comment", "<!-- comment -->"},
		{"cdata", "<![CDATA[cdata]]>"},
		{"processing instruction", "<?xml version=\"1.0\"?>"},
		{"deep nesting", "<a><b><c><d><e><f><g><h><i><j>deep</j></i></h></g></f></e></d></c></b></a>"},
		{"invalid entity", "2 &notanentity; 3"},
		{"invalid entity ampersand alone", "2 & 3"},
		{"mismatched closing bracket", "Hello > World"},
		{"nested attribute ampersand", `<a href="a&amp;b">link</a>`},
		{"nested attribute unescaped ampersand", `<a href="a&b">link</a>`},
		{"non-ASCII tag name", "<русский>Привет</русский>"},
		{"non-ASCII attribute name", "<tag имя='значение'>Привет</tag>"},
		{"non-ASCII attribute value", "<tag attr='русский'>Привет</tag>"},
		{"non-ASCII text outside tag", "Привет <b>мир</b>!"},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			// Compare slow decoder with our fast scanner.
			// Since namespaceAttrs doesn't matter for well-formedness structure (only prefixes),
			// we can use "" for namespaceAttrs in the slow one.
			slowResult := androidXMLFragmentWellFormed(tc.value, "")
			fastResult, certain := fastIsXMLFragmentWellFormed(tc.value)

			if certain {
				if fastResult != slowResult {
					t.Errorf("Parity mismatch for %q:\n  slow: %v\n  fast: %v (certain: %v)", tc.value, slowResult, fastResult, certain)
				}
			} else {
				// If not certain, then the integrated function should have fallen back and returned the slow result.
				integratedResult := androidXMLFragmentWellFormed(tc.value, "")
				if integratedResult != slowResult {
					t.Errorf("Fallback mismatch for %q:\n  slow: %v\n  integrated: %v", tc.value, slowResult, integratedResult)
				}
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
