package translationfileparser

import (
	"encoding/xml"
	"strings"
	"testing"
)

func TestEscapeXLIFFAttrValueEscapesControlAndAttributeWhitespace(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want string
	}{
		{name: "plain locale", in: "fr-FR", want: "fr-FR"},
		{name: "control character", in: "fr\x01", want: "fr\uFFFD"},
		{name: "tab", in: "fr\tFR", want: "fr&#x9;FR"},
		{name: "newline", in: "fr\nFR", want: "fr&#xA;FR"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := escapeXLIFFAttrValue(tt.in); got != tt.want {
				t.Fatalf("escapeXLIFFAttrValue(%q) = %q, want %q", tt.in, got, tt.want)
			}
		})
	}
}

func TestMarshalXLIFFEscapesForbiddenLocaleCharacters(t *testing.T) {
	template := []byte(`<xliff version="1.2"><file source-language="en"><body><trans-unit id="u"><source>Hello</source></trans-unit></body></file></xliff>`)
	out, err := MarshalXLIFF(template, map[string]string{"u": "Bonjour"}, "en", "fr\x01")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(out), `target-language="fr`+"\uFFFD"+`"`) {
		t.Fatalf("expected control character in locale to be replaced, got %q", out)
	}
	if _, err := readXLIFF(out); err != nil {
		t.Fatalf("marshaled XLIFF must remain parseable: %v", err)
	}
}

func TestXLIFFAttributeValuesCannotIntroduceAttributes(t *testing.T) {
	value := `fr" injected="yes' & < >` + "\t\n\r"
	for _, tag := range []string{`<file/>`, `<file source-language="en"/>`, `<file target-language="fr"/>`, `<file target-language='fr'/>`} {
		escaped := setXLIFFTagAttr(tag, "target-language", value)
		token, err := xml.NewDecoder(strings.NewReader(escaped)).Token()
		if err != nil {
			t.Fatalf("invalid XML for %s: %v", escaped, err)
		}
		start := token.(xml.StartElement)
		decoded, found := "", false
		for _, attr := range start.Attr {
			if attr.Name.Local == "target-language" {
				decoded, found = attr.Value, true
			}
		}
		if !found || decoded != value {
			t.Fatalf("attribute value did not round trip: %#v", start.Attr)
		}
		for _, attr := range start.Attr {
			if attr.Name.Local != "target-language" && attr.Name.Local != "source-language" {
				t.Fatalf("unexpected injected attribute: %#v", attr)
			}
		}
		if strings.Contains(escapeXLIFFAttrValue(value), `"`) || strings.Contains(escapeXLIFFAttrValue(value), "'") {
			t.Fatal("raw quote remains in escaped attribute")
		}
	}
}

func TestMarshalXLIFFQuotedLocalesRemainSingleAttributes(t *testing.T) {
	sourceLocale, targetLocale := `en" injected="source`, `fr' injected='target`
	for _, template := range []string{
		`<xliff version="1.2"><file source-language='en' target-language="fr"><body><trans-unit id="u"><source>Hello</source></trans-unit></body></file></xliff>`,
		`<xliff version="2.0" srcLang="en"><file id="f"><unit id="u"><segment><source>Hello</source></segment></unit></file></xliff>`,
	} {
		out, err := MarshalXLIFF([]byte(template), map[string]string{"u": "Bonjour"}, sourceLocale, targetLocale)
		if err != nil {
			t.Fatal(err)
		}
		elements, err := readXLIFF(out)
		if err != nil {
			t.Fatalf("malformed writeback: %s, %v", out, err)
		}
		found := false
		for _, element := range elements {
			for _, attr := range element.token.Attr {
				if attr.Name.Local == "injected" {
					t.Fatalf("attribute injection in %s", out)
				}
			}
			if element.token.Name.Local == "file" && attrValue(element.token.Attr, "source-language") != "" {
				found = true
				if attrValue(element.token.Attr, "source-language") != sourceLocale || attrValue(element.token.Attr, "target-language") != targetLocale {
					t.Fatalf("locale values changed: %s", out)
				}
			}
			if element.token.Name.Local == "xliff" && attrValue(element.token.Attr, "srcLang") != "" {
				found = true
				if attrValue(element.token.Attr, "srcLang") != sourceLocale || attrValue(element.token.Attr, "trgLang") != targetLocale {
					t.Fatalf("locale values changed: %s", out)
				}
			}
		}
		if !found {
			t.Fatal("locale attributes not found")
		}
	}
}

func TestXLIFFNamespaceQuotesSurviveTargetCreation(t *testing.T) {
	template := []byte(`<xliff version="1.2"><file><body><trans-unit id="u"><source xmlns:c="urn:test:&quot;'&amp;"><c:ph id="p"/>Hello</source></trans-unit></body></file></xliff>`)
	entries, err := (XLIFFParser{}).Parse(template)
	if err != nil {
		t.Fatal(err)
	}
	out, err := MarshalXLIFF(template, map[string]string{"u": strings.Replace(entries["u"], "Hello", "Bonjour", 1)}, "en", "fr")
	if err != nil {
		t.Fatal(err)
	}
	elements, err := readXLIFF(out)
	if err != nil {
		t.Fatal(err)
	}
	for _, element := range elements {
		if element.token.Name.Local == "target" && attrValue(element.token.Attr, "c") != `urn:test:"'&` {
			t.Fatalf("namespace value changed: %s", out)
		}
	}
}
