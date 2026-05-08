package cmd

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestPhraseUploadSourcesDryRunValidatesFiles(t *testing.T) {
	dir := t.TempDir()
	sourcePath := filepath.Join(dir, "en.json")
	if err := os.WriteFile(sourcePath, []byte(`{"hello":"Hello"}`), 0o644); err != nil {
		t.Fatalf("write source file: %v", err)
	}

	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetArgs([]string{"phrase", "upload", "sources", "--project-id", "project-1", "--source-locale", "en", "--format", "json", "--file", sourcePath, "--dry-run"})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute phrase upload dry-run: %v", err)
	}
	if !strings.Contains(out.String(), "dry-run action=phrase-upload-sources") || !strings.Contains(out.String(), "files=1") {
		t.Fatalf("unexpected output: %q", out.String())
	}
}

func TestPhraseUploadSourcesAcceptsCommaInFilePath(t *testing.T) {
	dir := t.TempDir()
	sourcePath := filepath.Join(dir, "hello,world.json")
	if err := os.WriteFile(sourcePath, []byte(`{"hello":"Hello"}`), 0o644); err != nil {
		t.Fatalf("write source file: %v", err)
	}

	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetArgs([]string{"phrase", "upload", "sources", "--project-id", "project-1", "--source-locale", "en", "--format", "json", "--file", sourcePath, "--dry-run"})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute phrase upload dry-run: %v", err)
	}
	if !strings.Contains(out.String(), "files=1") {
		t.Fatalf("unexpected output: %q", out.String())
	}
}

func TestPhraseUploadSourcesRequiresFile(t *testing.T) {
	cmd := newRootCmd("")
	cmd.SetArgs([]string{"phrase", "upload", "sources", "--project-id", "project-1", "--source-locale", "en", "--format", "json"})

	err := cmd.Execute()
	if err == nil {
		t.Fatalf("expected missing file error")
	}
	if !strings.Contains(err.Error(), "at least one --file is required") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestPhraseUploadSourcesTokenErrorListsFallback(t *testing.T) {
	dir := t.TempDir()
	sourcePath := filepath.Join(dir, "en.json")
	if err := os.WriteFile(sourcePath, []byte(`{"hello":"Hello"}`), 0o644); err != nil {
		t.Fatalf("write source file: %v", err)
	}
	t.Setenv("PHRASE_CUSTOM_TOKEN", "")
	t.Setenv("PHRASE_API_TOKEN", "")

	cmd := newRootCmd("")
	cmd.SetArgs([]string{"phrase", "upload", "sources", "--project-id", "project-1", "--source-locale", "en", "--format", "json", "--file", sourcePath, "--token-env", "PHRASE_CUSTOM_TOKEN"})

	err := cmd.Execute()
	if err == nil {
		t.Fatalf("expected missing token error")
	}
	if !strings.Contains(err.Error(), "PHRASE_CUSTOM_TOKEN or PHRASE_API_TOKEN") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestPhraseUploadSourcesUploadsToPhraseAPI(t *testing.T) {
	dir := t.TempDir()
	sourcePath := filepath.Join(dir, "en.json")
	if err := os.WriteFile(sourcePath, []byte(`{"hello":"Hello"}`), 0o644); err != nil {
		t.Fatalf("write source file: %v", err)
	}
	t.Setenv("PHRASE_TEST_TOKEN", "secret")

	var sawUpload bool
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/projects/project-1/uploads" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if r.Header.Get("Authorization") != "token secret" {
			t.Fatalf("unexpected auth header: %q", r.Header.Get("Authorization"))
		}
		if err := r.ParseMultipartForm(1 << 20); err != nil {
			t.Fatalf("parse multipart form: %v", err)
		}
		if got := r.FormValue("locale_id"); got != "en" {
			t.Fatalf("locale_id = %q, want en", got)
		}
		if got := r.FormValue("file_format"); got != "json" {
			t.Fatalf("file_format = %q, want json", got)
		}
		if got := r.FormValue("branch"); got != "main" {
			t.Fatalf("branch = %q, want main", got)
		}
		if got := r.FormValue("tags"); got != "app,source" {
			t.Fatalf("tags = %q, want app,source", got)
		}
		file, header, err := r.FormFile("file")
		if err != nil {
			t.Fatalf("form file: %v", err)
		}
		_ = file.Close()
		if header.Filename != "en.json" {
			t.Fatalf("filename = %q, want en.json", header.Filename)
		}
		sawUpload = true
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"id":       "upload-1",
			"filename": "en.json",
			"format":   "json",
			"state":    "success",
			"summary": map[string]int{
				"translation_keys_created": 2,
				"translation_keys_updated": 1,
				"translations_created":     2,
				"translations_updated":     1,
			},
		})
	}))
	defer server.Close()

	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetArgs([]string{"phrase", "upload", "sources", "--project-id", "project-1", "--source-locale", "en", "--format", "json", "--file", sourcePath, "--branch", "main", "--tag", "app", "--tag", "source", "--token-env", "PHRASE_TEST_TOKEN", "--api-base-url", server.URL})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute phrase upload: %v", err)
	}
	if !sawUpload {
		t.Fatalf("expected upload request")
	}
	output := out.String()
	if !strings.Contains(output, "uploaded file="+sourcePath) || !strings.Contains(output, "upload_id=upload-1") || !strings.Contains(output, "processed=1") {
		t.Fatalf("unexpected output: %q", output)
	}
}

