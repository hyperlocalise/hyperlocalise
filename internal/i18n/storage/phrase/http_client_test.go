package phrase

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
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

func TestHTTPClientWriteGlossaryCSV(t *testing.T) {
	page := 0
	mux := http.NewServeMux()
	mux.HandleFunc("/accounts/acct/glossaries/gloss/terms", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			t.Fatalf("method = %s, want GET", r.Method)
		}
		if r.Header.Get("Authorization") != "token x" {
			t.Fatalf("unexpected auth header: %q", r.Header.Get("Authorization"))
		}
		if got := r.URL.Query().Get("per_page"); got != "100" {
			t.Fatalf("per_page = %q, want 100", got)
		}
		page++
		switch r.URL.Query().Get("page") {
		case "1":
			_, _ = w.Write([]byte(`[
				{"id":"term-2","term":"Cart","description":"Shopping cart","translatable":true,"case_sensitive":false,"translations":[{"id":"tr-2","locale_code":"de-DE","content":"Warenkorb","created_at":"2024-02-01T00:00:00Z","updated_at":"2024-02-02T00:00:00Z"}],"created_at":"2024-01-01T00:00:00Z","updated_at":"2024-01-02T00:00:00Z"},
				{"id":"term-1","term":"Checkout","description":"CTA","translatable":true,"case_sensitive":true,"translations":[{"id":"tr-1","locale_code":"fr-FR","content":"Paiement","created_at":"2024-03-01T00:00:00Z","updated_at":"2024-03-02T00:00:00Z"}],"created_at":"2024-01-03T00:00:00Z","updated_at":"2024-01-04T00:00:00Z"}
			]`))
		case "2":
			_, _ = w.Write([]byte(`[]`))
		default:
			t.Fatalf("unexpected page: %s", r.URL.Query().Get("page"))
		}
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	client, err := NewHTTPClientWithBaseURL(Config{}, srv.URL, srv.Client())
	if err != nil {
		t.Fatal(err)
	}
	out := bytes.NewBuffer(nil)
	result, err := client.WriteGlossaryCSV(context.Background(), GlossaryDownloadInput{AccountID: "acct", GlossaryID: "gloss", APIToken: "x", Locales: []string{"fr-FR"}}, out)
	if err != nil {
		t.Fatalf("write glossary csv: %v", err)
	}
	if page != 1 {
		t.Fatalf("page requests = %d, want 1", page)
	}
	if result.Terms != 2 || result.Rows != 1 {
		t.Fatalf("result = %+v, want terms=2 rows=1", result)
	}
	want := "account_id,glossary_id,term_id,source_term,description,translatable,case_sensitive,translation_locale,translated_term,translation_id,translation_created_at,translation_updated_at,term_created_at,term_updated_at\nacct,gloss,term-1,Checkout,CTA,true,true,fr-FR,Paiement,tr-1,2024-03-01T00:00:00Z,2024-03-02T00:00:00Z,2024-01-03T00:00:00Z,2024-01-04T00:00:00Z\n"
	if got := out.String(); got != want {
		t.Fatalf("csv = %q, want %q", got, want)
	}
}

