package runsvc

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	config "github.com/hyperlocalise/hyperlocalise/pkg/i18nconfig"
)

func TestRunRejectsPinnedCLIVersionMismatch(t *testing.T) {
	projectDir := t.TempDir()
	sourcePath := filepath.Join(projectDir, "en", "messages.json")
	if err := os.MkdirAll(filepath.Dir(sourcePath), 0o755); err != nil {
		t.Fatalf("mkdir source dir: %v", err)
	}
	if err := os.WriteFile(sourcePath, []byte(`{"hello":"Hello"}`), 0o644); err != nil {
		t.Fatalf("write source file: %v", err)
	}

	configPath := filepath.Join(projectDir, "i18n.yml")
	content := `
version: hyperlocalise@1.2.3
locales:
  source: en
  targets:
    - fr
buckets:
  ui:
    files:
      - from: "{{source}}/messages.json"
        to: "{{target}}/messages.json"
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
`
	if err := os.WriteFile(configPath, []byte(content), 0o644); err != nil {
		t.Fatalf("write config: %v", err)
	}

	config.SetCLIVersion("v1.2.4")
	t.Cleanup(func() {
		config.SetCLIVersion("")
	})

	svc := newTestService()
	svc.loadConfig = config.LoadForCLI
	svc.readFile = os.ReadFile

	_, err := svc.Run(context.Background(), Input{ConfigPath: configPath, DryRun: true})
	if err == nil {
		t.Fatal("expected pinned version mismatch")
	}
	if !strings.Contains(err.Error(), "does not match pinned") {
		t.Fatalf("unexpected error: %v", err)
	}
}
