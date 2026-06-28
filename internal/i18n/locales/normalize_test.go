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
		{
			name: "prefix locales are distinct",
			in:   []string{"en", "en-US", "en-GB"},
			want: []string{"en", "en-US", "en-GB"},
		},
		{
			name: "overlapping values across multiple strings",
			in:   []string{"en-US, fr-FR", "de-DE, EN-US", "FR-fr, es-ES"},
			want: []string{"en-US", "fr-FR", "de-DE", "es-ES"},
		},
		{
			name: "first encounter casing wins",
			in:   []string{"fr-ca", "FR-CA", "Fr-Ca"},
			want: []string{"fr-ca"},
		},
		{
			name: "various whitespace characters",
			in:   []string{"en-US\t,\nfr-FR\r,\fde-DE\v"},
			want: []string{"en-US", "fr-FR", "de-DE"},
		},
		{
			name: "non-breaking space around comma",
			in:   []string{"en-US\u00A0,\u00A0fr-FR"},
			want: []string{"en-US", "fr-FR"},
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
