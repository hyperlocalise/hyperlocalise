package cmd

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestPackCommandGroupsFormatJSMessagesAndDropsDescriptions(t *testing.T) {
	dir := t.TempDir()
	inputPath := filepath.Join(dir, "messages.json")
	writePackTestFile(t, inputPath, `{
  "src.components.app-header.title": {
    "defaultMessage": "Dashboard",
    "description": "Main dashboard heading"
  },
  "src.components.hero.title": {
    "defaultMessage": "Dashboard",
    "description": "Hero heading"
  },
  "src.components.app-header.cta": {
    "defaultMessage": "Create project"
  }
}`)

	cmd := newPackCmd()
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetArgs([]string{inputPath})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute pack command: %v", err)
	}

	got := decodePackTestOutput(t, out.Bytes())
	want := map[string][]string{
		"Create project": {"src.components.app-header.cta"},
		"Dashboard": {
			"src.components.app-header.title",
			"src.components.hero.title",
		},
	}
	assertPackOutput(t, got, want)

	if strings.Contains(out.String(), "description") || strings.Contains(out.String(), "defaultMessage") {
		t.Fatalf("pack output should only contain translation values and id arrays: %s", out.String())
	}
}

func TestPackCommandStripsPrefixID(t *testing.T) {
	dir := t.TempDir()
	inputPath := filepath.Join(dir, "messages.json")
	writePackTestFile(t, inputPath, `{
  "src.components.app-header.title": {
    "defaultMessage": "Dashboard",
    "description": "Main dashboard heading"
  },
  "src.components.hero.title": {
    "defaultMessage": "Dashboard",
    "description": "Hero heading"
  },
  "src.components.app-header.button.label": {
    "defaultMessage": "Save settings"
  },
  "src.components.app-header.cta": {
    "defaultMessage": "Create project"
  }
}`)

	cmd := newPackCmd()
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetArgs([]string{inputPath, "--prefix-id"})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute pack command: %v", err)
	}

	got := decodePackTestOutput(t, out.Bytes())
	want := map[string][]string{
		"Create project": {"cta"},
		"Dashboard":      {"title"},
		"Save settings":  {"button.label"},
	}
	assertPackOutput(t, got, want)
}

func TestPackCommandStripsPrefixIDAtFilenameBoundary(t *testing.T) {
	dir := t.TempDir()
	t.Chdir(dir)

	writePackTestFile(t, filepath.Join(dir, "src", "components", "AppHeader.tsx"), `
import { FormattedMessage } from "react-intl";

export function AppHeader() {
  return (
    <>
      <FormattedMessage id="button.label" defaultMessage="Save settings" />
      <FormattedMessage id="title" defaultMessage="Dashboard" />
    </>
  );
}
`)
	writePackTestFile(t, filepath.Join(dir, "src", "components", "Hero.tsx"), `
import { FormattedMessage } from "react-intl";

export function Hero() {
  return <FormattedMessage id="button.label" defaultMessage="Start trial" />;
}
`)
	writePackTestFile(t, filepath.Join(dir, "src", "foo.tsx"), `
import { FormattedMessage } from "react-intl";

export function Foo() {
  return <FormattedMessage id="bar.baz" defaultMessage="Ambiguous" />;
}
`)
	writePackTestFile(t, filepath.Join(dir, "src", "foo", "Bar.tsx"), `
import { FormattedMessage } from "react-intl";

export function Bar() {
  return <FormattedMessage id="unrelated" defaultMessage="Other" />;
}
`)

	inputPath := filepath.Join(dir, "messages.json")
	writePackTestFile(t, inputPath, `{
  "src.components.app-header.button.label": {
    "defaultMessage": "Save settings"
  },
  "src.components.hero.button.label": {
    "defaultMessage": "Start trial"
  },
  "src.components.app-header.title": {
    "defaultMessage": "Dashboard"
  },
  "src.foo.bar.baz": {
    "defaultMessage": "Ambiguous"
  }
}`)

	cmd := newPackCmd()
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetArgs([]string{inputPath, "--prefix-id"})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute pack command: %v", err)
	}

	got := decodePackTestOutput(t, out.Bytes())
	want := map[string][]string{
		"Ambiguous":     {"bar.baz"},
		"Dashboard":     {"title"},
		"Save settings": {"button.label"},
		"Start trial":   {"button.label"},
	}
	assertPackOutput(t, got, want)
}

func TestPackCommandSupportsPlainJSONTranslations(t *testing.T) {
	dir := t.TempDir()
	inputPath := filepath.Join(dir, "messages.json")
	writePackTestFile(t, inputPath, `{
  "home": {
    "title": "Dashboard"
  },
  "nav": {
    "title": "Dashboard"
  }
}`)

	cmd := newPackCmd()
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetArgs([]string{inputPath})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute pack command: %v", err)
	}

	got := decodePackTestOutput(t, out.Bytes())
	want := map[string][]string{
		"Dashboard": {"home.title", "nav.title"},
	}
	assertPackOutput(t, got, want)
}

func TestRootHelpIncludesPackCommand(t *testing.T) {
	cmd := newRootCmd("")
	b := bytes.NewBufferString("")

	cmd.SetArgs([]string{"-h"})
	cmd.SetOut(b)

	if err := cmd.Execute(); err != nil {
		t.Fatalf("run root help: %v", err)
	}

	if !strings.Contains(b.String(), "pack") {
		t.Fatalf("expected help to include pack command, got %q", b.String())
	}
}

func writePackTestFile(t *testing.T, path, content string) {
	t.Helper()

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("create test directory: %v", err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write test file: %v", err)
	}
}

func decodePackTestOutput(t *testing.T, content []byte) map[string][]string {
	t.Helper()

	var out map[string][]string
	if err := json.Unmarshal(content, &out); err != nil {
		t.Fatalf("decode pack output: %v\noutput=%s", err, string(content))
	}

	return out
}

func assertPackOutput(t *testing.T, got, want map[string][]string) {
	t.Helper()

	if len(got) != len(want) {
		t.Fatalf("packed translation count = %d, want %d; output=%#v", len(got), len(want), got)
	}
	for translation, wantIDs := range want {
		gotIDs, ok := got[translation]
		if !ok {
			t.Fatalf("missing translation %q in output=%#v", translation, got)
		}
		if len(gotIDs) != len(wantIDs) {
			t.Fatalf("translation %q ids = %#v, want %#v", translation, gotIDs, wantIDs)
		}
		for i := range wantIDs {
			if gotIDs[i] != wantIDs[i] {
				t.Fatalf("translation %q ids = %#v, want %#v", translation, gotIDs, wantIDs)
			}
		}
	}
}
