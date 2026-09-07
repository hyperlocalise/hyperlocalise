package smartling

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestHTTPClientSearchGlossaries(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case strings.Contains(r.URL.Path, "/authenticate"):
			_ = json.NewEncoder(w).Encode(map[string]any{
				"response": map[string]any{"code": "success"},
				"data":     map[string]any{"accessToken": "test-token", "expiresIn": 3600},
			})
		case strings.Contains(r.URL.Path, "/glossaries/search"):
			_ = json.NewEncoder(w).Encode(map[string]any{
				"response": map[string]any{"code": "SUCCESS"},
				"data": map[string]any{
					"totalCount": 1,
					"items": []map[string]any{
						{
							"glossaryUid": "gloss-1",
							"name":        "Brand terms",
							"localeIds":   []string{"en-US", "fr-FR"},
						},
					},
				},
			})
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	client, _ := NewHTTPClient(Config{UserIdentifier: "user", UserSecret: "secret"})
	client.authBaseURL = server.URL
	client.glossaryV3BaseURL = server.URL

	glossaries, err := client.SearchGlossaries(context.Background(), GlossarySearchInput{
		AccountUID: "acc-1",
		Query:      "Brand",
	})
	if err != nil {
		t.Fatalf("SearchGlossaries: %v", err)
	}
	if len(glossaries) != 1 || glossaries[0].GlossaryUID != "gloss-1" || glossaries[0].Name != "Brand terms" {
		t.Fatalf("unexpected glossaries: %#v", glossaries)
	}
}

func TestHTTPClientSearchGlossariesPaginates(t *testing.T) {
	page := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case strings.Contains(r.URL.Path, "/authenticate"):
			_ = json.NewEncoder(w).Encode(map[string]any{
				"response": map[string]any{"code": "success"},
				"data":     map[string]any{"accessToken": "test-token", "expiresIn": 3600},
			})
		case strings.Contains(r.URL.Path, "/glossaries/search"):
			page++
			var items []map[string]any
			switch page {
			case 1:
				items = []map[string]any{{"glossaryUid": "gloss-1", "name": "One", "localeIds": []string{"en-US"}}}
			case 2:
				items = []map[string]any{{"glossaryUid": "gloss-2", "name": "Two", "localeIds": []string{"fr-FR"}}}
			}
			_ = json.NewEncoder(w).Encode(map[string]any{
				"response": map[string]any{"code": "SUCCESS"},
				"data": map[string]any{
					"totalCount": 2,
					"items":      items,
				},
			})
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	glossarySearchPageLimit = 1
	t.Cleanup(func() { glossarySearchPageLimit = 100 })

	client, _ := NewHTTPClient(Config{UserIdentifier: "user", UserSecret: "secret"})
	client.authBaseURL = server.URL
	client.glossaryV3BaseURL = server.URL

	glossaries, err := client.SearchGlossaries(context.Background(), GlossarySearchInput{AccountUID: "acc-1"})
	if err != nil {
		t.Fatalf("SearchGlossaries: %v", err)
	}
	if len(glossaries) != 2 || glossaries[0].GlossaryUID != "gloss-1" || glossaries[1].GlossaryUID != "gloss-2" {
		t.Fatalf("unexpected glossaries: %#v", glossaries)
	}
}

func TestHTTPClientImportGlossaryMissingFile(t *testing.T) {
	client, _ := NewHTTPClient(Config{UserIdentifier: "user", UserSecret: "secret"})
	_, err := client.ImportGlossary(context.Background(), GlossaryImportInput{
		AccountUID:  "acc-1",
		GlossaryUID: "gloss-1",
		FilePath:    filepath.Join(t.TempDir(), "missing.csv"),
	})
	if err == nil || !strings.Contains(err.Error(), "does not exist") {
		t.Fatalf("expected missing file error, got %v", err)
	}
}

