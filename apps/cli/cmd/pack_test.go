package cmd

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestPackCommandStripsDescriptionsByDefault(t *testing.T) {
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

	got := decodePackCatalogOutput(t, out.Bytes())
	want := map[string]extractCatalogMessage{
		"src.components.app-header.cta": {
			DefaultMessage: "Create project",
		},
		"src.components.app-header.title": {
			DefaultMessage: "Dashboard",
		},
		"src.components.hero.title": {
			DefaultMessage: "Dashboard",
		},
	}
	assertPackCatalogOutput(t, got, want)

	if strings.Contains(out.String(), "description") {
		t.Fatalf("pack output should omit description metadata: %s", out.String())
	}
}

func TestPackCommandGroupsByValue(t *testing.T) {
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
	cmd.SetArgs([]string{inputPath, "--group-by-value"})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute pack command: %v", err)
	}

	got := decodePackGroupedOutput(t, out.Bytes())
	want := map[string][]string{
		"Create project": {"src.components.app-header.cta"},
		"Dashboard": {
			"src.components.app-header.title",
			"src.components.hero.title",
		},
	}
	assertPackGroupedOutput(t, got, want)

	if strings.Contains(out.String(), "description") || strings.Contains(out.String(), "defaultMessage") {
		t.Fatalf("grouped pack output should only contain translation values and id arrays: %s", out.String())
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
  "src.components.app-header.my-button.label": {
    "defaultMessage": "Save button label"
  },
  "src.components.app-header.cta": {
    "defaultMessage": "Create project"
  }
}`)

	cmd := newPackCmd()
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetArgs([]string{inputPath, "--prefix-id", "--group-by-value"})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute pack command: %v", err)
	}

	got := decodePackGroupedOutput(t, out.Bytes())
	want := map[string][]string{
		"Create project":    {"cta"},
		"Dashboard":         {"title"},
		"Save button label": {"my-button.label"},
		"Save settings":     {"button.label"},
	}
	assertPackGroupedOutput(t, got, want)
}

func TestPackCommandStripsPrefixIDInDefaultCatalog(t *testing.T) {
	dir := t.TempDir()
	inputPath := filepath.Join(dir, "messages.json")
	writePackTestFile(t, inputPath, `{
  "src.components.app-header.button.label": {
    "defaultMessage": "Save settings"
  },
  "src.components.app-header.my-button.label": {
    "defaultMessage": "Save button label"
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

	got := decodePackCatalogOutput(t, out.Bytes())
	want := map[string]extractCatalogMessage{
		"button.label": {
			DefaultMessage: "Save settings",
		},
		"cta": {
			DefaultMessage: "Create project",
		},
		"my-button.label": {
			DefaultMessage: "Save button label",
		},
	}
	assertPackCatalogOutput(t, got, want)
}

func TestPackCommandStripsPrefixIDAtFilenameBoundaryInDefaultCatalog(t *testing.T) {
	dir := t.TempDir()
	t.Chdir(dir)

	writePackTestFile(t, filepath.Join(dir, "src", "components", "AppHeader.tsx"), `
import { FormattedMessage } from "react-intl";

export function AppHeader() {
  return <FormattedMessage id="title" defaultMessage="Dashboard" />;
}
`)
	writePackTestFile(t, filepath.Join(dir, "src", "foo.tsx"), `
import { FormattedMessage } from "react-intl";

export function Foo() {
  return <FormattedMessage id="bar.baz" defaultMessage="Ambiguous" />;
}
`)

	inputPath := filepath.Join(dir, "messages.json")
	writePackTestFile(t, inputPath, `{
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

	got := decodePackCatalogOutput(t, out.Bytes())
	want := map[string]extractCatalogMessage{
		"bar.baz": {
			DefaultMessage: "Ambiguous",
		},
		"title": {
			DefaultMessage: "Dashboard",
		},
	}
	assertPackCatalogOutput(t, got, want)
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
	cmd.SetArgs([]string{inputPath, "--prefix-id", "--group-by-value"})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute pack command: %v", err)
	}

	got := decodePackGroupedOutput(t, out.Bytes())
	want := map[string][]string{
		"Ambiguous":     {"bar.baz"},
		"Dashboard":     {"title"},
		"Save settings": {"button.label"},
		"Start trial":   {"button.label"},
	}
	assertPackGroupedOutput(t, got, want)
}

func TestPackCommandStripsPrefixIDInPlainJSONFlatOutput(t *testing.T) {
	dir := t.TempDir()
	inputPath := filepath.Join(dir, "messages.json")
	writePackTestFile(t, inputPath, `{
  "src.components.app-header.button.label": "Save settings",
  "src.components.app-header.cta": "Create project"
}`)

	cmd := newPackCmd()
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetArgs([]string{inputPath, "--prefix-id"})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute pack command: %v", err)
	}

	got := decodePackFlatOutput(t, out.Bytes())
	want := map[string]string{
		"button.label": "Save settings",
		"cta":          "Create project",
	}
	assertPackFlatOutput(t, got, want)
}

func TestPackCommandRejectsPrefixIDCollisionsInPlainJSONFlatOutput(t *testing.T) {
	dir := t.TempDir()
	inputPath := filepath.Join(dir, "messages.json")
	writePackTestFile(t, inputPath, `{
  "src.foo.button.label": "Save settings",
  "src.bar.button.label": "Start trial"
}`)

	cmd := newPackCmd()
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetArgs([]string{inputPath, "--prefix-id"})

	err := cmd.Execute()
	if err == nil {
		t.Fatalf("expected pack command to fail on prefix-id collision")
	}
	if !strings.Contains(err.Error(), `ids "src.bar.button.label" and "src.foo.button.label" both strip to "label"`) {
		t.Fatalf("unexpected error: %v", err)
	}
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

	got := decodePackFlatOutput(t, out.Bytes())
	want := map[string]string{
		"home.title": "Dashboard",
		"nav.title":  "Dashboard",
	}
	assertPackFlatOutput(t, got, want)
}

func TestPackCommandGroupsPlainJSONTranslationsByValue(t *testing.T) {
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
	cmd.SetArgs([]string{inputPath, "--group-by-value"})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute pack command: %v", err)
	}

	got := decodePackGroupedOutput(t, out.Bytes())
	want := map[string][]string{
		"Dashboard": {"home.title", "nav.title"},
	}
	assertPackGroupedOutput(t, got, want)
}

func TestPackCommandWritesOutFile(t *testing.T) {
	dir := t.TempDir()
	inputPath := filepath.Join(dir, "messages.json")
	writePackTestFile(t, inputPath, `{
  "home.title": {
    "defaultMessage": "Dashboard"
  },
  "nav.title": {
    "defaultMessage": "Dashboard"
  }
}`)

	outPath := filepath.Join(dir, "packed.json")
	cmd := newPackCmd()
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetArgs([]string{inputPath, "--out-file", outPath})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute pack command: %v", err)
	}
	if out.Len() != 0 {
		t.Fatalf("expected out-file mode to keep stdout empty, got %q", out.String())
	}

	content, err := os.ReadFile(outPath)
	if err != nil {
		t.Fatalf("read pack output file: %v", err)
	}

	got := decodePackCatalogOutput(t, content)
	want := map[string]extractCatalogMessage{
		"home.title": {DefaultMessage: "Dashboard"},
		"nav.title":  {DefaultMessage: "Dashboard"},
	}
	assertPackCatalogOutput(t, got, want)
}

func TestPackCommandDiscoversLocaleFilesFromConfig(t *testing.T) {
	dir := t.TempDir()
	t.Chdir(dir)

	langDir := filepath.Join(dir, "lang")
	distDir := filepath.Join(dir, "dist")
	writePackTestFile(t, filepath.Join(langDir, "en-US.json"), `{
  "home.title": {
    "defaultMessage": "Dashboard",
    "description": "Home heading"
  }
}`)
	writePackTestFile(t, filepath.Join(distDir, "es-ES.json"), `{
  "home.title": {
    "defaultMessage": "Panel",
    "description": "Home heading"
  }
}`)
	writePackTestFile(t, filepath.Join(langDir, "plain.json"), `{
  "home.title": "Dashboard"
}`)

	writePackConfig(t, filepath.Join(dir, "i18n.jsonc"), filepath.Join(langDir, "{{source}}.json"))

	cmd := newPackCmd()
	out := bytes.NewBuffer(nil)
	errOut := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetErr(errOut)
	cmd.SetArgs(nil)

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute pack command: %v", err)
	}
	if out.Len() != 0 {
		t.Fatalf("expected batch pack to keep stdout empty, got %q", out.String())
	}
	if !strings.Contains(errOut.String(), "dist/es-ES.packed.json") {
		t.Fatalf("expected status output for packed file, got %q", errOut.String())
	}

	content, err := os.ReadFile(filepath.Join(distDir, "es-ES.packed.json"))
	if err != nil {
		t.Fatalf("read packed output file: %v", err)
	}
	got := decodePackCatalogOutput(t, content)
	want := map[string]extractCatalogMessage{
		"home.title": {DefaultMessage: "Panel"},
	}
	assertPackCatalogOutput(t, got, want)

	if _, err := os.Stat(filepath.Join(langDir, "en-US.packed.json")); err == nil {
		t.Fatalf("expected source locale file to be skipped during auto discovery")
	}
	if _, err := os.Stat(filepath.Join(langDir, "plain.packed.json")); err == nil {
		t.Fatalf("expected plain JSON file to be skipped during auto discovery")
	}
}

func TestPackCommandSkipsNonJSONFilesDuringDiscovery(t *testing.T) {
	dir := t.TempDir()
	t.Chdir(dir)

	langDir := filepath.Join(dir, "lang")
	distDir := filepath.Join(dir, "dist")
	writePackTestFile(t, filepath.Join(langDir, "en-US.json"), `{
  "home.title": {
    "defaultMessage": "Dashboard"
  }
}`)
	writePackTestFile(t, filepath.Join(distDir, "es-ES.json"), `{
  "home.title": {
    "defaultMessage": "Panel"
  }
}`)
	writePackTestFile(t, filepath.Join(distDir, "es-ES.yaml"), `home.title: Panel`)

	writePackConfigWithFiles(t, filepath.Join(dir, "i18n.jsonc"), []packConfigFileMapping{
		{from: filepath.Join(langDir, "{{source}}.json"), to: filepath.Join(distDir, "{{target}}.json")},
		{from: filepath.Join(langDir, "{{source}}.yaml"), to: filepath.Join(distDir, "{{target}}.yaml")},
	})

	cmd := newPackCmd()
	out := bytes.NewBuffer(nil)
	errOut := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetErr(errOut)
	cmd.SetArgs(nil)

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute pack command: %v", err)
	}
	if !strings.Contains(errOut.String(), "dist/es-ES.packed.json") {
		t.Fatalf("expected status output for packed JSON file, got %q", errOut.String())
	}
	if _, err := os.Stat(filepath.Join(distDir, "es-ES.packed.json")); err != nil {
		t.Fatalf("expected packed JSON output file: %v", err)
	}
	if _, err := os.Stat(filepath.Join(distDir, "es-ES.yaml.packed.json")); err == nil {
		t.Fatalf("expected YAML locale file to be skipped during auto discovery")
	}
}

func TestPackCommandRejectsGroupByValueInBatchMode(t *testing.T) {
	dir := t.TempDir()
	t.Chdir(dir)

	langDir := filepath.Join(dir, "lang")
	writePackTestFile(t, filepath.Join(langDir, "en-US.json"), `{
  "home.title": {
    "defaultMessage": "Dashboard"
  }
}`)
	writePackConfig(t, filepath.Join(dir, "i18n.jsonc"), filepath.Join(langDir, "{{source}}.json"))

	cmd := newPackCmd()
	cmd.SetArgs([]string{"--group-by-value"})

	err := cmd.Execute()
	if err == nil {
		t.Fatalf("expected pack command to reject --group-by-value in batch mode")
	}
	if !strings.Contains(err.Error(), "pack --group-by-value requires a translation file") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestPackCommandRejectsFileWithConfigFlag(t *testing.T) {
	dir := t.TempDir()
	inputPath := filepath.Join(dir, "messages.json")
	writePackTestFile(t, inputPath, `{
  "home.title": {
    "defaultMessage": "Dashboard"
  }
}`)

	cmd := newPackCmd()
	cmd.SetArgs([]string{inputPath, "--config", filepath.Join(dir, "i18n.jsonc")})

	err := cmd.Execute()
	if err == nil {
		t.Fatalf("expected pack command to reject file plus --config")
	}
	if !strings.Contains(err.Error(), "cannot combine") {
		t.Fatalf("unexpected error: %v", err)
	}
}

type packConfigFileMapping struct {
	from string
	to   string
}

func writePackConfigWithFiles(t *testing.T, configPath string, files []packConfigFileMapping) {
	t.Helper()

	var fileEntries strings.Builder
	for i, file := range files {
		if i > 0 {
			fileEntries.WriteString(",\n")
		}
		fmt.Fprintf(&fileEntries, `        {
          "from": %q,
          "to": %q
        }`, file.from, file.to)
	}

	content := fmt.Sprintf(`{
  "locales": {
    "source": "en-US",
    "targets": ["es-ES"]
  },
  "buckets": {
    "ui": {
      "files": [
%s
      ]
    }
  },
  "llm": {
    "profiles": {
      "default": {
        "provider": "openai",
        "model": "gpt-5.2"
      }
    }
  }
}`, fileEntries.String())
	if err := os.WriteFile(configPath, []byte(content), 0o600); err != nil {
		t.Fatalf("write pack config: %v", err)
	}
}

func writePackConfig(t *testing.T, configPath, sourcePattern string) {
	t.Helper()

	writePackConfigWithFiles(t, configPath, []packConfigFileMapping{
		{from: sourcePattern, to: "dist/{{target}}.json"},
	})
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

func decodePackCatalogOutput(t *testing.T, content []byte) map[string]extractCatalogMessage {
	t.Helper()

	var out map[string]extractCatalogMessage
	if err := json.Unmarshal(content, &out); err != nil {
		t.Fatalf("decode pack catalog output: %v\noutput=%s", err, string(content))
	}

	return out
}

func decodePackFlatOutput(t *testing.T, content []byte) map[string]string {
	t.Helper()

	var out map[string]string
	if err := json.Unmarshal(content, &out); err != nil {
		t.Fatalf("decode pack flat output: %v\noutput=%s", err, string(content))
	}

	return out
}

func decodePackGroupedOutput(t *testing.T, content []byte) map[string][]string {
	t.Helper()

	var out map[string][]string
	if err := json.Unmarshal(content, &out); err != nil {
		t.Fatalf("decode pack grouped output: %v\noutput=%s", err, string(content))
	}

	return out
}

func assertPackCatalogOutput(t *testing.T, got, want map[string]extractCatalogMessage) {
	t.Helper()

	if len(got) != len(want) {
		t.Fatalf("packed catalog count = %d, want %d; output=%#v", len(got), len(want), got)
	}
	for id, wantMessage := range want {
		gotMessage, ok := got[id]
		if !ok {
			t.Fatalf("missing id %q in output=%#v", id, got)
		}
		if gotMessage != wantMessage {
			t.Fatalf("id %q message = %#v, want %#v", id, gotMessage, wantMessage)
		}
	}
}

func assertPackFlatOutput(t *testing.T, got, want map[string]string) {
	t.Helper()

	if len(got) != len(want) {
		t.Fatalf("packed flat count = %d, want %d; output=%#v", len(got), len(want), got)
	}
	for id, wantValue := range want {
		gotValue, ok := got[id]
		if !ok {
			t.Fatalf("missing id %q in output=%#v", id, got)
		}
		if gotValue != wantValue {
			t.Fatalf("id %q value = %q, want %q", id, gotValue, wantValue)
		}
	}
}

func assertPackGroupedOutput(t *testing.T, got, want map[string][]string) {
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
