package translationfileparser

import (
	"reflect"
	"strings"
	"testing"
)

func TestPOParserCommentDoesNotLeakContinuation(t *testing.T) {
	// Continuation lines (quoted strings) following a comment
	// MUST NOT be appended to the previous valid active field (like msgstr).
	// This was a bug where comments didn't reset the activeField.
	content := `msgid "key"
msgstr "value"
# This is a comment
" leaked"

msgid "next"
msgstr "val"
`
	got, err := (POFileParser{}).Parse([]byte(content))
	if err != nil {
		t.Fatalf("Parse() error = %v", err)
	}

	expected := map[string]string{
		"key":  "value",
		"next": "val",
	}

	if !reflect.DeepEqual(got, expected) {
		t.Errorf("got %v, want %v", got, expected)
	}
}

func TestPOParser_SyntaxErrors(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		wantErr string
	}{
		{
			name: "unterminated quoted msgid",
			input: `msgid "unterminated
msgstr "value"`,
			wantErr: "parse msgid",
		},
		{
			name: "unterminated quoted msgstr",
			input: `msgid "key"
msgstr "unterminated`,
			wantErr: "parse msgstr",
		},
		{
			name: "unterminated indexed msgstr[0]",
			input: `msgid "key"
msgid_plural "plural"
msgstr[0] "unterminated`,
			wantErr: "parse msgstr[0]",
		},
		{
			name: "unterminated continuation line",
			input: `msgid "key"
msgstr "value"
"unterminated continuation`,
			wantErr: "parse continued string",
		},
		{
			name: "not a quoted string in msgid",
			input: `msgid missing-quotes
msgstr "value"`,
			wantErr: "parse msgid",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			parser := POFileParser{}
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
