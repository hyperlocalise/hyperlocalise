package runsvc

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestExportPrefilledTargetReconstructsMarkdown(t *testing.T) {
	dir := t.TempDir()
	sourcePath := filepath.Join(dir, "_posts", "en", "hello.md")
	targetPath := filepath.Join(dir, "_posts", "de-DE", "hello.md")
	sourceMarkdown := "# Hello\n\nWorld.\n"
	if err := os.MkdirAll(filepath.Dir(sourcePath), 0o755); err != nil {
		t.Fatalf("mkdir source dir: %v", err)
	}
	if err := os.WriteFile(sourcePath, []byte(sourceMarkdown), 0o644); err != nil {
		t.Fatalf("write source markdown: %v", err)
	}

	entries, err := New().newParser().Parse(sourcePath, []byte(sourceMarkdown))
	if err != nil {
		t.Fatalf("parse markdown: %v", err)
	}
	prefilled := map[string]string{}
	for key, value := range entries {
		prefilled[key] = strings.ReplaceAll(value, "World", "Welt")
	}

	content, err := ExportPrefilledTarget(ExportInput{
		TargetPath:   targetPath,
		SourcePath:   sourcePath,
		SourceLocale: "en-US",
		TargetLocale: "de-DE",
		Prefilled:    prefilled,
		ProjectRoot:  dir,
	})
	if err != nil {
		t.Fatalf("ExportPrefilledTarget: %v", err)
	}
	if strings.Contains(string(content), `"md.`) {
		t.Fatalf("expected markdown output, got JSON-like content: %q", string(content))
	}
	if !strings.Contains(string(content), "Welt") {
		t.Fatalf("content = %q, want translated markdown", string(content))
	}
}

func TestExportPrefilledTargetReconstructsEmptyPrefilledMarkdown(t *testing.T) {
	dir := t.TempDir()
	sourcePath := filepath.Join(dir, "_posts", "en", "hello.md")
	targetPath := filepath.Join(dir, "_posts", "de-DE", "hello.md")
	sourceMarkdown := "# Hello\n\nWorld.\n"
	if err := os.MkdirAll(filepath.Dir(sourcePath), 0o755); err != nil {
		t.Fatalf("mkdir source dir: %v", err)
	}
	if err := os.WriteFile(sourcePath, []byte(sourceMarkdown), 0o644); err != nil {
		t.Fatalf("write source markdown: %v", err)
	}

	content, err := ExportPrefilledTarget(ExportInput{
		TargetPath:   targetPath,
		SourcePath:   sourcePath,
		SourceLocale: "en-US",
		TargetLocale: "de-DE",
		Prefilled:    map[string]string{},
		ProjectRoot:  dir,
	})
	if err != nil {
		t.Fatalf("ExportPrefilledTarget: %v", err)
	}
	if strings.Contains(string(content), `"md.`) {
		t.Fatalf("expected markdown output, got JSON-like content: %q", string(content))
	}
	if string(content) != sourceMarkdown {
		t.Fatalf("content = %q, want source markdown template %q", string(content), sourceMarkdown)
	}
}

func TestExportPrefilledTargetRejectsBrokenExistingMarkdownLinks(t *testing.T) {
	dir := t.TempDir()
	sourcePath := filepath.Join(dir, "_posts", "en", "cat.md")
	targetPath := filepath.Join(dir, "_posts", "vi-VN", "cat.md")
	sourceMarkdown := "Need a [next-generation CAT tool](/product/next-gen-cat-tool) today.\n"
	brokenTarget := "Cần một công cụ CAT thế hệ mới](/product/next-gen-cat-tool) ngay.\n"
	if err := os.MkdirAll(filepath.Dir(sourcePath), 0o755); err != nil {
		t.Fatalf("mkdir source dir: %v", err)
	}
	if err := os.MkdirAll(filepath.Dir(targetPath), 0o755); err != nil {
		t.Fatalf("mkdir target dir: %v", err)
	}
	if err := os.WriteFile(sourcePath, []byte(sourceMarkdown), 0o644); err != nil {
		t.Fatalf("write source markdown: %v", err)
	}
	if err := os.WriteFile(targetPath, []byte(brokenTarget), 0o644); err != nil {
		t.Fatalf("write broken target markdown: %v", err)
	}

	content, err := ExportPrefilledTarget(ExportInput{
		TargetPath:   targetPath,
		SourcePath:   sourcePath,
		SourceLocale: "en-US",
		TargetLocale: "vi-VN",
		Prefilled:    map[string]string{},
		ProjectRoot:  dir,
	})
	if err != nil {
		t.Fatalf("ExportPrefilledTarget: %v", err)
	}
	if strings.Contains(string(content), "thế hệ mới](/product") {
		t.Fatalf("expected orphan closer not preserved, got %q", content)
	}
	if !strings.Contains(string(content), "[next-generation CAT tool](/product/next-gen-cat-tool)") {
		t.Fatalf("expected source fallback with valid link, got %q", content)
	}
	if strings.ContainsRune(string(content), '\x1e') || strings.Contains(string(content), "HLMDPH_") {
		t.Fatalf("expected no leaked HLMDPH sentinels, got %q", content)
	}
}
