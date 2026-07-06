package segmentvalidate

import (
	"strings"
	"testing"
)

func TestValidateWhitespaceProfileScout(t *testing.T) {
	tests := []struct {
		name    string
		source  string
		target  string
		wantErr bool
	}{
		{
			name:    "leading newline match",
			source:  "\nHello",
			target:  "\nBonjour",
			wantErr: false,
		},
		{
			name:    "leading newline mismatch",
			source:  "\nHello",
			target:  "Bonjour",
			wantErr: true,
		},
		{
			name:    "trailing newline match",
			source:  "Hello\n",
			target:  "Bonjour\n",
			wantErr: false,
		},
		{
			name:    "trailing newline mismatch",
			source:  "Hello\n",
			target:  "Bonjour",
			wantErr: true,
		},
		{
			name:    "leading carriage return match",
			source:  "\rHello",
			target:  "\rBonjour",
			wantErr: false,
		},
		{
			name:    "leading carriage return mismatch",
			source:  "\rHello",
			target:  "Bonjour",
			wantErr: true,
		},
		{
			name:    "mixed whitespace match",
			source:  " \n\tHello",
			target:  " \n\tBonjour",
			wantErr: false,
		},
		{
			name:    "mixed whitespace mismatch",
			source:  " \n\tHello",
			target:  "\n Bonjour",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateWhitespaceProfile(tt.source, tt.target)
			if (err != nil) != tt.wantErr {
				t.Errorf("validateWhitespaceProfile() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestExtractSpecialCharLiteralsScout(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  []string
	}{
		{
			name:  "crlf literal",
			input: `Line1\r\nLine2`,
			want:  []string{`\r\n`},
		},
		{
			name:  "multiple literals with crlf",
			input: `A\nB\r\nC\tD`,
			want:  []string{`\n`, `\r\n`, `\t`},
		},
		{
			name:  "duplicate literals",
			input: `\n\n\r\n`,
			want:  []string{`\n`, `\n`, `\r\n`},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := extractSpecialCharLiterals(tt.input)
			if !stringSlicesEqual(got, tt.want) {
				t.Errorf("extractSpecialCharLiterals(%q) = %v, want %v", tt.input, got, tt.want)
			}
		})
	}
}

func TestValidateSegmentProfileScout(t *testing.T) {
	// These tests verify that SegmentValidate actually reports these failures.
	// Profile parity checks are applied to all non-Markdown segments, including
	// those without ICU placeholders.
	tests := []struct {
		name        string
		source      string
		target      string
		wantID      string
		errContains string
	}{
		{
			name:        "newline mismatch with placeholders",
			source:      "{name}\n",
			target:      "{name}",
			wantID:      "format-whitespace-profile",
			errContains: "trailing whitespace",
		},
		{
			name:        "crlf literal mismatch with placeholders",
			source:      "{name}\\r\\n",
			target:      "{name}",
			wantID:      "format-special-char-mismatch",
			errContains: `\r\n`,
		},
		{
			name:        "whitespace mismatch without placeholders",
			source:      " Hello ",
			target:      "Bonjour",
			wantID:      "format-whitespace-profile",
			errContains: "leading whitespace",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			checks := ValidateSegment(Request{
				SourceText: tt.source,
				TargetText: tt.target,
				SourcePath: "messages.json",
			})

			found := false
			for _, c := range checks {
				if c.ID == tt.wantID {
					found = true
					if tt.errContains != "" && !strings.Contains(c.Message, tt.errContains) {
						t.Errorf("check message %q does not contain %q", c.Message, tt.errContains)
					}
					break
				}
			}

			if !found {
				t.Errorf("expected check ID %q, but not found in %+v", tt.wantID, checks)
			}
		})
	}
}
