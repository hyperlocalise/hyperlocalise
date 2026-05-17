package cmd

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
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

func TestLokaliseDownloadSourcesDryRun(t *testing.T) {
	t.Chdir(t.TempDir())

	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetErr(out)
	cmd.SetArgs([]string{"lokalise", "download", "sources", "--project-id", "project-1", "--source-locale", "en", "--format", "json", "--output", "source.zip", "--dry-run"})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute lokalise download dry-run: %v", err)
	}
	output := out.String()
	if !strings.Contains(output, "dry-run action=lokalise-download-sources") ||
		!strings.Contains(output, "project_id=project-1") ||
		!strings.Contains(output, "source_locale=en") ||
		!strings.Contains(output, "output=source.zip") {
		t.Fatalf("unexpected output: %q", output)
	}
}

func TestLokaliseDownloadSourcesWritesStdout(t *testing.T) {
	t.Chdir(t.TempDir())
	t.Setenv("LOKALISE_TEST_TOKEN", "secret")
	fake := &fakeLokaliseSourceDownloader{
		result: lokalise.SourceDownloadResult{SourceLocale: "en", Format: "json", Content: []byte("zip-bytes")},
	}
	oldFactory := newLokaliseSourceDownloader
	newLokaliseSourceDownloader = func(cfg lokalise.Config) (lokaliseSourceDownloader, error) {
		if cfg.ProjectID != "project-1" || cfg.APIToken != "secret" {
			t.Fatalf("unexpected config: %+v", cfg)
		}
		return fake, nil
	}
	defer func() { newLokaliseSourceDownloader = oldFactory }()

	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetErr(out)
	cmd.SetArgs([]string{"lokalise", "download", "sources", "--project-id", "project-1", "--source-locale", "en", "--format", "json", "--token-env", "LOKALISE_TEST_TOKEN"})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute lokalise download: %v", err)
	}
	if got := out.String(); got != "zip-bytes" {
		t.Fatalf("unexpected stdout content: %q", got)
	}
	if !fake.called {
		t.Fatalf("expected downloader to be called")
	}
	if fake.in.ProjectID != "project-1" || fake.in.SourceLocale != "en" || fake.in.FileFormat != "json" {
		t.Fatalf("unexpected input: %+v", fake.in)
	}
}

func TestLokaliseDownloadSourcesWritesOutputFile(t *testing.T) {
	t.Chdir(t.TempDir())
	t.Setenv("LOKALISE_TEST_TOKEN", "secret")
	fake := &fakeLokaliseSourceDownloader{
		result: lokalise.SourceDownloadResult{SourceLocale: "en", Format: "json", Content: []byte("zip-bytes")},
	}
	oldFactory := newLokaliseSourceDownloader
	newLokaliseSourceDownloader = func(lokalise.Config) (lokaliseSourceDownloader, error) {
		return fake, nil
	}
	defer func() { newLokaliseSourceDownloader = oldFactory }()

	outputPath := filepath.Join(t.TempDir(), "downloads", "source.zip")
	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetErr(out)
	cmd.SetArgs([]string{"lokalise", "download", "sources", "--project-id", "project-1", "--source-locale", "en", "--format", "json", "--output", outputPath, "--token-env", "LOKALISE_TEST_TOKEN"})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute lokalise download: %v", err)
	}
	content, err := os.ReadFile(outputPath)
	if err != nil {
		t.Fatalf("read output file: %v", err)
	}
	if string(content) != "zip-bytes" {
		t.Fatalf("unexpected file content: %q", string(content))
	}
	if !strings.Contains(out.String(), "downloaded file="+outputPath) || !strings.Contains(out.String(), "bytes=9") {
		t.Fatalf("unexpected output: %q", out.String())
	}
}

func TestLokaliseDownloadSourcesRefusesOverwriteWithoutForce(t *testing.T) {
	t.Chdir(t.TempDir())
	t.Setenv("LOKALISE_TEST_TOKEN", "secret")
	outputPath := filepath.Join(t.TempDir(), "source.zip")
	if err := os.WriteFile(outputPath, []byte("old"), 0o644); err != nil {
		t.Fatalf("write existing output: %v", err)
	}

	fake := &fakeLokaliseSourceDownloader{}
	oldFactory := newLokaliseSourceDownloader
	newLokaliseSourceDownloader = func(lokalise.Config) (lokaliseSourceDownloader, error) {
		return fake, nil
	}
	defer func() { newLokaliseSourceDownloader = oldFactory }()

	cmd := newRootCmd("")
	cmd.SetArgs([]string{"lokalise", "download", "sources", "--project-id", "project-1", "--source-locale", "en", "--format", "json", "--output", outputPath, "--token-env", "LOKALISE_TEST_TOKEN"})

	err := cmd.Execute()
	if err == nil {
		t.Fatalf("expected overwrite error")
	}
	if !strings.Contains(err.Error(), "already exists; use --force to overwrite") {
		t.Fatalf("unexpected error: %v", err)
	}
	if fake.called {
		t.Fatalf("downloader should not be called when output already exists")
	}
}

