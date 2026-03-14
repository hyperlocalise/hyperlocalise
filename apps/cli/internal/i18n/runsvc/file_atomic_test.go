package runsvc

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestWriteBytesAtomicCreatesDirectories(t *testing.T) {
	path := filepath.Join(t.TempDir(), "nested", "dir", "out.json")
	if err := writeBytesAtomic(path, []byte("first")); err != nil {
		t.Fatalf("write bytes atomic: %v", err)
	}
	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read output file: %v", err)
	}
	if string(content) != "first" {
		t.Fatalf("content mismatch: %q", content)
	}
}

func TestWriteBytesAtomicOverwrites(t *testing.T) {
	path := filepath.Join(t.TempDir(), "out.txt")
	if err := os.WriteFile(path, []byte("old"), 0o644); err != nil {
		t.Fatalf("seed old file: %v", err)
	}
	if err := writeBytesAtomic(path, []byte("new")); err != nil {
		t.Fatalf("atomic overwrite: %v", err)
	}
	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read output file: %v", err)
	}
	if string(content) != "new" {
		t.Fatalf("content mismatch: %q", content)
	}
}

func TestWriteBytesAtomicRenameFailureCleansTempFile(t *testing.T) {
	dir := t.TempDir()
	targetDirPath := filepath.Join(dir, "target-dir")
	if err := os.MkdirAll(targetDirPath, 0o755); err != nil {
		t.Fatalf("mkdir target dir: %v", err)
	}

	err := writeBytesAtomic(targetDirPath, []byte("new"))
	if err == nil {
		t.Fatalf("expected rename failure when target path is a directory")
	}

	entries, readErr := os.ReadDir(dir)
	if readErr != nil {
		t.Fatalf("readdir: %v", readErr)
	}
	prefix := filepath.Base(targetDirPath) + ".tmp."
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), prefix) {
			t.Fatalf("expected temp file cleanup, found %q", entry.Name())
		}
	}
}