func TestPhraseDownloadSourcesDryRun(t *testing.T) {
	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetArgs([]string{"phrase", "download", "sources", "--project-id", "project-1", "--source-locale", "en", "--format", "json", "--output", "en.json", "--dry-run"})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute phrase download dry-run: %v", err)
	}
	if !strings.Contains(out.String(), "dry-run action=phrase-download-sources") || !strings.Contains(out.String(), "output=en.json") {
		t.Fatalf("unexpected output: %q", out.String())
	}
}

func TestPhraseDownloadSourcesWritesStdout(t *testing.T) {
	t.Setenv("PHRASE_TEST_TOKEN", "secret")

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/projects/project-1/locales/en/download" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if r.Header.Get("Authorization") != "token secret" {
			t.Fatalf("unexpected auth header: %q", r.Header.Get("Authorization"))
		}
		if got := r.URL.Query().Get("file_format"); got != "json" {
			t.Fatalf("file_format = %q, want json", got)
		}
		if got := r.URL.Query().Get("branch"); got != "main" {
			t.Fatalf("branch = %q, want main", got)
		}
		if got := r.URL.Query().Get("tags"); got != "app,source" {
			t.Fatalf("tags = %q, want app,source", got)
		}
		_, _ = w.Write([]byte(`{"hello":"Hello"}`))
	}))
	defer server.Close()

	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetArgs([]string{"phrase", "download", "sources", "--project-id", "project-1", "--source-locale", "en", "--format", "json", "--branch", "main", "--tag", "app", "--tag", "source", "--token-env", "PHRASE_TEST_TOKEN", "--api-base-url", server.URL})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute phrase download: %v", err)
	}
	if got := out.String(); got != `{"hello":"Hello"}` {
		t.Fatalf("unexpected stdout content: %q", got)
	}
}

