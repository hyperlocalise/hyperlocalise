package spellcheck

import "testing"

func TestStripMarkup(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want string
	}{
		{
			name: "plain text is untouched",
			in:   "Hello world",
			want: "Hello world",
		},
		{
			name: "empty string",
			in:   "",
			want: "",
		},
		{
			name: "HL sentinel is replaced with a single space",
			in:   "\x1eHLHTPH_ABCDEF012345_0\x1f Hello \x1eHLLQPH_ABCDEF012345_1\x1f",
			want: "  Hello  ",
		},
		{
			name: "unterminated sentinel is left in place",
			in:   "before \x1eHLHTPH_ABCDEF012345_0 after",
			want: "before \x1eHLHTPH_ABCDEF012345_0 after",
		},
		{
			name: "simple opening and closing tags",
			in:   "<b>Hello</b> <a href=\"/x\">world</a>",
			want: " Hello   world ",
		},
		{
			name: "self-closing tag",
			in:   "Line one<br/>Line two",
			want: "Line one Line two",
		},
		{
			name: "tag with quoted attribute containing angle bracket",
			in:   "<a title=\"a > b\">text</a>",
			want: " text ",
		},
		{
			name: "tag with single-quoted attribute containing angle bracket",
			in:   "<a title='a > b'>text</a>",
			want: " text ",
		},
		{
			name: "ICU placeholder inside an attribute is removed with the tag",
			in:   "<a href=\"/{lang}/page\">Click here</a>",
			want: " Click here ",
		},
		{
			name: "doctype declaration",
			in:   "<!DOCTYPE html>Hello",
			want: " Hello",
		},
		{
			name: "processing instruction",
			in:   "<?php echo 1; ?>Hello",
			want: " Hello",
		},
		{
			name: "markdown autolink matches the HTML tag shape",
			in:   "See <https://example.com> for more",
			want: "See   for more",
		},
		{
			name: "closing tag without a following letter is not a tag",
			in:   "aw </3 sad face",
			want: "aw </3 sad face",
		},
		{
			name: "unclosed tag is left in place",
			in:   "before <b unclosed",
			want: "before <b unclosed",
		},
		{
			name: "single backtick code span",
			in:   "Use `git commit` now",
			want: "Use   now",
		},
		{
			name: "double backtick code span with inner single backtick",
			in:   "Use ``git ` commit`` now",
			want: "Use   now",
		},
		{
			name: "unmatched backtick run is left as punctuation",
			in:   "This has a stray ` backtick",
			want: "This has a stray ` backtick",
		},
		{
			name: "shorter inner backtick run does not close a longer fence",
			in:   "``one` two``",
			want: " ",
		},
		{
			name: "combination of sentinel, tag, and code span",
			in:   "\x1eHLHTPH_ABCDEF012345_0\x1f <b>bold</b> and `code`",
			want: "   bold  and  ",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := stripMarkup(tt.in)
			if got != tt.want {
				t.Errorf("stripMarkup(%q) = %q, want %q", tt.in, got, tt.want)
			}
		})
	}
}
