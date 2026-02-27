package lokalise

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
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

func TestHTTPClientListKeysFiltersLocales(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.Contains(r.URL.Path, "/projects/123/keys") {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if got := r.Header.Get("X-Api-Token"); got != "token" {
			t.Fatalf("unexpected api token: %q", got)
		}

		_, _ = fmt.Fprint(w, `{
			"total_pages": 1,
			"keys":[
				{"key_name":{"web":"hello"},"description":"home","translations":[
					{"language_iso":"fr","translation":"bonjour"},
					{"language_iso":"de","translation":"hallo"}
				]},
				{"key_name":"bye","translations":[
					{"language_iso":"fr","translation":{"other":"au revoir"}}
				]}
			]
		}`)
	}))
	defer srv.Close()

	client := &HTTPClient{
		baseURL: srv.URL,
		http:    srv.Client(),
	}

	entries, revision, err := client.ListKeys(context.Background(), ListKeysInput{
		ProjectID: "123",
		APIToken:  "token",
		Locales:   []string{"fr"},
	})
	if err != nil {
		t.Fatalf("list keys: %v", err)
	}
	if revision == "" {
		t.Fatalf("expected revision")
	}
	if got := len(entries); got != 2 {
		t.Fatalf("expected 2 filtered entries, got %d", got)
	}
	for _, e := range entries {
		if e.Locale != "fr" {
			t.Fatalf("expected filtered locale fr, got %+v", e)
		}
	}
}

func TestHTTPClientUpsertTranslationsSendsPayload(t *testing.T) {
	var called bool
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		if r.Method != http.MethodPost {
			t.Fatalf("unexpected method: %s", r.Method)
		}
		if !strings.Contains(r.URL.Path, "/projects/123/keys") {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if got := r.Header.Get("X-Api-Token"); got != "token" {
			t.Fatalf("unexpected api token: %q", got)
		}
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Fatalf("read body: %v", err)
		}
		var payload map[string]any
		if err := json.Unmarshal(body, &payload); err != nil {
			t.Fatalf("decode payload: %v", err)
		}
		if _, ok := payload["keys"]; !ok {
			t.Fatalf("expected keys payload")
		}
		_, _ = fmt.Fprint(w, `{"process":{"process_id":"abc"}}`)
	}))
	defer srv.Close()

	client := &HTTPClient{
		baseURL: srv.URL,
		http:    srv.Client(),
	}

	revision, err := client.UpsertTranslations(context.Background(), UpsertTranslationsInput{
		ProjectID: "123",
		APIToken:  "token",
		Entries: []KeyTranslation{
			{Key: "hello", Context: "home", Locale: "fr", Value: "bonjour"},
		},
	})
	if err != nil {
		t.Fatalf("upsert translations: %v", err)
	}
	if !called {
		t.Fatalf("expected request call")
	}
	if revision == "" {
		t.Fatalf("expected revision")
	}
}

func TestHTTPClientGetJSONHTTPError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "boom", http.StatusBadRequest)
	}))
	defer srv.Close()

	client := &HTTPClient{
		baseURL: srv.URL,
		http:    srv.Client(),
	}

	err := client.getJSON(context.Background(), "/x", "token", &struct{}{})
	if err == nil || !strings.Contains(err.Error(), "status 400") {
		t.Fatalf("expected status error, got %v", err)
	}
}

func TestHTTPClientPostJSONDecodeError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(w, "{not-json")
	}))
	defer srv.Close()

	client := &HTTPClient{
		baseURL: srv.URL,
		http:    srv.Client(),
	}

	err := client.postJSON(context.Background(), "/x", "token", map[string]string{"a": "1"}, &struct{}{})
	if err == nil || !strings.Contains(err.Error(), "decode /x response") {
		t.Fatalf("expected decode error, got %v", err)
	}
}
