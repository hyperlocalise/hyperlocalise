package translationfileparser

import (
	"encoding/xml"
	"testing"
)

func TestEscapeXMLText(t *testing.T) {
	tests := []struct {
		in   string
		want string
	}{
		{"hello", "hello"},
		{"a & b", "a &amp; b"},
		{"<tag>", "&lt;tag&gt;"},
		{`"quoted"`, `"quoted"`},
		{"'apos'", "'apos'"},
		{"< & >", "&lt; &amp; &gt;"},
	}

	for _, tt := range tests {
		t.Run(tt.in, func(t *testing.T) {
			if got := escapeXMLText(tt.in); got != tt.want {
				t.Errorf("escapeXMLText() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestEscapeXMLAttr(t *testing.T) {
	tests := []struct {
		in   string
		want string
	}{
		{"hello", "hello"},
		{"a & b", "a &amp; b"},
		{"<tag>", "&lt;tag&gt;"},
		{`"quoted"`, "&quot;quoted&quot;"},
		{"'apos'", "&apos;apos&apos;"},
		{"< & > \" '", "&lt; &amp; &gt; &quot; &apos;"},
	}

	for _, tt := range tests {
		t.Run(tt.in, func(t *testing.T) {
			if got := escapeXMLAttr(tt.in); got != tt.want {
				t.Errorf("escapeXMLAttr() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestContainsXMLTextEntityReference(t *testing.T) {
	tests := []struct {
		in   string
		want bool
	}{
		{"no entities", false},
		{"&amp;", true},
		{"&lt;", true},
		{"&gt;", true},
		{"&apos;", true},
		{"&quot;", true},
		{"&#10;", true},
		{"&#x0A;", true},
		{"&#X0A;", false},
		{"&unknown;", false},
		{"&unknown; &amp;", true},
		{"&incomplete", false},
		{"&;", false},
		{"a & b", false},
		{"Value: &#1234; - more", true},
		{"&#xZ123;", false},
		{"&#123A;", false},
		{"&#0;", false},
		{"&#xFFFE;", false},
		{"&#x110000;", false},
	}

	for _, tt := range tests {
		t.Run(tt.in, func(t *testing.T) {
			if got := containsXMLTextEntityReference(tt.in); got != tt.want {
				t.Errorf("containsXMLTextEntityReference() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestAttrValue(t *testing.T) {
	attrs := []xml.Attr{
		{Name: xml.Name{Local: "id"}, Value: "  main-id  "},
		{Name: xml.Name{Local: "class"}, Value: "primary"},
		{Name: xml.Name{Local: "id"}, Value: "ignored-id"},
	}

	tests := []struct {
		name string
		attr string
		want string
	}{
		{"id attribute", "id", "main-id"},
		{"class attribute", "class", "primary"},
		{"unknown attribute", "unknown", ""},
		{"empty name", "", ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := attrValue(attrs, tt.attr); got != tt.want {
				t.Errorf("attrValue() = %q, want %q", got, tt.want)
			}
		})
	}

	t.Run("nil attributes", func(t *testing.T) {
		if got := attrValue(nil, "id"); got != "" {
			t.Errorf("attrValue(nil) = %q, want \"\"", got)
		}
	})
}

func TestIsAllXMLWhitespace(t *testing.T) {
	tests := []struct {
		in   string
		want bool
	}{
		{"", true},
		{"   ", true},
		{"\n\t\r ", true},
		{"  a  ", false},
		{"a", false},
		{"\u00A0", true}, // non-breaking space
		{" \u00A0 ", true},
		{" \u00A0 a", false},
	}

	for _, tt := range tests {
		t.Run(tt.in, func(t *testing.T) {
			if got := isAllXMLWhitespace([]byte(tt.in)); got != tt.want {
				t.Errorf("isAllXMLWhitespace(%q) = %v, want %v", tt.in, got, tt.want)
			}
		})
	}
}

func TestIsXMLPlainCharData(t *testing.T) {
	tests := []struct {
		name  string
		in    string
		valid bool
	}{
		{name: "empty", in: "", valid: true},
		{name: "plain text", in: "Hello world", valid: true},
		{name: "allowed whitespace", in: "a\tb\nc\rd", valid: true},
		{name: "cdata terminator", in: "hello ]]> world", valid: false},
		{name: "cdata terminator only", in: "]]>", valid: false},
		{name: "nul", in: "hello\x00world", valid: false},
		{name: "control character", in: "hello\x01world", valid: false},
		{name: "noncharacter", in: "hello\uFFFEworld", valid: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := isXMLPlainCharData(tt.in); got != tt.valid {
				t.Errorf("isXMLPlainCharData(%q) = %v, want %v", tt.in, got, tt.valid)
			}
		})
	}
}

func TestIsXMLWhitespace(t *testing.T) {
	tests := []struct {
		in   byte
		want bool
	}{
		{' ', true},
		{'\t', true},
		{'\n', true},
		{'\r', true},
		{'a', false},
		{0, false},
	}

	for _, tt := range tests {
		t.Run(string(tt.in), func(t *testing.T) {
			if got := isXMLWhitespace(tt.in); got != tt.want {
				t.Errorf("isXMLWhitespace(%v) = %v, want %v", tt.in, got, tt.want)
			}
		})
	}
}
