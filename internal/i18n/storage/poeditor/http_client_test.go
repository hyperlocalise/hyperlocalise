package poeditor

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/quiet-circles/hyperlocalise/internal/i18n/storage"
)

func TestNewHTTPClientUsesDefaultTimeout(t *testing.T) {
	client, err := NewHTTPClient(Config{})
	if err != nil {
		t.Fatalf("new http client: %v", err)
	}
	if got, want := client.http.Timeout, 30*time.Second; got != want {
		t.Fatalf("unexpected default timeout: got %v want %v", got, want)
	}
}

func TestHTTPClientExportFileDownloadsJSON(t *testing.T) {
	var serverURL string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/projects/export":
			body, err := io.ReadAll(r.Body)
			if err != nil {
				t.Fatalf("read body: %v", err)
			}
			values, err := url.ParseQuery(string(body))
			if err != nil {
				t.Fatalf("parse form body: %v", err)
			}
			if got := values.Get("language"); got != "fr" {
				t.Fatalf("unexpected language: %q", got)
			}
			_, _ = fmt.Fprintf(w, `{"result":{"url":"%s/download/fr.json"}}`, serverURL)
		case "/download/fr.json":
			_, _ = fmt.Fprint(w, `{"hello":"bonjour","bye":"au revoir"}`)
		default:
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
	}))
	defer srv.Close()
	serverURL = srv.URL

	client := &HTTPClient{baseURL: srv.URL, http: srv.Client()}
	entries, revision, err := client.ExportFile(context.Background(), ExportFileInput{
		ProjectID: "123",
		APIToken:  "token",
		Locales:   []string{"fr"},
		Type:      "key_value_json",
	})
	if err != nil {
		t.Fatalf("export file: %v", err)
	}
	if revision == "" {
		t.Fatalf("expected revision")
	}
	if got := len(entries); got != 2 {
		t.Fatalf("expected 2 entries, got %d", got)
	}
}

func TestHTTPClientAvailableLanguagesReadsCodes(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/languages/available" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		_, _ = fmt.Fprint(w, `{"result":{"languages":[{"code":"en-us"},{"code":"vi"},{"code":"zh-Hans"}]}}`)
	}))
	defer srv.Close()

	client := &HTTPClient{baseURL: srv.URL, http: srv.Client()}
	codes, err := client.AvailableLanguages(context.Background(), "token")
	if err != nil {
		t.Fatalf("available languages: %v", err)
	}
	if got := len(codes); got != 3 {
		t.Fatalf("expected 3 codes, got %+v", codes)
	}
}

func TestHTTPClientUploadFileUsesMultipartForm(t *testing.T) {
	expectedFile, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "tests", "key_value_json", "en-US.json"))
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}

	uploads := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/projects/upload" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if !strings.Contains(r.Header.Get("Content-Type"), "multipart/form-data") {
			t.Fatalf("unexpected content type: %s", r.Header.Get("Content-Type"))
		}
		if err := r.ParseMultipartForm(1 << 20); err != nil {
			t.Fatalf("parse multipart: %v", err)
		}
		uploads++
		if got := r.FormValue("language"); got != "en" {
			t.Fatalf("unexpected language: %q", got)
		}
		if got := r.FormValue("updating"); got != "translations" {
			t.Fatalf("unexpected updating: %q", got)
		}
		files := r.MultipartForm.File["file"]
		if len(files) != 1 {
			t.Fatalf("expected 1 uploaded file, got %d", len(files))
		}
		if got := files[0].Filename; got != "en.json" {
			t.Fatalf("unexpected uploaded filename: %q", got)
		}
		file, err := files[0].Open()
		if err != nil {
			t.Fatalf("open uploaded file: %v", err)
		}
		defer func() { _ = file.Close() }()
		body, err := io.ReadAll(file)
		if err != nil {
			t.Fatalf("read uploaded file: %v", err)
		}
		if strings.TrimSpace(string(body)) != strings.TrimSpace(string(expectedFile)) {
			t.Fatalf("unexpected uploaded body: %s", string(body))
		}
		_, _ = fmt.Fprint(w, `{"result":{"terms":{"parsed":0,"added":0,"deleted":0},"translations":{"parsed":1,"added":0,"updated":1}}}`)
	}))
	defer srv.Close()

	client := &HTTPClient{baseURL: srv.URL, http: srv.Client()}
	out, _, err := client.UploadFile(context.Background(), UploadFileInput{
		ProjectID: "123",
		APIToken:  "token",
		Locale:    "en",
		Type:      "key_value_json",
		Updating:  "translations",
		Entries:   []storage.Entry{{Key: "hello", Locale: "en", Value: "bonjour"}},
	})
	if err != nil {
		t.Fatalf("upload file: %v", err)
	}
	if uploads != 1 {
		t.Fatalf("expected 1 upload, got %d", uploads)
	}
	if out.TranslationsUpdated != 1 {
		t.Fatalf("unexpected upload result: %+v", out)
	}
}

func TestHTTPClientPostFormHTTPError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "boom", http.StatusBadRequest)
	}))
	defer srv.Close()

	client := &HTTPClient{
		baseURL: srv.URL,
		http:    srv.Client(),
	}

	err := client.postForm(context.Background(), "/x", url.Values{"a": {"1"}}, &struct{}{})
	if err == nil || !strings.Contains(err.Error(), "status 400") {
		t.Fatalf("expected status error, got %v", err)
	}
}

func TestHTTPClientPostFormDecodeError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(w, "{not-json")
	}))
	defer srv.Close()

	client := &HTTPClient{
		baseURL: srv.URL,
		http:    srv.Client(),
	}

	err := client.postForm(context.Background(), "/x", url.Values{"a": {"1"}}, &struct{}{})
	if err == nil || !strings.Contains(err.Error(), "decode /x response") {
		t.Fatalf("expected decode error, got %v", err)
	}
}
