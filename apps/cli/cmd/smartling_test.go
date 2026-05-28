package cmd

import (
	"bytes"
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/storage/smartling"
)

func TestSmartlingGlossaryDownloadFlags(t *testing.T) {
	root := newRootCmd("test")
	out := &bytes.Buffer{}
	root.SetOut(out)
	root.SetErr(out)

	// Test missing required flags
	root.SetArgs([]string{"smartling", "glossary", "download"})
	err := root.Execute()
	if err == nil {
		t.Fatal("expected error for missing required flags")
	}
	if !strings.Contains(err.Error(), "required flag(s)") {
		t.Errorf("unexpected error: %v", err)
	}

	// Test help output
	out.Reset()
	root.SetArgs([]string{"smartling", "glossary", "download", "--help"})
	if err := root.Execute(); err != nil {
		t.Fatalf("help failed: %v", err)
	}
	if !strings.Contains(out.String(), "--account-uid") ||
		!strings.Contains(out.String(), "--glossary-uid") {
		t.Error("help output missing required flags")
	}
}

func TestSmartlingTMDownloadFlags(t *testing.T) {
	root := newRootCmd("test")
	out := &bytes.Buffer{}
	root.SetOut(out)
	root.SetErr(out)

	// Test missing required flags
	root.SetArgs([]string{"smartling", "tm", "download"})
	err := root.Execute()
	if err == nil {
		t.Fatal("expected error for missing required flags")
	}
	if !strings.Contains(err.Error(), "required flag(s)") {
		t.Errorf("unexpected error: %v", err)
	}

	// Test help output
	out.Reset()
	root.SetArgs([]string{"smartling", "tm", "download", "--help"})
	if err := root.Execute(); err != nil {
		t.Fatalf("help failed: %v", err)
	}
	if !strings.Contains(out.String(), "--account-uid") ||
		!strings.Contains(out.String(), "--tm-uid") ||
		!strings.Contains(out.String(), "--source-language") {
		t.Error("help output missing required flags")
	}
}

func TestSmartlingUploadSourcesFlags(t *testing.T) {
	root := newRootCmd("test")
	out := &bytes.Buffer{}
	root.SetOut(out)
	root.SetErr(out)

	// Test missing required flags
	root.SetArgs([]string{"smartling", "upload", "sources"})
	err := root.Execute()
	if err == nil {
		t.Fatal("expected error for missing required flags")
	}
	if !strings.Contains(err.Error(), "required flag(s)") {
		t.Errorf("unexpected error: %v", err)
	}

	// Test help output
	out.Reset()
	root.SetArgs([]string{"smartling", "upload", "sources", "--help"})
	if err := root.Execute(); err != nil {
		t.Fatalf("help failed: %v", err)
	}
	if !strings.Contains(out.String(), "--project-id") ||
		!strings.Contains(out.String(), "--file") {
		t.Error("help output missing required flags")
	}
}

func TestSmartlingDownloadTranslationsFlags(t *testing.T) {
	root := newRootCmd("test")
	out := &bytes.Buffer{}
	root.SetOut(out)
	root.SetErr(out)

	// Test missing required flags
	root.SetArgs([]string{"smartling", "download", "translations"})
	err := root.Execute()
	if err == nil {
		t.Fatal("expected error for missing required flags")
	}
	if !strings.Contains(err.Error(), "required flag(s)") {
		t.Errorf("unexpected error: %v", err)
	}

	// Test help output
	out.Reset()
	root.SetArgs([]string{"smartling", "download", "translations", "--help"})
	if err := root.Execute(); err != nil {
		t.Fatalf("help failed: %v", err)
	}
	if !strings.Contains(out.String(), "--project-id") ||
		!strings.Contains(out.String(), "--target-locale") ||
		!strings.Contains(out.String(), "--file-uri") {
		t.Error("help output missing required flags")
	}
}

