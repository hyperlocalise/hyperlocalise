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

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/storage/lokalise"
)

func TestLokaliseGlossaryDownloadWritesCSVToStdout(t *testing.T) {
	t.Chdir(t.TempDir())
	t.Setenv("LOKALISE_API_TOKEN", "secret")

	oldFactory := newLokaliseGlossaryCSVWriter
	defer func() {
		newLokaliseGlossaryCSVWriter = oldFactory
	}()
	fake := &fakeLokaliseGlossaryCSVWriter{}
	var gotCfg lokalise.Config
	newLokaliseGlossaryCSVWriter = func(cfg lokalise.Config) (lokaliseGlossaryCSVWriter, error) {
		gotCfg = cfg
		return fake, nil
	}

	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetErr(out)
	cmd.SetArgs([]string{"lokalise", "glossary", "download", "--project-id", "proj-1", "--language", "fr"})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute lokalise glossary download: %v", err)
	}
	if gotCfg.ProjectID != "proj-1" || gotCfg.APIToken != "secret" {
		t.Fatalf("config = %+v, want project/token resolved", gotCfg)
	}
	if fake.req.ProjectID != "proj-1" {
		t.Fatalf("request = %+v, want project", fake.req)
	}
	if strings.Join(fake.req.Locales, ",") != "fr" {
		t.Fatalf("locales = %v, want fr", fake.req.Locales)
	}
	if got := out.String(); got != "term;description\nCheckout;CTA\n" {
		t.Fatalf("output = %q", got)
	}
}

func TestLokaliseGlossaryDownloadWritesCSVToFile(t *testing.T) {
	t.Chdir(t.TempDir())
	t.Setenv("LOKALISE_API_TOKEN", "secret")

	oldFactory := newLokaliseGlossaryCSVWriter
	defer func() {
		newLokaliseGlossaryCSVWriter = oldFactory
	}()
	newLokaliseGlossaryCSVWriter = func(lokalise.Config) (lokaliseGlossaryCSVWriter, error) {
		return &fakeLokaliseGlossaryCSVWriter{}, nil
	}

	outputPath := filepath.Join(t.TempDir(), "glossary.csv")
	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetErr(out)
	cmd.SetArgs([]string{"lokalise", "glossary", "download", "--project-id", "proj-1", "--output", outputPath})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute lokalise glossary download: %v", err)
	}
	content, err := os.ReadFile(outputPath)
	if err != nil {
		t.Fatalf("read output file: %v", err)
	}
	if got := string(content); !strings.Contains(got, "Checkout;CTA") {
		t.Fatalf("unexpected file content: %q", got)
	}
	if !strings.Contains(out.String(), "terms=1 rows=1") {
		t.Fatalf("unexpected summary: %q", out.String())
	}
}

func TestLokaliseGlossaryDownloadPreservesExistingFileOnError(t *testing.T) {
	t.Chdir(t.TempDir())
	t.Setenv("LOKALISE_API_TOKEN", "secret")

	oldFactory := newLokaliseGlossaryCSVWriter
	defer func() {
		newLokaliseGlossaryCSVWriter = oldFactory
	}()
	newLokaliseGlossaryCSVWriter = func(lokalise.Config) (lokaliseGlossaryCSVWriter, error) {
		return &fakeLokaliseGlossaryCSVWriter{err: errors.New("api failed")}, nil
	}

	outputPath := filepath.Join(t.TempDir(), "glossary.csv")
	if err := os.WriteFile(outputPath, []byte("existing glossary\n"), 0o644); err != nil {
		t.Fatalf("write existing output: %v", err)
	}
	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetErr(out)
	cmd.SetArgs([]string{"lokalise", "glossary", "download", "--project-id", "proj-1", "--output", outputPath})

	err := cmd.Execute()
	if err == nil {
		t.Fatalf("expected command error")
	}
	content, readErr := os.ReadFile(outputPath)
	if readErr != nil {
		t.Fatalf("read output file: %v", readErr)
	}
	if got, want := string(content), "existing glossary\n"; got != want {
		t.Fatalf("output file = %q, want %q", got, want)
	}
}

