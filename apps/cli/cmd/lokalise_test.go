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

func TestLokaliseDownloadTranslationsWritesSingleLocaleToStdout(t *testing.T) {
	t.Chdir(t.TempDir())
	t.Setenv("LOKALISE_API_TOKEN", "secret")

	oldFactory := newLokaliseTranslationDownloader
	defer func() {
		newLokaliseTranslationDownloader = oldFactory
	}()
	fake := &fakeLokaliseTranslationDownloader{
		files: []lokalise.TranslationFile{{
			Locale:  "fr",
			Name:    "fr.json",
			Content: []byte(`{"hello":"Bonjour"}`),
		}},
	}
	newLokaliseTranslationDownloader = func(cfg lokalise.Config) (lokaliseTranslationDownloader, error) {
		if cfg.ProjectID != "project-1" || cfg.APIToken != "secret" {
			t.Fatalf("config = %#v, want project/token from flags and env", cfg)
		}
		return fake, nil
	}

	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetErr(out)
	cmd.SetArgs([]string{"lokalise", "download", "translations", "--project-id", "project-1", "--target-locale", "fr", "--format", "json"})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute lokalise download translations: %v", err)
	}
	if got, want := out.String(), `{"hello":"Bonjour"}`; got != want {
		t.Fatalf("output = %q, want %q", got, want)
	}
	if fake.req.ProjectID != "project-1" || fake.req.Format != "json" {
		t.Fatalf("request = %#v, want project/format", fake.req)
	}
	if got, want := fake.req.TargetLanguages, []string{"fr"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("target locales = %#v, want %#v", got, want)
	}
}

func TestLokaliseDownloadTranslationsWritesMultipleLocalesToFiles(t *testing.T) {
	t.Chdir(t.TempDir())
	t.Setenv("LOKALISE_API_TOKEN", "secret")

	oldFactory := newLokaliseTranslationDownloader
	defer func() {
		newLokaliseTranslationDownloader = oldFactory
	}()
	newLokaliseTranslationDownloader = func(lokalise.Config) (lokaliseTranslationDownloader, error) {
		return &fakeLokaliseTranslationDownloader{
			files: []lokalise.TranslationFile{
				{Locale: "fr", Name: "fr.json", Content: []byte(`{"hello":"Bonjour"}`)},
				{Locale: "de", Name: "de.json", Content: []byte(`{"hello":"Hallo"}`)},
			},
		}, nil
	}

	dir := t.TempDir()
	outputPattern := filepath.Join(dir, "%locale%.json")
	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetErr(out)
	cmd.SetArgs([]string{"lokalise", "download", "translations", "--project-id", "project-1", "--target-locale", "fr,de", "--format", "json", "--output", outputPattern})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute lokalise download translations: %v", err)
	}
	frPayload, err := os.ReadFile(filepath.Join(dir, "fr.json"))
	if err != nil {
		t.Fatalf("read fr output: %v", err)
	}
	if string(frPayload) != `{"hello":"Bonjour"}` {
		t.Fatalf("fr payload = %q", string(frPayload))
	}
	dePayload, err := os.ReadFile(filepath.Join(dir, "de.json"))
	if err != nil {
		t.Fatalf("read de output: %v", err)
	}
	if string(dePayload) != `{"hello":"Hallo"}` {
		t.Fatalf("de payload = %q", string(dePayload))
	}
	output := out.String()
	if !strings.Contains(output, "downloaded file="+filepath.Join(dir, "fr.json")) || !strings.Contains(output, "locale=de") {
		t.Fatalf("summary output = %q", output)
	}
}