func TestSmartlingDownloadSourcesFlags(t *testing.T) {
	root := newRootCmd("test")
	out := &bytes.Buffer{}
	root.SetOut(out)
	root.SetErr(out)

	root.SetArgs([]string{"smartling", "download", "sources"})
	err := root.Execute()
	if err == nil {
		t.Fatal("expected error for missing required flags")
	}
	if !strings.Contains(err.Error(), "required flag(s)") {
		t.Errorf("unexpected error: %v", err)
	}

	out.Reset()
	root.SetArgs([]string{"smartling", "download", "sources", "--help"})
	if err := root.Execute(); err != nil {
		t.Fatalf("help failed: %v", err)
	}
	if !strings.Contains(out.String(), "--project-id") ||
		!strings.Contains(out.String(), "--file-uri") {
		t.Error("help output missing required flags")
	}
	if strings.Contains(out.String(), "--source-locale") {
		t.Error("help output includes unsupported source locale flag")
	}
}

func TestSmartlingDownloadTranslationsDryRun(t *testing.T) {
	root := newRootCmd("test")
	out := &bytes.Buffer{}
	root.SetOut(out)
	root.SetErr(out)

	root.SetArgs([]string{
		"smartling", "download", "translations",
		"--project-id", "123",
		"--target-locale", "fr",
		"--file-uri", "test.json",
		"--output", "fr.json",
		"--dry-run",
	})

	if err := root.Execute(); err != nil {
		t.Fatalf("execute failed: %v", err)
	}

	if !strings.Contains(out.String(), "dry-run action=smartling-download-translations") ||
		!strings.Contains(out.String(), "target_locales=fr") ||
		!strings.Contains(out.String(), "file_uri=test.json") ||
		!strings.Contains(out.String(), "output=fr.json") {
		t.Errorf("unexpected output: %s", out.String())
	}
}

func TestSmartlingDownloadSourcesDryRun(t *testing.T) {
	root := newRootCmd("test")
	out := &bytes.Buffer{}
	root.SetOut(out)
	root.SetErr(out)

	root.SetArgs([]string{
		"smartling", "download", "sources",
		"--project-id", "123",
		"--file-uri", "test.json",
		"--output", "en.json",
		"--dry-run",
	})

	if err := root.Execute(); err != nil {
		t.Fatalf("execute failed: %v", err)
	}

	if !strings.Contains(out.String(), "dry-run action=smartling-download-sources") ||
		!strings.Contains(out.String(), "file_uri=test.json") ||
		!strings.Contains(out.String(), "output=en.json") {
		t.Errorf("unexpected output: %s", out.String())
	}
	if strings.Contains(out.String(), "source_locale=") {
		t.Errorf("unexpected source locale in output: %s", out.String())
	}
}

func TestSmartlingDownloadSourcesSourceLocaleFlagDeprecated(t *testing.T) {
	root := newRootCmd("test")
	out := &bytes.Buffer{}
	root.SetOut(out)
	root.SetErr(out)

	root.SetArgs([]string{
		"smartling", "download", "sources",
		"--project-id", "123",
		"--source-locale", "fr",
		"--file-uri", "test.json",
		"--dry-run",
	})

	if err := root.Execute(); err != nil {
		t.Fatalf("execute failed: %v", err)
	}
	if !strings.Contains(out.String(), "Flag --source-locale has been deprecated") {
		t.Errorf("expected deprecated flag warning, got: %s", out.String())
	}
	if strings.Contains(out.String(), "source_locale=") {
		t.Errorf("unexpected source locale in output: %s", out.String())
	}
}

type fakeSmartlingSourceDownloader struct {
	result smartling.SourceDownloadResult
	err    error
}

func (f *fakeSmartlingSourceDownloader) DownloadSourceFile(_ context.Context, in smartling.SourceDownloadInput) (smartling.SourceDownloadResult, error) {
	if f.err != nil {
		return smartling.SourceDownloadResult{}, f.err
	}
	if f.result.Content != nil {
		return f.result, nil
	}
	return smartling.SourceDownloadResult{
		FileURI: in.FileURI,
		Content: []byte(`{"hello":"Hello"}`),
	}, nil
}

func TestSmartlingDownloadSourcesWritesStdout(t *testing.T) {
	t.Setenv("SMARTLING_USER_IDENTIFIER", "uid")
	t.Setenv("SMARTLING_USER_SECRET", "secret")

	orig := newSmartlingSourceDownloader
	newSmartlingSourceDownloader = func(_ smartling.Config) (smartlingSourceDownloader, error) {
		return &fakeSmartlingSourceDownloader{}, nil
	}
	defer func() { newSmartlingSourceDownloader = orig }()

	root := newRootCmd("test")
	out := &bytes.Buffer{}
	root.SetOut(out)
	root.SetErr(out)

	root.SetArgs([]string{
		"smartling", "download", "sources",
		"--project-id", "123",
		"--file-uri", "test.json",
	})

	if err := root.Execute(); err != nil {
		t.Fatalf("execute failed: %v", err)
	}

	if got := out.String(); got != `{"hello":"Hello"}` {
		t.Errorf("unexpected stdout content: %s", got)
	}
}

