package cmd

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/translationfileparser"
)

func TestEntriesCommandOutputsParsedEntries(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "en.json")
	if err := os.WriteFile(path, []byte(`{"title":"Hello","nested":{"cta":"Click"}}`), 0o600); err != nil {
		t.Fatal(err)
	}

	root := newRootCmd("test")
	out := bytes.NewBuffer(nil)
	root.SetOut(out)
	root.SetErr(out)
	root.SetArgs([]string{"entries", path})
	if err := root.Execute(); err != nil {
		t.Fatalf("execute entries: %v", err)
	}

	var payload map[string]string
	if err := json.Unmarshal(out.Bytes(), &payload); err != nil {
		t.Fatalf("decode output: %v", err)
	}
	if payload["title"] != "Hello" || payload["nested.cta"] != "Click" {
		t.Fatalf("unexpected payload: %+v", payload)
	}
}

func TestEntriesCommandUsesLocaleForXCStrings(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "Localizable.xcstrings")
	content := []byte(`{
  "sourceLanguage": "en",
  "strings": {
    "hello": {
      "localizations": {
        "en": {
          "stringUnit": {
            "state": "translated",
            "value": "Hello"
          }
        },
        "fr": {
          "stringUnit": {
            "state": "translated",
            "value": "Bonjour"
          }
        }
      }
    }
  }
}`)
	if err := os.WriteFile(path, content, 0o600); err != nil {
		t.Fatal(err)
	}

	root := newRootCmd("test")
	out := bytes.NewBuffer(nil)
	root.SetOut(out)
	root.SetErr(out)
	root.SetArgs([]string{"entries", path, "--locale", "fr"})
	if err := root.Execute(); err != nil {
		t.Fatalf("execute entries: %v", err)
	}

	var payload map[string]string
	if err := json.Unmarshal(out.Bytes(), &payload); err != nil {
		t.Fatalf("decode output: %v", err)
	}
	if payload["hello"] != "Bonjour" {
		t.Fatalf("expected French target locale value, got %+v", payload)
	}
}

func TestEntriesCommandUsesLocaleForCSV(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "translations.csv")
	content := []byte("id,en,fr\nhello,Hello,Bonjour\n")
	if err := os.WriteFile(path, content, 0o600); err != nil {
		t.Fatal(err)
	}

	root := newRootCmd("test")
	out := bytes.NewBuffer(nil)
	root.SetOut(out)
	root.SetErr(out)
	root.SetArgs([]string{"entries", path, "--locale", "fr"})
	if err := root.Execute(); err != nil {
		t.Fatalf("execute entries: %v", err)
	}

	var payload map[string]string
	if err := json.Unmarshal(out.Bytes(), &payload); err != nil {
		t.Fatalf("decode output: %v", err)
	}
	if payload["hello"] != "Bonjour" {
		t.Fatalf("expected French CSV column value, got %+v", payload)
	}
}

func TestEntriesCommandAlignsMarkdownTargetToSourceKeys(t *testing.T) {
	dir := t.TempDir()
	sourcePath := filepath.Join(dir, "guide.md")
	targetPath := filepath.Join(dir, "guide-fr.md")
	source := []byte("# Guide\n\nExisting intro.\n\nExisting outro.\n")
	target := []byte("# Guide\n\nIntro existant.\n\nConclusion existante.\n")
	if err := os.WriteFile(sourcePath, source, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(targetPath, target, 0o600); err != nil {
		t.Fatal(err)
	}

	sourceEntries, err := (translationfileparser.MarkdownParser{}).Parse(source)
	if err != nil {
		t.Fatalf("parse source: %v", err)
	}
	introKey := findEntriesTestKeyByValue(sourceEntries, "Existing intro.")
	outroKey := findEntriesTestKeyByValue(sourceEntries, "Existing outro.")
	if introKey == "" || outroKey == "" {
		t.Fatalf("expected source keys for intro/outro, got %#v", sourceEntries)
	}

	root := newRootCmd("test")
	out := bytes.NewBuffer(nil)
	root.SetOut(out)
	root.SetErr(out)
	root.SetArgs([]string{"entries", targetPath, "--source", sourcePath})
	if err := root.Execute(); err != nil {
		t.Fatalf("execute entries: %v", err)
	}

	var payload map[string]string
	if err := json.Unmarshal(out.Bytes(), &payload); err != nil {
		t.Fatalf("decode output: %v", err)
	}
	if got := strings.TrimSpace(payload[introKey]); got != "Intro existant." {
		t.Fatalf("expected intro mapped to source key %q, got %q (payload=%+v)", introKey, got, payload)
	}
	if got := strings.TrimSpace(payload[outroKey]); got != "Conclusion existante." {
		t.Fatalf("expected outro mapped to source key %q, got %q (payload=%+v)", outroKey, got, payload)
	}
}

func TestEntriesCommandWithoutSourceRehashesMarkdownTarget(t *testing.T) {
	dir := t.TempDir()
	sourcePath := filepath.Join(dir, "guide.md")
	targetPath := filepath.Join(dir, "guide-fr.md")
	source := []byte("# Guide\n\nExisting intro.\n")
	target := []byte("# Guide\n\nIntro existant.\n")
	if err := os.WriteFile(sourcePath, source, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(targetPath, target, 0o600); err != nil {
		t.Fatal(err)
	}

	sourceEntries, err := (translationfileparser.MarkdownParser{}).Parse(source)
	if err != nil {
		t.Fatalf("parse source: %v", err)
	}
	introKey := findEntriesTestKeyByValue(sourceEntries, "Existing intro.")
	if introKey == "" {
		t.Fatalf("expected source key for intro")
	}

	root := newRootCmd("test")
	out := bytes.NewBuffer(nil)
	root.SetOut(out)
	root.SetErr(out)
	root.SetArgs([]string{"entries", targetPath})
	if err := root.Execute(); err != nil {
		t.Fatalf("execute entries: %v", err)
	}

	var payload map[string]string
	if err := json.Unmarshal(out.Bytes(), &payload); err != nil {
		t.Fatalf("decode output: %v", err)
	}
	if _, ok := payload[introKey]; ok {
		t.Fatalf("expected bare entries on translated markdown not to keep source key %q, got %+v", introKey, payload)
	}
	if findEntriesTestKeyByValue(payload, "Intro existant.") == "" {
		t.Fatalf("expected translated segment under a rehashed key, got %+v", payload)
	}
}

func findEntriesTestKeyByValue(entries map[string]string, want string) string {
	for key, value := range entries {
		if strings.TrimSpace(value) == want {
			return key
		}
	}
	return ""
}
