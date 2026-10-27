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
)

func TestHTTPClientListTranslationMemories(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case strings.Contains(r.URL.Path, "/authenticate"):
			_ = json.NewEncoder(w).Encode(map[string]any{
				"response": map[string]any{"code": "success"},
				"data":     map[string]any{"accessToken": "test-token", "expiresIn": 3600},
			})
		case strings.HasSuffix(r.URL.Path, "/translation-memories"):
			_ = json.NewEncoder(w).Encode(map[string]any{
				"response": map[string]any{"code": "SUCCESS"},
				"data": map[string]any{
					"totalCount": 2,
					"items": []map[string]any{
						{"translationMemoryUid": "tm-1", "name": "Product TM", "sourceLocaleId": "en-US", "localeIds": []string{"en-US", "fr-FR"}},
						{"uid": "tm-2", "name": "Legal TM", "sourceLocaleId": "en-US"},
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
	client.tmBaseURL = server.URL

	memories, err := client.ListTranslationMemories(context.Background(), TranslationMemoryListInput{
		AccountUID: "acc-1",
		Query:      "product",
	})
	if err != nil {
		t.Fatalf("ListTranslationMemories: %v", err)
	}
	if len(memories) != 1 || memories[0].TranslationMemoryUID != "tm-1" || memories[0].Name != "Product TM" {
		t.Fatalf("unexpected memories: %#v", memories)
	}
}

func TestHTTPClientCreateTranslationMemory(t *testing.T) {
	var gotBody map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case strings.Contains(r.URL.Path, "/authenticate"):
			_ = json.NewEncoder(w).Encode(map[string]any{
				"response": map[string]any{"code": "success"},
				"data":     map[string]any{"accessToken": "test-token", "expiresIn": 3600},
			})
		case strings.HasSuffix(r.URL.Path, "/graphql") && r.Method == http.MethodPost:
			if err := json.NewDecoder(r.Body).Decode(&gotBody); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			_ = json.NewEncoder(w).Encode(map[string]any{
				"data": map[string]any{
					"createTm": map[string]any{
						"tmUid":          "tm-new",
						"name":           "New TM",
						"description":    "Fresh memory",
						"sourceLocaleId": "en-US",
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
	client.tmGraphQLBaseURL = server.URL

	result, err := client.CreateTranslationMemory(context.Background(), TranslationMemoryCreateInput{
		AccountUID:     "acc-1",
		Name:           "New TM",
		Description:    "Fresh memory",
		SourceLocaleID: "en-US",
	})
	if err != nil {
		t.Fatalf("CreateTranslationMemory: %v", err)
	}
	if result.TranslationMemoryUID != "tm-new" || result.Name != "New TM" || result.SourceLocaleID != "en-US" {
		t.Fatalf("unexpected result: %#v", result)
	}
	variables, _ := gotBody["variables"].(map[string]any)
	createTm, _ := variables["createTm"].(map[string]any)
	if createTm["name"] != "New TM" || createTm["sourceLocaleId"] != "en-US" {
		t.Fatalf("unexpected graphql variables: %#v", gotBody)
	}
}

func TestHTTPClientCreateTranslationMemoryGraphQLError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case strings.Contains(r.URL.Path, "/authenticate"):
			_ = json.NewEncoder(w).Encode(map[string]any{
				"response": map[string]any{"code": "success"},
				"data":     map[string]any{"accessToken": "test-token", "expiresIn": 3600},
			})
		case strings.HasSuffix(r.URL.Path, "/graphql"):
			_ = json.NewEncoder(w).Encode(map[string]any{
				"errors": []map[string]any{{"message": "name must not be blank"}},
			})
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	client, _ := NewHTTPClient(Config{UserIdentifier: "user", UserSecret: "secret"})
	client.authBaseURL = server.URL
	client.tmGraphQLBaseURL = server.URL

	_, err := client.CreateTranslationMemory(context.Background(), TranslationMemoryCreateInput{
		AccountUID:     "acc-1",
		Name:           "New TM",
		SourceLocaleID: "en-US",
	})
	if err == nil || !strings.Contains(err.Error(), "name must not be blank") {
		t.Fatalf("expected graphql error, got %v", err)
	}
}

func TestHTTPClientImportTranslationMemory(t *testing.T) {
	var gotTmUID, gotFileURI string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case strings.Contains(r.URL.Path, "/authenticate"):
			_ = json.NewEncoder(w).Encode(map[string]any{
				"response": map[string]any{"code": "success"},
				"data":     map[string]any{"accessToken": "test-token", "expiresIn": 3600},
			})
		case strings.HasSuffix(r.URL.Path, "/tmx/file") && r.Method == http.MethodPost:
			if err := r.ParseMultipartForm(1 << 20); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			gotTmUID = r.FormValue("tmUid")
			gotFileURI = r.FormValue("fileUri")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"response": map[string]any{"code": "SUCCESS"},
				"data": map[string]any{
					"jobUid":      "job-1",
					"tmxUid":      "tmx-1",
					"stringCount": 12,
					"wordCount":   34,
				},
			})
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	client, _ := NewHTTPClient(Config{UserIdentifier: "user", UserSecret: "secret"})
	client.authBaseURL = server.URL
	client.tmxBaseURL = server.URL

	tmxPath := filepath.Join(t.TempDir(), "memory.tmx")
	if err := os.WriteFile(tmxPath, []byte("<tmx/>"), 0o644); err != nil {
		t.Fatalf("write tmx: %v", err)
	}

	result, err := client.ImportTranslationMemory(context.Background(), TranslationMemoryImportInput{
		AccountUID:           "acc-1",
		TranslationMemoryUID: "tm-1",
		FilePath:             tmxPath,
	})
	if err != nil {
		t.Fatalf("ImportTranslationMemory: %v", err)
	}
	if result.JobUID != "job-1" || result.TmxUID != "tmx-1" || result.StringCount != 12 {
		t.Fatalf("unexpected result: %#v", result)
	}
	if gotTmUID != "tm-1" || gotFileURI != "memory.tmx" {
		t.Fatalf("tmUid=%q fileUri=%q", gotTmUID, gotFileURI)
	}
}

func TestHTTPClientImportTranslationMemoryRejectsNonTMX(t *testing.T) {
	client, _ := NewHTTPClient(Config{UserIdentifier: "user", UserSecret: "secret"})
	_, err := client.ImportTranslationMemory(context.Background(), TranslationMemoryImportInput{
		AccountUID:           "acc-1",
		TranslationMemoryUID: "tm-1",
		FilePath:             "memory.csv",
	})
	if err == nil || !strings.Contains(err.Error(), "must be .tmx") {
		t.Fatalf("expected tmx extension error, got %v", err)
	}
}