func TestHTTPClientWriteGlossaryCSVPaginates(t *testing.T) {
	pages := make([]string, 0, 2)
	mux := http.NewServeMux()
	mux.HandleFunc("/accounts/acct/glossaries/gloss/terms", func(w http.ResponseWriter, r *http.Request) {
		pages = append(pages, r.URL.Query().Get("page"))
		switch r.URL.Query().Get("page") {
		case "1":
			terms := make([]glossaryTerm, defaultPageSize)
			for i := range terms {
				terms[i] = glossaryTerm{ID: fmt.Sprintf("term-%03d", i), Term: fmt.Sprintf("Term %03d", i)}
			}
			_ = json.NewEncoder(w).Encode(terms)
		case "2":
			_ = json.NewEncoder(w).Encode([]glossaryTerm{{ID: "term-last", Term: "Last"}})
		default:
			t.Fatalf("unexpected page: %s", r.URL.Query().Get("page"))
		}
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	client, err := NewHTTPClientWithBaseURL(Config{}, srv.URL, srv.Client())
	if err != nil {
		t.Fatal(err)
	}
	result, err := client.WriteGlossaryCSV(context.Background(), GlossaryDownloadInput{AccountID: "acct", GlossaryID: "gloss", APIToken: "x"}, io.Discard)
	if err != nil {
		t.Fatalf("write glossary csv: %v", err)
	}
	if got, want := strings.Join(pages, ","), "1,2"; got != want {
		t.Fatalf("pages = %s, want %s", got, want)
	}
	if result.Terms != defaultPageSize+1 || result.Rows != defaultPageSize+1 {
		t.Fatalf("result = %+v, want %d terms/rows", result, defaultPageSize+1)
	}
}

func TestHTTPClientWriteGlossaryCSVIncludesTermsWithoutTranslations(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/accounts/acct/glossaries/gloss/terms", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`[{"id":"term-1","term":"Brand","description":"Do not translate","translatable":false,"case_sensitive":true,"translations":[],"created_at":"2024-01-01T00:00:00Z","updated_at":"2024-01-02T00:00:00Z"}]`))
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	client, err := NewHTTPClientWithBaseURL(Config{}, srv.URL, srv.Client())
	if err != nil {
		t.Fatal(err)
	}
	out := bytes.NewBuffer(nil)
	result, err := client.WriteGlossaryCSV(context.Background(), GlossaryDownloadInput{AccountID: "acct", GlossaryID: "gloss", APIToken: "x"}, out)
	if err != nil {
		t.Fatalf("write glossary csv: %v", err)
	}
	if result.Terms != 1 || result.Rows != 1 {
		t.Fatalf("result = %+v, want terms=1 rows=1", result)
	}
	if !strings.Contains(out.String(), "acct,gloss,term-1,Brand,Do not translate,false,true,,,,,,2024-01-01T00:00:00Z,2024-01-02T00:00:00Z") {
		t.Fatalf("unexpected csv: %q", out.String())
	}
}

func TestHTTPClientWriteGlossaryCSVAPIError(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/accounts/acct/glossaries/missing/terms", func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, `{"message":"Glossary not found"}`, http.StatusNotFound)
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	client, err := NewHTTPClientWithBaseURL(Config{}, srv.URL, srv.Client())
	if err != nil {
		t.Fatal(err)
	}
	_, err = client.WriteGlossaryCSV(context.Background(), GlossaryDownloadInput{AccountID: "acct", GlossaryID: "missing", APIToken: "x"}, bytes.NewBuffer(nil))
	if err == nil {
		t.Fatalf("expected API error")
	}
	if !strings.Contains(err.Error(), "status=404") || !strings.Contains(err.Error(), "Glossary not found") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestHTTPClientWriteTranslationMemoryCSV(t *testing.T) {
	calls := 0
	mux := http.NewServeMux()
	mux.HandleFunc("/v2/transMemories/tm-1/export", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Fatalf("method = %s, want POST", r.Method)
		}
		if got := r.Header.Get("Authorization"); got != "ApiToken secret" {
			t.Fatalf("auth = %q, want ApiToken secret", got)
		}
		var body struct {
			ExportTargetLangs []string `json:"exportTargetLangs"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		if strings.Join(body.ExportTargetLangs, ",") != "fr-FR,de-DE" {
			t.Fatalf("target languages = %#v", body.ExportTargetLangs)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"asyncRequest": map[string]string{"id": "async-1"}})
	})
	mux.HandleFunc("/v1/transMemories/downloadExport/async-1", func(w http.ResponseWriter, r *http.Request) {
		calls++
		if got := r.URL.Query().Get("format"); got != "TMX" {
			t.Fatalf("format = %q, want TMX", got)
		}
		if calls == 1 {
			w.WriteHeader(http.StatusAccepted)
			return
		}
		w.Header().Set("Content-Type", "application/octet-stream")
		_, _ = w.Write([]byte(`<tmx version="1.4"><body><tu tuid="seg-2" creationdate="20240101T010101Z" changedate="20240102T010101Z" creationid="alice" changeid="bob"><tuv xml:lang="fr-FR"><seg>Paiement</seg></tuv><tuv xml:lang="en-US"><seg>Checkout</seg></tuv><tuv xml:lang="de-DE"><seg>Kasse</seg></tuv></tu><tu tuid="seg-1"><tuv xml:lang="en-US"><seg>Cart</seg></tuv><tuv xml:lang="fr-FR"><seg>Panier</seg></tuv></tu></body></tmx>`))
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	client, err := NewTMSHTTPClientWithBaseURL(Config{}, srv.URL, srv.Client())
	if err != nil {
		t.Fatal(err)
	}
	out := bytes.NewBuffer(nil)
	result, err := client.WriteTranslationMemoryCSV(context.Background(), TranslationMemoryDownloadInput{TranslationMemoryID: "tm-1", APIToken: "secret", SourceLanguage: "en-US", TargetLanguages: []string{"fr-FR", "de-DE"}}, out)
	if err != nil {
		t.Fatalf("write tm csv: %v", err)
	}
	if result.Rows != 3 || result.Segments != 2 {
		t.Fatalf("result = %+v", result)
	}
	got := out.String()
	want := "tm_id,segment_id,source_locale,target_locale,source_text,target_text,created_at,changed_at,creation_id,change_id\ntm-1,seg-1,en-US,fr-FR,Cart,Panier,,,,\ntm-1,seg-2,en-US,de-DE,Checkout,Kasse,20240101T010101Z,20240102T010101Z,alice,bob\ntm-1,seg-2,en-US,fr-FR,Checkout,Paiement,20240101T010101Z,20240102T010101Z,alice,bob\n"
	if got != want {
		t.Fatalf("csv = %q, want %q", got, want)
	}
}

func TestHTTPClientWriteTranslationMemoryCSVEmptyTMX(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/v2/transMemories/tm-1/export", func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{"asyncRequest": map[string]string{"id": "async-1"}})
	})
	mux.HandleFunc("/v1/transMemories/downloadExport/async-1", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`<tmx version="1.4"><body></body></tmx>`))
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()
	client, _ := NewTMSHTTPClientWithBaseURL(Config{}, srv.URL, srv.Client())
	out := bytes.NewBuffer(nil)
	result, err := client.WriteTranslationMemoryCSV(context.Background(), TranslationMemoryDownloadInput{TranslationMemoryID: "tm-1", APIToken: "ApiToken secret", SourceLanguage: "en-US", TargetLanguages: []string{"fr-FR"}}, out)
	if err != nil {
		t.Fatalf("write empty tm csv: %v", err)
	}
	if result.Rows != 0 || result.Segments != 0 {
		t.Fatalf("result = %+v", result)
	}
	if got, want := out.String(), "tm_id,segment_id,source_locale,target_locale,source_text,target_text,created_at,changed_at,creation_id,change_id\n"; got != want {
		t.Fatalf("csv = %q, want %q", got, want)
	}
}

func TestHTTPClientWriteTranslationMemoryCSVAPIError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
	}))
	defer server.Close()
	client, _ := NewTMSHTTPClientWithBaseURL(Config{}, server.URL, server.Client())
	_, err := client.WriteTranslationMemoryCSV(context.Background(), TranslationMemoryDownloadInput{TranslationMemoryID: "tm-1", APIToken: "secret", SourceLanguage: "en-US", TargetLanguages: []string{"fr-FR"}}, bytes.NewBuffer(nil))
	if err == nil {
		t.Fatalf("expected api error")
	}
	if !strings.Contains(err.Error(), "response status=401") {
		t.Fatalf("error = %v", err)
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) {
	return f(r)
}

func TestHTTPClientTMSDownloadRetriesNetworkErrors(t *testing.T) {
	client := &HTTPClient{
		baseURL: "https://phrase.example",
		httpClient: &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
			return nil, &net.DNSError{Err: "temporary DNS failure", Name: "phrase.example", IsTemporary: true}
		})},
	}

	_, retry, err := client.doTMSDownload(context.Background(), "/v1/transMemories/downloadExport/async-1?format=TMX", "secret")
	if err == nil {
		t.Fatalf("expected network error")
	}
	if !retry {
		t.Fatalf("expected network error to be retryable")
	}
}

func TestPhraseTranslationMemoryCSVRowsMissingTUIDUsesUniqueSyntheticID(t *testing.T) {
	segments := []translationMemoryTU{
		{
			ID: "",
			Variants: []translationMemoryTUV{
				{Language: "en-US", Text: "Missing ID"},
				{Language: "fr-FR", Text: "ID manquant"},
			},
		},
		{
			ID: "1",
			Variants: []translationMemoryTUV{
				{Language: "en-US", Text: "Numeric real ID"},
				{Language: "fr-FR", Text: "ID réel numérique"},
			},
		},
		{
			ID: "__missing_tuid_1",
			Variants: []translationMemoryTUV{
				{Language: "en-US", Text: "Synthetic-looking real ID"},
				{Language: "fr-FR", Text: "ID réel synthétique"},
			},
		},
	}

	rows := phraseTranslationMemoryCSVRows("tm-1", segments, "en-US", []string{"fr-FR"})
	if len(rows) != 3 {
		t.Fatalf("rows = %d, want 3", len(rows))
	}
	seen := map[string]string{}
	for _, row := range rows {
		segmentID := row[1]
		sourceText := row[4]
		if previous, ok := seen[segmentID]; ok {
			t.Fatalf("duplicate segment id %q for %q and %q", segmentID, previous, sourceText)
		}
		seen[segmentID] = sourceText
	}
	if got := rows[0][1]; got != "__missing_tuid_2" {
		t.Fatalf("missing tuid fallback id = %q, want __missing_tuid_2", got)
	}
	if _, ok := seen["1"]; !ok {
		t.Fatalf("real numeric segment id was not preserved: %#v", seen)
	}
	if _, ok := seen["__missing_tuid_1"]; !ok {
		t.Fatalf("real synthetic-looking segment id was not preserved: %#v", seen)
	}
}
