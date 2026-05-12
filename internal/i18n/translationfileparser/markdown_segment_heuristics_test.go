package translationfileparser

import (
	"strings"
	"testing"
)

func TestValidateMarkdownTranslatedBlockStructure(t *testing.T) {
	tests := []struct {
		name    string
		source  string
		target  string
		wantErr string
	}{
		{
			name:   "basic single line OK",
			source: "Hello.",
			target: "Bonjour.",
		},
		{
			name:   "multi-line target OK if no blocks introduced",
			source: "Hello world.",
			target: "Bonjour le monde.\n\nC'est une belle journée.",
		},
		{
			name:   "skips validation for multi-line source",
			source: "# Title\n\nBody.",
			target: "# Title\n\nBody.\n\n# Extra heading",
		},
		{
			name:    "rejects injected heading",
			source:  "Hello.",
			target:  "Bonjour.\n\n# Heading",
			wantErr: "ATX heading",
		},
		{
			name:   "allows heading if source has it",
			source: "# Hello",
			target: "# Bonjour",
		},
		{
			name:    "rejects injected code fence",
			source:  "Hello.",
			target:  "Bonjour.\n\n```go\nfmt.Println()\n```",
			wantErr: "fenced code delimiter",
		},
		{
			name:   "allows code fence if source has it",
			source: "```",
			target: "```",
		},
		{
			name:    "rejects injected thematic break",
			source:  "Hello.",
			target:  "Bonjour.\n\n---",
			wantErr: "thematic break",
		},
		{
			name:   "allows thematic break if source has it",
			source: "---",
			target: "***",
		},
		{
			name:    "rejects injected blockquote",
			source:  "Hello.",
			target:  "Bonjour.\n\n> Quote",
			wantErr: "blockquote",
		},
		{
			name:   "allows blockquote if source has it",
			source: "> Hello",
			target: "> Bonjour",
		},
		{
			name:    "rejects injected ordered list",
			source:  "Hello.",
			target:  "Bonjour.\n\n1. First item",
			wantErr: "ordered list",
		},
		{
			name:   "allows ordered list if source has it",
			source: "1. Hello",
			target: "1. Bonjour",
		},
		{
			name:    "rejects injected bullet list",
			source:  "Hello.",
			target:  "Bonjour.\n\n- Item",
			wantErr: "bullet list",
		},
		{
			name:   "allows bullet list if source has it",
			source: "* Hello",
			target: "- Bonjour",
		},
		{
			name:   "empty translation is OK",
			source: "Hello",
			target: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateMarkdownTranslatedBlockStructure(tt.source, tt.target)
			if tt.wantErr == "" {
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
			} else {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				if !strings.Contains(err.Error(), tt.wantErr) {
					t.Fatalf("error %q does not contain %q", err.Error(), tt.wantErr)
				}
			}
		})
	}
}