func TestHTTPClientCreateGlossary(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case strings.Contains(r.URL.Path, "/authenticate"):
			_ = json.NewEncoder(w).Encode(map[string]any{
				"response": map[string]any{"code": "success"},
				"data":     map[string]any{"accessToken": "test-token", "expiresIn": 3600},
			})
		case strings.Contains(r.URL.Path, "/glossaries") && r.Method == http.MethodPost && !strings.Contains(r.URL.Path, "/search"):
			var body map[string]any
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			if body["name"] != "New glossary" {
				http.Error(w, "expected name in request body", http.StatusBadRequest)
				return
			}
			_ = json.NewEncoder(w).Encode(map[string]any{
				"response": map[string]any{"code": "SUCCESS"},
				"data": map[string]any{
					"glossaryUid": "gloss-new",
					"name":        "New glossary",
					"accountUid":  "acc-1",
				},
			})
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	client, _ := NewHTTPClient(Config{UserIdentifier: "user", UserSecret: "secret"})
	client.authBaseURL = server.URL
	client.glossaryV3BaseURL = server.URL

	result, err := client.CreateGlossary(context.Background(), GlossaryCreateInput{
		AccountUID: "acc-1",
		Name:       "New glossary",
		LocaleIDs:  []string{"en-US", "fr-FR"},
	})
	if err != nil {
		t.Fatalf("CreateGlossary: %v", err)
	}
	if result.GlossaryUID != "gloss-new" || result.Name != "New glossary" {
		t.Fatalf("unexpected result: %#v", result)
	}
}

func TestHTTPClientImportGlossary(t *testing.T) {
	status := glossaryImportStatusInProgress
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case strings.Contains(r.URL.Path, "/authenticate"):
			_ = json.NewEncoder(w).Encode(map[string]any{
				"response": map[string]any{"code": "success"},
				"data":     map[string]any{"accessToken": "test-token", "expiresIn": 3600},
			})
		case strings.Contains(r.URL.Path, "/import") && r.Method == http.MethodPost && !strings.Contains(r.URL.Path, "/confirm"):
			_ = json.NewEncoder(w).Encode(map[string]any{
				"response": map[string]any{"code": "SUCCESS"},
				"data": map[string]any{
					"glossaryImport": map[string]any{
						"glossaryUid":  "gloss-1",
						"importUid":    "import-1",
						"importStatus": glossaryImportStatusPending,
					},
				},
			})
		case strings.Contains(r.URL.Path, "/confirm"):
			w.WriteHeader(http.StatusOK)
		case strings.Contains(r.URL.Path, "/import/import-1"):
			if status == glossaryImportStatusInProgress {
				status = glossaryImportStatusSuccessful
			}
			_ = json.NewEncoder(w).Encode(map[string]any{
				"response": map[string]any{"code": "SUCCESS"},
				"data": map[string]any{
					"glossaryUid":  "gloss-1",
					"importUid":    "import-1",
					"importStatus": status,
				},
			})
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	oldInterval := glossaryImportPollInterval
	glossaryImportPollInterval = time.Millisecond
	t.Cleanup(func() { glossaryImportPollInterval = oldInterval })

	client, _ := NewHTTPClient(Config{UserIdentifier: "user", UserSecret: "secret"})
	client.authBaseURL = server.URL
	client.glossaryV3BaseURL = server.URL

	dir := t.TempDir()
	csvPath := filepath.Join(dir, "import.csv")
	if err := os.WriteFile(csvPath, []byte("term,definition\nhello,world\n"), 0o644); err != nil {
		t.Fatalf("write csv: %v", err)
	}

	result, err := client.ImportGlossary(context.Background(), GlossaryImportInput{
		AccountUID:  "acc-1",
		GlossaryUID: "gloss-1",
		FilePath:    csvPath,
	})
	if err != nil {
		t.Fatalf("ImportGlossary: %v", err)
	}
	if result.ImportUID != "import-1" || result.ImportStatus != glossaryImportStatusSuccessful {
		t.Fatalf("unexpected result: %#v", result)
	}
}
