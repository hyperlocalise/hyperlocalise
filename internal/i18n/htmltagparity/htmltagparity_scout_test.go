package htmltagparity

import (
	"reflect"
	"testing"
)

func TestFindAllTags_Direct(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want []string
	}{
		{
			name: "empty string",
			in:   "",
			want: nil,
		},
		{
			name: "plain text without tags",
			in:   "Hello world",
			want: nil,
		},
		{
			name: "single standard tag",
			in:   "<div>",
			want: []string{"<div>"},
		},
		{
			name: "multiple standard tags",
			in:   "Hello <strong>world</strong>",
			want: []string{"<strong>", "</strong>"},
		},
		{
			name: "tag with spaces and newlines",
			in:   "Hello <strong\n  class=\"foo\">world</strong>",
			want: []string{"<strong\n  class=\"foo\">", "</strong>"},
		},
		{
			name: "unclosed tag",
			in:   "Hello <div",
			want: nil,
		},
		{
			name: "incomplete tag with trailing slash only",
			in:   "Hello <",
			want: nil,
		},
		{
			name: "not a tag start (no letter or slash/letter)",
			in:   "Hello <123> or <.abc>",
			want: nil,
		},
		{
			name: "tag start with slash and no letter",
			in:   "Hello </ 123>",
			want: nil,
		},
		{
			name: "greater-than sign in quoted attribute",
			in:   `<div title="a > b">content</div>`,
			want: []string{`<div title="a > b">`, "</div>"},
		},
		{
			name: "single quotes attribute containing angle brackets",
			in:   `<div title='a > b'>`,
			want: []string{`<div title='a > b'>`},
		},
		{
			name: "unclosed quote inside tag",
			in:   `<div title="unclosed quote`,
			want: nil,
		},
		{
			name: "escaped slash-like content in quotes",
			in:   `<img src="/path/to/img.png">`,
			want: []string{`<img src="/path/to/img.png">`},
		},
		{
			name: "flexible self closing",
			in:   `<br / >`,
			want: []string{`<br / >`},
		},
		{
			name: "closing tag with space after slash",
			in:   "Hello <strong>world</ strong >",
			want: []string{"<strong>", "</ strong >"},
		},
		{
			name: "closing tag with space before slash",
			in:   "Hello <div>world< / div>",
			want: []string{"<div>", "< / div>"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := findAllTags(tt.in)
			if !reflect.DeepEqual(got, tt.want) {
				t.Errorf("findAllTags(%q) = %q, want %q", tt.in, got, tt.want)
			}
		})
	}
}

func TestMismatch_SpacedClosingTags(t *testing.T) {
	tests := []struct {
		name string
		src  string
		tgt  string
		want bool
	}{
		{
			name: "space after slash in closing tag matches tight closing tag",
			src:  "Hello <strong>world</ strong >",
			tgt:  "Bonjour <strong>monde</strong>",
			want: false,
		},
		{
			name: "space before slash in closing tag matches tight closing tag",
			src:  "Hello <div>world< / div>",
			tgt:  "Bonjour <div>monde</div>",
			want: false,
		},
		{
			name: "both sides use spaced closing tags and match",
			src:  "Hello <strong>world</ strong>",
			tgt:  "Bonjour <strong>monde< / strong >",
			want: false,
		},
		{
			name: "spaced closing tag still detects real mismatch",
			src:  "Hello <strong>world</ strong >",
			tgt:  "Bonjour <em>monde</em>",
			want: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := Mismatch(tt.src, tt.tgt); got != tt.want {
				t.Errorf("Mismatch(%q, %q) = %v, want %v", tt.src, tt.tgt, got, tt.want)
			}
		})
	}
}

func TestNormalizedTagNames_Direct(t *testing.T) {
	tags := []string{"<strong\n  class=\"foo\">", "</strong >", "<br / >", "</div>"}
	want := []string{"strong", "/strong", "br", "/div"}
	got := NormalizedTagNames(tags)
	if !reflect.DeepEqual(got, want) {
		t.Errorf("NormalizedTagNames(%v) = %v, want %v", tags, got, want)
	}
}

