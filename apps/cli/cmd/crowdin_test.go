package cmd

import (
	"bytes"
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/storage"
	crowdinstorage "github.com/hyperlocalise/hyperlocalise/internal/i18n/storage/crowdin"
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

	downloadReq := crowdinstorageRequestDownload(cfg, nil, "  flag-branch  ", false, false, false, false)
	if downloadReq.Config.Branch != "flag-branch" {
		t.Fatalf("download branch = %q, want trimmed flag-branch", downloadReq.Config.Branch)
	}
}

func TestCrowdinDownloadFlagsApplyRequestOptions(t *testing.T) {
	cfg := storage.FileWorkflowConfig{}

	req := crowdinstorageRequestDownload(cfg, []string{"fr"}, "", true, true, true, true)

	if got, want := req.Languages, []string{"fr"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("languages = %#v, want %#v", got, want)
	}
	if req.ExportOverrides.ExportOnlyApproved == nil || !*req.ExportOverrides.ExportOnlyApproved {
		t.Fatalf("export only approved = %#v, want true", req.ExportOverrides.ExportOnlyApproved)
	}
	if req.ExportOverrides.SkipUntranslatedStrings == nil || !*req.ExportOverrides.SkipUntranslatedStrings {
		t.Fatalf("skip untranslated strings = %#v, want true", req.ExportOverrides.SkipUntranslatedStrings)
	}
	if !req.MergeApproved {
		t.Fatalf("merge approved = false, want true")
	}
	if !req.IncludeSources {
		t.Fatalf("include sources = false, want true")
	}
}

func TestCrowdinDownloadFlagsOmitRequestOptionsWhenUnset(t *testing.T) {
	cfg := storage.FileWorkflowConfig{}

	req := crowdinstorageRequestDownload(cfg, nil, "", false, false, false, false)

	if req.ExportOverrides != nil {
		t.Fatalf("export overrides = %#v, want nil", req.ExportOverrides)
	}
	if req.MergeApproved {
		t.Fatalf("merge approved = true, want false")
	}
	if req.IncludeSources {
		t.Fatalf("include sources = true, want false")
	}
}

func TestCrowdinGlossaryDownloadWritesCSVToStdout(t *testing.T) {
	dir := t.TempDir()
	t.Chdir(dir)
	t.Setenv("CROWDIN_PROJECT_ID", "123")
	t.Setenv("CROWDIN_PERSONAL_TOKEN", "secret")

	if err := os.WriteFile(filepath.Join(dir, "crowdin.yml"), []byte(`
project_id: 123
`), 0o644); err != nil {
		t.Fatalf("write crowdin config: %v", err)
	}

	oldFactory := newCrowdinGlossaryCSVWriter
	defer func() {
		newCrowdinGlossaryCSVWriter = oldFactory
	}()
	fake := &fakeCrowdinGlossaryCSVWriter{}
	newCrowdinGlossaryCSVWriter = func(cfg crowdinstorage.Config) (crowdinGlossaryCSVWriter, error) {
		if cfg.ProjectID != "123" || cfg.APIToken != "secret" {
			t.Fatalf("config = %#v, want project/token from crowdin config", cfg)
		}
		return fake, nil
	}

	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetArgs([]string{"crowdin", "glossary", "download", "--glossary-id", "77", "--language", "fr"})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute crowdin glossary download: %v", err)
	}
	if got, want := out.String(), "term\nCheckout\n"; got != want {
		t.Fatalf("output = %q, want %q", got, want)
	}
	if fake.req.GlossaryID != 77 {
		t.Fatalf("glossary id = %d, want 77", fake.req.GlossaryID)
	}
	if got, want := fake.req.Languages, []string{"fr"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("languages = %#v, want %#v", got, want)
	}
}

func TestCrowdinGlossaryDownloadWritesCSVToFile(t *testing.T) {
	dir := t.TempDir()
	t.Chdir(dir)
	t.Setenv("CROWDIN_PROJECT_ID", "123")
	t.Setenv("CROWDIN_PERSONAL_TOKEN", "secret")

	if err := os.WriteFile(filepath.Join(dir, "crowdin.yml"), []byte(`
project_id: 123
`), 0o644); err != nil {
		t.Fatalf("write crowdin config: %v", err)
	}

	oldFactory := newCrowdinGlossaryCSVWriter
	defer func() {
		newCrowdinGlossaryCSVWriter = oldFactory
	}()
	newCrowdinGlossaryCSVWriter = func(crowdinstorage.Config) (crowdinGlossaryCSVWriter, error) {
		return &fakeCrowdinGlossaryCSVWriter{}, nil
	}

	outputPath := filepath.Join(dir, "glossary.csv")
	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetArgs([]string{"crowdin", "glossary", "download", "--glossary-id", "77", "--output", outputPath})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute crowdin glossary download: %v", err)
	}
	content, err := os.ReadFile(outputPath)
	if err != nil {
		t.Fatalf("read output: %v", err)
	}
	if got, want := string(content), "term\nCheckout\n"; got != want {
		t.Fatalf("file = %q, want %q", got, want)
	}
	if !strings.Contains(out.String(), "wrote "+outputPath+" terms=1") {
		t.Fatalf("summary output = %q", out.String())
	}
}

