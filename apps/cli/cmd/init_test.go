package cmd

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"

	config "github.com/hyperlocalise/hyperlocalise/pkg/i18nconfig"
)

func TestInitCommand(t *testing.T) {
	t.Chdir(t.TempDir())

	template, err := initTemplateFS.ReadFile("templates/i18n.yml")
	if err != nil {
		t.Fatalf("read embedded template: %v", err)
	}

	cmd := newInitCmd()
	b := bytes.NewBufferString("")
	cmd.SetOut(b)

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute init command: %v", err)
	}

	if got, want := b.String(), "wrote i18n.yml\n"; got != want {
		t.Fatalf("unexpected output: got %q want %q", got, want)
	}

	written, err := os.ReadFile(filepath.Join(".", configTemplateFilename))
	if err != nil {
		t.Fatalf("read written config file: %v", err)
	}

	if got, want := string(written), string(template); got != want {
		t.Fatalf("written file does not match template")
	}
	if strings.Contains(string(written), "\ngroups:\n") {
		t.Fatalf("starter template should omit groups")
	}
	if strings.Contains(string(written), "\n  rules:\n") {
		t.Fatalf("starter template should omit llm.rules")
	}
}

func TestInitCommandGeneratesLoadableConfig(t *testing.T) {
	t.Chdir(t.TempDir())

	cmd := newInitCmd()
	cmd.SetOut(bytes.NewBufferString(""))

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute init command: %v", err)
	}

	cfg, err := config.LoadForCLI(configTemplateFilename)
	if err != nil {
		t.Fatalf("load generated config: %v", err)
	}

	if got, want := cfg.Locales.Source, "en-US"; got != want {
		t.Fatalf("locales.source = %q, want %q", got, want)
	}
	if got, want := len(cfg.Locales.Targets), 1; got != want {
		t.Fatalf("len(locales.targets) = %d, want %d", got, want)
	}
	profile, ok := cfg.LLM.Profiles["default"]
	if !ok {
		t.Fatal("llm.profiles.default is missing")
	}
	if got, want := profile.Provider, "openai"; got != want {
		t.Fatalf("llm.profiles.default.provider = %q, want %q", got, want)
	}
	if cfg.Translation != nil {
		t.Fatalf("translation should stay commented out in the generated config, got %+v", cfg.Translation)
	}
	if cfg.MT != nil {
		t.Fatalf("mt should stay commented out in the generated config, got %+v", cfg.MT)
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

	template, err := initTemplateFS.ReadFile("templates/i18n.yml")
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

	if got, want := b.String(), "wrote i18n.yml\n"; got != want {
		t.Fatalf("unexpected output: got %q want %q", got, want)
	}

	written, err := os.ReadFile(filepath.Join(".", configTemplateFilename))
	if err != nil {
		t.Fatalf("read written config file: %v", err)
	}

	if got, want := string(written), string(template); got != want {
		t.Fatalf("written file does not match template")
	}
	if strings.Contains(string(written), "\ngroups:\n") {
		t.Fatalf("starter template should omit groups")
	}
	if strings.Contains(string(written), "\n  rules:\n") {
		t.Fatalf("starter template should omit llm.rules")
	}
}