func TestPhraseDownloadSourcesWritesOutputFile(t *testing.T) {
	t.Setenv("PHRASE_TEST_TOKEN", "secret")
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"hello":"Hello"}`))
	}))
	defer server.Close()

	outputPath := filepath.Join(t.TempDir(), "locales", "en.json")
	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetArgs([]string{"phrase", "download", "sources", "--project-id", "project-1", "--source-locale", "en", "--format", "json", "--output", outputPath, "--token-env", "PHRASE_TEST_TOKEN", "--api-base-url", server.URL})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute phrase download: %v", err)
	}
	content, err := os.ReadFile(outputPath)
	if err != nil {
		t.Fatalf("read output file: %v", err)
	}
	if string(content) != `{"hello":"Hello"}` {
		t.Fatalf("unexpected file content: %q", string(content))
	}
	if !strings.Contains(out.String(), "downloaded file="+outputPath) || !strings.Contains(out.String(), "bytes=17") {
		t.Fatalf("unexpected output: %q", out.String())
	}
}

func TestPhraseDownloadSourcesRefusesOverwriteWithoutForce(t *testing.T) {
	t.Setenv("PHRASE_TEST_TOKEN", "secret")
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"hello":"Hello"}`))
	}))
	defer server.Close()

	outputPath := filepath.Join(t.TempDir(), "en.json")
	if err := os.WriteFile(outputPath, []byte(`{"old":"Old"}`), 0o644); err != nil {
		t.Fatalf("write existing output: %v", err)
	}
	cmd := newRootCmd("")
	cmd.SetArgs([]string{"phrase", "download", "sources", "--project-id", "project-1", "--source-locale", "en", "--format", "json", "--output", outputPath, "--token-env", "PHRASE_TEST_TOKEN", "--api-base-url", server.URL})

	err := cmd.Execute()
	if err == nil {
		t.Fatalf("expected overwrite error")
	}
	if !strings.Contains(err.Error(), "already exists; use --force to overwrite") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestPhraseDownloadSourcesForceOverwritesOutputFile(t *testing.T) {
	t.Setenv("PHRASE_TEST_TOKEN", "secret")
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"hello":"Hello"}`))
	}))
	defer server.Close()

	outputPath := filepath.Join(t.TempDir(), "en.json")
	if err := os.WriteFile(outputPath, []byte(`{"old":"Old"}`), 0o644); err != nil {
		t.Fatalf("write existing output: %v", err)
	}
	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetArgs([]string{"phrase", "download", "sources", "--project-id", "project-1", "--source-locale", "en", "--format", "json", "--output", outputPath, "--force", "--token-env", "PHRASE_TEST_TOKEN", "--api-base-url", server.URL})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute phrase download with force: %v", err)
	}
	content, err := os.ReadFile(outputPath)
	if err != nil {
		t.Fatalf("read output file: %v", err)
	}
	if string(content) != `{"hello":"Hello"}` {
		t.Fatalf("unexpected file content: %q", string(content))
	}
	matches, err := filepath.Glob(filepath.Join(filepath.Dir(outputPath), "."+filepath.Base(outputPath)+".tmp-*"))
	if err != nil {
		t.Fatalf("glob temp files: %v", err)
	}
	if len(matches) != 0 {
		t.Fatalf("expected no temp files, got %v", matches)
	}
}

func TestPhraseDownloadSourcesTokenErrorListsFallback(t *testing.T) {
	t.Setenv("PHRASE_CUSTOM_TOKEN", "")
	t.Setenv("PHRASE_API_TOKEN", "")

	cmd := newRootCmd("")
	cmd.SetArgs([]string{"phrase", "download", "sources", "--project-id", "project-1", "--source-locale", "en", "--format", "json", "--token-env", "PHRASE_CUSTOM_TOKEN"})

	err := cmd.Execute()
	if err == nil {
		t.Fatalf("expected missing token error")
	}
	if !strings.Contains(err.Error(), "PHRASE_CUSTOM_TOKEN or PHRASE_API_TOKEN") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestPhraseDownloadTranslationsDryRun(t *testing.T) {
	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetArgs([]string{"phrase", "download", "translations", "--project-id", "project-1", "--target-locale", "fr", "--format", "json", "--output", "fr.json", "--dry-run"})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute phrase translation download dry-run: %v", err)
	}
	if !strings.Contains(out.String(), "dry-run action=phrase-download-translations") || !strings.Contains(out.String(), "target_locales=fr") || !strings.Contains(out.String(), "output=fr.json") {
		t.Fatalf("unexpected output: %q", out.String())
	}
}

func TestPhraseDownloadTranslationsRequiresTargetLocale(t *testing.T) {
	cmd := newRootCmd("")
	cmd.SetArgs([]string{"phrase", "download", "translations", "--project-id", "project-1", "--format", "json"})

	err := cmd.Execute()
	if err == nil {
		t.Fatalf("expected missing target locale error")
	}
	if !strings.Contains(err.Error(), "at least one --target-locale is required") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestPhraseDownloadTranslationsWritesStdout(t *testing.T) {
	t.Setenv("PHRASE_TEST_TOKEN", "secret")

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/projects/project-1/locales/fr/download" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if r.Header.Get("Authorization") != "token secret" {
			t.Fatalf("unexpected auth header: %q", r.Header.Get("Authorization"))
		}
		if got := r.URL.Query().Get("file_format"); got != "json" {
			t.Fatalf("file_format = %q, want json", got)
		}
		if got := r.URL.Query().Get("branch"); got != "main" {
			t.Fatalf("branch = %q, want main", got)
		}
		if got := r.URL.Query().Get("tags"); got != "app,reviewed" {
			t.Fatalf("tags = %q, want app,reviewed", got)
		}
		_, _ = w.Write([]byte(`{"hello":"Bonjour"}`))
	}))
	defer server.Close()

	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetArgs([]string{"phrase", "download", "translations", "--project-id", "project-1", "--target-locale", "fr", "--format", "json", "--branch", "main", "--tag", "app", "--tag", "reviewed", "--token-env", "PHRASE_TEST_TOKEN", "--api-base-url", server.URL})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute phrase translation download: %v", err)
	}
	if got := out.String(); got != `{"hello":"Bonjour"}` {
		t.Fatalf("unexpected stdout content: %q", got)
	}
}

func TestPhraseDownloadTranslationsWritesOutputFile(t *testing.T) {
	t.Setenv("PHRASE_TEST_TOKEN", "secret")
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"hello":"Bonjour"}`))
	}))
	defer server.Close()

	outputPath := filepath.Join(t.TempDir(), "locales", "fr.json")
	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetArgs([]string{"phrase", "download", "translations", "--project-id", "project-1", "--target-locale", "fr", "--format", "json", "--output", outputPath, "--token-env", "PHRASE_TEST_TOKEN", "--api-base-url", server.URL})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute phrase translation download: %v", err)
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

