package translationfileparser

import (
	"reflect"
	"strings"
	"testing"
)

func TestMarshalPOFileReplacesMsgstrByMsgid(t *testing.T) {
	template := []byte(`msgid ""
msgstr ""
"Language: en-US\n"

msgid "hello"
msgstr "Hello"

msgid "items"
msgid_plural "items"
msgstr[0] "item"
msgstr[1] "items"
`)

	out, err := MarshalPOFile(template, map[string]string{
		"hello": "Bonjour",
		"items": "article",
	})
	if err != nil {
		t.Fatalf("marshal po: %v", err)
	}

	content := string(out)
	if !strings.Contains(content, `msgstr "Bonjour"`) {
		t.Fatalf("expected msgstr replacement for hello, got %q", content)
	}
	if !strings.Contains(content, `msgstr[0] "article"`) {
		t.Fatalf("expected msgstr[0] replacement for items, got %q", content)
	}
	if !strings.Contains(content, `msgstr[1] "items"`) {
		t.Fatalf("expected higher plural forms unchanged, got %q", content)
	}
}

func TestPOParserMultilineContinuations(t *testing.T) {
	tests := []struct {
		name     string
		content  string
		expected map[string]string
	}{
		{
			name: "msgid_plural continuation does not leak into msgid",
			content: `msgid "key"
msgid_plural "plural"
" continuation"
msgstr "value"`,
			expected: map[string]string{"key": "value"},
		},
		{
			name: "msgstr[N] continuation does not leak into msgstr[0]",
			content: `msgid "key"
msgid_plural "plural"
msgstr[0] "value0"
" continuation0"
msgstr[1] "value1"
" continuation1"`,
			expected: map[string]string{"key": "value0 continuation0"},
		},
		{
			name: "msgctxt continuation does not leak into following fields",
			content: `msgctxt "context"
" continuation"
msgid "key"
msgstr "value"`,
			expected: map[string]string{"key": "value"},
		},
		{
			name: "multiple entries with continuations",
			content: `msgid "key1"
msgstr "value1"
" continuation1"

msgid "key2"
msgstr "value2"
" continuation2"`,
			expected: map[string]string{
				"key1": "value1 continuation1",
				"key2": "value2 continuation2",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := (POFileParser{}).Parse([]byte(tt.content))
			if err != nil {
				t.Fatalf("Parse() error = %v", err)
			}
			if !reflect.DeepEqual(got, tt.expected) {
				t.Errorf("got %v, want %v", got, tt.expected)
			}
		})
	}
}

func TestPOParserMsgctxtWithDuplicateMsgidCollidesByMsgid(t *testing.T) {
	content := []byte(`msgctxt "nav"
msgid "home"
msgstr "Accueil navigation"

msgctxt "hero"
msgid "home"
msgstr "Accueil hero"
`)

	got, err := (POFileParser{}).Parse(content)
	if err != nil {
		t.Fatalf("parse po: %v", err)
	}

	if len(got) != 1 {
		t.Fatalf("expected duplicate msgid to collapse to one key, got %+v", got)
	}
	if got["home"] != "Accueil hero" {
		t.Fatalf("expected last msgid variant to win, got %+v", got)
	}
}
