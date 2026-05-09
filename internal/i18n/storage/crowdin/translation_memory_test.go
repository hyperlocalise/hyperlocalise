package crowdin

import (
	"bytes"
	"context"
	"encoding/csv"
	"fmt"
	"net/http"
	"strings"
	"testing"
)

func TestWriteTranslationMemoryCSVWritesStableRows(t *testing.T) {
	client, mux, teardown := newCrowdinHTTPClientForTest(t)
	defer teardown()

	mux.HandleFunc("/api/v2/tms/44/segments", func(w http.ResponseWriter, r *http.Request) {
		assertRequest(t, r, http.MethodGet, "/api/v2/tms/44/segments?limit=500&orderBy=id")
		writeJSON(t, w, map[string]any{
			"data": []any{
				map[string]any{"data": map[string]any{
					"id": 9,
					"records": []any{
						map[string]any{"id": 92, "languageId": "fr", "text": "Commander", "usageCount": 2, "createdBy": 7, "updatedBy": 8, "createdAt": "2024-01-02T03:04:05+00:00", "updatedAt": "2024-01-03T03:04:05+00:00"},
						map[string]any{"id": 91, "languageId": "en", "text": "Checkout", "usageCount": 5, "createdBy": 3, "updatedBy": 4, "createdAt": "2024-01-01T03:04:05+00:00", "updatedAt": "2024-01-04T03:04:05+00:00"},
						map[string]any{"id": 93, "languageId": "es", "text": "Pagar", "usageCount": 1},
					},
				}},
			},
			"pagination": map[string]any{"offset": 0, "limit": 500},
		})
	})

	var out bytes.Buffer
	result, err := client.WriteTranslationMemoryCSV(context.Background(), TranslationMemoryDownloadRequest{
		TranslationMemoryID: 44,
		SourceLanguage:      "en",
		TargetLanguages:     []string{"fr", "es"},
	}, &out)
	if err != nil {
		t.Fatalf("write translation memory csv: %v", err)
	}
	if result.Rows != 2 || result.Segments != 1 {
		t.Fatalf("result = %#v, want rows=2 segments=1", result)
	}

	records, err := csv.NewReader(strings.NewReader(out.String())).ReadAll()
	if err != nil {
		t.Fatalf("read csv: %v", err)
	}
	if len(records) != 3 {
		t.Fatalf("record count = %d, want 3: %q", len(records), out.String())
	}
	if got, want := records[0], translationMemoryCSVHeader(); !equalStrings(got, want) {
		t.Fatalf("header = %#v, want %#v", got, want)
	}
	wantFirst := []string{"44", "9", "en", "es", "Checkout", "Pagar", "91", "93", "5", "1", "2024-01-01T03:04:05+00:00", "", "2024-01-04T03:04:05+00:00", "", "3", "0", "4", "0"}
	if got := records[1]; !equalStrings(got, wantFirst) {
		t.Fatalf("first row = %#v, want %#v", got, wantFirst)
	}
	wantSecond := []string{"44", "9", "en", "fr", "Checkout", "Commander", "91", "92", "5", "2", "2024-01-01T03:04:05+00:00", "2024-01-02T03:04:05+00:00", "2024-01-04T03:04:05+00:00", "2024-01-03T03:04:05+00:00", "3", "7", "4", "8"}
	if got := records[2]; !equalStrings(got, wantSecond) {
		t.Fatalf("second row = %#v, want %#v", got, wantSecond)
	}
}

func TestWriteTranslationMemoryCSVPaginatesSegments(t *testing.T) {
	client, mux, teardown := newCrowdinHTTPClientForTest(t)
	defer teardown()

	mux.HandleFunc("/api/v2/tms/45/segments", func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Query().Get("offset") {
		case "":
			writeJSON(t, w, map[string]any{
				"data":       tmSegmentPayload(500),
				"pagination": map[string]any{"offset": 0, "limit": 500},
			})
		case "500":
			writeJSON(t, w, map[string]any{
				"data":       []any{tmSegmentData(501)},
				"pagination": map[string]any{"offset": 500, "limit": 500},
			})
		default:
			t.Fatalf("unexpected offset %q", r.URL.Query().Get("offset"))
		}
	})

	var out bytes.Buffer
	result, err := client.WriteTranslationMemoryCSV(context.Background(), TranslationMemoryDownloadRequest{
		TranslationMemoryID: 45,
		SourceLanguage:      "en",
		TargetLanguages:     []string{"fr"},
	}, &out)
	if err != nil {
		t.Fatalf("write translation memory csv: %v", err)
	}
	if result.Rows != 501 || result.Segments != 501 {
		t.Fatalf("result = %#v, want rows=501 segments=501", result)
	}
}

