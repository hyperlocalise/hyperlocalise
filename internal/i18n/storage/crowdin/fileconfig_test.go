package crowdin

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLoadFileWorkflowConfigResolvesEnvAndBasePath(t *testing.T) {
	t.Setenv(defaultProjectIDEnvName, "123")
	t.Setenv(defaultAPITokenEnvName, "secret")

	dir := t.TempDir()
	configPath := filepath.Join(dir, "crowdin.yml")
	if err := os.WriteFile(configPath, []byte(`
base_path: ./project
preserve_hierarchy: true
files:
  - source: /src/en.json
    translation: /dist/%locale%/%original_file_name%
`), 0o644); err != nil {
		t.Fatalf("write config: %v", err)
	}

	cfg, err := LoadFileWorkflowConfig(configPath, "")
	if err != nil {
		t.Fatalf("load file workflow config: %v", err)
	}
	if cfg.ProjectID != "123" {
		t.Fatalf("project id = %q, want 123", cfg.ProjectID)
	}
	if cfg.APIToken != "secret" {
		t.Fatalf("api token = %q, want secret", cfg.APIToken)
	}
	if got, want := cfg.BasePath, filepath.Join(dir, "project"); got != want {
		t.Fatalf("base path = %q, want %q", got, want)
	}
	if len(cfg.Files) != 1 {
		t.Fatalf("files len = %d, want 1", len(cfg.Files))
	}
}

func TestLoadFileWorkflowConfigRejectsUnsupportedPlaceholder(t *testing.T) {
	t.Setenv(defaultProjectIDEnvName, "123")
	t.Setenv(defaultAPITokenEnvName, "secret")

	dir := t.TempDir()
	configPath := filepath.Join(dir, "crowdin.yml")
	if err := os.WriteFile(configPath, []byte(`
files:
  - source: /src/en.json
    translation: /dist/%unsupported%/%original_file_name%
`), 0o644); err != nil {
		t.Fatalf("write config: %v", err)
	}

	_, err := LoadFileWorkflowConfig(configPath, "")
	if err == nil || !strings.Contains(err.Error(), "unsupported placeholder") {
		t.Fatalf("expected unsupported placeholder error, got %v", err)
	}
}

func TestLoadFileWorkflowConfigIdentityOverridesProjectAndEnv(t *testing.T) {
	t.Setenv(defaultProjectIDEnvName, "111")
	t.Setenv(defaultAPITokenEnvName, "env-secret")

	dir := t.TempDir()
	configPath := filepath.Join(dir, "crowdin.yml")
	identityPath := filepath.Join(dir, ".identity.yml")

	if err := os.WriteFile(configPath, []byte(`
project_id: 222
api_token: project-secret
files:
  - source: /src/en.json
    translation: /dist/%locale%/%original_file_name%
`), 0o644); err != nil {
		t.Fatalf("write config: %v", err)
	}
	if err := os.WriteFile(identityPath, []byte(`
project_id: 333
api_token: identity-secret
`), 0o644); err != nil {
		t.Fatalf("write identity: %v", err)
	}

	cfg, err := LoadFileWorkflowConfig(configPath, identityPath)
	if err != nil {
		t.Fatalf("load file workflow config: %v", err)
	}
	if cfg.ProjectID != "333" {
		t.Fatalf("project id = %q, want 333", cfg.ProjectID)
	}
	if cfg.APIToken != "identity-secret" {
		t.Fatalf("api token = %q, want identity-secret", cfg.APIToken)
	}
}

func TestLoadFileWorkflowConfigUsesLegacyTokenFallback(t *testing.T) {
	t.Setenv(defaultProjectIDEnvName, "123")
	t.Setenv(legacyAPITokenEnvName, "legacy-secret")

	dir := t.TempDir()
	configPath := filepath.Join(dir, "crowdin.yml")
	if err := os.WriteFile(configPath, []byte(`
files:
  - source: /src/en.json
    translation: /dist/%locale%/%original_file_name%
`), 0o644); err != nil {
		t.Fatalf("write config: %v", err)
	}

	cfg, err := LoadFileWorkflowConfig(configPath, "")
	if err != nil {
		t.Fatalf("load file workflow config: %v", err)
	}
	if cfg.APIToken != "legacy-secret" {
		t.Fatalf("api token = %q, want legacy-secret", cfg.APIToken)
	}
}

func TestLoadFileWorkflowConfigAcceptsLanguagesMappingPlaceholder(t *testing.T) {
	t.Setenv(defaultProjectIDEnvName, "123")
	t.Setenv(defaultAPITokenEnvName, "secret")

	dir := t.TempDir()
	configPath := filepath.Join(dir, "crowdin.yml")
	if err := os.WriteFile(configPath, []byte(`
files:
  - source: /src/en.json
    translation: /dist/%custom_locale%/%original_file_name%
    languages_mapping:
      custom_locale:
        fr-FR: french
`), 0o644); err != nil {
		t.Fatalf("write config: %v", err)
	}

	cfg, err := LoadFileWorkflowConfig(configPath, "")
	if err != nil {
		t.Fatalf("load file workflow config: %v", err)
	}
	got := cfg.Files[0].LanguagesMapping["custom_locale"]["fr-FR"]
	if got != "french" {
		t.Fatalf("languages mapping = %q, want french", got)
	}
}
