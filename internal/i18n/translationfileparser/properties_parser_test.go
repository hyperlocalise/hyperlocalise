package translationfileparser

import (
	"strings"
	"testing"
)

func TestJavaPropertiesParserParsesEscapesCommentsAndContinuations(t *testing.T) {
	content := []byte(`# Checkout screen
welcome.message = Hello {0}
escaped\ key: Line one\nLine two
path = C:\\Program Files\\Hyperlocalise
unicode = Snowman \u2603
spaced\:key value with \= equals and \: colon
continued = first \
    second
`)

	got, contextByKey, err := (JavaPropertiesParser{}).ParseWithContext(content)
	if err != nil {
		t.Fatalf("parse properties: %v", err)
	}

	assertPropertyValue(t, got, "welcome.message", "Hello {0}")
	assertPropertyValue(t, got, "escaped key", "Line one\nLine two")
	assertPropertyValue(t, got, "path", `C:\Program Files\Hyperlocalise`)
	assertPropertyValue(t, got, "unicode", "Snowman \u2603")
	assertPropertyValue(t, got, "spaced:key", "value with = equals and : colon")
	assertPropertyValue(t, got, "continued", "first second")
	if contextByKey["welcome.message"] != "Checkout screen" {
		t.Fatalf("unexpected context for welcome.message: %#v", contextByKey)
	}
}

func TestMarshalJavaPropertiesPreservesTemplateAndAppendsDeterministically(t *testing.T) {
	template := []byte(`# Checkout screen
welcome.message = Hello {0}
untouched=Keep
escaped\ key: Line one\nLine two
`)

	got, err := MarshalJavaProperties(template, map[string]string{
		"welcome.message": "Bonjour {0}",
		"escaped key":     "Ligne 1\nLigne 2",
		"z.last":          "Dernier",
		"a.first":         "Premier",
	})
	if err != nil {
		t.Fatalf("marshal properties: %v", err)
	}

	want := `# Checkout screen
welcome.message = Bonjour {0}
untouched=Keep
escaped\ key: Ligne 1\nLigne 2
a.first=Premier
z.last=Dernier
`
	if string(got) != want {
		t.Fatalf("properties output mismatch\n got:\n%s\nwant:\n%s", got, want)
	}
}

func TestJavaPropertiesParserAndMarshalHandleUTF8BOM(t *testing.T) {
	template := []byte("\xef\xbb\xbfwelcome.message=Hello {0}\n")

	got, err := (JavaPropertiesParser{}).Parse(template)
	if err != nil {
		t.Fatalf("parse properties with BOM: %v", err)
	}
	assertPropertyValue(t, got, "welcome.message", "Hello {0}")
	if _, ok := got["\ufeffwelcome.message"]; ok {
		t.Fatalf("BOM must not be included in the first key: %#v", got)
	}

	rendered, err := MarshalJavaProperties(template, map[string]string{"welcome.message": "Bonjour {0}"})
	if err != nil {
		t.Fatalf("marshal properties with BOM: %v", err)
	}
	want := "\ufeffwelcome.message=Bonjour {0}\n"
	if string(rendered) != want {
		t.Fatalf("properties output mismatch\n got: %q\nwant: %q", rendered, want)
	}
}

func TestPropertiesDocumentRenderAppendsEntriesSkippedByBoundsGuard(t *testing.T) {
	doc := propertiesDocument{
		template: "",
		entries: []propertiesEntry{{
			key:        "welcome.message",
			valueStart: 12,
			valueEnd:   18,
		}},
	}

	got := string(doc.render(map[string]string{"welcome.message": "Bonjour"}))
	if got != "welcome.message=Bonjour\n" {
		t.Fatalf("expected skipped entry to be appended, got %q", got)
	}
}

func TestMarshalJavaPropertiesEscapesNonBMPRunesAsSurrogatePairs(t *testing.T) {
	template := []byte("emoji.value=old\n")

	got, err := MarshalJavaProperties(template, map[string]string{
		"emoji.value":         "Face \U0001F600",
		"emoji.key\U0001F600": "new \U0001F600",
	})
	if err != nil {
		t.Fatalf("marshal properties with non-BMP runes: %v", err)
	}

	want := "emoji.value=Face \\uD83D\\uDE00\nemoji.key\\uD83D\\uDE00=new \\uD83D\\uDE00\n"
	if string(got) != want {
		t.Fatalf("properties output mismatch\n got: %q\nwant: %q", got, want)
	}
}

func TestJavaPropertiesParserRejectsMalformedUnicodeEscape(t *testing.T) {
	_, err := (JavaPropertiesParser{}).Parse([]byte(`bad = \u12xz
`))
	if err == nil {
		t.Fatal("expected malformed unicode escape error")
	}
	if !strings.Contains(err.Error(), "invalid \\u escape") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestJavaPropertiesParserRejectsDuplicateKeys(t *testing.T) {
	_, err := (JavaPropertiesParser{}).Parse([]byte("hello=Hello\nhello=Bonjour\n"))
	if err == nil {
		t.Fatal("expected duplicate key error")
	}
	if !strings.Contains(err.Error(), "duplicate properties key") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func assertPropertyValue(t *testing.T, got map[string]string, key, want string) {
	t.Helper()
	if got[key] != want {
		t.Fatalf("properties key %q = %q, want %q", key, got[key], want)
	}
}
