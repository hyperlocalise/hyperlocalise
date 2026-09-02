package config

import (
	"strings"
	"testing"
)

func TestParsePinnedCLIVersion(t *testing.T) {
	testCases := []struct {
		name        string
		value       string
		want        string
		errContains string
	}{
		{
			name:  "hyperlocalise with v prefix",
			value: "hyperlocalise@v1.2.3",
			want:  "1.2.3",
		},
		{
			name:  "hyperlocalise without v prefix",
			value: "hyperlocalise@1.2.3",
			want:  "1.2.3",
		},
		{
			name:  "hl alias",
			value: "hl@2.0.0",
			want:  "2.0.0",
		},
		{
			name:        "missing tool name",
			value:       "1.2.3",
			errContains: "expected",
		},
		{
			name:        "unsupported tool",
			value:       "pnpm@1.2.3",
			errContains: "unsupported tool",
		},
		{
			name:        "invalid semver",
			value:       "hyperlocalise@latest",
			errContains: "invalid semver",
		},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			got, err := ParsePinnedCLIVersion(tc.value)
			if tc.errContains != "" {
				if err == nil {
					t.Fatalf("expected error containing %q", tc.errContains)
				}
				if !strings.Contains(err.Error(), tc.errContains) {
					t.Fatalf("unexpected error: got %q want substring %q", err.Error(), tc.errContains)
				}
				return
			}

			if err != nil {
				t.Fatalf("parse pinned version: %v", err)
			}
			if got.String() != tc.want {
				t.Fatalf("parsed version = %q, want %q", got.String(), tc.want)
			}
		})
	}
}

func TestCheckPinnedCLIVersion(t *testing.T) {
	cfg := I18NConfig{Version: "hyperlocalise@1.2.3"}

	if err := cfg.CheckPinnedCLIVersion("v1.2.3"); err != nil {
		t.Fatalf("expected matching version to pass: %v", err)
	}

	if err := cfg.CheckPinnedCLIVersion("v1.2.4"); err == nil {
		t.Fatal("expected version mismatch error")
	} else if !strings.Contains(err.Error(), "does not match pinned") {
		t.Fatalf("unexpected error: %v", err)
	}

	empty := I18NConfig{}
	if err := empty.CheckPinnedCLIVersion("v9.9.9"); err != nil {
		t.Fatalf("expected omitted version to skip check: %v", err)
	}

	if err := cfg.CheckPinnedCLIVersion(""); err != nil {
		t.Fatalf("expected unavailable CLI version to skip check: %v", err)
	}
}

func TestInstallerVersionFromConfigFile(t *testing.T) {
	yamlPath := writeConfigFileNamed(t, "i18n.yml", `
version: hyperlocalise@1.2.3 # pinned
locales:
  source: en-US
  targets:
    - es-ES
buckets:
  ui:
    files:
      - from: a
        to: b
llm:
  profiles:
    default:
      provider: openai
      model: x
`)

	got, err := InstallerVersionFromConfigFile(yamlPath)
	if err != nil {
		t.Fatalf("installer version from yaml config: %v", err)
	}
	if got != "1.2.3" {
		t.Fatalf("installer version = %q, want 1.2.3", got)
	}

	jsoncPath := writeConfigFileNamed(t, "i18n.jsonc", `{
  // pinned cli
  "version": "hyperlocalise@2.0.0",
  "locales": {"source": "en-US", "targets": ["es-ES"]},
  "buckets": {"ui": {"files": [{"from": "a", "to": "b"}]}},
  "llm": {"profiles": {"default": {"provider": "openai", "model": "x"}}}
}`)

	got, err = InstallerVersionFromConfigFile(jsoncPath)
	if err != nil {
		t.Fatalf("installer version from jsonc config: %v", err)
	}
	if got != "2.0.0" {
		t.Fatalf("installer version = %q, want 2.0.0", got)
	}
}

func TestLoadForCLIEnforcesPinnedVersion(t *testing.T) {
	path := writeConfigFile(t, `{
	  "version": "hyperlocalise@1.2.3",
	  "locales": {"source": "en-US", "targets": ["es-ES"]},
	  "buckets": {"ui": {"files": [{"from": "a", "to": "b"}]}},
	  "llm": {"profiles": {"default": {"provider": "openai", "model": "x"}}}
	}`)

	SetCLIVersion("v1.2.3")
	t.Cleanup(func() {
		SetCLIVersion("")
	})

	if _, err := LoadForCLI(path); err != nil {
		t.Fatalf("load for cli with matching version: %v", err)
	}

	SetCLIVersion("v1.2.4")
	if _, err := LoadForCLI(path); err == nil {
		t.Fatal("expected pinned version mismatch")
	} else if !strings.Contains(err.Error(), "does not match pinned") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestLoadYAMLVersionField(t *testing.T) {
	path := writeConfigFileNamed(t, "i18n.yml", `
version: hyperlocalise@1.2.3
locales:
  source: en-US
  targets:
    - es-ES
buckets:
  ui:
    files:
      - from: lang/{{source}}.json
        to: lang/{{target}}.json
llm:
  profiles:
    default:
      provider: openai
      model: gpt-4.1-mini
`)

	cfg, err := Load(path)
	if err != nil {
		t.Fatalf("load yaml config with version: %v", err)
	}
	if cfg.Version != "hyperlocalise@1.2.3" {
		t.Fatalf("version = %q, want hyperlocalise@1.2.3", cfg.Version)
	}

	SetCLIVersion("v1.2.3")
	t.Cleanup(func() {
		SetCLIVersion("")
	})

	if _, err := LoadForCLI(path); err != nil {
		t.Fatalf("load yaml config for cli with matching version: %v", err)
	}

	SetCLIVersion("v1.2.4")
	if _, err := LoadForCLI(path); err == nil {
		t.Fatal("expected pinned yaml version mismatch")
	} else if !strings.Contains(err.Error(), "does not match pinned") {
		t.Fatalf("unexpected error: %v", err)
	}
}
