package cmd

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/storage/phrase"
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

func TestPhraseUploadSourcesUsesPhraseConfig(t *testing.T) {
	dir := t.TempDir()
	sourcePath := filepath.Join(dir, "locales", "en.json")
	if err := os.MkdirAll(filepath.Dir(sourcePath), 0o755); err != nil {
		t.Fatalf("mkdir locales: %v", err)
	}
	if err := os.WriteFile(sourcePath, []byte(`{"hello":"Hello"}`), 0o644); err != nil {
		t.Fatalf("write source file: %v", err)
	}
	t.Setenv("PHRASE_ACCESS_TOKEN", "secret")

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
		if got := r.FormValue("locale_id"); got != "en-US" {
			t.Fatalf("locale_id = %q, want en-US", got)
		}
		if got := r.FormValue("file_format"); got != "json" {
			t.Fatalf("file_format = %q, want json", got)
		}
		if got := r.FormValue("tags"); got != "app,source" {
			t.Fatalf("tags = %q, want app,source", got)
		}
		if got := r.FormValue("update_translations"); got != "true" {
			t.Fatalf("update_translations = %q, want true", got)
		}
		if got := r.FormValue("update_translation_keys"); got != "false" {
			t.Fatalf("update_translation_keys = %q, want false", got)
		}
		if got := r.FormValue("skip_upload_tags"); got != "true" {
			t.Fatalf("skip_upload_tags = %q, want true", got)
		}
		sawUpload = true
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"id":       "upload-1",
			"filename": "en.json",
			"format":   "json",
			"state":    "success",
			"summary": map[string]int{
				"translation_keys_created": 1,
			},
		})
	}))
	defer server.Close()

	configPath := filepath.Join(dir, ".phrase.yml")
	if err := os.WriteFile(configPath, []byte(`
phrase:
  access_token: $PHRASE_ACCESS_TOKEN
  project_id: project-1
  file_format: json
  host: `+server.URL+`
  push:
    sources:
      - file: ./locales/en.json
        params:
          locale_id: en-US
          tags: app,source
          update_translations: true
          update_translation_keys: false
          skip_upload_tags: true
`), 0o644); err != nil {
		t.Fatalf("write phrase config: %v", err)
	}

	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetArgs([]string{"phrase", "upload", "sources", "--config", configPath})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute phrase upload: %v", err)
	}
	if !sawUpload {
		t.Fatalf("expected upload request")
	}
	if !strings.Contains(out.String(), "uploaded file="+sourcePath) || !strings.Contains(out.String(), "processed=1") {
		t.Fatalf("unexpected output: %q", out.String())
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

func TestPhraseDownloadTranslationsUsesPhraseConfig(t *testing.T) {
	t.Setenv("PHRASE_ACCESS_TOKEN", "secret")
	dir := t.TempDir()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/projects/project-1/locales/fr-FR/download" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if r.Header.Get("Authorization") != "token secret" {
			t.Fatalf("unexpected auth header: %q", r.Header.Get("Authorization"))
		}
		if got := r.URL.Query().Get("file_format"); got != "json" {
			t.Fatalf("file_format = %q, want json", got)
		}
		if got := r.URL.Query().Get("tags"); got != "app,reviewed" {
			t.Fatalf("tags = %q, want app,reviewed", got)
		}
		if got := r.URL.Query().Get("include_unverified_translations"); got != "false" {
			t.Fatalf("include_unverified_translations = %q, want false", got)
		}
		if got := r.URL.Query().Get("include_empty_translations"); got != "true" {
			t.Fatalf("include_empty_translations = %q, want true", got)
		}
		_, _ = w.Write([]byte(`{"hello":"Bonjour"}`))
	}))
	defer server.Close()

	configPath := filepath.Join(dir, ".phrase.yml")
	if err := os.WriteFile(configPath, []byte(`
phrase:
  access_token: $PHRASE_ACCESS_TOKEN
  project_id: project-1
  file_format: json
  host: `+server.URL+`
  locale_mapping:
    fr-FR: fr
  pull:
    targets:
      - file: ./locales/<locale_name>.json
        params:
          locale_id: fr-FR
          tags:
            - app
            - reviewed
          include_unverified_translations: false
          include_empty_translations: true
`), 0o644); err != nil {
		t.Fatalf("write phrase config: %v", err)
	}

	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetArgs([]string{"phrase", "download", "translations", "--config", configPath})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute phrase translation download: %v", err)
	}
	outputPath := filepath.Join(dir, "locales", "fr.json")
	content, err := os.ReadFile(outputPath)
	if err != nil {
		t.Fatalf("read output file: %v", err)
	}
	if string(content) != `{"hello":"Bonjour"}` {
		t.Fatalf("unexpected file content: %q", string(content))
	}
	if !strings.Contains(out.String(), "downloaded file="+outputPath) || !strings.Contains(out.String(), "locale=fr-FR") {
		t.Fatalf("unexpected output: %q", out.String())
	}
}

