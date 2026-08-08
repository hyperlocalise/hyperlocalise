package translationfileparser

import (
	"strings"
	"testing"
)

// TestGenericXMLParser_SyntaxErrors comprehensively tests syntax error flows
// and validation limits of GenericXMLParser on invalid, malformed, or unsupported files.
func TestGenericXMLParser_SyntaxErrors(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		wantErr string
	}{
		{
			name:    "mismatched closing tag",
			input:   `<locale><message key="hello">Hello</other></locale>`,
			wantErr: "XML syntax error on line 1: element <message> closed by </other>",
		},
		{
			name:    "unexpected closing tag",
			input:   `</locale>`,
			wantErr: "unexpected end element </locale>",
		},
		{
			name:    "unclosed element",
			input:   `<locale><message key="hello">Hello`,
			wantErr: "unexpected EOF",
		},
		{
			name:    "empty XML document",
			input:   `<!-- comment only -->`,
			wantErr: "empty XML document",
		},
		{
			name:    "duplicate key error",
			input:   `<locale><message key="hello">Hello</message><message key="hello">Hi</message></locale>`,
			wantErr: "duplicate key \"hello\"",
		},
		{
			name:    "metadata element key conflict - comment",
			input:   `<locale><comment key="note">Hello</comment></locale>`,
			wantErr: "metadata element <comment> cannot have a key/id/name attribute",
		},
		{
			name:    "metadata element key conflict - note",
			input:   `<locale><note id="1">Hello</note></locale>`,
			wantErr: "metadata element <note> cannot have a key/id/name attribute",
		},
		{
			name:    "text element with no stable key - root text",
			input:   `<locale>Hello</locale>`,
			wantErr: "text element <locale> has no stable key",
		},
		{
			name:    "specialized root elements rejection - plist",
			input:   `<plist><message key="hello">Hello</message></plist>`,
			wantErr: "element <plist> should be handled by a specialized parser",
		},
		{
			name:    "specialized root elements rejection - xliff",
			input:   `<xliff><message key="hello">Hello</message></xliff>`,
			wantErr: "element <xliff> should be handled by a specialized parser",
		},
		{
			name:    "mixed content with comments inside translatable text",
			input:   `<locale><message key="msg">Hello <!-- comment --></message></locale>`,
			wantErr: "mixed content in <message> is unsupported",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			parser := GenericXMLParser{}
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
