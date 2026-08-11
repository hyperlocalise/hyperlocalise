package scoring

import (
	"slices"
	"testing"
)

func TestForbiddenTerms_Scout(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name        string
		source      string
		translated  string
		tags        []string
		wantFail    bool
		wantScore   float64
		wantScoreID string
	}{
		{
			name:        "no forbidden terms returns success",
			source:      "Hello world",
			translated:  "Bonjour le monde",
			tags:        []string{},
			wantFail:    false,
			wantScore:   1.0,
			wantScoreID: "termCompliance",
		},
		{
			name:        "exact match of forbidden term triggers hard fail",
			source:      "Sign in",
			translated:  "Use legacy-login",
			tags:        []string{"forbidden:legacy-login"},
			wantFail:    true,
			wantScore:   0.0,
			wantScoreID: "termCompliance",
		},
		{
			name:        "case-insensitive match of forbidden term: lowercase tag, uppercase translation",
			source:      "Sign in",
			translated:  "Use LEGACY-LOGIN",
			tags:        []string{"forbidden:legacy-login"},
			wantFail:    true,
			wantScore:   0.0,
			wantScoreID: "termCompliance",
		},
		{
			name:        "case-insensitive match of forbidden term: uppercase tag, lowercase translation",
			source:      "Sign in",
			translated:  "Use legacy-login",
			tags:        []string{"forbidden:LEGACY-LOGIN"},
			wantFail:    true,
			wantScore:   0.0,
			wantScoreID: "termCompliance",
		},
		{
			name:        "multiple forbidden terms: first term matches",
			source:      "Sign in",
			translated:  "Use legacy-login",
			tags:        []string{"forbidden:legacy-login", "forbidden:deprecated-auth"},
			wantFail:    true,
			wantScore:   0.0,
			wantScoreID: "termCompliance",
		},
		{
			name:        "multiple forbidden terms: second term matches",
			source:      "Sign in",
			translated:  "Use deprecated-auth",
			tags:        []string{"forbidden:legacy-login", "forbidden:deprecated-auth"},
			wantFail:    true,
			wantScore:   0.0,
			wantScoreID: "termCompliance",
		},
		{
			name:        "substring match of forbidden term",
			source:      "Sign in",
			translated:  "Use legacy-login-v2",
			tags:        []string{"forbidden:legacy-login"},
			wantFail:    true,
			wantScore:   0.0,
			wantScoreID: "termCompliance",
		},
		{
			name:        "whitespace-padded forbidden tag gets trimmed",
			source:      "Sign in",
			translated:  "Use legacy-login",
			tags:        []string{"   forbidden:legacy-login   "},
			wantFail:    true,
			wantScore:   0.0,
			wantScoreID: "termCompliance",
		},
		{
			name:        "whitespace-padded forbidden term gets trimmed",
			source:      "Sign in",
			translated:  "Use legacy-login",
			tags:        []string{"forbidden:  legacy-login  "},
			wantFail:    true,
			wantScore:   0.0,
			wantScoreID: "termCompliance",
		},
		{
			name:        "empty forbidden term is ignored and does not fail",
			source:      "Sign in",
			translated:  "Use legacy-login",
			tags:        []string{"forbidden:"},
			wantFail:    false,
			wantScore:   1.0,
			wantScoreID: "termCompliance",
		},
		{
			name:        "whitespace-only forbidden term is ignored and does not fail",
			source:      "Sign in",
			translated:  "Use legacy-login",
			tags:        []string{"forbidden:   "},
			wantFail:    false,
			wantScore:   1.0,
			wantScoreID: "termCompliance",
		},
		{
			name:        "malformed forbidden tag is ignored and does not fail",
			source:      "Sign in",
			translated:  "Use legacy-login",
			tags:        []string{"forbidd:legacy-login"},
			wantFail:    false,
			wantScore:   1.0,
			wantScoreID: "termCompliance",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			e := NewEvaluator()
			res := e.Evaluate(tt.source, tt.translated, "", "en-US", tt.tags)

			// Verify targeted detail score
			score, ok := res.Details[tt.wantScoreID]
			if !ok {
				t.Fatalf("score ID %q not found in Details: %v", tt.wantScoreID, res.Details)
			}
			if score != tt.wantScore {
				t.Errorf("expected score %v for %q, got %v", tt.wantScore, tt.wantScoreID, score)
			}

			// Verify hard fails list and aggregate output
			hasHardFail := slices.Contains(res.HardFails, HardFailForbiddenTerms)
			if hasHardFail != tt.wantFail {
				t.Errorf("HardFails presence for %q = %v, want %v", HardFailForbiddenTerms, hasHardFail, tt.wantFail)
			}

			if tt.wantFail {
				if res.WeightedAggregate != 0 {
					t.Errorf("expected weightedAggregate to be 0 on hard fail, got %v", res.WeightedAggregate)
				}
			} else {
				if len(res.HardFails) > 0 {
					t.Errorf("unexpected hard fails: %v", res.HardFails)
				}
			}
		})
	}
}
