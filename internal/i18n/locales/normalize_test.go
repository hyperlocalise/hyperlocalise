package locales

import (
	"slices"
	"testing"
)

func TestNormalizeListSplitsTrimsAndDeduplicates(t *testing.T) {
	tests := []struct {
		name string
		in   []string
		want []string
	}{
		{
			name: "basic splitting and deduplication",
			in:   []string{" fr-FR, de-DE ", "fr-fr", "", " es-ES "},
			want: []string{"fr-FR", "de-DE", "es-ES"},
		},
		{
			name: "empty inputs and strings with only whitespace",
			in:   []string{"", "  ", " \t\n "},
			want: []string{},
		},
		{
			name: "strings with only commas",
			in:   []string{",", ",,,", " , , "},
			want: []string{},
		},
		{
			name: "multiple consecutive commas and mixed casing",
			in:   []string{"en-US,,en-GB", "EN-US", "  fr-CA  ,  FR-ca "},
			want: []string{"en-US", "en-GB", "fr-CA"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := NormalizeList(tt.in)
			if !slices.Equal(got, tt.want) {
				t.Errorf("NormalizeList() = %#v, want %#v", got, tt.want)
			}
		})
	}
}
