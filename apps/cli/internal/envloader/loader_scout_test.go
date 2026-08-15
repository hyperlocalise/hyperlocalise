package envloader

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLoadFilesInDir_DirectoryError(t *testing.T) {
	dir := t.TempDir()
	envDir := filepath.Join(dir, ".env")
	if err := os.MkdirAll(envDir, 0o755); err != nil {
		t.Fatalf("failed to create directory .env: %v", err)
	}

	err := LoadFilesInDir(dir)
	if err == nil {
		t.Fatalf("expected error when .env is a directory, got nil")
	}

	if !strings.Contains(err.Error(), "must be a file") {
		t.Errorf("expected error to contain %q, got: %v", "must be a file", err)
	}
}

func TestLoadFilesInDir_MalformedSyntax(t *testing.T) {
	dir := t.TempDir()
	// gotenv returns an error for double quotes without closing quote
	mustWriteFile(t, filepath.Join(dir, ".env"), "INVALID_VAR=\"unclosed quote\n")

	err := LoadFilesInDir(dir)
	if err == nil {
		t.Fatalf("expected error when parsing malformed .env, got nil")
	}

	if !strings.Contains(err.Error(), "parse env file") {
		t.Errorf("expected error to contain %q, got: %v", "parse env file", err)
	}
}

func TestLoadFilesInDir_ComplexValuesAndComments(t *testing.T) {
	dir := t.TempDir()
	content := `# Comment line
EXPORTED_KEY="value=with=equals"
EMPTY_KEY=
QUOTED_KEY="hello world"
`
	mustWriteFile(t, filepath.Join(dir, ".env"), content)

	withUnsetEnv(t, "EXPORTED_KEY")
	withUnsetEnv(t, "EMPTY_KEY")
	withUnsetEnv(t, "QUOTED_KEY")

	if err := LoadFilesInDir(dir); err != nil {
		t.Fatalf("unexpected error loading env files: %v", err)
	}

	if got := os.Getenv("EXPORTED_KEY"); got != "value=with=equals" {
		t.Errorf("EXPORTED_KEY: got %q, want %q", got, "value=with=equals")
	}
	if got := os.Getenv("EMPTY_KEY"); got != "" {
		t.Errorf("EMPTY_KEY: got %q, want %q", got, "")
	}
	if got := os.Getenv("QUOTED_KEY"); got != "hello world" {
		t.Errorf("QUOTED_KEY: got %q, want %q", got, "hello world")
	}
}

func TestLoadProjectFiles_Success(t *testing.T) {
	dir := t.TempDir()
	mustWriteFile(t, filepath.Join(dir, ".env"), "PROJECT_ENV_TEST_VAR=scout-test-value\n")

	origCwd, err := os.Getwd()
	if err != nil {
		t.Fatalf("failed to get current working directory: %v", err)
	}

	if err := os.Chdir(dir); err != nil {
		t.Fatalf("failed to chdir to temp dir: %v", err)
	}
	t.Cleanup(func() {
		_ = os.Chdir(origCwd)
	})

	withUnsetEnv(t, "PROJECT_ENV_TEST_VAR")

	if err := LoadProjectFiles(); err != nil {
		t.Fatalf("LoadProjectFiles returned unexpected error: %v", err)
	}

	if got := os.Getenv("PROJECT_ENV_TEST_VAR"); got != "scout-test-value" {
		t.Errorf("PROJECT_ENV_TEST_VAR: got %q, want %q", got, "scout-test-value")
	}
}