func TestPhraseDownloadTranslationsRejectsConfigUntrustedHost(t *testing.T) {
	t.Setenv("PHRASE_ACCESS_TOKEN", "secret")
	dir := t.TempDir()
	configPath := filepath.Join(dir, ".phrase.yml")
	if err := os.WriteFile(configPath, []byte(`
phrase:
  access_token: $PHRASE_ACCESS_TOKEN
  project_id: project-1
  file_format: json
  host: https://attacker.example/v2
  pull:
    targets:
      - file: ./locales/fr.json
        params:
          locale_id: fr-FR
`), 0o644); err != nil {
		t.Fatalf("write phrase config: %v", err)
	}

	cmd := newRootCmd("")
	cmd.SetArgs([]string{"phrase", "download", "translations", "--config", configPath})

	err := cmd.Execute()
	if err == nil {
		t.Fatalf("expected untrusted Phrase host to be rejected")
	}
	if !strings.Contains(err.Error(), "allowed Phrase API host") {
		t.Fatalf("error = %v, want allowed host rejection", err)
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

func TestPhraseDownloadTranslationsRemovesWrittenFilesOnLaterFailure(t *testing.T) {
	t.Setenv("PHRASE_TEST_TOKEN", "secret")
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/projects/project-1/locales/fr/download":
			_, _ = w.Write([]byte(`{"hello":"Bonjour"}`))
		case "/projects/project-1/locales/de/download":
			http.Error(w, `{"message":"Locale not found"}`, http.StatusNotFound)
		default:
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
	}))
	defer server.Close()

	dir := t.TempDir()
	cmd := newRootCmd("")
	cmd.SetArgs([]string{"phrase", "download", "translations", "--project-id", "project-1", "--target-locale", "fr", "--target-locale", "de", "--format", "json", "--output", filepath.Join(dir, "%locale%.json"), "--token-env", "PHRASE_TEST_TOKEN", "--api-base-url", server.URL})

	err := cmd.Execute()
	if err == nil {
		t.Fatalf("expected later locale failure")
	}
	if _, statErr := os.Stat(filepath.Join(dir, "fr.json")); !os.IsNotExist(statErr) {
		t.Fatalf("fr output should be removed after later failure, stat err=%v", statErr)
	}
	if _, statErr := os.Stat(filepath.Join(dir, "de.json")); !os.IsNotExist(statErr) {
		t.Fatalf("de output should not exist after failure, stat err=%v", statErr)
	}
}

