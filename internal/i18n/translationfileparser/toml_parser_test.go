package translationfileparser

import (
	"reflect"
	"strings"
	"testing"
)

func TestTOMLParserFlattensTablesAndSkipsNonStrings(t *testing.T) {
	content := []byte(`
_version = 2
hello = "Hello"
[home]
title = "Welcome"
items = ["One", "Two"]
inline = { label = "Save" }
`)
	got, err := (TOMLParser{}).Parse(content)
	if err != nil {
		t.Fatalf("parse toml: %v", err)
	}
	want := map[string]string{
		"hello":             "Hello",
		"home.title":        "Welcome",
		"home.items[0]":     "One",
		"home.items[1]":     "Two",
		"home.inline.label": "Save",
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("parsed values mismatch\n got: %#v\nwant: %#v", got, want)
	}
}

func TestMarshalTOMLReplacesStringsAndAppendsKeys(t *testing.T) {
	template := []byte("hello = \"Hello\"\n")
	got, err := MarshalTOML(template, map[string]string{
		"hello": "Bonjour",
		"bye":   "Au revoir",
	})
	if err != nil {
		t.Fatalf("marshal toml: %v", err)
	}
	out := string(got)
	if !strings.Contains(out, `hello = "Bonjour"`) {
		t.Fatalf("expected replaced hello, got %q", out)
	}
	if !strings.Contains(out, `bye = "Au revoir"`) {
		t.Fatalf("expected appended bye, got %q", out)
	}
}

func TestTOMLParserRejectsArrayOfTables(t *testing.T) {
	_, err := (TOMLParser{}).Parse([]byte("[[products]]\nname = \"Stool\"\n"))
	if err == nil || !strings.Contains(err.Error(), "array-of-tables") {
		t.Fatalf("expected array-of-tables error, got %v", err)
	}
}

func TestTOMLParserDecodesUnicodeEscapes(t *testing.T) {
	got, err := (TOMLParser{}).Parse([]byte(`hello = "caf\u00e9 \U0001F600"` + "\n"))
	if err != nil {
		t.Fatalf("parse toml: %v", err)
	}
	if got["hello"] != "café 😀" {
		t.Fatalf("unexpected decoded value %q", got["hello"])
	}
}

func TestTOMLParserRejectsInvalidUnicodeEscapes(t *testing.T) {
	for _, escape := range []string{`\uD800`, `\U00110000`, `\UFFFFFFFF`} {
		_, err := (TOMLParser{}).Parse([]byte(`hello = "` + escape + `"` + "\n"))
		if err == nil || !strings.Contains(err.Error(), "unicode scalar value") {
			t.Fatalf("expected invalid unicode error for %s, got %v", escape, err)
		}
	}
}

func TestTOMLParserRejectsDuplicateKeys(t *testing.T) {
	_, err := (TOMLParser{}).Parse([]byte("hello = \"A\"\nhello = \"B\"\n"))
	if err == nil || !strings.Contains(err.Error(), "duplicate") {
		t.Fatalf("expected duplicate key error, got %v", err)
	}
}
