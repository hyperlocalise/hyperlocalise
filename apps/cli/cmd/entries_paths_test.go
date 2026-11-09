package cmd

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func runEntriesCommand(t *testing.T, args ...string) (string, error) {
	t.Helper()
	root := newRootCmd("test")
	out := bytes.NewBuffer(nil)
	root.SetOut(out)
	root.SetErr(bytes.NewBuffer(nil))
	root.SetArgs(append([]string{"entries"}, args...))
	err := root.Execute()
	return out.String(), err
}

func writeEntriesFixture(t *testing.T, dir, name, content string) string {
	t.Helper()
	path := filepath.Join(dir, name)
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

func decodeEntriesOutput(t *testing.T, out string) map[string]any {
	t.Helper()
	var decoded map[string]any
	if err := json.Unmarshal([]byte(out), &decoded); err != nil {
		t.Fatalf("decode entries output %q: %v", out, err)
	}
	return decoded
}

func TestEntriesCommandRejectsBlankPath(t *testing.T) {
	_, err := runEntriesCommand(t, "   ")
	if err == nil || err.Error() != "entries translation file path cannot be empty" {
		t.Fatalf("expected blank path error, got %v", err)
	}
}

func TestEntriesCommandReportsMissingInput(t *testing.T) {
	missing := filepath.Join(t.TempDir(), "missing.json")
	_, err := runEntriesCommand(t, missing)
	if err == nil || !strings.Contains(err.Error(), `read entries input "`+missing+`"`) {
		t.Fatalf("expected read error, got %v", err)
	}
}

func TestEntriesCommandImportSettingsErrors(t *testing.T) {
	dir := t.TempDir()
	input := writeEntriesFixture(t, dir, "app.json", `{"hello":"Hello"}`)

	missing := filepath.Join(dir, "missing-settings.json")
	_, err := runEntriesCommand(t, input, "--import-settings", missing)
	if err == nil || !strings.Contains(err.Error(), `read import settings "`+missing+`"`) {
		t.Fatalf("expected missing settings error, got %v", err)
	}

	invalid := writeEntriesFixture(t, dir, "settings.json", "{not json")
	_, err = runEntriesCommand(t, input, "--import-settings", invalid)
	if err == nil || !strings.Contains(err.Error(), `decode import settings "`+invalid+`"`) {
		t.Fatalf("expected decode settings error, got %v", err)
	}
}

func TestEntriesCommandAcceptsEmptyImportSettings(t *testing.T) {
	dir := t.TempDir()
	input := writeEntriesFixture(t, dir, "app.json", `{"hello":"Hello"}`)
	settings := writeEntriesFixture(t, dir, "settings.json", "{}")

	out, err := runEntriesCommand(t, input, "--import-settings", settings)
	if err != nil {
		t.Fatalf("entries with import settings: %v", err)
	}
	if decoded := decodeEntriesOutput(t, out); decoded["hello"] == nil {
		t.Fatalf("expected hello entry, got %s", out)
	}
}

func TestEntriesCommandPlainTextDocuments(t *testing.T) {
	dir := t.TempDir()
	source := writeEntriesFixture(t, dir, "notes.txt", "First paragraph.\n\nSecond paragraph.\n")
	target := writeEntriesFixture(t, dir, "notes-fr.txt", "Premier paragraphe.\n\nDeuxième paragraphe.\n")

	standalone, err := runEntriesCommand(t, target)
	if err != nil {
		t.Fatalf("entries plain text: %v", err)
	}
	if !strings.Contains(standalone, "Premier paragraphe.") {
		t.Fatalf("expected plain text entries, got %s", standalone)
	}

	aligned, err := runEntriesCommand(t, target, "--source", source)
	if err != nil {
		t.Fatalf("entries plain text with source: %v", err)
	}
	if !strings.Contains(aligned, "Premier paragraphe.") || !strings.Contains(aligned, "Deuxième paragraphe.") {
		t.Fatalf("expected aligned plain text entries, got %s", aligned)
	}
}

func TestEntriesCommandSourceMismatchAndReadErrors(t *testing.T) {
	dir := t.TempDir()
	txtTarget := writeEntriesFixture(t, dir, "notes.txt", "Bonjour.\n")
	adocTarget := writeEntriesFixture(t, dir, "guide.adoc", "= Guide\n\nIntro.\n")
	mdTarget := writeEntriesFixture(t, dir, "guide.md", "# Guide\n\nIntro.\n")
	mdSource := writeEntriesFixture(t, dir, "source.md", "# Guide\n\nIntro.\n")

	tests := []struct {
		name    string
		args    []string
		wantErr string
	}{
		{name: "plain text with markdown source", args: []string{txtTarget, "--source", mdSource}, wantErr: `entries source extension ".md" does not match target extension ".txt"`},
		{name: "plain text missing source", args: []string{txtTarget, "--source", filepath.Join(dir, "missing.txt")}, wantErr: "read entries source"},
		{name: "asciidoc missing source", args: []string{adocTarget, "--source", filepath.Join(dir, "missing.adoc")}, wantErr: "read entries source"},
		{name: "markdown missing source", args: []string{mdTarget, "--source", filepath.Join(dir, "missing.md")}, wantErr: "read entries source"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			_, err := runEntriesCommand(t, tc.args...)
			if err == nil || !strings.Contains(err.Error(), tc.wantErr) {
				t.Fatalf("expected error containing %q, got %v", tc.wantErr, err)
			}
		})
	}
}

func TestEntriesCommandSourceIgnoredForStructuredFormats(t *testing.T) {
	dir := t.TempDir()
	input := writeEntriesFixture(t, dir, "app.json", `{"hello":"Bonjour"}`)
	source := writeEntriesFixture(t, dir, "source.json", `{"hello":"Hello"}`)

	out, err := runEntriesCommand(t, input, "--source", source)
	if err != nil {
		t.Fatalf("entries json with source: %v", err)
	}
	if !strings.Contains(out, "Bonjour") {
		t.Fatalf("expected target value, got %s", out)
	}
}

func TestEntriesCommandRejectsInvalidSRXSpec(t *testing.T) {
	dir := t.TempDir()
	missingSRX := filepath.Join(dir, "missing.srx")
	for _, input := range []string{
		writeEntriesFixture(t, dir, "app.json", `{"hello":"Hello. World."}`),
		writeEntriesFixture(t, dir, "guide.md", "# Guide\n\nHello. World.\n"),
	} {
		_, err := runEntriesCommand(t, input, "--srx", missingSRX)
		if err == nil {
			t.Fatalf("%s: expected invalid srx spec error", filepath.Base(input))
		}
	}
}

func TestEntriesCommandReportsParseErrors(t *testing.T) {
	input := writeEntriesFixture(t, t.TempDir(), "broken.json", "{")
	if _, err := runEntriesCommand(t, input); err == nil {
		t.Fatal("expected parse error for malformed json")
	}
}
