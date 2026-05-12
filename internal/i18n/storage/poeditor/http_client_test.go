package poeditor

import (
	"context"
	"encoding/json"
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

func TestHTTPClientListTermsFiltersLocales(t *testing.T) {
	var requestedLanguages []string

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/terms/list" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if ct := r.Header.Get("Content-Type"); !strings.Contains(ct, "application/x-www-form-urlencoded") {
			t.Fatalf("unexpected content-type: %s", ct)
		}
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatalf("read body: %v", err)
		}
		values, err := url.ParseQuery(string(body))
		if err != nil {
			t.Fatalf("parse form body: %v", err)
		}
		if got := values.Get("api_token"); got != "token" {
			t.Fatalf("unexpected api_token: %q", got)
		}
		if got := values.Get("id"); got != "123" {
			t.Fatalf("unexpected project id: %q", got)
		}
		if got := values.Get("language"); got != "fr" {
			t.Fatalf("unexpected language: %q", got)
		}
		requestedLanguages = append(requestedLanguages, values.Get("language"))

		_, _ = fmt.Fprint(w, `{
			"response":{"status":"success","code":"200","message":"OK"},
			"result":{"terms":[
				{"term":"hello","context":"home","translation":{"content":"bonjour"}},
				{"term":"bye","context":"","translation":{"content":"au revoir"}},
				{"term":"empty","context":"","translation":{"content":""}}
			]}
		}`)
	}))
	defer srv.Close()

	client := &HTTPClient{
		baseURL: srv.URL,
		http:    srv.Client(),
	}

	entries, revision, err := client.ListTerms(context.Background(), ListTermsInput{
		ProjectID: "123",
		APIToken:  "token",
		Locales:   []string{"fr"},
	})
	if err != nil {
		t.Fatalf("list terms: %v", err)
	}
	if revision == "" {
		t.Fatalf("expected revision")
	}
	if got := len(entries); got != 2 {
		t.Fatalf("expected 2 filtered entries, got %d", got)
	}
	if got := len(requestedLanguages); got != 1 {
		t.Fatalf("expected one language-specific request, got %d", got)
	}
	for _, e := range entries {
		if e.Locale != "fr" {
			t.Fatalf("expected filtered locale fr, got %+v", e)
		}
	}
}

func TestHTTPClientListTermsDiscoversLanguages(t *testing.T) {
	var requestedLanguages []string

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatalf("read body: %v", err)
		}
		values, err := url.ParseQuery(string(body))
		if err != nil {
			t.Fatalf("parse form body: %v", err)
		}

		switch r.URL.Path {
		case "/languages/list":
			if got := values.Get("api_token"); got != "token" {
				t.Fatalf("unexpected api_token: %q", got)
			}
			if got := values.Get("id"); got != "123" {
				t.Fatalf("unexpected project id: %q", got)
			}
			_, _ = fmt.Fprint(w, `{
				"response":{"status":"success","code":"200","message":"OK"},
				"result":{"languages":[{"code":"fr"},{"code":"de"}]}
			}`)
		case "/terms/list":
			locale := values.Get("language")
			requestedLanguages = append(requestedLanguages, locale)
			_, _ = fmt.Fprintf(w, `{
				"response":{"status":"success","code":"200","message":"OK"},
				"result":{"terms":[{"term":"hello","context":"","translation":{"content":"hello-%s"}}]}
			}`, locale)
		default:
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
	}))
	defer srv.Close()

	client := &HTTPClient{
		baseURL: srv.URL,
		http:    srv.Client(),
	}

	entries, _, err := client.ListTerms(context.Background(), ListTermsInput{
		ProjectID: "123",
		APIToken:  "token",
	})
	if err != nil {
		t.Fatalf("list terms: %v", err)
	}
	if got := strings.Join(requestedLanguages, ","); got != "fr,de" {
		t.Fatalf("unexpected language requests: %s", got)
	}
	if got := len(entries); got != 2 {
		t.Fatalf("expected discovered language entries, got %d", got)
	}
}