func TestCrowdinGlossaryDownloadRequiresGlossaryID(t *testing.T) {
	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetErr(out)
	cmd.SetArgs([]string{"crowdin", "glossary", "download"})

	err := cmd.Execute()
	if err == nil {
		t.Fatalf("expected missing glossary id error")
	}
	if !strings.Contains(err.Error(), `required flag(s) "glossary-id" not set`) {
		t.Fatalf("error = %v", err)
	}
}

type crowdinFailingWriter struct{}

func (f *crowdinFailingWriter) Write(_ []byte) (int, error) {
	return 0, errors.New("write failed")
}

type fakeCrowdinGlossaryCSVWriter struct {
	req crowdinstorage.GlossaryDownloadRequest
}

func (f *fakeCrowdinGlossaryCSVWriter) WriteGlossaryCSV(_ context.Context, req crowdinstorage.GlossaryDownloadRequest, w io.Writer) (crowdinstorage.GlossaryDownloadResult, error) {
	f.req = req
	if _, err := io.WriteString(w, "term\nCheckout\n"); err != nil {
		return crowdinstorage.GlossaryDownloadResult{}, err
	}
	return crowdinstorage.GlossaryDownloadResult{Terms: 1}, nil
}

func TestCrowdinTranslationMemoryDownloadWritesCSVToStdout(t *testing.T) {
	dir := t.TempDir()
	t.Chdir(dir)
	t.Setenv("CROWDIN_PROJECT_ID", "123")
	t.Setenv("CROWDIN_PERSONAL_TOKEN", "secret")

	if err := os.WriteFile(filepath.Join(dir, "crowdin.yml"), []byte(`
project_id: 123
`), 0o644); err != nil {
		t.Fatalf("write crowdin config: %v", err)
	}

	oldFactory := newCrowdinTranslationMemoryWriter
	defer func() {
		newCrowdinTranslationMemoryWriter = oldFactory
	}()
	fake := &fakeCrowdinTranslationMemoryWriter{}
	newCrowdinTranslationMemoryWriter = func(cfg crowdinstorage.Config) (crowdinTranslationMemoryWriter, error) {
		if cfg.ProjectID != "123" || cfg.APIToken != "secret" {
			t.Fatalf("config = %#v, want project/token from crowdin config", cfg)
		}
		return fake, nil
	}

	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetArgs([]string{"crowdin", "tm", "download", "--tm-id", "44", "--source-language", "en", "--target-language", "fr"})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute crowdin tm download: %v", err)
	}
	if got, want := out.String(), "source_text,target_text\nCheckout,Commander\n"; got != want {
		t.Fatalf("output = %q, want %q", got, want)
	}
	if fake.req.TranslationMemoryID != 44 {
		t.Fatalf("tm id = %d, want 44", fake.req.TranslationMemoryID)
	}
	if fake.req.SourceLanguage != "en" {
		t.Fatalf("source language = %q, want en", fake.req.SourceLanguage)
	}
	if got, want := fake.req.TargetLanguages, []string{"fr"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("target languages = %#v, want %#v", got, want)
	}
}

func TestCrowdinTranslationMemoryDownloadWritesTMXToStdout(t *testing.T) {
	dir := t.TempDir()
	t.Chdir(dir)
	t.Setenv("CROWDIN_PROJECT_ID", "123")
	t.Setenv("CROWDIN_PERSONAL_TOKEN", "secret")

	if err := os.WriteFile(filepath.Join(dir, "crowdin.yml"), []byte(`
project_id: 123
`), 0o644); err != nil {
		t.Fatalf("write crowdin config: %v", err)
	}

	oldFactory := newCrowdinTranslationMemoryWriter
	defer func() { newCrowdinTranslationMemoryWriter = oldFactory }()
	fake := &fakeCrowdinTranslationMemoryWriter{}
	newCrowdinTranslationMemoryWriter = func(crowdinstorage.Config) (crowdinTranslationMemoryWriter, error) {
		return fake, nil
	}

	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetArgs([]string{"crowdin", "tm", "download", "--tm-id", "44", "--source-language", "en", "--target-language", "fr", "--format", "tmx"})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute crowdin tm tmx download: %v", err)
	}
	if !strings.Contains(out.String(), "<tmx version=\"1.4\">") {
		t.Fatalf("output = %q, want TMX", out.String())
	}
	if fake.req.TranslationMemoryID != 44 {
		t.Fatalf("tm id = %d, want 44", fake.req.TranslationMemoryID)
	}
}

