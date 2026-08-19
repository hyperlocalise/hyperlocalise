package spellcheck

import (
	"slices"
	"testing"
)

func TestTokenize(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want []string
	}{
		{
			name: "plain text",
			in:   "Hello world",
			want: []string{"Hello", "world"},
		},

		{
			name: "punctuation-adjacent words",
			in:   "Hello, world!",
			want: []string{"Hello", "world"},
		},

		{
			name: "precomposed accented letters",
			in:   "café naïve",
			want: []string{"café", "naïve"},
		},
		{
			name: "decomposed combining marks stay grouped with their base letters",
			in:   "tie\u0302ng Vie\u0323\u0302t",
			want: []string{"tie\u0302ng", "Vie\u0323\u0302t"},
		},
		{
			name: "straight and curly apostrophes are word-internal",
			in:   "don't and O\u2019Brien",
			want: []string{"don't", "and", "O\u2019Brien"},
		},
		{
			name: "lowercase elision apostrophe",
			in:   "l'\u00e9cole",
			want: []string{"l'\u00e9cole"},
		},
		{
			name: "polynesian okina is word-internal",
			in:   "\u02BBokina",
			want: []string{"\u02BBokina"},
		},
		{
			name: "leading and trailing quotes are stripped as boundaries",
			in:   "'quoted'",
			want: []string{"quoted"},
		},

		{
			name: "hyphen word-internal",
			in:   "mother-in-law and co-operate",
			want: []string{"mother-in-law", "and", "co-operate"},
		},
		{
			name: "hyphen surrounded by spaces is not word-internal",
			in:   "well-known - really",
			want: []string{"well-known", "really"},
		},
		{
			name: "soft hyphen is a boundary, not word-internal",
			in:   "wor\u00ADd",
			want: []string{"wor", "d"},
		},

		{
			name: "pure argument placeholder produces no words",
			in:   "{name}",
			want: nil,
		},
		{
			name: "plural branches are extracted, the argument itself is not",
			in:   "{count, plural, one {item} other {items}}",
			want: []string{"item", "items"},
		},
		{
			name: "nested select and plural branches, order preserved",
			in:   "{gender, select, male {He} female {She} other {They}} liked {count, plural, one {one item} other {# items}}",
			want: []string{"He", "She", "They", "liked", "one", "item", "items"},
		},

		{
			name: "ICU-quoted literal braces are real text, not a placeholder to skip",
			in:   "Use '{literal brace}' here",
			want: []string{"Use", "literal", "brace", "here"},
		},

		{
			name: "malformed ICU falls back to opaque scanning of the whole string",
			in:   "Hello {name, you have {count, plural, one {item} other {items}}",
			want: []string{"Hello", "name", "you", "have", "count", "plural", "one", "item", "other", "items"},
		},

		{
			name: "basic printf specifiers",
			in:   "Hello %s, you have %d messages",
			want: []string{"Hello", "you", "have", "messages"},
		},
		{
			name: "positional, named, objc, and shell-style placeholders",
			in:   "%1$s and %(name)s and %@ and ${name}",
			want: []string{"and", "and", "and"},
		},
		{
			name: "escaped percent is not a placeholder",
			in:   "100%% discount",
			want: []string{"discount"},
		},

		{
			name: "simple tags and a link",
			in:   `<b>Hello</b> <a href="/x">world</a>`,
			want: []string{"Hello", "world"},
		},
		{
			name: "self-closing tag",
			in:   "Line<br/>break",
			want: []string{"Line", "break"},
		},
		{
			name: "ICU placeholder embedded in an attribute is removed with the tag",
			in:   `<a href="/{lang}/page">Click here</a>`,
			want: []string{"Click", "here"},
		},

		{
			name: "code span",
			in:   "Use `git commit` now",
			want: []string{"Use", "now"},
		},
		{
			name: "inline link with destination and title",
			in:   `[Click here](https://example.com "title")`,
			want: []string{"Click", "here"},
		},
		{
			name: "reference-style link",
			in:   "[Click here][ref]",
			want: []string{"Click", "here"},
		},
		{
			name: "bare URL in prose",
			in:   "See https://example.com/path for more",
			want: []string{"See", "for", "more"},
		},
		{
			name: "documented limitation: adjacent bracket groups misread as a reference link",
			in:   "See sections [3][see also] for details",
			want: []string{"See", "sections", "for", "details"},
		},
		{
			name: "contrast: non-adjacent bracket groups are unaffected",
			in:   "See sections [3] and [see also] for details",
			want: []string{"See", "sections", "and", "see", "also", "for", "details"},
		},

		{
			name: "HL sentinels are removed, surrounding text is kept",
			in:   "\x1eHLHTPH_ABCDEF012345_0\x1f Hello \x1eHLLQPH_ABCDEF012345_1\x1f",
			want: []string{"Hello"},
		},

		{
			name: "pure numbers and currency amounts never enter a word run",
			in:   "Order 12345 costs $10.50",
			want: []string{"Order", "costs"},
		},
		{
			name: "digit-adjacent product names keep their letter prefix",
			in:   "Web3 and GPT4 are popular, iPhone15 too",
			want: []string{"Web", "and", "GPT", "are", "popular", "iPhone", "too"},
		},
		{
			name: "hyphenated disease name keeps its letter prefix",
			in:   "the disease is called COVID-19",
			want: []string{"the", "disease", "is", "called", "COVID"},
		},
		{
			name: "hyphenated SKU identifier keeps its letter prefix",
			in:   "the SKU-12345 is out of stock",
			want: []string{"the", "SKU", "is", "out", "of", "stock"},
		},
		{
			name: "underscore is never word-forming",
			in:   "user_id2 and user_id",
			want: []string{"user", "id", "and", "user", "id"},
		},
		{
			name: "canonical UUID is skipped wholesale, not fragmented",
			in:   "id 550e8400-e29b-41d4-a716-446655440000 done",
			want: []string{"id", "done"},
		},

		{
			name: "mixed HTML, Markdown, ICU, and bare URL in one segment",
			in:   "<b>Hello</b>, you have {count, plural, one {one message} other {# messages}}. See `code` or https://example.com for details.",
			want: []string{"Hello", "you", "have", "one", "message", "messages", "See", "or", "for", "details"},
		},

		{
			name: "empty string",
			in:   "",
			want: nil,
		},
		{
			name: "whitespace only",
			in:   "   ",
			want: nil,
		},
		{
			name: "placeholder-only ICU argument",
			in:   "{name}",
			want: nil,
		},
		{
			name: "placeholder-only printf specifier",
			in:   "%s",
			want: nil,
		},
		{
			name: "sentinel-only internal placeholder",
			in:   "\x1eHLMDPH_ABCDEF012345_0\x1f",
			want: nil,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := Tokenize(tt.in)
			if !slices.Equal(got, tt.want) {
				t.Errorf("Tokenize(%q) = %#v, want %#v", tt.in, got, tt.want)
			}
		})
	}
}