func TestHTTPClientUpsertTranslationsSendsGroupedPayload(t *testing.T) {
	var calls []struct {
		Path   string
		Values url.Values
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatalf("read body: %v", err)
		}
		values, err := url.ParseQuery(string(body))
		if err != nil {
			t.Fatalf("parse query: %v", err)
		}
		calls = append(calls, struct {
			Path   string
			Values url.Values
		}{Path: r.URL.Path, Values: values})

		_, _ = fmt.Fprint(w, `{"result":{"code":"200","message":"OK"}}`)
	}))
	defer srv.Close()

	client := &HTTPClient{
		baseURL: srv.URL,
		http:    srv.Client(),
	}

	revision, err := client.UpsertTranslations(context.Background(), UpsertTranslationsInput{
		ProjectID: "123",
		APIToken:  "token",
		Entries: []TermTranslation{
			{Term: "hello", Context: "home", Locale: "fr", Value: "bonjour"},
			{Term: "bye", Locale: "fr", Value: "au revoir"},
			{Term: "skip", Locale: "", Value: "x"},
			{Term: "hello", Locale: "de", Value: "hallo"},
		},
	})
	if err != nil {
		t.Fatalf("upsert translations: %v", err)
	}
	if revision == "" {
		t.Fatalf("expected revision")
	}
	if got := len(calls); got != 3 {
		t.Fatalf("expected terms add plus language update calls for 2 locales, got %d", got)
	}

	seenPaths := map[string]int{}
	for _, call := range calls {
		if call.Values.Get("api_token") != "token" || call.Values.Get("id") != "123" {
			t.Fatalf("unexpected auth/id form values: %+v", call.Values)
		}
		seenPaths[call.Path]++
		raw := call.Values.Get("data")
		if raw == "" {
			t.Fatalf("missing data payload")
		}
		if call.Path == "/terms/add" {
			var terms []struct {
				Term    string `json:"term"`
				Context string `json:"context"`
			}
			if err := json.Unmarshal([]byte(raw), &terms); err != nil {
				t.Fatalf("decode terms payload: %v", err)
			}
			if got := len(terms); got != 3 {
				t.Fatalf("expected unique terms payload, got %d", got)
			}
			continue
		}
		var payload []struct {
			Term        string `json:"term"`
			Context     string `json:"context"`
			Translation struct {
				Content string `json:"content"`
			} `json:"translation"`
		}
		if err := json.Unmarshal([]byte(raw), &payload); err != nil {
			t.Fatalf("decode data payload: %v", err)
		}
		if len(payload) == 0 {
			t.Fatalf("expected non-empty payload")
		}
		for _, item := range payload {
			if item.Term == "" {
				t.Fatalf("missing term in payload: %+v", payload)
			}
			if item.Translation.Content == "" {
				t.Fatalf("missing nested translation content in payload: %+v", payload)
			}
		}
	}
	if seenPaths["/terms/add"] != 1 {
		t.Fatalf("expected one terms/add call, got paths: %+v", seenPaths)
	}
	if seenPaths["/languages/update"] != 2 {
		t.Fatalf("expected two languages/update calls, got paths: %+v", seenPaths)
	}
}

func TestHTTPClientUploadTermsFileUsesProjectsUpload(t *testing.T) {
	tempDir := t.TempDir()
	sourcePath := filepath.Join(tempDir, "messages.po")
	if err := os.WriteFile(sourcePath, []byte("msgid \"hello\"\nmsgstr \"\"\n"), 0o644); err != nil {
		t.Fatalf("write source file: %v", err)
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/projects/upload" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if ct := r.Header.Get("Content-Type"); !strings.Contains(ct, "multipart/form-data") {
			t.Fatalf("unexpected content-type: %s", ct)
		}
		if err := r.ParseMultipartForm(1 << 20); err != nil {
			t.Fatalf("parse multipart: %v", err)
		}
		if got := r.FormValue("api_token"); got != "token" {
			t.Fatalf("unexpected api_token: %q", got)
		}
		if got := r.FormValue("id"); got != "123" {
			t.Fatalf("unexpected project id: %q", got)
		}
		if got := r.FormValue("updating"); got != "terms" {
			t.Fatalf("unexpected updating mode: %q", got)
		}
		if got := r.FormValue("sync_terms"); got != "1" {
			t.Fatalf("unexpected sync_terms: %q", got)
		}
		if got := r.FormValue("tags"); got != `{"all":"imported"}` {
			t.Fatalf("unexpected tags: %q", got)
		}

		file, header, err := r.FormFile("file")
		if err != nil {
			t.Fatalf("read multipart file: %v", err)
		}
		defer func() {
			_ = file.Close()
		}()
		if header.Filename != "messages.po" {
			t.Fatalf("unexpected uploaded filename: %q", header.Filename)
		}
		content, err := io.ReadAll(file)
		if err != nil {
			t.Fatalf("read uploaded file: %v", err)
		}
		if got := string(content); got != "msgid \"hello\"\nmsgstr \"\"\n" {
			t.Fatalf("unexpected uploaded content: %q", got)
		}

		_, _ = fmt.Fprint(w, `{
			"response":{"status":"success","code":"200","message":"OK"},
			"result":{
				"terms":{"parsed":1,"added":1,"deleted":0},
				"translations":{"parsed":0,"added":0,"updated":0}
			}
		}`)
	}))
	defer srv.Close()

	client := &HTTPClient{
		baseURL: srv.URL,
		http:    srv.Client(),
	}

	result, err := client.UploadTermsFile(context.Background(), UploadTermsFileInput{
		ProjectID: "123",
		APIToken:  "token",
		FilePath:  sourcePath,
		SyncTerms: true,
		Tags:      `{"all":"imported"}`,
	})
	if err != nil {
		t.Fatalf("upload terms file: %v", err)
	}
	if result.Terms.Parsed != 1 || result.Terms.Added != 1 {
		t.Fatalf("unexpected upload result: %+v", result)
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

func TestHTTPClientPostFormAPIError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = io.WriteString(w, `{"response":{"status":"fail","code":"403","message":"Denied"}}`)
	}))
	defer srv.Close()

	client := &HTTPClient{
		baseURL: srv.URL,
		http:    srv.Client(),
	}

	err := client.postForm(context.Background(), "/x", url.Values{"a": {"1"}}, &struct{ apiEnvelope }{})
	if err == nil || !strings.Contains(err.Error(), "api error 403: Denied") {
		t.Fatalf("expected API envelope error, got %v", err)
	}
}
