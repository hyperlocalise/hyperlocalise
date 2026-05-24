package translationfileparser

import (
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

func TestPOParserIndexedMsgStrContinuation(t *testing.T) {
	content := []byte(`msgid "plural"
msgid_plural "plurals"
msgstr[0] "singular"
" continuation"
msgstr[1] "plural"
" should be ignored"
`)

	got, err := (POFileParser{}).Parse(content)
	if err != nil {
		t.Fatalf("parse po: %v", err)
	}

	val, ok := got["plural"]
	if !ok {
		t.Fatalf("expected key 'plural' to exist")
	}

	expected := "singular continuation"
	if val != expected {
		t.Errorf("expected %q, got %q. If it contains 'should be ignored', then msgstr[1] continuation leaked into msgstr[0]", expected, val)
	}
}

func TestPOParserMsgidPluralContinuation(t *testing.T) {
	content := []byte(`msgid "singular"
msgid_plural "plural"
" continuation"
msgstr "singular value"
`)

	got, err := (POFileParser{}).Parse(content)
	if err != nil {
		t.Fatalf("parse po: %v", err)
	}

	val, ok := got["singular"]
	if !ok {
		for k := range got {
			if k == "singular continuation" {
				t.Errorf("bug: msgid_plural continuation was appended to msgid")
				return
			}
		}
		t.Fatalf("expected key 'singular' to exist, got %v", got)
	}
	if val != "singular value" {
		t.Errorf("expected 'singular value', got %q", val)
	}
}
