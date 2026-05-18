package cmd

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
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

func TestLokaliseDownloadTranslationsDryRunWithConfigDoesNotRequireToken(t *testing.T) {
	t.Setenv("LOKALISE_CONFIG_TOKEN", "")
	t.Setenv("LOKALISE_API_TOKEN", "")

	configPath := writeLokaliseDownloadConfig(t)
	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetErr(out)
	cmd.SetArgs([]string{"lokalise", "download", "translations", "--config", configPath, "--target-locale", "fr-FR", "--format", "json", "--dry-run"})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute dry-run with config: %v", err)
	}
	output := out.String()
	if !strings.Contains(output, "project_id=cfg-project") || !strings.Contains(output, "target_locales=fr-FR") {
		t.Fatalf("dry-run output = %q", output)
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

func TestLokaliseProjectIDWithBranchEscapesBranchOnce(t *testing.T) {
	got, err := lokaliseProjectIDWithBranch("project-1", " feature/my-branch ")
	if err != nil {
		t.Fatalf("project ID with branch: %v", err)
	}
	if want := "project-1:feature%2Fmy-branch"; got != want {
		t.Fatalf("project ID = %q, want %q", got, want)
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
	if fake.in.AllPlatforms {
		t.Fatalf("all platforms should be opt-in, got input: %+v", fake.in)
	}
}

func TestLokaliseDownloadSourcesAllPlatformsFlag(t *testing.T) {
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

	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetErr(out)
	cmd.SetArgs([]string{"lokalise", "download", "sources", "--project-id", "project-1", "--source-locale", "en", "--format", "json", "--all-platforms", "--token-env", "LOKALISE_TEST_TOKEN"})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute lokalise download: %v", err)
	}
	if !fake.in.AllPlatforms {
		t.Fatalf("expected all platforms input, got %+v", fake.in)
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
	t.Setenv("LOKALISE_API_TOKEN", "")

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

func TestLokaliseDecodeConfigRejectsInlineTokenCasing(t *testing.T) {
	_, err := lokalise.DecodeConfig(json.RawMessage(`{"projectID":"project-1","APIToken":"inline"}`))
	if err == nil || !strings.Contains(err.Error(), "apiToken is not supported") {
		t.Fatalf("expected inline token rejection, got %v", err)
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
