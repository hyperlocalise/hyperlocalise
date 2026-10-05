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

func TestTOMLParserSkipsNonStringArrayValues(t *testing.T) {
	got, err := (TOMLParser{}).Parse([]byte("items = [1, \"two\", true, { label = \"Save\" }]\n"))
	if err != nil {
		t.Fatalf("parse mixed toml array: %v", err)
	}
	want := map[string]string{
		"items[1]":       "two",
		"items[3].label": "Save",
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("parsed values mismatch\n got: %#v\nwant: %#v", got, want)
	}
}

func TestMarshalTOMLInsertsExtraRootKeysBeforeTables(t *testing.T) {
	template := []byte("hello = \"Hello\"\n[home]\ntitle = \"Welcome\"\n")
	got, err := MarshalTOML(template, map[string]string{
		"hello":      "Bonjour",
		"home.title": "Bienvenue",
		"obsolete":   "Ancien",
		"items[0]":   "One",
	})
	if err != nil {
		t.Fatalf("marshal toml: %v", err)
	}
	out := string(got)
	if !strings.Contains(out, "obsolete = \"Ancien\"\n[home]") {
		t.Fatalf("expected extra root key before [home], got %q", out)
	}
	if strings.Contains(out, "items[0]") {
		t.Fatalf("did not expect flattened array key in writeback, got %q", out)
	}
	if strings.Contains(out, "[home]\ntitle = \"Bienvenue\"\nobsolete") {
		t.Fatalf("extra root key was appended into [home]: %q", out)
	}
	if strings.Contains(out, "home.title") {
		t.Fatalf("did not expect dotted table key to be rewritten as an extra, got %q", out)
	}
	if !strings.Contains(out, "[home]\ntitle = \"Bienvenue\"") {
		t.Fatalf("expected in-place table title replacement, got %q", out)
	}
}

func TestMarshalTOMLDoesNotDuplicateTableKeysAsExtras(t *testing.T) {
	template := []byte("[home]\ntitle = \"Welcome\"\n")
	got, err := MarshalTOML(template, map[string]string{
		"home.title": "Bienvenue",
	})
	if err != nil {
		t.Fatalf("marshal toml: %v", err)
	}
	out := string(got)
	if out != "[home]\ntitle = \"Bienvenue\"\n" {
		t.Fatalf("unexpected toml writeback %q", out)
	}
}

func TestTOMLParserRejectsDuplicateKeys(t *testing.T) {
	_, err := (TOMLParser{}).Parse([]byte("hello = \"A\"\nhello = \"B\"\n"))
	if err == nil || !strings.Contains(err.Error(), "duplicate") {
		t.Fatalf("expected duplicate key error, got %v", err)
	}
}
