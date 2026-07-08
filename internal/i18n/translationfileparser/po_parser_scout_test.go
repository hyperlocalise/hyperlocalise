package translationfileparser

import (
	"reflect"
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
