package runsvc

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	config "github.com/hyperlocalise/hyperlocalise/pkg/i18nconfig"
)

func TestRunRejectsSourceLocaleSymlinkEscapeAfterPlaceholderResolution(t *testing.T) {
	projectDir := t.TempDir()
	outsideDir := t.TempDir()
	outsideSourceDir := filepath.Join(outsideDir, "en")
	if err := os.MkdirAll(outsideSourceDir, 0o755); err != nil {
		t.Fatalf("mkdir outside source: %v", err)
	}
	if err := os.WriteFile(filepath.Join(outsideSourceDir, "messages.json"), []byte(`{"hello":"Hello"}`), 0o644); err != nil {
		t.Fatalf("write outside source: %v", err)
	}
	if err := os.Symlink(outsideSourceDir, filepath.Join(projectDir, "en")); err != nil {
		t.Skipf("symlink unavailable: %v", err)
	}

	configPath := writeRuntimePathSecurityConfig(t, projectDir)
	svc := newTestService()
	svc.loadConfig = config.Load
	svc.readFile = os.ReadFile

	_, err := svc.Run(context.Background(), Input{ConfigPath: configPath, DryRun: true})
	if err == nil {
		t.Fatalf("expected source symlink escape to be rejected")
	}
	if !strings.Contains(err.Error(), "escapes root") {
		t.Fatalf("error = %v, want root escape rejection", err)
	}
}

func TestRunRejectsTargetLocaleSymlinkEscapeAfterPlaceholderResolution(t *testing.T) {
	projectDir := t.TempDir()
	sourceDir := filepath.Join(projectDir, "en")
	if err := os.MkdirAll(sourceDir, 0o755); err != nil {
		t.Fatalf("mkdir source: %v", err)
	}
	if err := os.WriteFile(filepath.Join(sourceDir, "messages.json"), []byte(`{"hello":"Hello"}`), 0o644); err != nil {
		t.Fatalf("write source: %v", err)
	}

	outsideDir := t.TempDir()
	outsideTargetDir := filepath.Join(outsideDir, "fr")
	if err := os.MkdirAll(outsideTargetDir, 0o755); err != nil {
		t.Fatalf("mkdir outside target: %v", err)
	}
	if err := os.Symlink(outsideTargetDir, filepath.Join(projectDir, "fr")); err != nil {
		t.Skipf("symlink unavailable: %v", err)
	}

	configPath := writeRuntimePathSecurityConfig(t, projectDir)
	svc := newTestService()
	svc.loadConfig = config.Load
	svc.readFile = os.ReadFile

	_, err := svc.Run(context.Background(), Input{ConfigPath: configPath, DryRun: true})
	if err == nil {
		t.Fatalf("expected target symlink escape to be rejected")
	}
	if !strings.Contains(err.Error(), "escapes root") {
		t.Fatalf("error = %v, want root escape rejection", err)
	}
}

func writeRuntimePathSecurityConfig(t *testing.T, projectDir string) string {
	t.Helper()
	configPath := filepath.Join(projectDir, "i18n.yml")
	content := `
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
    targets: [fr]
    buckets: [ui]
llm:
  profiles:
    default:
      provider: openai
      model: gpt-4.1-mini
`
	if err := os.WriteFile(configPath, []byte(content), 0o644); err != nil {
		t.Fatalf("write config: %v", err)
	}
	return configPath
}