func TestExtractTagName_Direct(t *testing.T) {
	tests := []struct {
		name string
		tag  string
		want string
	}{
		{
			name: "standard opening tag",
			tag:  "<div>",
			want: "div",
		},
		{
			name: "standard closing tag",
			tag:  "</div>",
			want: "/div",
		},
		{
			name: "leading and trailing whitespaces",
			tag:  " \n <div class=\"foo\"> \t",
			want: "div",
		},
		{
			name: "closing tag with space inside parses correctly",
			tag:  "</ strong >",
			want: "/strong",
		},
		{
			name: "closing tag with space before slash parses correctly",
			tag:  "< / div>",
			want: "/div",
		},
		{
			name: "self-closing tag",
			tag:  "<br/>",
			want: "br",
		},
		{
			name: "flexible self-closing tag",
			tag:  "<br / >",
			want: "br",
		},
		{
			name: "invalid tag structure",
			tag:  "not a tag",
			want: "",
		},
		{
			name: "just braces",
			tag:  "<>",
			want: "",
		},
		{
			name: "just closing brace parses as empty",
			tag:  "</>",
			want: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := extractTagName(tt.tag)
			if got != tt.want {
				t.Errorf("extractTagName(%q) = %q, want %q", tt.tag, got, tt.want)
			}
		})
	}
}

func TestIsLikelyMarkupTag_Direct(t *testing.T) {
	tests := []struct {
		name       string
		raw        string
		normalized string
		want       bool
	}{
		{
			name:       "empty normalized string",
			raw:        "<>",
			normalized: "",
			want:       false,
		},
		{
			name:       "known html atom (div)",
			raw:        "<div>",
			normalized: "div",
			want:       true,
		},
		{
			name:       "known html atom closing (span)",
			raw:        "</span>",
			normalized: "/span",
			want:       true,
		},
		{
			name:       "ignored template atom (name) without attributes",
			raw:        "<name>",
			normalized: "name",
			want:       false,
		},
		{
			name:       "ignored template atom (name) with attributes",
			raw:        "<name class=\"bold\">",
			normalized: "name",
			want:       true,
		},
		{
			name:       "ignored template atom (id) without attributes",
			raw:        "<id>",
			normalized: "id",
			want:       false,
		},
		{
			name:       "ignored template atom (id) with attributes",
			raw:        "<id val=\"123\">",
			normalized: "id",
			want:       true,
		},
		{
			name:       "custom tag with hyphen",
			raw:        "<my-component>",
			normalized: "my-component",
			want:       true,
		},
		{
			name:       "namespaced tag with colon",
			raw:        "<ui:button>",
			normalized: "ui:button",
			want:       true,
		},
		{
			name:       "MDX component tag starting with uppercase letter",
			raw:        "<Badge>",
			normalized: "badge",
			want:       true,
		},
		{
			name:       "placeholder-like tag with digit without attributes",
			raw:        "<tag1>",
			normalized: "tag1",
			want:       false,
		},
		{
			name:       "placeholder-like tag with digit with attributes",
			raw:        "<tag1 class=\"foo\">",
			normalized: "tag1",
			want:       true,
		},
		{
			name:       "placeholder-like tag with dot without attributes",
			raw:        "<my.component>",
			normalized: "my.component",
			want:       false,
		},
		{
			name:       "placeholder-like tag with underscore without attributes",
			raw:        "<my_tag>",
			normalized: "my_tag",
			want:       false,
		},
		{
			name:       "invalid raw tag structure name extraction failure",
			raw:        "not_a_tag",
			normalized: "tag",
			want:       false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := isLikelyMarkupTag(tt.raw, tt.normalized)
			if got != tt.want {
				t.Errorf("isLikelyMarkupTag(%q, %q) = %v, want %v", tt.raw, tt.normalized, got, tt.want)
			}
		})
	}
}

func TestRawTagHasAttributes_Direct(t *testing.T) {
	tests := []struct {
		name    string
		raw     string
		rawName string
		want    bool
	}{
		{
			name:    "tag with no attributes",
			raw:     "<div>",
			rawName: "div",
			want:    false,
		},
		{
			name:    "tag with attribute",
			raw:     "<div class=\"foo\">",
			rawName: "div",
			want:    true,
		},
		{
			name:    "self-closing tag with no attributes",
			raw:     "<br/>",
			rawName: "br",
			want:    false,
		},
		{
			name:    "flexible self-closing tag with no attributes",
			raw:     "<br / >",
			rawName: "br",
			want:    false,
		},
		{
			name:    "self-closing tag with attribute",
			raw:     "<img src=\"foo.png\"/>",
			rawName: "img",
			want:    true,
		},
		{
			name:    "flexible self-closing tag with attribute",
			raw:     "<img src=\"foo.png\" / >",
			rawName: "img",
			want:    true,
		},
		{
			name:    "invalid prefix tag",
			raw:     "not_a_tag",
			rawName: "tag",
			want:    false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := rawTagHasAttributes(tt.raw, tt.rawName)
			if got != tt.want {
				t.Errorf("rawTagHasAttributes(%q, %q) = %v, want %v", tt.raw, tt.rawName, got, tt.want)
			}
		})
	}
}
