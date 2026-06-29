package runsvc

import (
	"strings"
	"testing"
)

func TestParseCSVForTargetLocale(t *testing.T) {
	content := []byte("id,en,fr\nhello,Hello,Bonjour\n")
	values, err := parseCSVForTargetLocale(content, "fr")
	if err != nil {
		t.Fatalf("parse csv locale: %v", err)
	}
	if got := values["hello"]; got != "Bonjour" {
		t.Fatalf("locale value mismatch: got %q", got)
	}

	fallback, err := parseCSVForTargetLocale(content, "de")
	if err != nil {
		t.Fatalf("parse csv fallback: %v", err)
	}
	if got := fallback["hello"]; got != "Hello" {
		t.Fatalf("fallback value mismatch: got %q", got)
	}
}

func TestMarshalCSVTarget(t *testing.T) {
	template := []byte("key,en,fr\nhello,Hello,Salut\n")
	out, err := marshalCSVTarget(template, map[string]string{"hello": "Bonjour", "bye": "Au revoir"}, "fr")
	if err != nil {
		t.Fatalf("marshal csv locale: %v", err)
	}
	text := string(out)
	if !strings.Contains(text, "hello,Hello,Bonjour") {
		t.Fatalf("expected locale update, got %q", text)
	}
	if !strings.Contains(text, "bye,,Au revoir") {
		t.Fatalf("expected appended key in fr column, got %q", text)
	}

	out, err = marshalCSVTarget([]byte("key,value\nhello,Hi\n"), map[string]string{"hello": "Salut"}, "fr")
	if err != nil {
		t.Fatalf("marshal csv fallback: %v", err)
	}
	if !strings.Contains(string(out), "hello,Salut") {
		t.Fatalf("expected fallback value column update, got %q", out)
	}
}

func TestParseCSVForTargetLocaleWithBOMHeader(t *testing.T) {
	content := []byte("\ufeffid,en,fr\nhello,Hello,Bonjour\n")
	values, err := parseCSVForTargetLocale(content, "fr")
	if err != nil {
		t.Fatalf("parse csv with bom: %v", err)
	}
	if got := values["hello"]; got != "Bonjour" {
		t.Fatalf("locale value mismatch with bom header: got %q", got)
	}
}
