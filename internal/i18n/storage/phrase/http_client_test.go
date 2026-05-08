package phrase

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/storage"
)

func TestHTTPClientListStrings(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/projects/p/locales", func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode([]map[string]string{{"name": "fr"}})
	})
	mux.HandleFunc("/projects/p/keys", func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode([]map[string]string{{"id": "k1", "name": "hello", "description": "ctx"}})
	})
	mux.HandleFunc("/projects/p/translations", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("locale_name") == "fr" {
			_ = json.NewEncoder(w).Encode([]map[string]string{{"key_id": "k1", "content": "bonjour"}})
			return
		}
		_ = json.NewEncoder(w).Encode([]map[string]string{})
	})

	srv := httptest.NewServer(mux)
	defer srv.Close()

	client, err := NewHTTPClientWithBaseURL(Config{}, srv.URL, srv.Client())
	if err != nil {
		t.Fatal(err)
	}
	entries, _, err := client.ListStrings(context.Background(), ListStringsInput{ProjectID: "p", APIToken: "x"})
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 || entries[0].Key != "hello" || entries[0].Value != "bonjour" {
		t.Fatalf("unexpected entries: %+v", entries)
	}
}

func TestHTTPClientUpsertStringsPartialFailure(t *testing.T) {
	calls := 0
	mux := http.NewServeMux()
	mux.HandleFunc("/projects/p/keys", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			_ = json.NewEncoder(w).Encode([]map[string]string{})
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]string{"id": "k1", "name": "a"})
	})
	mux.HandleFunc("/projects/p/translations", func(w http.ResponseWriter, r *http.Request) {
		calls++
		if calls > 1 {
			http.Error(w, `{"error":"bad"}`, http.StatusBadRequest)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]string{"id": "t1"})
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()
	client, _ := NewHTTPClientWithBaseURL(Config{}, srv.URL, srv.Client())

	_, err := client.UpsertStrings(context.Background(), UpsertStringsInput{ProjectID: "p", APIToken: "x", Entries: []StringTranslation{{Key: "a", Locale: "fr", Value: "A"}, {Key: "a", Locale: "de", Value: "B"}}})
	if err == nil {
		t.Fatalf("expected error")
	}
	idx := sentIndexesFromError(err)
	if len(idx) != 1 || idx[0] != 0 {
		t.Fatalf("unexpected sent indexes: %+v", idx)
	}
}

func TestHTTPClientRetriesRateLimit(t *testing.T) {
	attempts := 0
	mux := http.NewServeMux()
	mux.HandleFunc("/projects/p/locales", func(w http.ResponseWriter, r *http.Request) {
		attempts++
		if attempts == 1 {
			w.Header().Set("Retry-After", "0")
			http.Error(w, "busy", http.StatusTooManyRequests)
			return
		}
		_ = json.NewEncoder(w).Encode([]map[string]string{{"name": "fr"}})
	})
	mux.HandleFunc("/projects/p/keys", func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode([]map[string]string{})
	})
	mux.HandleFunc("/projects/p/translations", func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode([]map[string]string{})
	})
	server := httptest.NewServer(mux)
	defer server.Close()
	client, _ := NewHTTPClientWithBaseURL(Config{}, server.URL, server.Client())

	if _, _, err := client.ListStrings(context.Background(), ListStringsInput{ProjectID: "p", APIToken: "x"}); err != nil {
		t.Fatalf("list strings with retry: %v", err)
	}
	if attempts < 2 {
		t.Fatalf("expected retries, attempts=%d", attempts)
	}
}

