package segmentvalidate

import (
	"testing"
)

// Locks the #1580 WithTokens pass-path contract: after format/profile validation
// succeeds, Label/Message must reflect whether ICU or profile tokens were present
// in the primary validation pass (no secondary rescan).
func TestValidateSegmentPassLabelReflectsTokenPresence(t *testing.T) {
	t.Parallel()

	const (
		passNoTokensLabel   = "Format"
		passNoTokensMessage = "No placeholders or ICU blocks detected."
		passTokensLabel     = "Placeholders & ICU"
		passTokensMessage   = "Target keeps the required placeholders and ICU structure."
	)

	tests := []struct {
		name        string
		path        string
		source      string
		target      string
		wantLabel   string
		wantMessage string
	}{
		{
			name:        "plain_text_no_tokens",
			path:        "/pkg/en.json",
			source:      "Hello world",
			target:      "Bonjour monde",
			wantLabel:   passNoTokensLabel,
			wantMessage: passNoTokensMessage,
		},
		{
			name:        "icu_placeholder",
			path:        "/pkg/en.json",
			source:      "Hello {name}",
			target:      "Bonjour {name}",
			wantLabel:   passTokensLabel,
			wantMessage: passTokensMessage,
		},
		{
			name:        "icu_plural_block",
			path:        "/pkg/en.json",
			source:      "{count, plural, one {# item} other {# items}}",
			target:      "{count, plural, one {# article} other {# articles}}",
			wantLabel:   passTokensLabel,
			wantMessage: passTokensMessage,
		},
		{
			name:        "printf_extra_placeholder",
			path:        "/pkg/en.json",
			source:      "Hello %s",
			target:      "Bonjour %s",
			wantLabel:   passTokensLabel,
			wantMessage: passTokensMessage,
		},
		{
			name:        "dollar_token_extra_placeholder",
			path:        "/pkg/en.json",
			source:      "Hello $user$",
			target:      "Bonjour $user$",
			wantLabel:   passTokensLabel,
			wantMessage: passTokensMessage,
		},
		{
			name:        "leading_whitespace_profile_token",
			path:        "/pkg/en.json",
			source:      "  Hello",
			target:      "  Bonjour",
			wantLabel:   passTokensLabel,
			wantMessage: passTokensMessage,
		},
		{
			name:        "nbsp_profile_token",
			path:        "/pkg/en.json",
			source:      "Hello\u00a0world",
			target:      "Bonjour\u00a0monde",
			wantLabel:   passTokensLabel,
			wantMessage: passTokensMessage,
		},
		{
			name:        "special_char_literal",
			path:        "/pkg/en.json",
			source:      `Line1\nLine2`,
			target:      `Ligne1\nLigne2`,
			wantLabel:   passTokensLabel,
			wantMessage: passTokensMessage,
		},
		{
			name:        "html_with_icu_placeholder",
			path:        "/pkg/en.html",
			source:      "<p>Hello {name}</p>",
			target:      "<p>Bonjour {name}</p>",
			wantLabel:   passTokensLabel,
			wantMessage: passTokensMessage,
		},
		{
			name:        "html_plain_no_tokens",
			path:        "/pkg/en.html",
			source:      "<p>Hello</p>",
			target:      "<p>Bonjour</p>",
			wantLabel:   passNoTokensLabel,
			wantMessage: passNoTokensMessage,
		},
		{
			name:        "markdown_hlmdph_token",
			path:        "/content/en/guide.md",
			source:      "A " + testHLMDPHToken + " B",
			target:      "AA " + testHLMDPHToken + " BB",
			wantLabel:   passTokensLabel,
			wantMessage: passTokensMessage,
		},
		{
			name:        "markdown_plain_no_tokens",
			path:        "/content/en/guide.md",
			source:      "Hello.",
			target:      "Bonjour.",
			wantLabel:   passNoTokensLabel,
			wantMessage: passNoTokensMessage,
		},
		{
			name:        "markdown_icu_placeholder",
			path:        "/content/en/guide.md",
			source:      "Hello {name}",
			target:      "Bonjour {name}",
			wantLabel:   passTokensLabel,
			wantMessage: passTokensMessage,
		},
		{
			name:        "brace_without_icu_placeholder_is_not_token",
			path:        "/pkg/en.json",
			source:      "Use { for grouping",
			target:      "Utilisez { pour regrouper",
			wantLabel:   passNoTokensLabel,
			wantMessage: passNoTokensMessage,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			checks := ValidateSegment(Request{
				SourceText: tt.source,
				TargetText: tt.target,
				SourcePath: tt.path,
			})

			var formatCheck *Check
			for i := range checks {
				if checks[i].ID == "format-parity" {
					formatCheck = &checks[i]
					break
				}
			}
			if formatCheck == nil {
				t.Fatalf("expected format-parity check, got %+v", checks)
			}
			if formatCheck.Status != StatusPass {
				t.Fatalf("expected StatusPass, got %+v", formatCheck)
			}
			if formatCheck.Label != tt.wantLabel {
				t.Fatalf("Label = %q, want %q (check=%+v)", formatCheck.Label, tt.wantLabel, formatCheck)
			}
			if formatCheck.Message != tt.wantMessage {
				t.Fatalf("Message = %q, want %q (check=%+v)", formatCheck.Message, tt.wantMessage, formatCheck)
			}
		})
	}
}