func TestSmartlingDownloadSourcesWritesOutputFile(t *testing.T) {
	t.Setenv("SMARTLING_USER_IDENTIFIER", "uid")
	t.Setenv("SMARTLING_USER_SECRET", "secret")

	orig := newSmartlingSourceDownloader
	newSmartlingSourceDownloader = func(_ smartling.Config) (smartlingSourceDownloader, error) {
		return &fakeSmartlingSourceDownloader{}, nil
	}
	defer func() { newSmartlingSourceDownloader = orig }()

	outputPath := filepath.Join(t.TempDir(), "en.json")
	root := newRootCmd("test")
	out := &bytes.Buffer{}
	root.SetOut(out)
	root.SetErr(out)

	root.SetArgs([]string{
		"smartling", "download", "sources",
		"--project-id", "123",
		"--file-uri", "test.json",
		"--output", outputPath,
	})

	if err := root.Execute(); err != nil {
		t.Fatalf("execute failed: %v", err)
	}

	content, err := os.ReadFile(outputPath)
	if err != nil {
		t.Fatalf("read output file: %v", err)
	}
	if string(content) != `{"hello":"Hello"}` {
		t.Fatalf("unexpected file content: %q", string(content))
	}
	if !strings.Contains(out.String(), "downloaded file="+outputPath) ||
		!strings.Contains(out.String(), "file_uri=test.json") {
		t.Fatalf("unexpected output: %q", out.String())
	}
	if strings.Contains(out.String(), "source_locale=") {
		t.Fatalf("unexpected source locale in output: %q", out.String())
	}
}

