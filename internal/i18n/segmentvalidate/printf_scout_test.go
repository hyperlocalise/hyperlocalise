package segmentvalidate

import (
	"reflect"
	"testing"
)

func TestExtractExtraPlaceholdersPrintfExtended(t *testing.T) {
	tests := []struct {
		text string
		want []string
	}{
		{
			text: "Count: %i",
			want: []string{"%i"},
		},
		{
			text: "Hex: %x",
			want: []string{"%x"},
		},
		{
			text: "HEX: %X",
			want: []string{"%X"},
		},
		{
			text: "Unsigned: %u",
			want: []string{"%u"},
		},
		{
			text: "Price: %.2f",
			want: []string{"%.2f"},
		},
		{
			text: "Padded: %02d",
			want: []string{"%02d"},
		},
		{
			text: "Long: %ld",
			want: []string{"%ld"},
		},
		{
			text: "Long Unsigned: %lu",
			want: []string{"%lu"},
		},
		{
			text: "Positional: %1$i",
			want: []string{"%1$i"},
		},
		{
			text: "Named: %(count)i",
			want: []string{"%(count)i"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.text, func(t *testing.T) {
			got := extractExtraPlaceholders(tt.text)
			if !reflect.DeepEqual(got, tt.want) {
				t.Errorf("extractExtraPlaceholders(%q) = %v, want %v", tt.text, got, tt.want)
			}
		})
	}
}

func TestValidateSegmentPrintfExtendedParity(t *testing.T) {
	tests := []struct {
		name       string
		source     string
		target     string
		wantTokens []string
		wantID     string
	}{
		{
			name:       "missing %i",
			source:     "Count: %i",
			target:     "Count:",
			wantTokens: []string{"%i"},
			wantID:     "format-extra-placeholder-mismatch",
		},
		{
			name:       "missing %.2f",
			source:     "Price: %.2f",
			target:     "Price:",
			wantTokens: []string{"%.2f"},
			wantID:     "format-extra-placeholder-mismatch",
		},
		{
			name:       "missing %02d",
			source:     "Value: %02d",
			target:     "Value:",
			wantTokens: []string{"%02d"},
			wantID:     "format-extra-placeholder-mismatch",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := Request{
				SourceText: tt.source,
				TargetText: tt.target,
				SourcePath: "/pkg/en.json",
			}

			checks := ValidateSegment(req)
			var formatCheck *Check
			for i := range checks {
				if checks[i].ID == tt.wantID {
					formatCheck = &checks[i]
					break
				}
			}

			if formatCheck == nil {
				t.Fatalf("expected %s check, but none found in %+v", tt.wantID, checks)
			}

			if !reflect.DeepEqual(formatCheck.RelatedTokens, tt.wantTokens) {
				t.Errorf("RelatedTokens = %v, want %v", formatCheck.RelatedTokens, tt.wantTokens)
			}
		})
	}
}
