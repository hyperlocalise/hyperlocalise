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

	cfg, resolvedPath, err := LoadFileWorkflowConfig(configPath, "")
	if err != nil {
		t.Fatalf("load file workflow config: %v", err)
	}
	if resolvedPath != configPath {
		t.Fatalf("resolved path = %q, want %q", resolvedPath, configPath)
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

	_, _, err := LoadFileWorkflowConfig(configPath, "")
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

	cfg, _, err := LoadFileWorkflowConfig(configPath, identityPath)
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

	cfg, _, err := LoadFileWorkflowConfig(configPath, "")
	if err != nil {
		t.Fatalf("load file workflow config: %v", err)
	}
	if cfg.APIToken != "legacy-secret" {
		t.Fatalf("api token = %q, want legacy-secret", cfg.APIToken)
	}
}

func TestLoadFileWorkflowConfigAcceptsCrowdinCLIFileMetadata(t *testing.T) {
	t.Setenv(defaultProjectIDEnvName, "123")
	t.Setenv(defaultAPITokenEnvName, "secret")

	dir := t.TempDir()
	configPath := filepath.Join(dir, "crowdin.yml")
	if err := os.WriteFile(configPath, []byte(`
files:
  - source: /src/en.json
    type: json
    translation: /dist/%locale%/%original_file_name%
`), 0o644); err != nil {
		t.Fatalf("write config: %v", err)
	}

	cfg, _, err := LoadFileWorkflowConfig(configPath, "")
	if err != nil {
		t.Fatalf("load file workflow config: %v", err)
	}
	if len(cfg.Files) != 1 {
		t.Fatalf("files len = %d, want 1", len(cfg.Files))
	}
}

func TestLoadFileWorkflowConfigAcceptsExtendedCrowdinCLIKeys(t *testing.T) {
	t.Setenv(defaultProjectIDEnvName, "123")
	t.Setenv(defaultAPITokenEnvName, "secret")

	dir := t.TempDir()
	configPath := filepath.Join(dir, "crowdin.yml")
	if err := os.WriteFile(configPath, []byte(`
export_languages:
  - uk
  - ja
branch: main
pull_request_title: Custom
pull_request_labels:
  - crowdin
commit_message: "[ci skip]"
append_commit_message: false
pull_request_assignees:
  - alice
  - 42
pull_request_reviewers:
  - bob
files:
  - source: /src/**/*.xml
    dest: /dest/%file_name%.xml
    translation: /dist/%locale%/%original_file_name%
    type: xml
    update_option: update_as_unapproved
    export_pattern: /dist/%two_letters_code%/%original_file_name%
    ignore:
      - /src/legacy/**/*
    translation_replace:
      _en: ""
    first_line_contains_header: true
    scheme: identifier,source_phrase,context,uk
    custom_segmentation: /rules/sample.srx.xml
    translate_content: 0
    translate_attributes: 1
    content_segmentation: 1
    translatable_elements:
      - /content/text
    escape_quotes: 1
    escape_special_characters: 0
    labels:
      - android
`), 0o644); err != nil {
		t.Fatalf("write config: %v", err)
	}

	cfg, _, err := LoadFileWorkflowConfig(configPath, "")
	if err != nil {
		t.Fatalf("load file workflow config: %v", err)
	}
	if len(cfg.Files) != 1 {
		t.Fatalf("files len = %d, want 1", len(cfg.Files))
	}
	if cfg.Branch != "main" {
		t.Fatalf("branch = %q, want main", cfg.Branch)
	}
	raw, err := decodeYAMLFile[fileConfigYAML](configPath)
	if err != nil {
		t.Fatalf("decode raw config: %v", err)
	}
	wantExport := "/dist/%two_letters_code%/%original_file_name%"
	if got := raw.Files[0].ExportPattern; got != wantExport {
		t.Fatalf("export_pattern = %q, want %q", got, wantExport)
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

	cfg, _, err := LoadFileWorkflowConfig(configPath, "")
	if err != nil {
		t.Fatalf("load file workflow config: %v", err)
	}
	got := cfg.Files[0].LanguagesMapping["custom_locale"]["fr-FR"]
	if got != "french" {
		t.Fatalf("languages mapping = %q, want french", got)
	}
}

func TestLoadFileWorkflowConfigPreservesExplicitFalseExportOptions(t *testing.T) {
	t.Setenv(defaultProjectIDEnvName, "123")
	t.Setenv(defaultAPITokenEnvName, "secret")

	dir := t.TempDir()
	configPath := filepath.Join(dir, "crowdin.yml")
	if err := os.WriteFile(configPath, []byte(`
files:
  - source: /src/en.json
    translation: /dist/%locale%/%original_file_name%
    skip_untranslated_strings: false
    skip_untranslated_files: false
    export_only_approved: false
`), 0o644); err != nil {
		t.Fatalf("write config: %v", err)
	}

	cfg, _, err := LoadFileWorkflowConfig(configPath, "")
	if err != nil {
		t.Fatalf("load file workflow config: %v", err)
	}

	export := cfg.Files[0].Export
	if export.SkipUntranslatedStrings == nil || *export.SkipUntranslatedStrings {
		t.Fatalf("skip untranslated strings = %#v, want explicit false", export.SkipUntranslatedStrings)
	}
	if export.SkipUntranslatedFiles == nil || *export.SkipUntranslatedFiles {
		t.Fatalf("skip untranslated files = %#v, want explicit false", export.SkipUntranslatedFiles)
	}
	if export.ExportOnlyApproved == nil || *export.ExportOnlyApproved {
		t.Fatalf("export only approved = %#v, want explicit false", export.ExportOnlyApproved)
	}
}
