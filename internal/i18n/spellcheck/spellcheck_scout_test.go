package spellcheck

import (
	"slices"
	"testing"
)

func TestTokenize_ScoutEdgeCases(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want []string
	}{
		{
			name: "complex HTML with quoted attribute angle brackets and doctype",
			in:   `<!DOCTYPE html><a href="/page" title="Go > Next">Click &amp; Enter</a>`,
			want: []string{"Click", "Enter"},
		},
		{
			name: "self-closing HTML tags with trailing spaces",
			in:   "First line<br  />Second line<hr   />Third line",
			want: []string{"First", "line", "Second", "line", "Third", "line"},
		},
		{
			name: "xml processing instruction and hyper-localise sentinel",
			in:   "<?xml version=\"1.0\"?> \x1eHLHTPH_012345_0\x1f Welcome back \x1eHLHTPH_012345_1\x1f",
			want: []string{"Welcome", "back"},
		},
		{
			name: "markdown inline link with parenthetical destination and title",
			in:   `Read the [API Documentation](https://example.com/docs/(v2)#sec "Reference") for details`,
			want: []string{"Read", "the", "API", "Documentation", "for", "details"},
		},
		{
			name: "markdown code span with double backtick fence enclosing single backtick",
			in:   "Run ``git config `name`` to set up",
			want: []string{"Run", "to", "set", "up"},
		},
		{
			name: "nested ICU select with HTML entity and placeholders",
			in:   "{role, select, admin {Administrator &amp; Owner} user {Standard User &hellip;} other {Guest}}",
			want: []string{"Administrator", "Owner", "Standard", "User", "Guest"},
		},
		{
			name: "HTML entities mid-word and non-breaking space boundaries",
			in:   "Fran&ccedil;ais&nbsp;caf&eacute;&nbsp;re&#x2010;enter",
			want: []string{"Français", "café", "re\u2010enter"},
		},
		{
			name: "HTML entity-encoded contractions with curly apostrophe",
			in:   "don&rsquo;t and O&rsquo;Brien",
			want: []string{"don\u2019t", "and", "O\u2019Brien"},
		},
		{
			name: "bare URLs surrounded by sentence punctuation",
			in:   "Visit https://example.com/docs! (or www.example.org/api, for info).",
			want: []string{"Visit", "or", "for", "info"},
		},
		{
			name: "digit-adjacent product names, diseases, and SKUs",
			in:   "Order COVID-19 test kits, iPhone15 or Web3 devices, SKU-8800 ready",
			want: []string{"Order", "COVID", "test", "kits", "iPhone", "or", "Web", "devices", "SKU", "ready"},
		},
		{
			name: "canonical UUID skipping without tokenizing hex fragments",
			in:   "Session 550e8400-e29b-41d4-a716-446655440000 authenticated",
			want: []string{"Session", "authenticated"},
		},
		{
			name: "formatted printf positional specifiers skipped cleanly",
			in:   "Processed %1$d items (%2$.2f%% complete) in %3$s",
			want: []string{"Processed", "items", "complete", "in"},
		},
		{
			name: "combining character accents stay grouped with base letter",
			in:   "tie\u0302ng Vie\u0323\u0302t language",
			want: []string{"tie\u0302ng", "Vie\u0323\u0302t", "language"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := Tokenize(tt.in)
			if !slices.Equal(got, tt.want) {
				t.Errorf("Tokenize(%q) =\n  got:  %#v\n  want: %#v", tt.in, got, tt.want)
			}
		})
	}
}

func TestStripMarkup_ScoutEdgeCases(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want string
	}{
		{
			name: "no markup returns input directly",
			in:   "Simple plain text",
			want: "Simple plain text",
		},
		{
			name: "unclosed HTML tag leaves string intact",
			in:   "Text <div class=\"unclosed",
			want: "Text <div class=\"unclosed",
		},
		{
			name: "tag with single quote containing angle bracket",
			in:   "<span title='a > b'>text</span>",
			want: " text ",
		},
		{
			name: "markdown autolink replaced with space",
			in:   "Link <https://hyperlocalise.com> here",
			want: "Link   here",
		},
		{
			name: "stray backtick with no matching fence left in place",
			in:   "Code `stray backtick without closing",
			want: "Code `stray backtick without closing",
		},
		{
			name: "closing tag without tag lead is not stripped",
			in:   "math </ 3 equation",
			want: "math </ 3 equation",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := stripMarkup(tt.in)
			if got != tt.want {
				t.Errorf("stripMarkup(%q) =\n  got:  %q\n  want: %q", tt.in, got, tt.want)
			}
		})
	}
}

func TestSplitICULiterals_ScoutEdgeCases(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want []string
	}{
		{
			name: "no braces returns slice with original string",
			in:   "Plain ICU text",
			want: []string{"Plain ICU text"},
		},
		{
			name: "malformed ICU syntax falls back to original string",
			in:   "Hello {count, plural, one {item} other",
			want: []string{"Hello {count, plural, one {item} other"},
		},
		{
			name: "quoted literal brace is retained as literal text",
			in:   "Press '{'Esc'}' key to exit",
			want: []string{"Press {Esc} key to exit"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := splitICULiterals(tt.in)
			if !slices.Equal(got, tt.want) {
				t.Errorf("splitICULiterals(%q) =\n  got:  %#v\n  want: %#v", tt.in, got, tt.want)
			}
		})
	}
}
