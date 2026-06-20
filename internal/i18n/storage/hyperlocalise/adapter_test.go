package hyperlocalise

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/storage"
)

type fakeClient struct {
	listResult ListTranslationsResult
	upserted   int
}

func (f *fakeClient) ListTranslations(context.Context, ListTranslationsInput) (ListTranslationsResult, error) {
	return f.listResult, nil
}

func (f *fakeClient) UpsertTranslations(context.Context, UpsertTranslationsInput) (string, error) {
	return "upserted:1", nil
}

func TestAdapterPullMapsApprovedTranslations(t *testing.T) {
	adapter, err := NewWithClient(Config{
		ProjectID:      "project_1",
		APIKey:         "test-key",
		APIBaseURL:     "http://127.0.0.1:9",
		SourcePath:     "lang/en.json",
		SourceLanguage: "en",
	}, &fakeClient{
		listResult: ListTranslationsResult{
			Revision: "2026-01-01T00:00:00Z",
			Entries: []TranslationEntry{{
				Key:    "greeting",
				Locale: "fr",
				Value:  "Bonjour",
				Status: "approved",
			}},
		},
	})
	if err != nil {
		t.Fatalf("new adapter: %v", err)
	}

	result, err := adapter.Pull(context.Background(), storage.PullRequest{Locales: []string{"fr"}})
	if err != nil {
		t.Fatalf("pull: %v", err)
	}
	if len(result.Snapshot.Entries) != 1 {
		t.Fatalf("entries = %d, want 1", len(result.Snapshot.Entries))
	}
	if result.Snapshot.Entries[0].Provenance.State != storage.StateCurated {
		t.Fatalf("state = %q, want curated", result.Snapshot.Entries[0].Provenance.State)
	}
}

func TestHTTPClientListTranslations(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/projects/project_1/translations" {
			t.Fatalf("path = %q", r.URL.Path)
		}
		if got := r.URL.Query().Get("sourcePath"); got != "lang/en.json" {
			t.Fatalf("sourcePath = %q", got)
		}
		_, _ = w.Write([]byte(`{"translations":[{"key":"greeting","locale":"fr","value":"Bonjour","status":"approved"}],"revision":"rev-1"}`))
	}))
	defer server.Close()

	client, err := NewHTTPClient(Config{
		ProjectID:  "project_1",
		APIKey:     "test-key",
		APIBaseURL: server.URL,
	})
	if err != nil {
		t.Fatalf("new client: %v", err)
	}

	result, err := client.ListTranslations(context.Background(), ListTranslationsInput{
		ProjectID:  "project_1",
		APIKey:     "test-key",
		SourcePath: "lang/en.json",
		Locales:    []string{"fr"},
	})
	if err != nil {
		t.Fatalf("list translations: %v", err)
	}
	if len(result.Entries) != 1 || result.Entries[0].Value != "Bonjour" {
		t.Fatalf("result = %#v", result)
	}
}

func TestParseConfigRequiresSourcePath(t *testing.T) {
	raw, err := json.Marshal(Config{
		ProjectID:  "project_1",
		APIKey:     "test-key",
		APIBaseURL: "http://127.0.0.1:9",
	})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	_, err = ParseConfig(raw)
	if err == nil {
		t.Fatalf("expected sourcePath validation error")
	}
}
