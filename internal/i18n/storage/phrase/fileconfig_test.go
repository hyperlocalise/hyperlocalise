package phrase

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadCLIConfigResolvesOfficialPhraseShape(t *testing.T) {
	t.Setenv(defaultPhraseAccessTokenEnv, "secret")

	dir := t.TempDir()
	configPath := filepath.Join(dir, ".phrase.yml")
	if err := os.WriteFile(configPath, []byte(`
phrase:
  access_token: $PHRASE_ACCESS_TOKEN
  project_id: project-1
  file_format: json
  host: https://api.us.app.phrase.com/v2
  locale_mapping:
    fr-FR: fr
  push:
    sources:
      - file: ./locales/en.json
        params:
          locale_id: en-US
          tags: app,source
          update_translations: true
          update_translation_keys: false
          skip_upload_tags: true
          format_options:
            convert_placeholder: true
  pull:
    targets:
      - file: ./locales/<locale_name>.json
        params:
          locale_id: fr-FR
          tags:
            - app
            - reviewed
          include_unverified_translations: false
          include_empty_translations: true
`), 0o644); err != nil {
		t.Fatalf("write config: %v", err)
	}

	cfg, resolvedPath, err := LoadCLIConfig(configPath)
	if err != nil {
		t.Fatalf("load config: %v", err)
	}
	if resolvedPath != configPath {
		t.Fatalf("resolved path = %q, want %q", resolvedPath, configPath)
	}
	if cfg.ProjectID != "project-1" {
		t.Fatalf("project id = %q, want project-1", cfg.ProjectID)
	}
	if cfg.APIToken != "secret" {
		t.Fatalf("api token = %q, want secret", cfg.APIToken)
	}
	if cfg.APIBaseURL != "https://api.us.app.phrase.com/v2" {
		t.Fatalf("api base url = %q", cfg.APIBaseURL)
	}
	if cfg.BasePath != dir {
		t.Fatalf("base path = %q, want %q", cfg.BasePath, dir)
	}
	if got := LocaleNameForPath("fr-FR", cfg.LocaleMapping); got != "fr" {
		t.Fatalf("mapped locale = %q, want fr", got)
	}
	if len(cfg.PushSources) != 1 || cfg.PushSources[0].LocaleID != "en-US" {
		t.Fatalf("push sources = %#v", cfg.PushSources)
	}
	if cfg.PushSources[0].UpdateTranslationKeys == nil || *cfg.PushSources[0].UpdateTranslationKeys {
		t.Fatalf("update_translation_keys = %#v, want false", cfg.PushSources[0].UpdateTranslationKeys)
	}
	if len(cfg.PushSources[0].FormatOptions) == 0 {
		t.Fatalf("expected push format options")
	}
	if len(cfg.PullTargets) != 1 || cfg.PullTargets[0].LocaleID != "fr-FR" {
		t.Fatalf("pull targets = %#v", cfg.PullTargets)
	}
	if cfg.PullTargets[0].IncludeUnverifiedTranslations == nil || *cfg.PullTargets[0].IncludeUnverifiedTranslations {
		t.Fatalf("include_unverified_translations = %#v, want false", cfg.PullTargets[0].IncludeUnverifiedTranslations)
	}
}

func TestLoadCLIConfigUsesPhraseAppConfigEnv(t *testing.T) {
	dir := t.TempDir()
	configPath := filepath.Join(dir, "phrase.yml")
	if err := os.WriteFile(configPath, []byte(`
phrase:
  project_id: project-1
  file_format: json
  push:
    sources:
      - file: ./en.json
        params:
          locale_id: en
`), 0o644); err != nil {
		t.Fatalf("write config: %v", err)
	}
	t.Setenv(defaultPhraseAppConfigEnvVar, configPath)

	_, resolvedPath, err := LoadCLIConfig("")
	if err != nil {
		t.Fatalf("load config: %v", err)
	}
	if resolvedPath != configPath {
		t.Fatalf("resolved path = %q, want %q", resolvedPath, configPath)
	}
}

func TestExpandCLIFilePathRejectsUnsupportedPlaceholder(t *testing.T) {
	_, err := ExpandCLIFilePath("./locales/<unsupported>.json", "fr", "", nil)
	if err == nil {
		t.Fatalf("expected unsupported placeholder error")
	}
}
