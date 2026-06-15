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
		if got := escapeXMLText(tt.in); got != tt.want {
			t.Errorf("escapeXMLText(%q) = %q, want %q", tt.in, got, tt.want)
		}
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
		if got := escapeXMLAttr(tt.in); got != tt.want {
			t.Errorf("escapeXMLAttr(%q) = %q, want %q", tt.in, got, tt.want)
		}
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
		{"&#X0A;", true},
		{"&unknown;", false},
		{"&incomplete", false},
		{"&;", false},
		{"a & b", false},
		{"Value: &#1234; - more", true},
		{"&#xZ123;", false},
		{"&#123A;", false},
	}

	for _, tt := range tests {
		if got := containsXMLTextEntityReference(tt.in); got != tt.want {
			t.Errorf("containsXMLTextEntityReference(%q) = %v, want %v", tt.in, got, tt.want)
		}
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
		want string
	}{
		{"id", "main-id"},
		{"class", "primary"},
		{"unknown", ""},
		{"", ""},
	}

	for _, tt := range tests {
		if got := attrValue(attrs, tt.name); got != tt.want {
			t.Errorf("attrValue(attrs, %q) = %q, want %q", tt.name, got, tt.want)
		}
	}

	if got := attrValue(nil, "id"); got != "" {
		t.Errorf("attrValue(nil, \"id\") = %q, want \"\"", got)
	}
}