func TestWriteTranslationMemoryCSVHandlesEmptyResults(t *testing.T) {
	client, mux, teardown := newCrowdinHTTPClientForTest(t)
	defer teardown()

	mux.HandleFunc("/api/v2/tms/46/segments", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(t, w, map[string]any{"data": []any{}, "pagination": map[string]any{"offset": 0, "limit": 500}})
	})

	var out bytes.Buffer
	result, err := client.WriteTranslationMemoryCSV(context.Background(), TranslationMemoryDownloadRequest{
		TranslationMemoryID: 46,
		SourceLanguage:      "en",
		TargetLanguages:     []string{"fr"},
	}, &out)
	if err != nil {
		t.Fatalf("write translation memory csv: %v", err)
	}
	if result.Rows != 0 || result.Segments != 0 {
		t.Fatalf("result = %#v, want zero result", result)
	}
	if got, want := strings.TrimSpace(out.String()), strings.Join(translationMemoryCSVHeader(), ","); got != want {
		t.Fatalf("csv = %q, want %q", got, want)
	}
}

func TestWriteTranslationMemoryTMXWritesStableUnits(t *testing.T) {
	client, mux, teardown := newCrowdinHTTPClientForTest(t)
	defer teardown()

	mux.HandleFunc("/api/v2/tms/48/segments", func(w http.ResponseWriter, r *http.Request) {
		assertRequest(t, r, http.MethodGet, "/api/v2/tms/48/segments?limit=500&orderBy=id")
		writeJSON(t, w, map[string]any{
			"data": []any{
				map[string]any{"data": map[string]any{
					"id": 9,
					"records": []any{
						map[string]any{"id": 92, "languageId": "fr", "text": "Commander & payer"},
						map[string]any{"id": 91, "languageId": "en", "text": "Checkout <now>"},
					},
				}},
			},
			"pagination": map[string]any{"offset": 0, "limit": 500},
		})
	})

	var out bytes.Buffer
	result, err := client.WriteTranslationMemoryTMX(context.Background(), TranslationMemoryDownloadRequest{
		TranslationMemoryID: 48,
		SourceLanguage:      "en",
		TargetLanguages:     []string{"fr"},
	}, &out)
	if err != nil {
		t.Fatalf("write translation memory tmx: %v", err)
	}
	if result.Rows != 2 || result.Segments != 1 {
		t.Fatalf("result = %#v, want rows=2 segments=1", result)
	}
	got := out.String()
	for _, want := range []string{`<header creationtool="hyperlocalise"`, `srclang="en"`, `<tu tuid="9">`, `<tuv xml:lang="en">`, `Checkout &lt;now&gt;`, `<tuv xml:lang="fr">`, `Commander &amp; payer`} {
		if !strings.Contains(got, want) {
			t.Fatalf("tmx = %q, want to contain %q", got, want)
		}
	}
}

func TestWriteTranslationMemoryCSVReturnsAPIError(t *testing.T) {
	client, mux, teardown := newCrowdinHTTPClientForTest(t)
	defer teardown()

	mux.HandleFunc("/api/v2/tms/47/segments", func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, `{"error":{"message":"unauthorized"}}`, http.StatusUnauthorized)
	})

	var out bytes.Buffer
	_, err := client.WriteTranslationMemoryCSV(context.Background(), TranslationMemoryDownloadRequest{
		TranslationMemoryID: 47,
		SourceLanguage:      "en",
		TargetLanguages:     []string{"fr"},
	}, &out)
	if err == nil || !strings.Contains(err.Error(), "list translation memory segments") {
		t.Fatalf("error = %v, want list translation memory segments error", err)
	}
}

func tmSegmentPayload(count int) []any {
	segments := make([]any, 0, count)
	for i := 1; i <= count; i++ {
		segments = append(segments, tmSegmentData(i))
	}
	return segments
}

func tmSegmentData(id int) any {
	return map[string]any{"data": map[string]any{
		"id": id,
		"records": []any{
			map[string]any{"id": id*10 + 1, "languageId": "en", "text": fmt.Sprintf("Source %d", id)},
			map[string]any{"id": id*10 + 2, "languageId": "fr", "text": fmt.Sprintf("Target %d", id)},
		},
	}}
}
