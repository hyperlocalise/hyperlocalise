package crowdin

import (
	"bytes"
	"context"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"
)

func TestWriteGlossaryCSVWritesStableRows(t *testing.T) {
	client, mux, teardown := newCrowdinHTTPClientForTest(t)
	defer teardown()

	mux.HandleFunc("/api/v2/glossaries/77", func(w http.ResponseWriter, r *http.Request) {
		assertRequest(t, r, http.MethodGet, "/api/v2/glossaries/77")
		writeJSON(t, w, map[string]any{
			"data": map[string]any{
				"id":         77,
				"languageId": "en",
			},
		})
	})
	mux.HandleFunc("/api/v2/glossaries/77/concepts", func(w http.ResponseWriter, r *http.Request) {
		assertRequest(t, r, http.MethodGet, "/api/v2/glossaries/77/concepts?limit=500&orderBy=id")
		writeJSON(t, w, map[string]any{
			"data": []any{
				map[string]any{"data": map[string]any{
					"id":           9,
					"subject":      "checkout",
					"definition":   "Checkout action",
					"note":         "Use for ecommerce buttons",
					"url":          "https://example.test/concepts/9",
					"figure":       "https://example.test/concepts/9.png",
					"translatable": true,
				}},
			},
			"pagination": map[string]any{"offset": 0, "limit": 500},
		})
	})
	mux.HandleFunc("/api/v2/glossaries/77/terms", func(w http.ResponseWriter, r *http.Request) {
		assertRequest(t, r, http.MethodGet, "/api/v2/glossaries/77/terms?limit=500&orderBy=id")
		writeJSON(t, w, map[string]any{
			"data": []any{
				map[string]any{"data": map[string]any{
					"id":           4,
					"glossaryId":   77,
					"languageId":   "fr",
					"text":         "Commander",
					"description":  "Button label",
					"partOfSpeech": "verb",
					"status":       "preferred",
					"type":         "full form",
					"gender":       "other",
					"note":         "Imperative",
					"url":          "https://example.test/terms/4",
					"conceptId":    9,
					"lemma":        "commander",
				}},
				map[string]any{"data": map[string]any{
					"id":         3,
					"glossaryId": 77,
					"languageId": "en",
					"text":       "Checkout",
					"conceptId":  9,
					"lemma":      "checkout",
				}},
			},
			"pagination": map[string]any{"offset": 0, "limit": 500},
		})
	})

	var out bytes.Buffer
	result, err := client.WriteGlossaryCSV(context.Background(), GlossaryDownloadRequest{
		GlossaryID: 77,
		Languages:  []string{"fr"},
	}, &out)
	if err != nil {
		t.Fatalf("write glossary csv: %v", err)
	}
	if result.Terms != 1 {
		t.Fatalf("terms = %d, want 1", result.Terms)
	}

	records, err := csv.NewReader(strings.NewReader(out.String())).ReadAll()
	if err != nil {
		t.Fatalf("read csv: %v", err)
	}
	if len(records) != 2 {
		t.Fatalf("record count = %d, want 2: %q", len(records), out.String())
	}
	if got, want := records[0], glossaryCSVHeader; !equalStrings(got, want) {
		t.Fatalf("header = %#v, want %#v", got, want)
	}
	wantRow := []string{
		"77",
		"9",
		"4",
		"en",
		"Checkout",
		"fr",
		"Commander",
		"Button label",
		"verb",
		"full form",
		"preferred",
		"other",
		"Imperative",
		"https://example.test/terms/4",
		"commander",
		"checkout",
		"Checkout action",
		"Use for ecommerce buttons",
		"https://example.test/concepts/9",
		"https://example.test/concepts/9.png",
	}
	if got := records[1]; !equalStrings(got, wantRow) {
		t.Fatalf("row = %#v, want %#v", got, wantRow)
	}
}