func TestPhraseDownloadTranslationsForceKeepsOverwrittenFileOnLaterFailure(t *testing.T) {
	t.Setenv("PHRASE_TEST_TOKEN", "secret")
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/projects/project-1/locales/fr/download":
			_, _ = w.Write([]byte(`{"hello":"Bonjour"}`))
		case "/projects/project-1/locales/de/download":
			http.Error(w, `{"message":"Locale not found"}`, http.StatusNotFound)
		default:
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
	}))
	defer server.Close()

	dir := t.TempDir()
	frPath := filepath.Join(dir, "fr.json")
	dePath := filepath.Join(dir, "de.json")
	if err := os.WriteFile(frPath, []byte(`{"old":"Fr"}`), 0o644); err != nil {
		t.Fatalf("write existing fr output: %v", err)
	}
	if err := os.WriteFile(dePath, []byte(`{"old":"De"}`), 0o644); err != nil {
		t.Fatalf("write existing de output: %v", err)
	}

	cmd := newRootCmd("")
	cmd.SetArgs([]string{"phrase", "download", "translations", "--project-id", "project-1", "--target-locale", "fr", "--target-locale", "de", "--format", "json", "--output", filepath.Join(dir, "%locale%.json"), "--force", "--token-env", "PHRASE_TEST_TOKEN", "--api-base-url", server.URL})

	err := cmd.Execute()
	if err == nil {
		t.Fatalf("expected later locale failure")
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

func TestPhraseGlossaryDownloadWritesCSVToStdout(t *testing.T) {
	t.Setenv("PHRASE_TEST_TOKEN", "secret")
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/accounts/acct-1/glossaries/gloss-1/terms" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if r.Header.Get("Authorization") != "token secret" {
			t.Fatalf("unexpected auth header: %q", r.Header.Get("Authorization"))
		}
		_, _ = w.Write([]byte(`[{"id":"term-1","term":"Checkout","description":"CTA","translatable":true,"case_sensitive":true,"translations":[{"id":"tr-1","locale_code":"fr-FR","content":"Paiement","created_at":"2024-03-01T00:00:00Z","updated_at":"2024-03-02T00:00:00Z"}],"created_at":"2024-01-03T00:00:00Z","updated_at":"2024-01-04T00:00:00Z"}]`))
	}))
	defer server.Close()

	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetArgs([]string{"phrase", "glossary", "download", "--account-id", "acct-1", "--glossary-id", "gloss-1", "--language", "fr-FR", "--token-env", "PHRASE_TEST_TOKEN", "--api-base-url", server.URL})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute phrase glossary download: %v", err)
	}
	if !strings.Contains(out.String(), "account_id,glossary_id,term_id,source_term") || !strings.Contains(out.String(), "acct-1,gloss-1,term-1,Checkout,CTA,true,true,fr-FR,Paiement") {
		t.Fatalf("unexpected output: %q", out.String())
	}
}

func TestPhraseGlossaryDownloadWritesOutputFile(t *testing.T) {
	t.Setenv("PHRASE_TEST_TOKEN", "secret")
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`[{"id":"term-1","term":"Checkout","description":"CTA","translatable":true,"case_sensitive":true,"translations":[],"created_at":"2024-01-03T00:00:00Z","updated_at":"2024-01-04T00:00:00Z"}]`))
	}))
	defer server.Close()

	outputPath := filepath.Join(t.TempDir(), "glossary.csv")
	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetArgs([]string{"phrase", "glossary", "download", "--account-id", "acct-1", "--glossary-id", "gloss-1", "--output", outputPath, "--token-env", "PHRASE_TEST_TOKEN", "--api-base-url", server.URL})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute phrase glossary download: %v", err)
	}
	content, err := os.ReadFile(outputPath)
	if err != nil {
		t.Fatalf("read output: %v", err)
	}
	if !strings.Contains(string(content), "acct-1,gloss-1,term-1,Checkout,CTA,true,true") {
		t.Fatalf("unexpected file content: %q", string(content))
	}
	if !strings.Contains(out.String(), "wrote "+outputPath+" terms=1 rows=1") {
		t.Fatalf("unexpected summary: %q", out.String())
	}
	info, err := os.Stat(outputPath)
	if err != nil {
		t.Fatalf("stat output: %v", err)
	}
	if got, want := info.Mode().Perm(), os.FileMode(0o644); got != want {
		t.Fatalf("output permissions = %v, want %v", got, want)
	}
}

