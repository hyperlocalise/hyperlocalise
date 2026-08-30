package crowdin

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestImportTranslationMemoryFile(t *testing.T) {
	client, mux, teardown := newCrowdinHTTPClientForTest(t)
	defer teardown()

	oldInterval := importPollInterval
	importPollInterval = time.Millisecond
	t.Cleanup(func() { importPollInterval = oldInterval })

	path := filepath.Join(t.TempDir(), "memory.tmx")
	if err := os.WriteFile(path, []byte("<tmx></tmx>"), 0o644); err != nil {
		t.Fatalf("write tmx: %v", err)
	}

	mux.HandleFunc("/api/v2/storages", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Fatalf("storage method = %s", r.Method)
		}
		writeJSON(t, w, map[string]any{"data": map[string]any{"id": 61, "fileName": "memory.tmx"}})
	})
	mux.HandleFunc("/api/v2/tms/4/imports", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v2/tms/4/imports" {
			return
		}
		assertRequest(t, r, http.MethodPost, "/api/v2/tms/4/imports")
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("decode import body: %v", err)
		}
		if body["storageId"] != float64(61) {
			t.Fatalf("storageId = %v", body["storageId"])
		}
		writeJSON(t, w, map[string]any{
			"data": map[string]any{
				"identifier": "imp-1",
				"status":     "created",
				"progress":   0,
			},
		})
	})
	mux.HandleFunc("/api/v2/tms/4/imports/imp-1", func(w http.ResponseWriter, r *http.Request) {
		assertRequest(t, r, http.MethodGet, "/api/v2/tms/4/imports/imp-1")
		writeJSON(t, w, map[string]any{
			"data": map[string]any{
				"identifier": "imp-1",
				"status":     "finished",
				"progress":   100,
			},
		})
	})

	result, err := client.ImportTranslationMemoryFile(context.Background(), 4, path)
	if err != nil {
		t.Fatalf("import translation memory: %v", err)
	}
	if result.Identifier != "imp-1" || result.Status != "finished" || result.Progress != 100 {
		t.Fatalf("result = %#v", result)
	}
}

func TestImportGlossaryFile(t *testing.T) {
	client, mux, teardown := newCrowdinHTTPClientForTest(t)
	defer teardown()

	oldInterval := importPollInterval
	importPollInterval = time.Millisecond
	t.Cleanup(func() { importPollInterval = oldInterval })

	path := filepath.Join(t.TempDir(), "terms.tbx")
	if err := os.WriteFile(path, []byte("<tbx></tbx>"), 0o644); err != nil {
		t.Fatalf("write tbx: %v", err)
	}

	mux.HandleFunc("/api/v2/storages", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Fatalf("storage method = %s", r.Method)
		}
		writeJSON(t, w, map[string]any{"data": map[string]any{"id": 62, "fileName": "terms.tbx"}})
	})
	mux.HandleFunc("/api/v2/glossaries/77/imports", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v2/glossaries/77/imports" {
			return
		}
		assertRequest(t, r, http.MethodPost, "/api/v2/glossaries/77/imports")
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("decode import body: %v", err)
		}
		if body["storageId"] != float64(62) {
			t.Fatalf("storageId = %v", body["storageId"])
		}
		if _, ok := body["firstLineContainsHeader"]; ok {
			t.Fatalf("tbx import must omit firstLineContainsHeader, got %v", body["firstLineContainsHeader"])
		}
		if _, ok := body["scheme"]; ok {
			t.Fatalf("tbx import must omit scheme, got %v", body["scheme"])
		}
		writeJSON(t, w, map[string]any{
			"data": map[string]any{
				"identifier": "g-1",
				"status":     "inProgress",
				"progress":   10,
			},
		})
	})
	mux.HandleFunc("/api/v2/glossaries/77/imports/g-1", func(w http.ResponseWriter, r *http.Request) {
		assertRequest(t, r, http.MethodGet, "/api/v2/glossaries/77/imports/g-1")
		writeJSON(t, w, map[string]any{
			"data": map[string]any{
				"identifier": "g-1",
				"status":     "finished",
				"progress":   100,
			},
		})
	})

	result, err := client.ImportGlossaryFile(context.Background(), 77, path)
	if err != nil {
		t.Fatalf("import glossary: %v", err)
	}
	if result.Status != "finished" {
		t.Fatalf("result = %#v", result)
	}
}

func TestImportTranslationMemoryFileRejectsNonTMX(t *testing.T) {
	client, _, teardown := newCrowdinHTTPClientForTest(t)
	defer teardown()
	_, err := client.ImportTranslationMemoryFile(context.Background(), 4, "memory.csv")
	if err == nil || !strings.Contains(err.Error(), ".tmx") {
		t.Fatalf("error = %v", err)
	}
}

func TestImportGlossaryFileRejectsNonTBX(t *testing.T) {
	client, _, teardown := newCrowdinHTTPClientForTest(t)
	defer teardown()
	_, err := client.ImportGlossaryFile(context.Background(), 77, "terms.csv")
	if err == nil || !strings.Contains(err.Error(), ".tbx") {
		t.Fatalf("error = %v", err)
	}
}

func TestImportFailsOnFailedStatus(t *testing.T) {
	client, mux, teardown := newCrowdinHTTPClientForTest(t)
	defer teardown()

	path := filepath.Join(t.TempDir(), "memory.tmx")
	if err := os.WriteFile(path, []byte("<tmx></tmx>"), 0o644); err != nil {
		t.Fatalf("write tmx: %v", err)
	}

	mux.HandleFunc("/api/v2/storages", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(t, w, map[string]any{"data": map[string]any{"id": 61, "fileName": "memory.tmx"}})
	})
	mux.HandleFunc("/api/v2/tms/4/imports", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v2/tms/4/imports" {
			return
		}
		writeJSON(t, w, map[string]any{
			"data": map[string]any{"identifier": "imp-1", "status": "failed", "progress": 0},
		})
	})

	_, err := client.ImportTranslationMemoryFile(context.Background(), 4, path)
	if err == nil || !strings.Contains(err.Error(), "failed") {
		t.Fatalf("error = %v", err)
	}
}
