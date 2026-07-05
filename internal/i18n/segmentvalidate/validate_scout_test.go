package segmentvalidate

import (
	"reflect"
	"testing"
)

func TestValidateSegmentRelatedTokensWithSpaces(t *testing.T) {
	tests := []struct {
		name       string
		source     string
		target     string
		wantTokens []string
		wantID     string
	}{
		{
			name:       "extra_placeholder_with_space",
			source:     "Value is %{my key}",
			target:     "Le valeur est",
			wantTokens: []string{"%{my key}"},
			wantID:     "format-extra-placeholder-mismatch",
		},
		{
			name:       "multiple_extra_placeholders_with_spaces",
			source:     "From %{start date} to %{end date}",
			target:     "De to",
			wantTokens: []string{"%{end date}", "%{start date}"}, // Sorted
			wantID:     "format-extra-placeholder-mismatch",
		},
		{
			name:       "mixed_extra_placeholders",
			source:     "Hi %s, your id is %{user id}",
			target:     "Bonjour",
			wantTokens: []string{"%s", "%{user id}"}, // Sorted
			wantID:     "format-extra-placeholder-mismatch",
		},
		{
			name:       "icu_placeholder_missing",
			source:     "Hello {first_name}",
			target:     "Bonjour",
			wantTokens: []string{"{first_name}"},
			wantID:     "format-missing-token",
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
