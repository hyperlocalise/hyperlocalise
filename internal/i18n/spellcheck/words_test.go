package spellcheck

import (
	"slices"
	"testing"
)

func TestScanWords(t *testing.T) {
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
			name: "whitespace only",
			in:   "   ",
			want: nil,
		},
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
			name: "precomposed accented letters kept as single tokens",
			in:   "café naïve",
			want: []string{"café", "naïve"},
		},
		{
			name: "decomposed combining marks grouped with their base letters",
			in:   "tie\u0302ng Vie\u0323\u0302t",
			want: []string{"tie\u0302ng", "Vie\u0323\u0302t"},
		},
		{
			name: "straight apostrophe word-internal",
			in:   "don't",
			want: []string{"don't"},
		},
		{
			name: "curly apostrophe word-internal",
			in:   "O\u2019Brien",
			want: []string{"O\u2019Brien"},
		},
		{
			name: "apostrophe in a lowercase contraction",
			in:   "l'\u00e9cole",
			want: []string{"l'\u00e9cole"},
		},
		{
			name: "polynesian okina is word-internal",
			in:   "\u02BBokina word",
			want: []string{"\u02BBokina", "word"},
		},
		{
			name: "leading and trailing quotes are boundaries, not word-internal",
			in:   "'quoted'",
			want: []string{"quoted"},
		},
		{
			name: "hyphen word-internal, multiple hyphens",
			in:   "mother-in-law",
			want: []string{"mother-in-law"},
		},
		{
			name: "hyphen word-internal",
			in:   "co-operate",
			want: []string{"co-operate"},
		},
		{
			name: "hyphen surrounded by spaces is not word-internal",
			in:   "well-known - really",
			want: []string{"well-known", "really"},
		},
		{
			name: "soft hyphen is excluded from the hyphen class and splits the word",
			in:   "wor\u00ADd",
			want: []string{"wor", "d"},
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
			name: "fully escaped percent placeholder yields no placeholder",
			in:   "Literal %%@",
			want: []string{"Literal"},
		},
		{
			name: "escaped pair followed by a real placeholder",
			in:   "Escaped then real %%%@",
			want: []string{"Escaped", "then", "real"},
		},
		{
			name: "escaped percent leaves the following letter as an ordinary word",
			in:   "Save %%s today",
			want: []string{"Save", "s", "today"},
		},
		{
			name: "escaped percent with no adjacent specifier",
			in:   "100%% discount",
			want: []string{"discount"},
		},
		{
			name: "braces are ordinary punctuation, not a placeholder skip",
			in:   "{{mustache}} style",
			want: []string{"mustache", "style"},
		},
		{
			name: "canonical UUID is skipped wholesale, not fragmented",
			in:   "id 550e8400-e29b-41d4-a716-446655440000 done",
			want: []string{"id", "done"},
		},
		{
			name: "letters immediately before a UUID are extracted as their own word",
			in:   "abc550e8400-e29b-41d4-a716-446655440000",
			want: []string{"abc"},
		},
		{
			name: "bare https URL",
			in:   "See https://example.com/path for more",
			want: []string{"See", "for", "more"},
		},
		{
			name: "trailing sentence punctuation is trimmed off the URL",
			in:   "See https://example.com/path. Then stop",
			want: []string{"See", "Then", "stop"},
		},
		{
			name: "bare www URL without scheme",
			in:   "Visit www.example.com now",
			want: []string{"Visit", "now"},
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
			name: "pure numbers never enter a word run",
			in:   "Order 12345 costs $10.50",
			want: []string{"Order", "costs"},
		},
		{
			name: "digit-adjacent product names keep their letter prefix",
			in:   "Web3 and GPT4 are popular, iPhone15 too",
			want: []string{"Web", "and", "GPT", "are", "popular", "iPhone", "too"},
		},
		{
			name: "hyphenated disease/SKU-style identifiers keep their letter prefix",
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
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := scanWords(tt.in, nil)
			if !slices.Equal(got, tt.want) {
				t.Errorf("scanWords(%q) = %#v, want %#v", tt.in, got, tt.want)
			}
		})
	}
}
