package locales

import (
	"slices"
	"testing"
)

func TestNormalizeList_Unicode_Scout(t *testing.T) {
	tests := []struct {
		name string
		in   []string
		want []string
	}{
		{
			name: "cyrillic locales case-insensitive deduplication and normalization",
			in:   []string{" ру-РУ , РУ-ру ", "ру-ру", "  БГ-бг  "},
			want: []string{"ру-РУ", "БГ-бг"},
		},
		{
			name: "greek locales normalization and deduplication",
			in:   []string{"  ΕΛ-γρ  ,  ελ-ΓΡ  ", "ελ-γρ"},
			want: []string{"ΕΛ-γρ"},
		},
		{
			name: "arabic and hebrew scripts without uppercase distinctions",
			in:   []string{"  ar-AE , ar-ae ", "he-IL", "HE-il"},
			want: []string{"ar-AE", "he-IL"},
		},
		{
			name: "mixed ascii and non-ascii unicode scripts with dashes and digits",
			in:   []string{"  zh-Hans-CN , ZH-HANS-CN ", "ja-JP-u-ca-japanese"},
			want: []string{"zh-Hans-CN", "ja-JP-u-ca-japanese"},
		},
		{
			name: "unicode accented locales and casing fallback",
			in:   []string{"  FR-ca-éé , fr-ca-ÉÉ ", "es-ES-ññ", "ES-es-ÑÑ"},
			want: []string{"FR-ca-éé", "es-ES-ññ"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := NormalizeList(tt.in)
			if got == nil {
				t.Fatalf("NormalizeList() returned nil, want empty slice")
			}
			if !slices.Equal(got, tt.want) {
				t.Errorf("NormalizeList() = %#v, want %#v", got, tt.want)
			}
		})
	}
}
