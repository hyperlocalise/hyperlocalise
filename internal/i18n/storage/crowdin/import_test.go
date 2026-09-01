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

func TestImportStatusFinishedAliases(t *testing.T) {
	for _, status := range []string{"finished", "Finished", " completed ", "DONE"} {
		if !importStatusFinished(status) {
			t.Fatalf("importStatusFinished(%q) = false", status)
		}
	}
	for _, status := range []string{"", "created", "inProgress", "failed"} {
		if importStatusFinished(status) {
			t.Fatalf("importStatusFinished(%q) = true", status)
		}
	}
}

func TestImportStatusErrorAliases(t *testing.T) {
	for _, status := range []string{"failed", "Failed", "canceled", "cancelled", " error "} {
		err := importStatusError(status)
		if err == nil {
			t.Fatalf("importStatusError(%q) = nil", status)
		}
	}
	for _, status := range []string{"", "created", "inProgress", "finished", "completed"} {
		if err := importStatusError(status); err != nil {
			t.Fatalf("importStatusError(%q) = %v", status, err)
		}
	}
}

func TestRequireImportExtension(t *testing.T) {
	if err := requireImportExtension("memory.TMX", ".tmx"); err != nil {
		t.Fatalf("case-insensitive tmx: %v", err)
	}
	if err := requireImportExtension("terms.Tbx", ".tbx"); err != nil {
		t.Fatalf("case-insensitive tbx: %v", err)
	}
	if err := requireImportExtension("  ", ".tmx"); err == nil || !strings.Contains(err.Error(), "required") {
		t.Fatalf("empty path error = %v", err)
	}
	if err := requireImportExtension("memory.csv", ".tmx"); err == nil || !strings.Contains(err.Error(), ".tmx") {
		t.Fatalf("wrong ext error = %v", err)
	}
}

func TestImportTranslationMemoryFileRejectsNonPositiveID(t *testing.T) {
	client, _, teardown := newCrowdinHTTPClientForTest(t)
	defer teardown()
	_, err := client.ImportTranslationMemoryFile(context.Background(), 0, "memory.tmx")
	if err == nil || !strings.Contains(err.Error(), "positive") {
		t.Fatalf("error = %v", err)
	}
}

func TestImportGlossaryFileRejectsNonPositiveID(t *testing.T) {
	client, _, teardown := newCrowdinHTTPClientForTest(t)
	defer teardown()
	_, err := client.ImportGlossaryFile(context.Background(), -1, "terms.tbx")
	if err == nil || !strings.Contains(err.Error(), "positive") {
		t.Fatalf("error = %v", err)
	}
}

func TestImportTranslationMemoryFileAcceptsUppercaseExtension(t *testing.T) {
	client, mux, teardown := newCrowdinHTTPClientForTest(t)
	defer teardown()

	oldInterval := importPollInterval
	importPollInterval = time.Millisecond
	t.Cleanup(func() { importPollInterval = oldInterval })

	path := filepath.Join(t.TempDir(), "memory.TMX")
	if err := os.WriteFile(path, []byte("<tmx></tmx>"), 0o644); err != nil {
		t.Fatalf("write tmx: %v", err)
	}

	mux.HandleFunc("/api/v2/storages", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(t, w, map[string]any{"data": map[string]any{"id": 61, "fileName": "memory.TMX"}})
	})
	mux.HandleFunc("/api/v2/tms/4/imports", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v2/tms/4/imports" {
			return
		}
		writeJSON(t, w, map[string]any{
			"data": map[string]any{"identifier": "imp-1", "status": "completed", "progress": 100},
		})
	})

	result, err := client.ImportTranslationMemoryFile(context.Background(), 4, path)
	if err != nil {
		t.Fatalf("import translation memory: %v", err)
	}
	if result.Status != "completed" {
		t.Fatalf("result = %#v", result)
	}
}

func TestImportFailsOnCanceledStatus(t *testing.T) {
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
			"data": map[string]any{"identifier": "imp-1", "status": "canceled", "progress": 0},
		})
	})

	_, err := client.ImportTranslationMemoryFile(context.Background(), 4, path)
	if err == nil || !strings.Contains(err.Error(), "canceled") {
		t.Fatalf("error = %v", err)
	}
}

func TestImportTimesOut(t *testing.T) {
	client, mux, teardown := newCrowdinHTTPClientForTest(t)
	defer teardown()

	oldInterval := importPollInterval
	oldTimeout := importPollTimeout
	importPollInterval = time.Millisecond
	importPollTimeout = 5 * time.Millisecond
	t.Cleanup(func() {
		importPollInterval = oldInterval
		importPollTimeout = oldTimeout
	})

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
			"data": map[string]any{"identifier": "imp-1", "status": "inProgress", "progress": 10},
		})
	})
	mux.HandleFunc("/api/v2/tms/4/imports/imp-1", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(t, w, map[string]any{
			"data": map[string]any{"identifier": "imp-1", "status": "inProgress", "progress": 20},
		})
	})

	_, err := client.ImportTranslationMemoryFile(context.Background(), 4, path)
	if err == nil || !strings.Contains(err.Error(), "timed out") {
		t.Fatalf("error = %v", err)
	}
}

func TestImportTranslationMemoryFileRejectsEmptyIdentifier(t *testing.T) {
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
			"data": map[string]any{"identifier": "  ", "status": "created", "progress": 0},
		})
	})

	_, err := client.ImportTranslationMemoryFile(context.Background(), 4, path)
	if err == nil || !strings.Contains(err.Error(), "empty import identifier") {
		t.Fatalf("error = %v", err)
	}
}
