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

func TestValidateSegmentIdenticalFastPath_Scout(t *testing.T) {
	t.Run("identical source and target with tokens passes format validation", func(t *testing.T) {
		req := Request{
			SourceText: "Hello {name}, your code is %d!",
			TargetText: "Hello {name}, your code is %d!",
			SourcePath: "messages.properties",
		}
		checks := ValidateSegment(req)
		var foundPass bool
		for _, c := range checks {
			if c.ID == "format-parity" && c.Status == StatusPass {
				foundPass = true
			}
		}
		if !foundPass {
			t.Errorf("Expected format-parity pass check, got: %+v", checks)
		}
	})

	t.Run("identical with invalid braces on source and target is ignored as non-ICU", func(t *testing.T) {
		req := Request{
			SourceText: "Hello {name",
			TargetText: "Hello {name",
			SourcePath: "messages.json",
		}
		checks := ValidateSegment(req)
		var foundPass bool
		for _, c := range checks {
			if c.ID == "format-parity" && c.Status == StatusPass {
				foundPass = true
			}
		}
		if !foundPass {
			t.Errorf("Expected format-parity pass check for ignored invalid source braces, got: %+v", checks)
		}
	})

	t.Run("identical with duplicate pound symbols returns error check", func(t *testing.T) {
		req := Request{
			SourceText: "{count, plural, one {one # message #} other {# messages}}",
			TargetText: "{count, plural, one {one # message #} other {# messages}}",
			SourcePath: "messages.json",
		}
		checks := ValidateSegment(req)
		var foundError bool
		for _, c := range checks {
			if c.ID == "format-icu-duplicate-pound" && c.Status == StatusFail {
				foundError = true
			}
		}
		if !foundError {
			t.Errorf("Expected format-icu-duplicate-pound, got: %+v", checks)
		}
	})

	t.Run("identical and exceeds max length returns length error check", func(t *testing.T) {
		req := Request{
			SourceText: "A very long message",
			TargetText: "A very long message",
			SourcePath: "messages.json",
			MaxLength:  5,
		}
		checks := ValidateSegment(req)
		var foundError bool
		for _, c := range checks {
			if c.ID == "length" && c.Status == StatusFail {
				foundError = true
			}
		}
		if !foundError {
			t.Errorf("Expected length failure, got: %+v", checks)
		}
	})

	t.Run("identical and with same_as_source QA mode returns warn", func(t *testing.T) {
		req := Request{
			SourceText: "Hello, world!",
			TargetText: "Hello, world!",
			SourcePath: "messages.json",
			Modes:      []string{QAModeSameAsSource},
		}
		checks := ValidateSegment(req)
		var foundWarn bool
		for _, c := range checks {
			if c.ID == "qa-same-as-source" && c.Status == StatusWarn {
				foundWarn = true
			}
		}
		if !foundWarn {
			t.Errorf("Expected qa-same-as-source warning, got: %+v", checks)
		}
	})
}