func TestSmartlingDownloadSourcesRefusesOverwriteWithoutForce(t *testing.T) {
	outputPath := filepath.Join(t.TempDir(), "en.json")
	if err := os.WriteFile(outputPath, []byte(`{"old":"Old"}`), 0o644); err != nil {
		t.Fatalf("write existing output: %v", err)
	}

	root := newRootCmd("test")
	root.SetArgs([]string{
		"smartling", "download", "sources",
		"--project-id", "123",
		"--file-uri", "test.json",
		"--output", outputPath,
	})

	err := root.Execute()
	if err == nil {
		t.Fatal("expected overwrite error")
	}
	if !strings.Contains(err.Error(), "already exists; use --force to overwrite") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestSmartlingDownloadSourcesForceOverwritesOutputFile(t *testing.T) {
	t.Setenv("SMARTLING_USER_IDENTIFIER", "uid")
	t.Setenv("SMARTLING_USER_SECRET", "secret")

	orig := newSmartlingSourceDownloader
	newSmartlingSourceDownloader = func(_ smartling.Config) (smartlingSourceDownloader, error) {
		return &fakeSmartlingSourceDownloader{}, nil
	}
	defer func() { newSmartlingSourceDownloader = orig }()

	outputPath := filepath.Join(t.TempDir(), "en.json")
	if err := os.WriteFile(outputPath, []byte(`{"old":"Old"}`), 0o644); err != nil {
		t.Fatalf("write existing output: %v", err)
	}

	root := newRootCmd("test")
	out := &bytes.Buffer{}
	root.SetOut(out)
	root.SetErr(out)
	root.SetArgs([]string{
		"smartling", "download", "sources",
		"--project-id", "123",
		"--file-uri", "test.json",
		"--output", outputPath,
		"--force",
	})

	if err := root.Execute(); err != nil {
		t.Fatalf("execute failed: %v", err)
	}
	content, err := os.ReadFile(outputPath)
	if err != nil {
		t.Fatalf("read output file: %v", err)
	}
	if string(content) != `{"hello":"Hello"}` {
		t.Fatalf("unexpected file content: %q", string(content))
	}
}

type fakeSmartlingTranslationDownloader struct {
	results map[string]smartling.TranslationDownloadResult
	err     error
}

func (f *fakeSmartlingTranslationDownloader) DownloadTranslationFile(_ context.Context, in smartling.TranslationDownloadInput) (smartling.TranslationDownloadResult, error) {
	if f.err != nil {
		return smartling.TranslationDownloadResult{}, f.err
	}
	result, ok := f.results[in.LocaleID]
	if !ok {
		return smartling.TranslationDownloadResult{LocaleID: in.LocaleID, Content: []byte(`{}`)}, nil
	}
	return result, nil
}

func TestSmartlingDownloadTranslationsWritesStdout(t *testing.T) {
	t.Setenv("SMARTLING_USER_IDENTIFIER", "uid")
	t.Setenv("SMARTLING_USER_SECRET", "secret")

	orig := newSmartlingTranslationDownloader
	newSmartlingTranslationDownloader = func(_ smartling.Config) (smartlingTranslationDownloader, error) {
		return &fakeSmartlingTranslationDownloader{
			results: map[string]smartling.TranslationDownloadResult{
				"fr": {LocaleID: "fr", Content: []byte(`{"hello":"Bonjour"}`)},
			},
		}, nil
	}
	defer func() { newSmartlingTranslationDownloader = orig }()

	root := newRootCmd("test")
	out := &bytes.Buffer{}
	root.SetOut(out)
	root.SetErr(out)

	root.SetArgs([]string{
		"smartling", "download", "translations",
		"--project-id", "123",
		"--target-locale", "fr",
		"--file-uri", "test.json",
	})

	if err := root.Execute(); err != nil {
		t.Fatalf("execute failed: %v", err)
	}

	if got := out.String(); !strings.Contains(got, `{"hello":"Bonjour"}`) {
		t.Errorf("unexpected stdout content: %s", got)
	}
}

func TestSmartlingDownloadTranslationsWritesOutputFile(t *testing.T) {
	t.Setenv("SMARTLING_USER_IDENTIFIER", "uid")
	t.Setenv("SMARTLING_USER_SECRET", "secret")

	orig := newSmartlingTranslationDownloader
	newSmartlingTranslationDownloader = func(_ smartling.Config) (smartlingTranslationDownloader, error) {
		return &fakeSmartlingTranslationDownloader{
			results: map[string]smartling.TranslationDownloadResult{
				"fr": {LocaleID: "fr", Content: []byte(`{"hello":"Bonjour"}`)},
			},
		}, nil
	}
	defer func() { newSmartlingTranslationDownloader = orig }()

	outputPath := filepath.Join(t.TempDir(), "fr.json")
	root := newRootCmd("test")
	out := &bytes.Buffer{}
	root.SetOut(out)
	root.SetErr(out)

	root.SetArgs([]string{
		"smartling", "download", "translations",
		"--project-id", "123",
		"--target-locale", "fr",
		"--file-uri", "test.json",
		"--output", outputPath,
	})

	if err := root.Execute(); err != nil {
		t.Fatalf("execute failed: %v", err)
	}

	content, err := os.ReadFile(outputPath)
	if err != nil {
		t.Fatalf("read output file: %v", err)
	}
	if string(content) != `{"hello":"Bonjour"}` {
		t.Fatalf("unexpected file content: %q", string(content))
	}
	if !strings.Contains(out.String(), "downloaded file="+outputPath) || !strings.Contains(out.String(), "locale=fr") {
		t.Fatalf("unexpected output: %q", out.String())
	}
}

func TestSmartlingDownloadTranslationsMultipleLocalesUseOutputPattern(t *testing.T) {
	t.Setenv("SMARTLING_USER_IDENTIFIER", "uid")
	t.Setenv("SMARTLING_USER_SECRET", "secret")

	orig := newSmartlingTranslationDownloader
	newSmartlingTranslationDownloader = func(_ smartling.Config) (smartlingTranslationDownloader, error) {
		return &fakeSmartlingTranslationDownloader{
			results: map[string]smartling.TranslationDownloadResult{
				"fr": {LocaleID: "fr", Content: []byte(`{"hello":"Bonjour"}`)},
				"de": {LocaleID: "de", Content: []byte(`{"hello":"Hallo"}`)},
			},
		}, nil
	}
	defer func() { newSmartlingTranslationDownloader = orig }()

	dir := t.TempDir()
	outputPattern := filepath.Join(dir, "%locale%.json")
	root := newRootCmd("test")
	out := &bytes.Buffer{}
	root.SetOut(out)
	root.SetErr(out)

	root.SetArgs([]string{
		"smartling", "download", "translations",
		"--project-id", "123",
		"--target-locale", "fr,de",
		"--file-uri", "test.json",
		"--output", outputPattern,
	})

	if err := root.Execute(); err != nil {
		t.Fatalf("execute failed: %v", err)
	}

	fr, err := os.ReadFile(filepath.Join(dir, "fr.json"))
	if err != nil {
		t.Fatalf("read fr output: %v", err)
	}
	de, err := os.ReadFile(filepath.Join(dir, "de.json"))
	if err != nil {
		t.Fatalf("read de output: %v", err)
	}
	if string(fr) != `{"hello":"Bonjour"}` || string(de) != `{"hello":"Hallo"}` {
		t.Fatalf("unexpected outputs: fr=%q de=%q", string(fr), string(de))
	}
}

func TestSmartlingDownloadTranslationsMultipleLocalesRequireOutputPattern(t *testing.T) {
	root := newRootCmd("test")
	root.SetArgs([]string{
		"smartling", "download", "translations",
		"--project-id", "123",
		"--target-locale", "fr",
		"--target-locale", "de",
		"--file-uri", "test.json",
		"--output", "translations.json",
		"--dry-run",
	})

	err := root.Execute()
	if err == nil {
		t.Fatal("expected output pattern error")
	}
	if !strings.Contains(err.Error(), "must include %locale%") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestSmartlingDownloadTranslationsRemovesWrittenFilesOnLaterFailure(t *testing.T) {
	t.Setenv("SMARTLING_USER_IDENTIFIER", "uid")
	t.Setenv("SMARTLING_USER_SECRET", "secret")

	orig := newSmartlingTranslationDownloader
	newSmartlingTranslationDownloader = func(_ smartling.Config) (smartlingTranslationDownloader, error) {
		return &fakeSmartlingTranslationDownloader{
			results: map[string]smartling.TranslationDownloadResult{
				"fr": {LocaleID: "fr", Content: []byte(`{"hello":"Bonjour"}`)},
			},
			err: nil,
		}, nil
	}
	defer func() { newSmartlingTranslationDownloader = orig }()

	// We need to simulate an error on the second locale. Use a custom downloader.
	newSmartlingTranslationDownloader = func(_ smartling.Config) (smartlingTranslationDownloader, error) {
		return &fakeSmartlingTranslationDownloaderWithError{
			results: map[string]smartling.TranslationDownloadResult{
				"fr": {LocaleID: "fr", Content: []byte(`{"hello":"Bonjour"}`)},
				"de": {LocaleID: "de", Content: []byte(`{"hello":"Hallo"}`)},
			},
			errLocale: "de",
		}, nil
	}

	dir := t.TempDir()
	root := newRootCmd("test")
	root.SetArgs([]string{
		"smartling", "download", "translations",
		"--project-id", "123",
		"--target-locale", "fr",
		"--target-locale", "de",
		"--file-uri", "test.json",
		"--output", filepath.Join(dir, "%locale%.json"),
	})

	err := root.Execute()
	if err == nil {
		t.Fatal("expected later locale failure")
	}
	if _, statErr := os.Stat(filepath.Join(dir, "fr.json")); !os.IsNotExist(statErr) {
		t.Fatalf("fr output should be removed after later failure, stat err=%v", statErr)
	}
}

type fakeSmartlingTranslationDownloaderWithError struct {
	results   map[string]smartling.TranslationDownloadResult
	errLocale string
}

func (f *fakeSmartlingTranslationDownloaderWithError) DownloadTranslationFile(_ context.Context, in smartling.TranslationDownloadInput) (smartling.TranslationDownloadResult, error) {
	if in.LocaleID == f.errLocale {
		return smartling.TranslationDownloadResult{}, errors.New("download failed")
	}
	result, ok := f.results[in.LocaleID]
	if !ok {
		return smartling.TranslationDownloadResult{LocaleID: in.LocaleID, Content: []byte(`{}`)}, nil
	}
	return result, nil
}

func TestSmartlingDownloadTranslationsRefusesOverwriteWithoutForce(t *testing.T) {
	outputPath := filepath.Join(t.TempDir(), "fr.json")
	if err := os.WriteFile(outputPath, []byte(`{"old":"Old"}`), 0o644); err != nil {
		t.Fatalf("write existing output: %v", err)
	}

	root := newRootCmd("test")
	root.SetArgs([]string{
		"smartling", "download", "translations",
		"--project-id", "123",
		"--target-locale", "fr",
		"--file-uri", "test.json",
		"--output", outputPath,
	})

	err := root.Execute()
	if err == nil {
		t.Fatal("expected overwrite error")
	}
	if !strings.Contains(err.Error(), "already exists; use --force to overwrite") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestSmartlingDownloadTranslationsForceKeepsOverwrittenFileOnLaterFailure(t *testing.T) {
	t.Setenv("SMARTLING_USER_IDENTIFIER", "uid")
	t.Setenv("SMARTLING_USER_SECRET", "secret")

	orig := newSmartlingTranslationDownloader
	newSmartlingTranslationDownloader = func(_ smartling.Config) (smartlingTranslationDownloader, error) {
		return &fakeSmartlingTranslationDownloaderWithError{
			results: map[string]smartling.TranslationDownloadResult{
				"fr": {LocaleID: "fr", Content: []byte(`{"hello":"Bonjour"}`)},
				"de": {LocaleID: "de", Content: []byte(`{"hello":"Hallo"}`)},
			},
			errLocale: "de",
		}, nil
	}
	defer func() { newSmartlingTranslationDownloader = orig }()

	dir := t.TempDir()
	frPath := filepath.Join(dir, "fr.json")
	dePath := filepath.Join(dir, "de.json")
	if err := os.WriteFile(frPath, []byte(`{"old":"Fr"}`), 0o644); err != nil {
		t.Fatalf("write existing fr output: %v", err)
	}
	if err := os.WriteFile(dePath, []byte(`{"old":"De"}`), 0o644); err != nil {
		t.Fatalf("write existing de output: %v", err)
	}

	root := newRootCmd("test")
	root.SetArgs([]string{
		"smartling", "download", "translations",
		"--project-id", "123",
		"--target-locale", "fr",
		"--target-locale", "de",
		"--file-uri", "test.json",
		"--output", filepath.Join(dir, "%locale%.json"),
		"--force",
	})

	err := root.Execute()
	if err == nil {
		t.Fatal("expected later locale failure")
	}
	fr, readErr := os.ReadFile(frPath)
	if readErr != nil {
		t.Fatalf("fr output should still exist after later failure: %v", readErr)
	}
	if string(fr) != `{"hello":"Bonjour"}` {
		t.Fatalf("expected overwritten fr output to be kept, got %q", string(fr))
	}
	de, readErr := os.ReadFile(dePath)
	if readErr != nil {
		t.Fatalf("de output should still exist after failure: %v", readErr)
	}
	if string(de) != `{"old":"De"}` {
		t.Fatalf("expected de output to remain unchanged, got %q", string(de))
	}
}

func TestSmartlingUploadSourcesDryRun(t *testing.T) {
	t.Setenv("SMARTLING_USER_IDENTIFIER", "uid")
	t.Setenv("SMARTLING_USER_SECRET", "secret")

	root := newRootCmd("test")
	out := &bytes.Buffer{}
	root.SetOut(out)
	root.SetErr(out)

	root.SetArgs([]string{
		"smartling", "upload", "sources",
		"--project-id", "123",
		"--file", "test.json",
		"--dry-run",
	})

	if err := root.Execute(); err != nil {
		t.Fatalf("execute failed: %v", err)
	}

	if !strings.Contains(out.String(), "dry-run action=smartling-upload-source file=test.json") {
		t.Errorf("unexpected output: %s", out.String())
	}
}

func TestSmartlingUploadSourcesRejectsSharedFileURIForMultipleFiles(t *testing.T) {
	root := newRootCmd("test")
	out := &bytes.Buffer{}
	root.SetOut(out)
	root.SetErr(out)

	root.SetArgs([]string{
		"smartling", "upload", "sources",
		"--project-id", "123",
		"--file", "one.json",
		"--file", "two.json",
		"--file-uri", "shared.json",
		"--dry-run",
	})

	err := root.Execute()
	if err == nil {
		t.Fatal("expected shared file-uri error")
	}
	if !strings.Contains(err.Error(), "--file-uri cannot be used with multiple --file values") {
		t.Fatalf("unexpected error: %v", err)
	}
}
