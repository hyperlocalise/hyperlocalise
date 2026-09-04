package translationfileparser

import (
	"strings"
	"testing"
)

// TestPHPArrayParser_SyntaxErrors comprehensively tests syntax error flows
// and limits of PHPArrayParser on invalid or unsupported files.
func TestPHPArrayParser_SyntaxErrors(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		wantErr string
	}{
		{
			name:    "missing php opening tag",
			input:   `return ['key' => 'val'];`,
			wantErr: "expected <?php opening tag",
		},
		{
			name:    "missing return statement",
			input:   `<?php ['key' => 'val'];`,
			wantErr: "expected return statement",
		},
		{
			name:    "unterminated array literal",
			input:   `<?php return [`,
			wantErr: "unterminated array literal",
		},
		{
			name:    "array keys must be quoted strings",
			input:   `<?php return [ 123 => 'value' ];`,
			wantErr: "array keys must be quoted strings",
		},
		{
			name:    "expected => after key",
			input:   `<?php return [ 'key' 'value' ];`,
			wantErr: "expected => after key",
		},
		{
			name:    "expected comma or array close",
			input:   `<?php return [ 'key' => 'value' 'other' => 'val' ];`,
			wantErr: "expected comma or array close",
		},
		{
			name:    "missing value for key",
			input:   `<?php return [ 'key' => `,
			wantErr: "missing value for key",
		},
		{
			name:    "duplicate key error",
			input:   `<?php return [ 'key' => 'val', 'key' => 'val2' ];`,
			wantErr: "duplicate key",
		},
		{
			name:    "unsupported value type",
			input:   `<?php return [ 'key' => 12345 ];`,
			wantErr: "unsupported value for key",
		},
		{
			name:    "expected parenthesis after array keyword",
			input:   `<?php return array [ 'key' => 'val' ];`,
			wantErr: "expected ( after array keyword",
		},
		{
			name:    "expected array literal",
			input:   `<?php return 'not an array';`,
			wantErr: "expected array literal",
		},
		{
			name:    "dynamic interpolation in double quotes",
			input:   `<?php return [ 'key' => "value $variable" ];`,
			wantErr: "dynamic interpolation is not supported",
		},
		{
			name:    "dangling string escape",
			input:   `<?php return [ 'key' => "value\`,
			wantErr: "dangling string escape",
		},
		{
			name:    "unterminated unicode escape",
			input:   `<?php return [ 'key' => "\u{123" ];`,
			wantErr: "unterminated unicode escape",
		},
		{
			name:    "invalid unicode escape code points",
			input:   `<?php return [ 'key' => "\u{XYZ}" ];`,
			wantErr: "invalid unicode escape",
		},
		{
			name:    "octal escape out of byte range",
			input:   `<?php return [ 'key' => "\400" ];`,
			wantErr: "invalid octal escape",
		},
		{
			name:    "unterminated string literal",
			input:   `<?php return [ 'key' => 'value ];`,
			wantErr: "unterminated string literal",
		},
		{
			name:    "unsupported PHP code after return",
			input:   `<?php return [ 'key' => 'value' ]; echo "hello";`,
			wantErr: "unsupported PHP code after return array",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			parser := PHPArrayParser{}
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

// TestPHPArrayParser_CommentsTriviaHandling verifies that comment styles
// (multi-line, single-line, hash comments) do not interfere with key-value
// parsing.
func TestPHPArrayParser_CommentsTriviaHandling(t *testing.T) {
	input := `<?php
/*
  Multi-line file block comment.
*/
return [
    # Hash-style comment
    'key1' => 'value1', // Trailing comment
    /* Block comment inline */
    'key2' => 'value2',
];
`
	parser := PHPArrayParser{}
	got, err := parser.Parse([]byte(input))
	if err != nil {
		t.Fatalf("failed to parse: %v", err)
	}

	want := map[string]string{
		"key1": "value1",
		"key2": "value2",
	}

	if len(got) != len(want) {
		t.Fatalf("got %d keys, want %d", len(got), len(want))
	}
	for k, v := range want {
		if got[k] != v {
			t.Errorf("key %q = %q, want %q", k, got[k], v)
		}
	}
}
