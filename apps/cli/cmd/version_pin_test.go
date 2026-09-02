package cmd

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	config "github.com/hyperlocalise/hyperlocalise/pkg/i18nconfig"
)

func TestStatusCommandRejectsPinnedVersionMismatch(t *testing.T) {
	dir := t.TempDir()
	configPath := filepath.Join(dir, "i18n.yml")
	content := `
version: hyperlocalise@1.2.3
locales:
  source: en
  targets:
    - fr
buckets:
  ui:
    files:
      - from: ui.json
        to: lang/[locale].json
groups:
  default:
    targets:
      - fr
    buckets:
      - ui
llm:
  profiles:
    default:
      provider: openai
      model: gpt-4.1-mini
      prompt: Translate
`
	if err := os.WriteFile(configPath, []byte(content), 0o600); err != nil {
		t.Fatalf("write config: %v", err)
	}

	config.SetCLIVersion("v1.2.4")
	t.Cleanup(func() {
		config.SetCLIVersion("")
	})

	cmd := newRootCmd("v1.2.4")
	cmd.SetArgs([]string{"status", "--config", configPath})
	err := cmd.Execute()
	if err == nil {
		t.Fatal("expected pinned version mismatch")
	}
	if !strings.Contains(err.Error(), "does not match pinned") {
		t.Fatalf("unexpected error: %v", err)
	}
}