func TestLokaliseDownloadSourcesForceOverwritesOutputFile(t *testing.T) {
	t.Chdir(t.TempDir())
	t.Setenv("LOKALISE_TEST_TOKEN", "secret")
	fake := &fakeLokaliseSourceDownloader{
		result: lokalise.SourceDownloadResult{SourceLocale: "en", Format: "json", Content: []byte("new")},
	}
	oldFactory := newLokaliseSourceDownloader
	newLokaliseSourceDownloader = func(lokalise.Config) (lokaliseSourceDownloader, error) {
		return fake, nil
	}
	defer func() { newLokaliseSourceDownloader = oldFactory }()

	outputPath := filepath.Join(t.TempDir(), "source.zip")
	if err := os.WriteFile(outputPath, []byte("old"), 0o644); err != nil {
		t.Fatalf("write existing output: %v", err)
	}
	cmd := newRootCmd("")
	cmd.SetArgs([]string{"lokalise", "download", "sources", "--project-id", "project-1", "--source-locale", "en", "--format", "json", "--output", outputPath, "--force", "--token-env", "LOKALISE_TEST_TOKEN"})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute lokalise download with force: %v", err)
	}
	content, err := os.ReadFile(outputPath)
	if err != nil {
		t.Fatalf("read output file: %v", err)
	}
	if string(content) != "new" {
		t.Fatalf("unexpected file content: %q", string(content))
	}
}

func TestLokaliseDownloadSourcesUsesConfig(t *testing.T) {
	t.Setenv("LOKALISE_CONFIG_TOKEN", "cfg-secret")
	configPath := writeLokaliseDownloadConfig(t)
	outputPath := filepath.Join(t.TempDir(), "source.zip")

	fake := &fakeLokaliseSourceDownloader{
		result: lokalise.SourceDownloadResult{SourceLocale: "en-US", Format: "json", Content: []byte("zip-bytes")},
	}
	oldFactory := newLokaliseSourceDownloader
	newLokaliseSourceDownloader = func(cfg lokalise.Config) (lokaliseSourceDownloader, error) {
		if cfg.ProjectID != "cfg-project" || cfg.SourceLanguage != "en-US" || cfg.APIToken != "cfg-secret" || cfg.APIBaseURL != "https://example.invalid/api2" || cfg.TimeoutSeconds != 7 {
			t.Fatalf("unexpected config: %+v", cfg)
		}
		return fake, nil
	}
	defer func() { newLokaliseSourceDownloader = oldFactory }()

	cmd := newRootCmd("")
	cmd.SetArgs([]string{"lokalise", "download", "sources", "--config", configPath, "--format", "json", "--output", outputPath})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute lokalise download from config: %v", err)
	}
	if fake.in.ProjectID != "cfg-project" || fake.in.SourceLocale != "en-US" {
		t.Fatalf("unexpected input: %+v", fake.in)
	}
}

func TestLokaliseDownloadSourcesTokenErrorListsFallback(t *testing.T) {
	t.Chdir(t.TempDir())
	t.Setenv("LOKALISE_CUSTOM_TOKEN", "")
	t.Setenv("LOKALISE_API_TOKEN", "")

	cmd := newRootCmd("")
	cmd.SetArgs([]string{"lokalise", "download", "sources", "--project-id", "project-1", "--source-locale", "en", "--format", "json", "--token-env", "LOKALISE_CUSTOM_TOKEN"})

	err := cmd.Execute()
	if err == nil {
		t.Fatalf("expected missing token error")
	}
	if !strings.Contains(err.Error(), "LOKALISE_CUSTOM_TOKEN or LOKALISE_API_TOKEN") {
		t.Fatalf("unexpected error: %v", err)
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

type fakeLokaliseSourceDownloader struct {
	result lokalise.SourceDownloadResult
	err    error
	in     lokalise.SourceDownloadInput
	called bool
}

func (f *fakeLokaliseSourceDownloader) DownloadSourceFile(_ context.Context, in lokalise.SourceDownloadInput) (lokalise.SourceDownloadResult, error) {
	f.called = true
	f.in = in
	if f.err != nil {
		return lokalise.SourceDownloadResult{}, f.err
	}
	return f.result, nil
}

func writeLokaliseDownloadConfig(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	sourceDir := filepath.Join(dir, "lang")
	if err := os.MkdirAll(sourceDir, 0o755); err != nil {
		t.Fatalf("mkdir source dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(sourceDir, "en-US.json"), []byte(`{"hello":"Hello"}`), 0o644); err != nil {
		t.Fatalf("write source file: %v", err)
	}
	content := fmt.Sprintf(`{
  "locales": {
    "source": "en-US",
    "targets": ["fr-FR"]
  },
  "buckets": {
    "json": {
      "files": [
        {"from": %q, "to": %q}
      ]
    }
  },
  "groups": {
    "default": {
      "targets": ["fr-FR"],
      "buckets": ["json"]
    }
  },
  "llm": {
    "profiles": {
      "default": {
        "provider": "openai",
        "model": "gpt-4.1-mini",
        "prompt": "Translate."
      }
    }
  },
  "storage": {
    "adapter": "lokalise",
    "config": {
      "projectID": "cfg-project",
      "apiTokenEnv": "LOKALISE_CONFIG_TOKEN",
      "apiBaseURL": "https://example.invalid/api2",
      "sourceLanguage": "en-US",
      "timeoutSeconds": 7
    }
  }
}`, "lang/en-US.json", "lang/fr-FR.json")
	path := filepath.Join(dir, "i18n.jsonc")
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatalf("write config: %v", err)
	}
	return path
}