func TestPhraseGlossaryDownloadRequiresAccountID(t *testing.T) {
	cmd := newRootCmd("")
	cmd.SetArgs([]string{"phrase", "glossary", "download", "--glossary-id", "gloss-1"})

	err := cmd.Execute()
	if err == nil {
		t.Fatalf("expected missing account id error")
	}
	if !strings.Contains(err.Error(), "--account-id is required") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestPhraseGlossaryDownloadRequiresGlossaryID(t *testing.T) {
	cmd := newRootCmd("")
	cmd.SetArgs([]string{"phrase", "glossary", "download", "--account-id", "acct-1"})

	err := cmd.Execute()
	if err == nil {
		t.Fatalf("expected missing glossary id error")
	}
	if !strings.Contains(err.Error(), "--glossary-id is required") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestPhraseGlossaryDownloadRefusesOverwriteWithoutForce(t *testing.T) {
	outputPath := filepath.Join(t.TempDir(), "glossary.csv")
	if err := os.WriteFile(outputPath, []byte("old"), 0o644); err != nil {
		t.Fatalf("write existing output: %v", err)
	}
	cmd := newRootCmd("")
	cmd.SetArgs([]string{"phrase", "glossary", "download", "--account-id", "acct-1", "--glossary-id", "gloss-1", "--output", outputPath})

	err := cmd.Execute()
	if err == nil {
		t.Fatalf("expected overwrite error")
	}
	if !strings.Contains(err.Error(), "already exists; use --force to overwrite") {
		t.Fatalf("unexpected error: %v", err)
	}
}

type fakePhraseTranslationMemoryWriter struct {
	input phrase.TranslationMemoryDownloadInput
	err   error
}

func (f *fakePhraseTranslationMemoryWriter) WriteTranslationMemoryCSV(_ context.Context, input phrase.TranslationMemoryDownloadInput, w io.Writer) (phrase.TranslationMemoryDownloadResult, error) {
	f.input = input
	if f.err != nil {
		return phrase.TranslationMemoryDownloadResult{}, f.err
	}
	if _, err := io.WriteString(w, "source_text,target_text\nCheckout,Paiement\n"); err != nil {
		return phrase.TranslationMemoryDownloadResult{}, err
	}
	return phrase.TranslationMemoryDownloadResult{Rows: 1, Segments: 1}, nil
}

func (f *fakePhraseTranslationMemoryWriter) WriteTranslationMemoryTMX(_ context.Context, input phrase.TranslationMemoryDownloadInput, w io.Writer) (phrase.TranslationMemoryDownloadResult, error) {
	f.input = input
	if f.err != nil {
		return phrase.TranslationMemoryDownloadResult{}, f.err
	}
	if _, err := io.WriteString(w, "<?xml version=\"1.0\" encoding=\"UTF-8\"?><tmx version=\"1.4\"><body></body></tmx>"); err != nil {
		return phrase.TranslationMemoryDownloadResult{}, err
	}
	return phrase.TranslationMemoryDownloadResult{Rows: 1, Segments: 1}, nil
}

func TestPhraseTranslationMemoryDownloadWritesCSVToStdout(t *testing.T) {
	t.Setenv("PHRASE_TEST_TOKEN", "secret")
	oldFactory := newPhraseTranslationMemoryWriter
	defer func() { newPhraseTranslationMemoryWriter = oldFactory }()
	fake := &fakePhraseTranslationMemoryWriter{}
	newPhraseTranslationMemoryWriter = func(apiBaseURL string) (phraseTranslationMemoryWriter, error) {
		if apiBaseURL != "https://phrase-tms.example/api2" {
			t.Fatalf("api base url = %q", apiBaseURL)
		}
		return fake, nil
	}

	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetArgs([]string{"phrase", "tm", "download", "--tm-id", "tm-1", "--source-language", "en-US", "--target-language", "fr-FR", "--token-env", "PHRASE_TEST_TOKEN", "--api-base-url", "https://phrase-tms.example/api2"})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute phrase tm download: %v", err)
	}
	if got, want := out.String(), "source_text,target_text\nCheckout,Paiement\n"; got != want {
		t.Fatalf("output = %q, want %q", got, want)
	}
	if fake.input.TranslationMemoryID != "tm-1" || fake.input.APIToken != "secret" || fake.input.SourceLanguage != "en-US" {
		t.Fatalf("input = %#v", fake.input)
	}
	if got, want := strings.Join(fake.input.TargetLanguages, ","), "fr-FR"; got != want {
		t.Fatalf("target languages = %q, want %q", got, want)
	}
}

func TestPhraseTranslationMemoryDownloadWritesTMXToStdout(t *testing.T) {
	t.Setenv("PHRASE_TEST_TOKEN", "secret")
	oldFactory := newPhraseTranslationMemoryWriter
	defer func() { newPhraseTranslationMemoryWriter = oldFactory }()
	fake := &fakePhraseTranslationMemoryWriter{}
	newPhraseTranslationMemoryWriter = func(string) (phraseTranslationMemoryWriter, error) {
		return fake, nil
	}

	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetArgs([]string{"phrase", "tm", "download", "--tm-id", "tm-1", "--source-language", "en-US", "--target-language", "fr-FR", "--format", "tmx", "--token-env", "PHRASE_TEST_TOKEN"})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute phrase tm tmx download: %v", err)
	}
	if !strings.Contains(out.String(), "<tmx version=\"1.4\">") {
		t.Fatalf("output = %q, want TMX", out.String())
	}
	if fake.input.TranslationMemoryID != "tm-1" {
		t.Fatalf("input = %#v", fake.input)
	}
}

