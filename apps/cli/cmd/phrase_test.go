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
