package cmd

import (
	"bytes"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/storage"
	"github.com/spf13/cobra"
)

func TestCrowdinInitWritesTemplate(t *testing.T) {
	t.Chdir(t.TempDir())

	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetArgs([]string{"crowdin", "init"})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute crowdin init: %v", err)
	}
	if _, err := os.Stat("crowdin.yml"); err != nil {
		t.Fatalf("expected crowdin.yml to exist: %v", err)
	}
	if !strings.Contains(out.String(), "wrote crowdin.yml") {
		t.Fatalf("unexpected output: %q", out.String())
	}
}

func TestCrowdinConfigValidate(t *testing.T) {
	dir := t.TempDir()
	t.Chdir(dir)
	t.Setenv("CROWDIN_PROJECT_ID", "123")
	t.Setenv("CROWDIN_PERSONAL_TOKEN", "secret")

	if err := os.WriteFile(filepath.Join(dir, "crowdin.yml"), []byte(`
files:
  - source: /src/*.json
    translation: /dist/%locale%/%original_file_name%
`), 0o644); err != nil {
		t.Fatalf("write crowdin config: %v", err)
	}

	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetArgs([]string{"crowdin", "config", "validate"})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute crowdin config validate: %v", err)
	}
	if !strings.Contains(out.String(), "files=1") {
		t.Fatalf("unexpected output: %q", out.String())
	}
}

func TestCrowdinConfigValidateFailsClosedOnUnsupportedField(t *testing.T) {
	dir := t.TempDir()
	t.Chdir(dir)
	t.Setenv("CROWDIN_PROJECT_ID", "123")
	t.Setenv("CROWDIN_PERSONAL_TOKEN", "secret")

	if err := os.WriteFile(filepath.Join(dir, "crowdin.yml"), []byte(`
unsupported_top_level: true
files:
  - source: /src/*.json
    translation: /dist/%locale%/%original_file_name%
`), 0o644); err != nil {
		t.Fatalf("write crowdin config: %v", err)
	}

	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetErr(out)
	cmd.SetArgs([]string{"crowdin", "config", "validate"})

	err := cmd.Execute()
	if err == nil {
		t.Fatalf("expected validation failure")
	}
	if !strings.Contains(err.Error(), "decode crowdin config") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestCrowdinConfigValidateUsesExplicitIdentityPath(t *testing.T) {
	dir := t.TempDir()
	t.Chdir(dir)

	if err := os.WriteFile(filepath.Join(dir, "crowdin.yml"), []byte(`
files:
  - source: /src/*.json
    translation: /dist/%locale%/%original_file_name%
`), 0o644); err != nil {
		t.Fatalf("write crowdin config: %v", err)
	}
	identityPath := filepath.Join(dir, "identity.yml")
	if err := os.WriteFile(identityPath, []byte(`
project_id: 456
api_token: identity-secret
`), 0o644); err != nil {
		t.Fatalf("write identity config: %v", err)
	}

	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetArgs([]string{"crowdin", "config", "validate", "--identity", identityPath})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute crowdin config validate: %v", err)
	}
	if !strings.Contains(out.String(), "files=1") {
		t.Fatalf("unexpected output: %q", out.String())
	}
}

func TestWriteCrowdinResultErrorPrefersOperationError(t *testing.T) {
	cmd := &cobra.Command{}
	cmd.SetOut(&crowdinFailingWriter{})

	opErr := errors.New("upload failed")
	err := writeCrowdinResultError(cmd, "upload-sources", storage.FileOperationResult{}, opErr)
	if !errors.Is(err, opErr) {
		t.Fatalf("expected operation error, got %v", err)
	}
}

func TestWriteCrowdinResultErrorReturnsWriteErrorWhenOperationSucceeds(t *testing.T) {
	cmd := &cobra.Command{}
	cmd.SetOut(&crowdinFailingWriter{})

	err := writeCrowdinResultError(cmd, "upload-sources", storage.FileOperationResult{}, nil)
	if err == nil || err.Error() != "write failed" {
		t.Fatalf("expected write error, got %v", err)
	}
}

func TestCrowdinBranchOverrideAppliesToRequests(t *testing.T) {
	cfg := storage.FileWorkflowConfig{Branch: "config-branch"}

	sourceReq := crowdinstorageRequestSources(cfg, "flag-branch")
	if sourceReq.Config.Branch != "flag-branch" {
		t.Fatalf("source branch = %q, want flag-branch", sourceReq.Config.Branch)
	}

	translationsReq := crowdinstorageRequestTranslations(cfg, nil, "")
	if translationsReq.Config.Branch != "config-branch" {
		t.Fatalf("translation branch = %q, want config-branch", translationsReq.Config.Branch)
	}

	downloadReq := crowdinstorageRequestDownload(cfg, nil, "  flag-branch  ")
	if downloadReq.Config.Branch != "flag-branch" {
		t.Fatalf("download branch = %q, want trimmed flag-branch", downloadReq.Config.Branch)
	}
}

type crowdinFailingWriter struct{}

func (f *crowdinFailingWriter) Write(_ []byte) (int, error) {
	return 0, errors.New("write failed")
}