func TestLokaliseGlossaryDownloadRequiresProjectIDOrConfig(t *testing.T) {
	t.Chdir(t.TempDir())
	t.Setenv("LOKALISE_API_TOKEN", "secret")

	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetErr(out)
	cmd.SetArgs([]string{"lokalise", "glossary", "download"})

	err := cmd.Execute()
	if err == nil {
		t.Fatalf("expected missing project error")
	}
	if !strings.Contains(err.Error(), "--project-id is required") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestLokaliseUploadSourcesDryRunValidatesFiles(t *testing.T) {
	dir := t.TempDir()
	sourcePath := filepath.Join(dir, "en.json")
	if err := os.WriteFile(sourcePath, []byte(`{"hello":"Hello"}`), 0o644); err != nil {
		t.Fatalf("write source file: %v", err)
	}
	t.Setenv("LOKALISE_API_TOKEN", "")

	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetArgs([]string{"lokalise", "upload", "sources", "--project-id", "project-1", "--source-locale", "en", "--file", sourcePath, "--dry-run"})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute lokalise upload dry-run: %v", err)
	}
	if !strings.Contains(out.String(), "dry-run action=lokalise-upload-sources") || !strings.Contains(out.String(), "files=1") {
		t.Fatalf("unexpected output: %q", out.String())
	}
}

func TestLokaliseUploadSourcesRequiresFile(t *testing.T) {
	t.Setenv("LOKALISE_API_TOKEN", "secret")

	cmd := newRootCmd("")
	cmd.SetArgs([]string{"lokalise", "upload", "sources", "--project-id", "project-1", "--source-locale", "en"})

	err := cmd.Execute()
	if err == nil {
		t.Fatalf("expected missing file error")
	}
	if !strings.Contains(err.Error(), "at least one --file is required") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestLokaliseUploadSourcesRequiresFormatForExtensionlessFile(t *testing.T) {
	dir := t.TempDir()
	sourcePath := filepath.Join(dir, "source")
	if err := os.WriteFile(sourcePath, []byte(`hello=Hello`), 0o644); err != nil {
		t.Fatalf("write source file: %v", err)
	}
	t.Setenv("LOKALISE_API_TOKEN", "secret")

	cmd := newRootCmd("")
	cmd.SetArgs([]string{"lokalise", "upload", "sources", "--project-id", "project-1", "--source-locale", "en", "--file", sourcePath, "--dry-run"})

	err := cmd.Execute()
	if err == nil || !strings.Contains(err.Error(), "use --format") {
		t.Fatalf("error = %v, want format hint", err)
	}
}

func TestLokaliseUploadSourcesTokenErrorListsEnv(t *testing.T) {
	dir := t.TempDir()
	sourcePath := filepath.Join(dir, "en.json")
	if err := os.WriteFile(sourcePath, []byte(`{"hello":"Hello"}`), 0o644); err != nil {
		t.Fatalf("write source file: %v", err)
	}
	t.Setenv("LOKALISE_API_TOKEN", "")

	cmd := newRootCmd("")
	cmd.SetArgs([]string{"lokalise", "upload", "sources", "--project-id", "project-1", "--source-locale", "en", "--file", sourcePath})

	err := cmd.Execute()
	if err == nil || !strings.Contains(err.Error(), "LOKALISE_API_TOKEN") {
		t.Fatalf("error = %v, want token env hint", err)
	}
}

func TestLokaliseUploadSourcesUploadsFiles(t *testing.T) {
	dir := t.TempDir()
	sourcePath := filepath.Join(dir, "en.json")
	if err := os.WriteFile(sourcePath, []byte(`{"hello":"Hello"}`), 0o644); err != nil {
		t.Fatalf("write source file: %v", err)
	}
	t.Setenv("LOKALISE_TEST_TOKEN", "secret")

	oldFactory := newLokaliseSourceUploader
	defer func() {
		newLokaliseSourceUploader = oldFactory
	}()
	fake := &fakeLokaliseSourceUploader{}
	newLokaliseSourceUploader = func(cfg lokalise.Config) (lokaliseSourceUploader, error) {
		if cfg.ProjectID != "project-1" || cfg.APIToken != "secret" {
			t.Fatalf("config = %#v, want project/token from flags and env", cfg)
		}
		return fake, nil
	}

	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetArgs([]string{"lokalise", "upload", "sources", "--project-id", "project-1", "--source-locale", "en", "--file", sourcePath, "--format", "json", "--branch", "main", "--tag", "app,source", "--token-env", "LOKALISE_TEST_TOKEN", "--convert-placeholders", "--replace-modified"})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute lokalise upload: %v", err)
	}
	if !strings.Contains(out.String(), "uploaded file="+sourcePath+" process_id=proc-1 status=queued type=file-import") {
		t.Fatalf("missing upload output: %q", out.String())
	}
	if !strings.Contains(out.String(), "action=lokalise-upload-sources processed=1") {
		t.Fatalf("missing summary output: %q", out.String())
	}
	if len(fake.inputs) != 1 {
		t.Fatalf("inputs = %#v, want one upload", fake.inputs)
	}
	input := fake.inputs[0]
	if input.ProjectID != "project-1" || input.SourceLocale != "en" || input.FilePath != sourcePath || input.FileFormat != "json" || input.Branch != "main" {
		t.Fatalf("input = %#v, want CLI values", input)
	}
	if !reflect.DeepEqual(input.Tags, []string{"app", "source"}) {
		t.Fatalf("tags = %#v, want parsed CLI tags", input.Tags)
	}
	if !input.ConvertPlaceholders || !input.ReplaceModified {
		t.Fatalf("options not passed through: %#v", input)
	}
}