func TestLokaliseDownloadTranslationsUsesStorageConfig(t *testing.T) {
	dir := t.TempDir()
	t.Chdir(dir)
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
    targetLanguages:
      - fr
`), 0o644); err != nil {
		t.Fatalf("write config: %v", err)
	}

	oldFactory := newLokaliseTranslationDownloader
	defer func() {
		newLokaliseTranslationDownloader = oldFactory
	}()
	fake := &fakeLokaliseTranslationDownloader{
		files: []lokalise.TranslationFile{{Locale: "fr", Name: "fr.json", Content: []byte(`{"hello":"Bonjour"}`)}},
	}
	newLokaliseTranslationDownloader = func(cfg lokalise.Config) (lokaliseTranslationDownloader, error) {
		if cfg.ProjectID != "project-from-config" || cfg.APIToken != "secret" || cfg.APITokenEnv != "LOKALISE_TEST_TOKEN" {
			t.Fatalf("config = %#v, want project/token from config", cfg)
		}
		return fake, nil
	}

	outputPath := filepath.Join(dir, "fr.json")
	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetErr(out)
	cmd.SetArgs([]string{"lokalise", "download", "translations", "--config", "  " + configPath + "  ", "--format", "json", "--output", outputPath})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute lokalise download translations: %v", err)
	}
	if fake.req.ProjectID != "project-from-config" || !reflect.DeepEqual(fake.req.TargetLanguages, []string{"fr"}) {
		t.Fatalf("request = %#v, want values from storage config", fake.req)
	}
}

func TestLokaliseDownloadTranslationsRequiresOutputPatternForMultipleLocales(t *testing.T) {
	t.Chdir(t.TempDir())
	t.Setenv("LOKALISE_API_TOKEN", "secret")

	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetErr(out)
	cmd.SetArgs([]string{"lokalise", "download", "translations", "--project-id", "project-1", "--target-locale", "fr", "--target-locale", "de", "--format", "json"})

	err := cmd.Execute()
	if err == nil || !strings.Contains(err.Error(), "--output with %locale%") {
		t.Fatalf("error = %v, want output pattern error", err)
	}
}

func TestLokaliseDownloadTranslationsDryRunDoesNotRequireToken(t *testing.T) {
	t.Chdir(t.TempDir())

	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetErr(out)
	cmd.SetArgs([]string{"lokalise", "download", "translations", "--project-id", "project-1", "--target-locale", "fr", "--format", "json", "--dry-run"})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute dry-run: %v", err)
	}
	if got := out.String(); !strings.Contains(got, "dry-run action=lokalise-download-translations") || !strings.Contains(got, "target_locales=fr") {
		t.Fatalf("dry-run output = %q", got)
	}
}

func TestLokaliseDownloadTranslationsRejectsExistingOutputWithoutForce(t *testing.T) {
	t.Chdir(t.TempDir())
	t.Setenv("LOKALISE_API_TOKEN", "secret")

	oldFactory := newLokaliseTranslationDownloader
	defer func() {
		newLokaliseTranslationDownloader = oldFactory
	}()
	newLokaliseTranslationDownloader = func(lokalise.Config) (lokaliseTranslationDownloader, error) {
		t.Fatalf("downloader should not be created when output validation fails")
		return nil, nil
	}

	outputPath := filepath.Join(t.TempDir(), "fr.json")
	if err := os.WriteFile(outputPath, []byte("existing"), 0o644); err != nil {
		t.Fatalf("write existing output: %v", err)
	}
	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetErr(out)
	cmd.SetArgs([]string{"lokalise", "download", "translations", "--project-id", "project-1", "--target-locale", "fr", "--format", "json", "--output", outputPath})

	err := cmd.Execute()
	if err == nil || !strings.Contains(err.Error(), "already exists") {
		t.Fatalf("error = %v, want already exists", err)
	}
}

func TestLokaliseDownloadTranslationsForceOverwritesExistingOutput(t *testing.T) {
	t.Chdir(t.TempDir())
	t.Setenv("LOKALISE_API_TOKEN", "secret")

	oldFactory := newLokaliseTranslationDownloader
	defer func() {
		newLokaliseTranslationDownloader = oldFactory
	}()
	newLokaliseTranslationDownloader = func(lokalise.Config) (lokaliseTranslationDownloader, error) {
		return &fakeLokaliseTranslationDownloader{
			files: []lokalise.TranslationFile{{Locale: "fr", Name: "fr.json", Content: []byte(`{"hello":"Bonjour"}`)}},
		}, nil
	}

	outputPath := filepath.Join(t.TempDir(), "fr.json")
	if err := os.WriteFile(outputPath, []byte("existing"), 0o644); err != nil {
		t.Fatalf("write existing output: %v", err)
	}
	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetErr(out)
	cmd.SetArgs([]string{"lokalise", "download", "translations", "--project-id", "project-1", "--target-locale", "fr", "--format", "json", "--output", outputPath, "--force"})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute lokalise download translations: %v", err)
	}
	content, err := os.ReadFile(outputPath)
	if err != nil {
		t.Fatalf("read output: %v", err)
	}
	if got, want := string(content), `{"hello":"Bonjour"}`; got != want {
		t.Fatalf("output = %q, want %q", got, want)
	}
}

func TestLokaliseDownloadTranslationsForceRemovesOverwrittenOutputOnLaterFailure(t *testing.T) {
	t.Chdir(t.TempDir())
	t.Setenv("LOKALISE_API_TOKEN", "secret")

	dir := t.TempDir()
	frPath := filepath.Join(dir, "fr.json")
	dePath := filepath.Join(dir, "de.json")
	if err := os.WriteFile(frPath, []byte("existing"), 0o644); err != nil {
		t.Fatalf("write existing output: %v", err)
	}

	oldFactory := newLokaliseTranslationDownloader
	defer func() {
		newLokaliseTranslationDownloader = oldFactory
	}()
	newLokaliseTranslationDownloader = func(lokalise.Config) (lokaliseTranslationDownloader, error) {
		return &fakeLokaliseTranslationDownloader{
			files: []lokalise.TranslationFile{
				{Locale: "fr", Name: "fr.json", Content: []byte(`{"hello":"Bonjour"}`)},
				{Locale: "de", Name: "de.json", Content: []byte(`{"hello":"Hallo"}`)},
			},
			beforeReturn: func() {
				if err := os.Mkdir(dePath, 0o755); err != nil {
					t.Fatalf("create conflicting output directory: %v", err)
				}
			},
		}, nil
	}

	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetErr(out)
	cmd.SetArgs([]string{"lokalise", "download", "translations", "--project-id", "project-1", "--target-locale", "fr,de", "--format", "json", "--output", filepath.Join(dir, "%locale%.json"), "--force"})

	err := cmd.Execute()
	if err == nil || !strings.Contains(err.Error(), "is a directory") {
		t.Fatalf("error = %v, want later output write failure", err)
	}
	if _, err := os.Stat(frPath); !os.IsNotExist(err) {
		t.Fatalf("fr output should be removed after partial failure, stat err = %v", err)
	}
}

func TestLokaliseDownloadTranslationsPrintsAPIWarning(t *testing.T) {
	t.Chdir(t.TempDir())
	t.Setenv("LOKALISE_API_TOKEN", "secret")

	oldFactory := newLokaliseTranslationDownloader
	defer func() {
		newLokaliseTranslationDownloader = oldFactory
	}()
	newLokaliseTranslationDownloader = func(lokalise.Config) (lokaliseTranslationDownloader, error) {
		return &fakeLokaliseTranslationDownloader{
			files:   []lokalise.TranslationFile{{Locale: "fr", Name: "fr.json", Content: []byte(`{"hello":"Bonjour"}`)}},
			warning: "some translations are incomplete",
		}, nil
	}

	outputPath := filepath.Join(t.TempDir(), "fr.json")
	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	errOut := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetErr(errOut)
	cmd.SetArgs([]string{"lokalise", "download", "translations", "--project-id", "project-1", "--target-locale", "fr", "--format", "json", "--output", outputPath})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute lokalise download translations: %v", err)
	}
	if got := errOut.String(); !strings.Contains(got, "warning: some translations are incomplete") {
		t.Fatalf("stderr = %q, want API warning", got)
	}
}

func TestLokaliseDownloadTranslationsRequiresInputs(t *testing.T) {
	t.Chdir(t.TempDir())

	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetErr(out)
	cmd.SetArgs([]string{"lokalise", "download", "translations"})

	err := cmd.Execute()
	if err == nil {
		t.Fatalf("expected missing project input error")
	}
	if !strings.Contains(err.Error(), "--project-id") {
		t.Fatalf("error = %v, want --project-id", err)
	}
}

func TestLokaliseDownloadTranslationsRequiresTargetLocaleBeforeOptionalConfigError(t *testing.T) {
	t.Chdir(t.TempDir())
	t.Setenv("LOKALISE_API_TOKEN", "secret")

	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetErr(out)
	cmd.SetArgs([]string{"lokalise", "download", "translations", "--project-id", "project-1", "--format", "json"})

	err := cmd.Execute()
	if err == nil || !strings.Contains(err.Error(), "at least one --target-locale is required") {
		t.Fatalf("error = %v, want target locale requirement", err)
	}
	if strings.Contains(err.Error(), "load config") {
		t.Fatalf("error = %v, should not surface optional config load failure", err)
	}
}

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

type fakeLokaliseTranslationDownloader struct {
	req          lokalise.TranslationFileDownloadRequest
	files        []lokalise.TranslationFile
	warning      string
	beforeReturn func()
	err          error
}

func (f *fakeLokaliseTranslationDownloader) DownloadTranslationFiles(_ context.Context, req lokalise.TranslationFileDownloadRequest) (lokalise.TranslationFileDownloadResult, error) {
	f.req = req
	if f.err != nil {
		return lokalise.TranslationFileDownloadResult{}, f.err
	}
	if f.beforeReturn != nil {
		f.beforeReturn()
	}
	return lokalise.TranslationFileDownloadResult{
		Files:   append([]lokalise.TranslationFile(nil), f.files...),
		Warning: f.warning,
	}, nil
}
