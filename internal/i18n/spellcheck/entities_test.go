package spellcheck

import (
	"slices"
	"testing"
)

func TestScanWordsEntities(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want []string
	}{
		{
			name: "named entity between two real words is decoded away, not tokenized",
			in:   "Tom &amp; Jerry",
			want: []string{"Tom", "Jerry"},
		},
		{
			name: "named entity mid-word is decoded and merged into a single token",
			in:   "caf&eacute;",
			want: []string{"café"},
		},
		{
			name: "named entity mid-word, multiple entities in one word",
			in:   "Fran&ccedil;ais",
			want: []string{"Français"},
		},
		{
			name: "named entity at the very start of a word seeds the run",
			in:   "&eacute;cole",
			want: []string{"école"},
		},
		{
			name: "non-breaking space entity between words is a silent boundary",
			in:   "hello&nbsp;world",
			want: []string{"hello", "world"},
		},
		{
			name: "standalone non-breaking space entity yields no tokens",
			in:   "&nbsp;",
			want: nil,
		},
		{
			name: "standalone hex numeric non-breaking space entity yields no tokens",
			in:   "&#xA0;",
			want: nil,
		},
		{
			name: "escaped literal angle brackets decode and are silent boundaries, inner text survives",
			in:   "&lt;tag&gt;",
			want: []string{"tag"},
		},
		{
			name: "bare ampersand with no entity shape is unaffected",
			in:   "Fish & Chips",
			want: []string{"Fish", "Chips"},
		},
		{
			name: "unrecognized entity name retains current (pre-fix) behavior",
			in:   "&notarealentity;",
			want: []string{"notarealentity"},
		},
		{
			name: "decimal numeric apostrophe entity flanked by letters merges as a contraction",
			in:   "don&#39;t",
			want: []string{"don't"},
		},
		{
			name: "named curly-apostrophe entity flanked by letters merges as a contraction",
			in:   "don&rsquo;t",
			want: []string{"don\u2019t"},
		},
		{
			name: "hex numeric HYPHEN entity flanked by letters is word-internal",
			in:   "co&#x2010;operate",
			want: []string{"co\u2010operate"},
		},
		{
			name: "hex numeric HYPHEN entity surrounded by spaces is not word-internal",
			in:   "well&#x2010;known &#x2010; really",
			want: []string{"well\u2010known", "really"},
		},
		{
			name: "leading apostrophe entity has no left flank and is a silent boundary",
			in:   "&#39;tis",
			want: []string{"tis"},
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
