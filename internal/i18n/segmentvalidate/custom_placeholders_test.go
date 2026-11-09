package segmentvalidate

import (
	"slices"
	"testing"
)

func TestCompileCustomPlaceholderPatternsSkipsUnusablePatterns(t *testing.T) {
	compiled := CompileCustomPlaceholderPatterns([]string{"", "  ", "[unclosed", "a*", `\[\[\w+\]\]`})
	if len(compiled) != 1 {
		t.Fatalf("expected 1 compiled pattern, got %d", len(compiled))
	}
}

func TestExtractCustomPlaceholdersPrefersEarliestLongestMatch(t *testing.T) {
	compiled := CompileCustomPlaceholderPatterns([]string{`\[\w+\]`, `\[\[\w+\]\]`, `:\w+`})
	got := ExtractCustomPlaceholders(compiled, "Hi [[name]], see :link and [x]")
	want := []string{":link", "[[name]]", "[x]"}
	if !slices.Equal(got, want) {
		t.Fatalf("got %q, want %q", got, want)
	}
}

func TestValidateSegmentCustomPlaceholders(t *testing.T) {
	patterns := []string{`\[\[\w+\]\]`}
	tests := []struct {
		name       string
		source     string
		target     string
		wantID     string
		wantStatus string
		wantTokens []string
	}{
		{
			name:       "kept",
			source:     "Hello [[name]]",
			target:     "Bonjour [[name]]",
			wantID:     "custom-placeholder-parity",
			wantStatus: StatusPass,
		},
		{
			name:       "missing",
			source:     "Hello [[name]] and [[team]]",
			target:     "Bonjour [[name]]",
			wantID:     "custom-placeholder-mismatch",
			wantStatus: StatusFail,
			wantTokens: []string{"[[team]]"},
		},
		{
			name:       "introduced",
			source:     "Hello",
			target:     "Bonjour [[name]]",
			wantID:     "custom-placeholder-mismatch",
			wantStatus: StatusFail,
			wantTokens: []string{"[[name]]"},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			checks := ValidateSegment(Request{
				SourceText:          tt.source,
				TargetText:          tt.target,
				SourcePath:          "/pkg/messages.json",
				PlaceholderPatterns: patterns,
			})
			idx := slices.IndexFunc(checks, func(check Check) bool { return check.ID == tt.wantID })
			if idx < 0 {
				t.Fatalf("expected check %q in %+v", tt.wantID, checks)
			}
			if checks[idx].Status != tt.wantStatus {
				t.Fatalf("status = %q, want %q", checks[idx].Status, tt.wantStatus)
			}
			if !slices.Equal(checks[idx].RelatedTokens, tt.wantTokens) {
				t.Fatalf("related tokens = %q, want %q", checks[idx].RelatedTokens, tt.wantTokens)
			}
		})
	}
}

func TestValidateSegmentWithoutCustomPlaceholdersAddsNoCheck(t *testing.T) {
	checks := ValidateSegment(Request{
		SourceText:          "Hello",
		TargetText:          "Bonjour",
		SourcePath:          "/pkg/messages.json",
		PlaceholderPatterns: []string{`\[\[\w+\]\]`},
	})
	for _, check := range checks {
		if check.ID == "custom-placeholder-parity" || check.ID == "custom-placeholder-mismatch" {
			t.Fatalf("unexpected custom placeholder check %+v", check)
		}
	}
}