func TestCrowdinTranslationMemoryDownloadWritesCSVToFile(t *testing.T) {
	dir := t.TempDir()
	t.Chdir(dir)
	t.Setenv("CROWDIN_PROJECT_ID", "123")
	t.Setenv("CROWDIN_PERSONAL_TOKEN", "secret")

	if err := os.WriteFile(filepath.Join(dir, "crowdin.yml"), []byte(`
project_id: 123
`), 0o644); err != nil {
		t.Fatalf("write crowdin config: %v", err)
	}

	oldFactory := newCrowdinTranslationMemoryWriter
	defer func() {
		newCrowdinTranslationMemoryWriter = oldFactory
	}()
	newCrowdinTranslationMemoryWriter = func(crowdinstorage.Config) (crowdinTranslationMemoryWriter, error) {
		return &fakeCrowdinTranslationMemoryWriter{}, nil
	}

	outputPath := filepath.Join(dir, "tm.csv")
	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetArgs([]string{"crowdin", "translation-memory", "download", "--tm-id", "44", "--source-language", "en", "--target-language", "fr", "--output", outputPath})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute crowdin tm download: %v", err)
	}
	content, err := os.ReadFile(outputPath)
	if err != nil {
		t.Fatalf("read output: %v", err)
	}
	if got, want := string(content), "source_text,target_text\nCheckout,Commander\n"; got != want {
		t.Fatalf("file = %q, want %q", got, want)
	}
	if !strings.Contains(out.String(), "wrote "+outputPath+" rows=1 segments=1") {
		t.Fatalf("summary output = %q", out.String())
	}
}

func TestCrowdinTranslationMemoryDownloadRequiresInputs(t *testing.T) {
	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetErr(out)
	cmd.SetArgs([]string{"crowdin", "tm", "download"})

	err := cmd.Execute()
	if err == nil {
		t.Fatalf("expected missing tm input error")
	}
	if !strings.Contains(err.Error(), `required flag(s)`) || !strings.Contains(err.Error(), `"tm-id"`) {
		t.Fatalf("error = %v", err)
	}
}

func TestCrowdinTranslationMemoryDownloadPreservesExistingFileOnError(t *testing.T) {
	dir := t.TempDir()
	t.Chdir(dir)
	t.Setenv("CROWDIN_PROJECT_ID", "123")
	t.Setenv("CROWDIN_PERSONAL_TOKEN", "secret")

	if err := os.WriteFile(filepath.Join(dir, "crowdin.yml"), []byte(`
project_id: 123
`), 0o644); err != nil {
		t.Fatalf("write crowdin config: %v", err)
	}

	oldFactory := newCrowdinTranslationMemoryWriter
	defer func() {
		newCrowdinTranslationMemoryWriter = oldFactory
	}()
	newCrowdinTranslationMemoryWriter = func(crowdinstorage.Config) (crowdinTranslationMemoryWriter, error) {
		return &fakeCrowdinTranslationMemoryWriter{err: errors.New("api failed")}, nil
	}

	outputPath := filepath.Join(dir, "tm.csv")
	if err := os.WriteFile(outputPath, []byte("existing csv\n"), 0o644); err != nil {
		t.Fatalf("write existing output: %v", err)
	}

	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetArgs([]string{"crowdin", "tm", "download", "--tm-id", "44", "--source-language", "en", "--target-language", "fr", "--output", outputPath})

	err := cmd.Execute()
	if err == nil || !strings.Contains(err.Error(), "api failed") {
		t.Fatalf("error = %v, want api failed", err)
	}
	content, err := os.ReadFile(outputPath)
	if err != nil {
		t.Fatalf("read existing output: %v", err)
	}
	if got, want := string(content), "existing csv\n"; got != want {
		t.Fatalf("file = %q, want preserved %q", got, want)
	}
}

type fakeCrowdinTranslationMemoryWriter struct {
	req crowdinstorage.TranslationMemoryDownloadRequest
	err error
}

func (f *fakeCrowdinTranslationMemoryWriter) WriteTranslationMemoryCSV(_ context.Context, req crowdinstorage.TranslationMemoryDownloadRequest, w io.Writer) (crowdinstorage.TranslationMemoryDownloadResult, error) {
	f.req = req
	if f.err != nil {
		return crowdinstorage.TranslationMemoryDownloadResult{}, f.err
	}
	if _, err := io.WriteString(w, "source_text,target_text\nCheckout,Commander\n"); err != nil {
		return crowdinstorage.TranslationMemoryDownloadResult{}, err
	}
	return crowdinstorage.TranslationMemoryDownloadResult{Rows: 1, Segments: 1}, nil
}

func (f *fakeCrowdinTranslationMemoryWriter) WriteTranslationMemoryTMX(_ context.Context, req crowdinstorage.TranslationMemoryDownloadRequest, w io.Writer) (crowdinstorage.TranslationMemoryDownloadResult, error) {
	f.req = req
	if f.err != nil {
		return crowdinstorage.TranslationMemoryDownloadResult{}, f.err
	}
	if _, err := io.WriteString(w, "<?xml version=\"1.0\" encoding=\"UTF-8\"?><tmx version=\"1.4\"><body></body></tmx>"); err != nil {
		return crowdinstorage.TranslationMemoryDownloadResult{}, err
	}
	return crowdinstorage.TranslationMemoryDownloadResult{Segments: 1}, nil
}