func TestWriteGlossaryCSVPaginatesTerms(t *testing.T) {
	client, mux, teardown := newCrowdinHTTPClientForTest(t)
	defer teardown()

	mux.HandleFunc("/api/v2/glossaries/88", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(t, w, map[string]any{"data": map[string]any{"id": 88, "languageId": "en"}})
	})
	mux.HandleFunc("/api/v2/glossaries/88/concepts", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(t, w, map[string]any{"data": []any{}, "pagination": map[string]any{"offset": 0, "limit": 500}})
	})
	mux.HandleFunc("/api/v2/glossaries/88/terms", func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Query().Get("offset") {
		case "":
			writeJSON(t, w, map[string]any{
				"data":       termPayload(500),
				"pagination": map[string]any{"offset": 0, "limit": 500},
			})
		case "500":
			writeJSON(t, w, map[string]any{
				"data": []any{
					map[string]any{"data": map[string]any{"id": 501, "languageId": "fr", "text": "Term 501", "conceptId": 501}},
				},
				"pagination": map[string]any{"offset": 500, "limit": 500},
			})
		default:
			t.Fatalf("unexpected offset %q", r.URL.Query().Get("offset"))
		}
	})

	var out bytes.Buffer
	result, err := client.WriteGlossaryCSV(context.Background(), GlossaryDownloadRequest{GlossaryID: 88}, &out)
	if err != nil {
		t.Fatalf("write glossary csv: %v", err)
	}
	if result.Terms != 501 {
		t.Fatalf("terms = %d, want 501", result.Terms)
	}
}

func TestWriteGlossaryCSVHandlesEmptyGlossary(t *testing.T) {
	client, mux, teardown := newCrowdinHTTPClientForTest(t)
	defer teardown()

	mux.HandleFunc("/api/v2/glossaries/89", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(t, w, map[string]any{"data": map[string]any{"id": 89, "languageId": "en"}})
	})
	mux.HandleFunc("/api/v2/glossaries/89/concepts", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(t, w, map[string]any{"data": []any{}, "pagination": map[string]any{"offset": 0, "limit": 500}})
	})
	mux.HandleFunc("/api/v2/glossaries/89/terms", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(t, w, map[string]any{"data": []any{}, "pagination": map[string]any{"offset": 0, "limit": 500}})
	})

	var out bytes.Buffer
	result, err := client.WriteGlossaryCSV(context.Background(), GlossaryDownloadRequest{GlossaryID: 89}, &out)
	if err != nil {
		t.Fatalf("write glossary csv: %v", err)
	}
	if result.Terms != 0 {
		t.Fatalf("terms = %d, want 0", result.Terms)
	}
	if got, want := strings.TrimSpace(out.String()), strings.Join(glossaryCSVHeader, ","); got != want {
		t.Fatalf("csv = %q, want %q", got, want)
	}
}

func TestWriteGlossaryCSVReturnsAPIError(t *testing.T) {
	client, mux, teardown := newCrowdinHTTPClientForTest(t)
	defer teardown()

	mux.HandleFunc("/api/v2/glossaries/90", func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, `{"error":{"message":"unauthorized"}}`, http.StatusUnauthorized)
	})

	var out bytes.Buffer
	_, err := client.WriteGlossaryCSV(context.Background(), GlossaryDownloadRequest{GlossaryID: 90}, &out)
	if err == nil || !strings.Contains(err.Error(), "get glossary") {
		t.Fatalf("error = %v, want get glossary error", err)
	}
}

func writeJSON(t *testing.T, w http.ResponseWriter, value any) {
	t.Helper()
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(value); err != nil {
		t.Fatalf("write json: %v", err)
	}
}

func termPayload(count int) []any {
	terms := make([]any, 0, count)
	for i := 1; i <= count; i++ {
		terms = append(terms, map[string]any{"data": map[string]any{
			"id":         i,
			"languageId": "fr",
			"text":       fmt.Sprintf("Term %d", i),
			"conceptId":  i,
		}})
	}
	return terms
}

func equalStrings(left, right []string) bool {
	if len(left) != len(right) {
		return false
	}
	for idx := range left {
		if left[idx] != right[idx] {
			return false
		}
	}
	return true
}