func TestPhraseTranslationMemoryDownloadWritesTMXToFile(t *testing.T) {
	t.Setenv("PHRASE_TEST_TOKEN", "secret")
	oldFactory := newPhraseTranslationMemoryWriter
	defer func() { newPhraseTranslationMemoryWriter = oldFactory }()
	newPhraseTranslationMemoryWriter = func(string) (phraseTranslationMemoryWriter, error) {
		return &fakePhraseTranslationMemoryWriter{}, nil
	}

	outputPath := filepath.Join(t.TempDir(), "tm.tmx")
	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetArgs([]string{"phrase", "tm", "download", "--tm-id", "tm-1", "--source-language", "en-US", "--target-language", "fr-FR", "--format", "tmx", "--output", outputPath, "--token-env", "PHRASE_TEST_TOKEN"})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute phrase tm tmx download: %v", err)
	}
	content, err := os.ReadFile(outputPath)
	if err != nil {
		t.Fatalf("read output: %v", err)
	}
	if !strings.Contains(string(content), "<tmx version=\"1.4\">") {
		t.Fatalf("file = %q, want TMX", string(content))
	}
	if !strings.Contains(out.String(), "wrote "+outputPath+" format=tmx rows=1 segments=1") {
		t.Fatalf("summary = %q", out.String())
	}
}

func TestPhraseTranslationMemoryDownloadWritesCSVToFile(t *testing.T) {
	t.Setenv("PHRASE_TEST_TOKEN", "secret")
	oldFactory := newPhraseTranslationMemoryWriter
	defer func() { newPhraseTranslationMemoryWriter = oldFactory }()
	newPhraseTranslationMemoryWriter = func(string) (phraseTranslationMemoryWriter, error) {
		return &fakePhraseTranslationMemoryWriter{}, nil
	}

	outputPath := filepath.Join(t.TempDir(), "tm.csv")
	cmd := newRootCmd("")
	out := bytes.NewBuffer(nil)
	cmd.SetOut(out)
	cmd.SetArgs([]string{"phrase", "translation-memory", "download", "--tm-id", "tm-1", "--source-language", "en-US", "--target-language", "fr-FR", "--output", outputPath, "--token-env", "PHRASE_TEST_TOKEN"})

	if err := cmd.Execute(); err != nil {
		t.Fatalf("execute phrase tm download: %v", err)
	}
	content, err := os.ReadFile(outputPath)
	if err != nil {
		t.Fatalf("read output: %v", err)
	}
	if got, want := string(content), "source_text,target_text\nCheckout,Paiement\n"; got != want {
		t.Fatalf("file = %q, want %q", got, want)
	}
	if !strings.Contains(out.String(), "wrote "+outputPath+" rows=1 segments=1") {
		t.Fatalf("summary = %q", out.String())
	}
}

func TestPhraseTranslationMemoryDownloadRefusesOverwriteWithoutForce(t *testing.T) {
	outputPath := filepath.Join(t.TempDir(), "tm.csv")
	if err := os.WriteFile(outputPath, []byte("old"), 0o644); err != nil {
		t.Fatalf("write existing output: %v", err)
	}
	cmd := newRootCmd("")
	cmd.SetArgs([]string{"phrase", "tm", "download", "--tm-id", "tm-1", "--source-language", "en-US", "--target-language", "fr-FR", "--output", outputPath})

	err := cmd.Execute()
	if err == nil {
		t.Fatalf("expected overwrite error")
	}
	if !strings.Contains(err.Error(), "already exists; use --force to overwrite") {
		t.Fatalf("unexpected error: %v", err)
	}
}
