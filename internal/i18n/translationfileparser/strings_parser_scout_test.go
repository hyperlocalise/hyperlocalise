package translationfileparser

import (
	"strings"
	"testing"
)

func TestAppleStringsParser_SyntaxErrors(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		wantErr string
	}{
		{
			name:    "missing equals sign",
			input:   `"key" "value";`,
			wantErr: "expected '=' after key",
		},
		{
			name:    "missing semicolon",
			input:   `"key" = "value"`,
			wantErr: "expected ';' after value",
		},
		{
			name:    "unterminated quoted string",
			input:   `"key" = "value;`,
			wantErr: "unterminated quoted string",
		},
		{
			name:    "unterminated block comment",
			input:   `/* comment without end "key" = "value";`,
			wantErr: "unterminated block comment",
		},
		{
			name:    "invalid character at start",
			input:   `invalid = "value";`,
			wantErr: "expected quoted string",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			parser := AppleStringsParser{}
			_, err := parser.Parse([]byte(tt.input))
			if err == nil {
				t.Fatalf("expected error containing %q, got nil", tt.wantErr)
			}
			if !strings.Contains(err.Error(), tt.wantErr) {
				t.Fatalf("expected error containing %q, got: %v", tt.wantErr, err)
			}
		})
	}
}