func TestHTTPClientUploadSourceFileMultipart(t *testing.T) {
	dir := t.TempDir()
	sourcePath := dir + "/en.json"
	if err := os.WriteFile(sourcePath, []byte(`{"hello":"Hello"}`), 0o644); err != nil {
		t.Fatalf("write source file: %v", err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/projects/p/uploads", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Fatalf("method = %s, want POST", r.Method)
		}
		if r.Header.Get("Authorization") != "token x" {
			t.Fatalf("unexpected auth header: %q", r.Header.Get("Authorization"))
		}
		if err := r.ParseMultipartForm(1 << 20); err != nil {
			t.Fatalf("parse form: %v", err)
		}
		if got := r.FormValue("locale_id"); got != "en" {
			t.Fatalf("locale_id = %q, want en", got)
		}
		if got := r.FormValue("file_format"); got != "json" {
			t.Fatalf("file_format = %q, want json", got)
		}
		if got := r.FormValue("update_translations"); got != "true" {
			t.Fatalf("update_translations = %q, want true", got)
		}
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"id":    "upload-1",
			"state": "success",
			"summary": map[string]int{
				"translation_keys_created": 1,
			},
		})
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	client, err := NewHTTPClientWithBaseURL(Config{}, srv.URL, srv.Client())
	if err != nil {
		t.Fatal(err)
	}
	result, err := client.UploadSourceFile(context.Background(), SourceUploadInput{
		ProjectID:          "p",
		APIToken:           "x",
		LocaleID:           "en",
		FilePath:           sourcePath,
		FileFormat:         "json",
		UpdateTranslations: true,
	})
	if err != nil {
		t.Fatalf("upload source file: %v", err)
	}
	if result.ID != "upload-1" || result.Summary.TranslationKeysCreated != 1 {
		t.Fatalf("unexpected result: %+v", result)
	}
}

func TestHTTPClientDownloadSourceFile(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/projects/p/locales/en/download", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			t.Fatalf("method = %s, want GET", r.Method)
		}
		if r.Header.Get("Authorization") != "token x" {
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
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	client, err := NewHTTPClientWithBaseURL(Config{}, srv.URL, srv.Client())
	if err != nil {
		t.Fatal(err)
	}
	result, err := client.DownloadSourceFile(context.Background(), SourceDownloadInput{
		ProjectID:  "p",
		APIToken:   "x",
		LocaleID:   "en",
		FileFormat: "json",
		Branch:     "main",
		Tags:       []string{"app", "source"},
	})
	if err != nil {
		t.Fatalf("download source file: %v", err)
	}
	if string(result.Content) != `{"hello":"Hello"}` || result.LocaleID != "en" || result.Format != "json" {
		t.Fatalf("unexpected result: %+v", result)
	}
}

func TestHTTPClientDownloadSourceFileAPIError(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/projects/p/locales/missing/download", func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, `{"message":"Locale not found"}`, http.StatusNotFound)
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	client, err := NewHTTPClientWithBaseURL(Config{}, srv.URL, srv.Client())
	if err != nil {
		t.Fatal(err)
	}
	_, err = client.DownloadSourceFile(context.Background(), SourceDownloadInput{
		ProjectID:  "p",
		APIToken:   "x",
		LocaleID:   "missing",
		FileFormat: "json",
	})
	if err == nil {
		t.Fatalf("expected API error")
	}
	if !strings.Contains(err.Error(), "status=404") || !strings.Contains(err.Error(), "Locale not found") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestHTTPClientDownloadTranslationFile(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/projects/p/locales/fr/download", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			t.Fatalf("method = %s, want GET", r.Method)
		}
		if r.Header.Get("Authorization") != "token x" {
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
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	client, err := NewHTTPClientWithBaseURL(Config{}, srv.URL, srv.Client())
	if err != nil {
		t.Fatal(err)
	}
	result, err := client.DownloadTranslationFile(context.Background(), TranslationDownloadInput{
		ProjectID:  "p",
		APIToken:   "x",
		LocaleID:   "fr",
		FileFormat: "json",
		Branch:     "main",
		Tags:       []string{"app", "reviewed"},
	})
	if err != nil {
		t.Fatalf("download translation file: %v", err)
	}
	if string(result.Content) != `{"hello":"Bonjour"}` || result.LocaleID != "fr" || result.Format != "json" {
		t.Fatalf("unexpected result: %+v", result)
	}
}

func TestEncodeDecodeEntriesJSON(t *testing.T) {
	in := []storage.Entry{{Key: "a", Locale: "fr", Value: "A"}, {Key: "b", Locale: "fr", Value: ""}, {Key: "a", Locale: "de", Value: "AA"}}
	data, err := encodeEntriesJSON(in)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(data), `"b"`) {
		t.Fatalf("empty value should be filtered: %s", string(data))
	}
	out, err := decodeEntriesJSON(data)
	if err != nil {
		t.Fatal(err)
	}
	if len(out) != 2 {
		t.Fatalf("unexpected decoded entries: %+v", out)
	}
}

func TestRetryDelayUsesExponentialBackoff(t *testing.T) {
	d1 := retryDelay(0, nil)
	d2 := retryDelay(1, nil)
	if d2 <= d1 || d1 < 200*time.Millisecond {
		t.Fatalf("unexpected delays: %s %s", d1, d2)
	}
}
