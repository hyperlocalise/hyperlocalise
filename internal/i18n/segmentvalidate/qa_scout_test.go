package segmentvalidate

import (
	"testing"
)

func TestQAModesEdgeCases(t *testing.T) {
	tests := []struct {
		name       string
		req        Request
		wantIDs    []string
		wantMsg    string // Optional: check message for specific cases
	}{
		{
			name: "same_as_source with NBSP",
			req: Request{
				SourceText: "Hello\u00a0world",
				TargetText: "Hello\u00a0world",
				SourcePath: "en.json",
				Modes:      []string{QAModeSameAsSource},
			},
			wantIDs: []string{"format-parity", "qa-same-as-source"},
		},
		{
			name: "same_as_source case sensitive",
			req: Request{
				SourceText: "Hello",
				TargetText: "hello",
				SourcePath: "en.json",
				Modes:      []string{QAModeSameAsSource},
			},
			wantIDs: []string{"format-parity"}, // Should NOT trigger qa-same-as-source
		},
		{
			name: "whitespace_only with NBSP",
			req: Request{
				SourceText: "Hello",
				TargetText: " \u00a0\t",
				SourcePath: "en.json",
				Modes:      []string{QAModeWhitespaceOnly},
			},
			// Source "Hello" has no leading whitespace, but target " \u00a0\t" has.
			// This causes a format-whitespace-profile mismatch FAIL check.
			wantIDs: []string{"format-whitespace-profile", "qa-whitespace-only"},
		},
		{
			name: "not_localized with both strictly empty",
			req: Request{
				SourceText: "",
				TargetText: "",
				SourcePath: "en.json",
				Modes:      []string{QAModeNotLocalized},
			},
			wantIDs: []string{"format-parity", "qa-not-localized"},
			wantMsg: "Target value is empty while source is also empty.",
		},
		{
			name: "not_localized with non-empty source",
			req: Request{
				SourceText: "Content",
				TargetText: "",
				SourcePath: "en.json",
				Modes:      []string{QAModeNotLocalized},
			},
			wantIDs: []string{"format-parity", "qa-not-localized"},
			wantMsg: "Target value is empty.",
		},
		{
			name: "modes trimming and deduplication",
			req: Request{
				SourceText: "Hello",
				TargetText: "Hello",
				SourcePath: "en.json",
				Modes:      []string{"  " + QAModeSameAsSource + "  ", QAModeSameAsSource, ""},
			},
			wantIDs: []string{"format-parity", "qa-same-as-source"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			checks := ValidateSegment(tt.req)

			gotIDs := make([]string, 0, len(checks))
			for _, c := range checks {
				gotIDs = append(gotIDs, c.ID)
				if tt.wantMsg != "" && c.ID == "qa-not-localized" {
					if c.Message != tt.wantMsg {
						t.Errorf("qa-not-localized message = %q, want %q", c.Message, tt.wantMsg)
					}
				}
			}

			// Check if all expected IDs are present
			for _, wantID := range tt.wantIDs {
				found := false
				for _, gotID := range gotIDs {
					if gotID == wantID {
						found = true
						break
					}
				}
				if !found {
					t.Errorf("expected check ID %q, but not found in %v", wantID, gotIDs)
				}
			}

			// Check for unexpected IDs (excluding pass ID if not in wantIDs)
			for _, gotID := range gotIDs {
				expected := false
				for _, wantID := range tt.wantIDs {
					if gotID == wantID {
						expected = true
						break
					}
				}
				if !expected {
					t.Errorf("unexpected check ID %q in %v", gotID, gotIDs)
				}
			}
		})
	}
}

func TestQAModeSameAsSourceIgnoresPeripheralWhitespace(t *testing.T) {
	// The current implementation of sameAsSourceCheck uses strings.TrimSpace
	// on both source and target. This test verifies that behavior.
	tests := []struct {
		name   string
		source string
		target string
		want   bool // true if qa-same-as-source is expected
	}{
		{"identical", "Hello", "Hello", true},
		{"target has leading space", "Hello", " Hello", true},
		{"source has trailing space", "Hello ", "Hello", true},
		{"both have different spaces", " Hello ", "\tHello\n", true},
		{"internal whitespace differs", "Hello world", "Hello  world", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			checks := ValidateSegment(Request{
				SourceText: tt.source,
				TargetText: tt.target,
				SourcePath: "en.json",
				Modes:      []string{QAModeSameAsSource},
			})

			found := false
			for _, c := range checks {
				if c.ID == "qa-same-as-source" {
					found = true
					break
				}
			}

			if found != tt.want {
				t.Errorf("qa-same-as-source presence = %v, want %v", found, tt.want)
			}
		})
	}
}

func TestQAModeInteraction(t *testing.T) {
	// Verify that multiple modes can be active at once.
	// Use matching whitespace to ensure format-parity PASSes.
	req := Request{
		SourceText: "  ",
		TargetText: "  ",
		SourcePath: "en.json",
		Modes:      []string{QAModeNotLocalized, QAModeWhitespaceOnly},
	}

	checks := ValidateSegment(req)
	// format-parity (pass), qa-not-localized (fail), qa-whitespace-only (warn)
	if len(checks) != 3 {
		t.Fatalf("expected 3 checks, got %d: %+v", len(checks), checks)
	}

	ids := map[string]bool{}
	for _, c := range checks {
		ids[c.ID] = true
	}

	for _, id := range []string{"format-parity", "qa-not-localized", "qa-whitespace-only"} {
		if !ids[id] {
			t.Errorf("missing check ID %q", id)
		}
	}
}