func TestPhraseDownloadTranslationsMultipleLocalesUseOutputPattern(t *testing.T) {
	t.Setenv("PHRASE_TEST_TOKEN", "secret")
	requests := make([]string, 0, 2)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests = append(requests, r.URL.Path)
		switch r.URL.Path {
		case "/projects/project-1/locales/fr/download":
			_, _ = w.Write([]byte(`{"hello":"Bonjour"}`))
		case "/projects/project-1/locales/de/download":
			_, _ = w.Write([]byte(`{"hello":"Hallo"}`))
		default:
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
	}))
	defer server.Close()

	dir := t.TempDir()
	outputPattern := filepath.Join(dir, "%locale%.json")
	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetArgs([]string{"phrase", "download", "translations", "--project-id", "project-1", "--target-locale", "fr,de", "--format", "json", "--output", outputPattern, "--token-env", "PHRASE_TEST_TOKEN", "--api-base-url", server.URL})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute phrase translation download: %v", err)
	}
	if len(requests) != 2 {
		t.Fatalf("requests len = %d, want 2", len(requests))
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

func TestPhraseDownloadTranslationsMultipleLocalesRequireOutputPattern(t *testing.T) {
	cmd := newRootCmd("")
	cmd.SetArgs([]string{"phrase", "download", "translations", "--project-id", "project-1", "--target-locale", "fr", "--target-locale", "de", "--format", "json", "--output", "translations.json", "--dry-run"})

	err := cmd.Execute()
	if err == nil {
		t.Fatalf("expected output pattern error")
	}
	if !strings.Contains(err.Error(), "must include %locale%") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestPhraseDownloadTranslationsRefusesOverwriteWithoutForce(t *testing.T) {
	outputPath := filepath.Join(t.TempDir(), "fr.json")
	if err := os.WriteFile(outputPath, []byte(`{"old":"Old"}`), 0o644); err != nil {
		t.Fatalf("write existing output: %v", err)
	}
	cmd := newRootCmd("")
	cmd.SetArgs([]string{"phrase", "download", "translations", "--project-id", "project-1", "--target-locale", "fr", "--format", "json", "--output", outputPath})

	err := cmd.Execute()
	if err == nil {
		t.Fatalf("expected overwrite error")
	}
	if !strings.Contains(err.Error(), "already exists; use --force to overwrite") {
		t.Fatalf("unexpected error: %v", err)
	}
}
