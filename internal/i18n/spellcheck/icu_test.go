package spellcheck

import (
	"slices"
	"testing"
)

func TestSplitICULiterals(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want []string
	}{
		{
			name: "no braces returns the whole string as one fragment",
			in:   "Hello world",
			want: []string{"Hello world"},
		},
		{
			name: "empty string",
			in:   "",
			want: []string{""},
		},
		{
			name: "pure argument placeholder produces no fragments",
			in:   "{name}",
			want: nil,
		},
		{
			name: "plural branches produce a fragment each, argument itself does not",
			in:   "{count, plural, one {item} other {items}}",
			want: []string{"item", "items"},
		},
		{
			name: "literal text and argument interleaved with a plural, order preserved",
			in:   "Hello {name}, you have {count, plural, one {item} other {items}}",
			want: []string{"Hello ", ", you have ", "item", "items"},
		},
		{
			name: "nested plural inside select branches, order preserved",
			in:   "{gender, select, male {{count, plural, one {one item} other {# items}}} other {{count, plural, one {one item} other {# items}}}}",
			want: []string{"one item", " items", "one item", " items"},
		},
		{
			name: "empty branch contributes no fragment",
			in:   "{count, plural, one {} other {items}}",
			want: []string{"items"},
		},

		{
			name: "unbalanced braces fall back to one opaque fragment",
			in:   "Hello {name, you have {count, plural, one {item} other {items}}",
			want: []string{"Hello {name, you have {count, plural, one {item} other {items}}"},
		},
		{
			name: "unclosed plural options fall back to one opaque fragment",
			in:   "{count, plural",
			want: []string{"{count, plural"},
		},
		{
			name: "non-ICU curly template syntax falls back to one opaque fragment",
			in:   "This has {{mustache}} style",
			want: []string{"This has {{mustache}} style"},
		},
		{
			name: "an incomplete tag-shaped span that survived stripMarkup triggers fallback",
			in:   "before <b unclosed {count}",
			want: []string{"before <b unclosed {count}"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := splitICULiterals(tt.in)
			if !slices.Equal(got, tt.want) {
				t.Errorf("splitICULiterals(%q) = %#v, want %#v", tt.in, got, tt.want)
			}
		})
	}
}
