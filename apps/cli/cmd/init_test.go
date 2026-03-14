package cmd

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestInitCommand(t *testing.T) {
	t.Chdir(t.TempDir())

	template, err := initTemplateFS.ReadFile("templates/i18n.jsonc")
	if err != nil {
		t.Fatalf("read embedded template: %v", err)
	}

	cmd := newInitCmd()
	b := bytes.NewBufferString("")
	cmd.SetOut(b)

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute init command: %v", err)
	}

	if got, want := b.String(), "wrote i18n.jsonc\n"; got != want {
		t.Fatalf("unexpected output: got %q want %q", got, want)
	}

	written, err := os.ReadFile(filepath.Join(".", configTemplateFilename))
	if err != nil {
		t.Fatalf("read written config file: %v", err)
	}

	if got, want := string(written), string(template); got != want {
		t.Fatalf("written file does not match template")
	}
}

func TestInitCommandDoesNotOverwriteWithoutForce(t *testing.T) {
	t.Chdir(t.TempDir())

	const existing = "{\n  \"kept\": true\n}\n"
	if err := os.WriteFile(configTemplateFilename, []byte(existing), 0o644); err != nil {
		t.Fatalf("seed existing file: %v", err)
	}

	cmd := newInitCmd()
	b := bytes.NewBufferString("")
	cmd.SetOut(b)

	err := cmd.Execute()
	if err == nil {
		t.Fatalf("expected error when config already exists")
	}

	if !strings.Contains(err.Error(), "already exists") {
		t.Fatalf("unexpected error: %v", err)
	}

	written, err := os.ReadFile(filepath.Join(".", configTemplateFilename))
	if err != nil {
		t.Fatalf("read existing config file: %v", err)
	}

	if got, want := string(written), existing; got != want {
		t.Fatalf("existing file should not be overwritten")
	}
}

func TestInitCommandOverwritesWithForce(t *testing.T) {
	t.Chdir(t.TempDir())

	template, err := initTemplateFS.ReadFile("templates/i18n.jsonc")
	if err != nil {
		t.Fatalf("read embedded template: %v", err)
	}

	if err := os.WriteFile(configTemplateFilename, []byte("stale"), 0o644); err != nil {
		t.Fatalf("seed existing file: %v", err)
	}

	cmd := newInitCmd()
	b := bytes.NewBufferString("")
	cmd.SetOut(b)
	cmd.SetArgs([]string{"--force"})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute forced init command: %v", err)
	}

	if got, want := b.String(), "wrote i18n.jsonc\n"; got != want {
		t.Fatalf("unexpected output: got %q want %q", got, want)
	}

	written, err := os.ReadFile(filepath.Join(".", configTemplateFilename))
	if err != nil {
		t.Fatalf("read written config file: %v", err)
	}

	if got, want := string(written), string(template); got != want {
		t.Fatalf("written file does not match template")
	}
}