func TestLokaliseUploadSourcesUsesStorageConfig(t *testing.T) {
	dir := t.TempDir()
	sourcePath := filepath.Join(dir, "en.json")
	if err := os.WriteFile(sourcePath, []byte(`{"hello":"Hello"}`), 0o644); err != nil {
		t.Fatalf("write source file: %v", err)
	}
	t.Setenv("LOKALISE_TEST_TOKEN", "secret")

	configPath := filepath.Join(dir, "i18n.yml")
	if err := os.WriteFile(configPath, []byte(`
locales:
  source: en
  targets:
    - fr
buckets:
  ui:
    files:
      - from: content/en.json
        to: dist/{{target}}.json
llm:
  profiles:
    default:
      provider: openai
      model: test
storage:
  adapter: lokalise
  config:
    projectID: project-from-config
    apiTokenEnv: LOKALISE_TEST_TOKEN
    sourceLanguage: en
`), 0o644); err != nil {
		t.Fatalf("write config: %v", err)
	}

	oldFactory := newLokaliseSourceUploader
	defer func() {
		newLokaliseSourceUploader = oldFactory
	}()
	fake := &fakeLokaliseSourceUploader{}
	newLokaliseSourceUploader = func(cfg lokalise.Config) (lokaliseSourceUploader, error) {
		if cfg.ProjectID != "project-from-config" || cfg.APIToken != "secret" {
			t.Fatalf("config = %#v, want storage config", cfg)
		}
		return fake, nil
	}

	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetArgs([]string{"lokalise", "upload", "sources", "--config", configPath, "--file", sourcePath})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute lokalise upload: %v", err)
	}
	if len(fake.inputs) != 1 || fake.inputs[0].ProjectID != "project-from-config" || fake.inputs[0].SourceLocale != "en" {
		t.Fatalf("inputs = %#v, want config values", fake.inputs)
	}
}

func TestLokaliseUploadSourcesPreservesPartialProgressOnError(t *testing.T) {
	dir := t.TempDir()
	sourcePath := filepath.Join(dir, "en.json")
	if err := os.WriteFile(sourcePath, []byte(`{"hello":"Hello"}`), 0o644); err != nil {
		t.Fatalf("write source file: %v", err)
	}
	t.Setenv("LOKALISE_API_TOKEN", "secret")

	oldFactory := newLokaliseSourceUploader
	defer func() {
		newLokaliseSourceUploader = oldFactory
	}()
	newLokaliseSourceUploader = func(lokalise.Config) (lokaliseSourceUploader, error) {
		return &fakeLokaliseSourceUploader{err: errors.New("api failed")}, nil
	}

	cmd := newRootCmd("")
	cmd.SetArgs([]string{"lokalise", "upload", "sources", "--project-id", "project-1", "--source-locale", "en", "--file", sourcePath})

	err := cmd.Execute()
	if err == nil || !strings.Contains(err.Error(), "api failed") {
		t.Fatalf("error = %v, want api failed", err)
	}
}

type fakeLokaliseGlossaryCSVWriter struct {
	req lokalise.GlossaryDownloadInput
	err error
}

func (f *fakeLokaliseGlossaryCSVWriter) WriteGlossaryCSV(_ context.Context, req lokalise.GlossaryDownloadInput, w io.Writer) (lokalise.GlossaryDownloadResult, error) {
	f.req = req
	if f.err != nil {
		return lokalise.GlossaryDownloadResult{}, f.err
	}
	if _, err := io.WriteString(w, "term;description\nCheckout;CTA\n"); err != nil {
		return lokalise.GlossaryDownloadResult{}, err
	}
	return lokalise.GlossaryDownloadResult{Terms: 1, Rows: 1}, nil
}

type fakeLokaliseSourceUploader struct {
	inputs []lokalise.SourceUploadInput
	err    error
}

func (f *fakeLokaliseSourceUploader) UploadSourceFile(_ context.Context, input lokalise.SourceUploadInput) (lokalise.SourceUploadResult, error) {
	f.inputs = append(f.inputs, input)
	if f.err != nil {
		return lokalise.SourceUploadResult{}, f.err
	}
	return lokalise.SourceUploadResult{ProcessID: "proc-1", Type: "file-import", Status: "queued"}, nil
}
