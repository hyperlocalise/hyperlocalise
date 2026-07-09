package cmd

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/translationfileparser"
)

func TestExportCommandReconstructsMarkdown(t *testing.T) {
	dir := t.TempDir()
	sourcePath := filepath.Join(dir, "hello.md")
	prefilledPath := filepath.Join(dir, "prefilled.json")
	outputPath := filepath.Join(dir, "hello-de.md")
	sourceMarkdown := "# Hello\n\nWorld.\n"
	if err := os.WriteFile(sourcePath, []byte(sourceMarkdown), 0o644); err != nil {
		t.Fatalf("write source: %v", err)
	}

	entries, err := (translationfileparser.MarkdownParser{}).Parse([]byte(sourceMarkdown))
	if err != nil {
		t.Fatalf("parse markdown: %v", err)
	}
	prefilled := map[string]string{}
	for key, value := range entries {
		prefilled[key] = strings.ReplaceAll(value, "World", "Welt")
	}
	prefilledRaw, err := json.Marshal(prefilled)
	if err != nil {
		t.Fatalf("marshal prefilled: %v", err)
	}
	if err := os.WriteFile(prefilledPath, prefilledRaw, 0o644); err != nil {
		t.Fatalf("write prefilled: %v", err)
	}

	cmd := newRootCmd("test")
	cmd.SetArgs([]string{
		"export",
		"--source", sourcePath,
		"--target", outputPath,
		"--prefilled", prefilledPath,
		"--source-locale", "en-US",
		"--target-locale", "de-DE",
		"--project-root", dir,
		"--output", outputPath,
	})
	if err := cmd.Execute(); err != nil {
		t.Fatalf("export command: %v", err)
	}

	content, err := os.ReadFile(outputPath)
	if err != nil {
		t.Fatalf("read output: %v", err)
	}
	if !strings.Contains(string(content), "Welt") {
		t.Fatalf("output = %q, want translated markdown", string(content))
	}
}
