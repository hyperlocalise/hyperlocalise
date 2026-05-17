package lokalise

import (
	"bytes"
	"context"
	"encoding/csv"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHTTPClientWriteGlossaryCSV(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/projects/proj-1/glossary-terms", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			t.Fatalf("method = %s, want GET", r.Method)
		}
		if got := r.Header.Get("X-Api-Token"); got != "token" {
			t.Fatalf("X-Api-Token = %q, want token", got)
		}
		if got := r.URL.Query().Get("limit"); got != "500" {
			t.Fatalf("limit = %q, want 500", got)
		}
		writeLokaliseJSON(t, w, map[string]any{
			"items": []any{
				map[string]any{
					"id":            2,
					"term":          "Cart",
					"description":   "Shopping cart",
					"translatable":  true,
					"forbidden":     false,
					"caseSensitive": false,
					"tags":          []string{"commerce"},
					"translations": []any{
						map[string]any{"id": 22, "langId": 597, "translation": "Warenkorb", "description": "German term"},
					},
					"createdAt": "2024-01-01T00:00:00Z",
					"updatedAt": "2024-01-02T00:00:00Z",
				},
				map[string]any{
					"id":            1,
					"term":          "Checkout",
					"description":   "CTA",
					"translatable":  true,
					"forbidden":     false,
					"caseSensitive": true,
					"tags":          []string{"checkout", "button"},
					"translations": []any{
						map[string]any{"id": 11, "langId": 674, "translation": "Paiement", "description": "French term"},
					},
					"createdAt": "2024-02-01T00:00:00Z",
					"updatedAt": "2024-02-02T00:00:00Z",
				},
			},
		})
	})
	mux.HandleFunc("/projects/proj-1/languages", func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("X-Api-Token"); got != "token" {
			t.Fatalf("X-Api-Token = %q, want token", got)
		}
		writeLokaliseJSON(t, w, map[string]any{
			"languages": []any{
				map[string]any{"lang_id": 674, "lang_iso": "fr"},
				map[string]any{"lang_id": 597, "lang_iso": "de_DE"},
			},
		})
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	client, err := NewHTTPClientWithBaseURL(Config{APIToken: "token"}, srv.URL, srv.Client())
	if err != nil {
		t.Fatal(err)
	}
	out := bytes.NewBuffer(nil)
	result, err := client.WriteGlossaryCSV(context.Background(), GlossaryDownloadInput{ProjectID: "proj-1", APIToken: "token"}, out)
	if err != nil {
		t.Fatalf("write glossary csv: %v", err)
	}
	if result.Terms != 2 || result.Rows != 2 {
		t.Fatalf("result = %+v, want terms=2 rows=2", result)
	}
	reader := csv.NewReader(strings.NewReader(out.String()))
	reader.Comma = ';'
	records, err := reader.ReadAll()
	if err != nil {
		t.Fatalf("read csv: %v", err)
	}
	wantHeader := []string{
		"term",
		"description",
		"casesensitive",
		"translatable",
		"Forbidden",
		"tags",
		"de_DE",
		"fr",
		"de_DE_description",
		"fr_description",
	}
	wantCartRow := []string{
		"Cart",
		"Shopping cart",
		"no",
		"yes",
		"no",
		"commerce",
		"Warenkorb",
		"",
		"German term",
		"",
	}
	wantCheckoutRow := []string{
		"Checkout",
		"CTA",
		"yes",
		"yes",
		"no",
		"checkout,button",
		"",
		"Paiement",
		"",
		"French term",
	}
	if got := records[0]; !equalLokaliseStrings(got, wantHeader) {
		t.Fatalf("header = %#v, want %#v", got, wantHeader)
	}
	if got := records[1]; !equalLokaliseStrings(got, wantCartRow) {
		t.Fatalf("cart row = %#v, want %#v", got, wantCartRow)
	}
	if got := records[2]; !equalLokaliseStrings(got, wantCheckoutRow) {
		t.Fatalf("checkout row = %#v, want %#v", got, wantCheckoutRow)
	}
}

func TestHTTPClientWriteGlossaryCSVFiltersLocaleColumns(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/projects/proj-1/glossary-terms", func(w http.ResponseWriter, _ *http.Request) {
		writeLokaliseJSON(t, w, map[string]any{
			"items": []any{
				map[string]any{
					"id":            1,
					"term":          "Checkout",
					"description":   "CTA",
					"translatable":  true,
					"forbidden":     false,
					"caseSensitive": true,
					"translations": []any{
						map[string]any{"id": 11, "langId": 674, "translation": "Paiement", "description": "French term"},
						map[string]any{"id": 12, "langId": 597, "translation": "Kasse", "description": "German term"},
					},
				},
			},
		})
	})
	mux.HandleFunc("/projects/proj-1/languages", func(w http.ResponseWriter, _ *http.Request) {
		writeLokaliseJSON(t, w, map[string]any{
			"languages": []any{
				map[string]any{"lang_id": 674, "lang_iso": "fr"},
				map[string]any{"lang_id": 597, "lang_iso": "de_DE"},
			},
		})
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	client, err := NewHTTPClientWithBaseURL(Config{APIToken: "token"}, srv.URL, srv.Client())
	if err != nil {
		t.Fatal(err)
	}
	out := bytes.NewBuffer(nil)
	result, err := client.WriteGlossaryCSV(context.Background(), GlossaryDownloadInput{
		ProjectID: "proj-1",
		APIToken:  "token",
		Locales:   []string{"fr"},
	}, out)
	if err != nil {
		t.Fatalf("write glossary csv: %v", err)
	}
	if result.Terms != 1 || result.Rows != 1 {
		t.Fatalf("result = %+v, want terms=1 rows=1", result)
	}
	reader := csv.NewReader(strings.NewReader(out.String()))
	reader.Comma = ';'
	records, err := reader.ReadAll()
	if err != nil {
		t.Fatalf("read csv: %v", err)
	}
	wantHeader := []string{"term", "description", "casesensitive", "translatable", "Forbidden", "tags", "fr", "fr_description"}
	wantRow := []string{"Checkout", "CTA", "yes", "yes", "no", "", "Paiement", "French term"}
	if got := records[0]; !equalLokaliseStrings(got, wantHeader) {
		t.Fatalf("header = %#v, want %#v", got, wantHeader)
	}
	if got := records[1]; !equalLokaliseStrings(got, wantRow) {
		t.Fatalf("row = %#v, want %#v", got, wantRow)
	}
}

func TestHTTPClientWriteGlossaryCSVPaginates(t *testing.T) {
	cursors := make([]string, 0, 2)
	mux := http.NewServeMux()
	mux.HandleFunc("/projects/proj-1/glossary-terms", func(w http.ResponseWriter, r *http.Request) {
		cursors = append(cursors, r.URL.Query().Get("cursor"))
		switch r.URL.Query().Get("cursor") {
		case "":
			w.Header().Set("X-Pagination-Next-Cursor", "next-1")
			writeLokaliseJSON(t, w, map[string]any{"items": []any{map[string]any{"id": 1, "term": "First"}}})
		case "next-1":
			writeLokaliseJSON(t, w, map[string]any{"items": []any{map[string]any{"id": 2, "term": "Second"}}})
		default:
			t.Fatalf("unexpected cursor: %s", r.URL.Query().Get("cursor"))
		}
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	client, err := NewHTTPClientWithBaseURL(Config{APIToken: "token"}, srv.URL, srv.Client())
	if err != nil {
		t.Fatal(err)
	}
	result, err := client.WriteGlossaryCSV(context.Background(), GlossaryDownloadInput{ProjectID: "proj-1", APIToken: "token"}, io.Discard)
	if err != nil {
		t.Fatalf("write glossary csv: %v", err)
	}
	if got, want := strings.Join(cursors, ","), ",next-1"; got != want {
		t.Fatalf("cursors = %q, want %q", got, want)
	}
	if result.Terms != 2 || result.Rows != 2 {
		t.Fatalf("result = %+v, want terms=2 rows=2", result)
	}
}

func TestHTTPClientWriteGlossaryCSVHandlesEmptyGlossary(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/projects/proj-1/glossary-terms", func(w http.ResponseWriter, _ *http.Request) {
		writeLokaliseJSON(t, w, map[string]any{"items": []any{}})
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	client, err := NewHTTPClientWithBaseURL(Config{APIToken: "token"}, srv.URL, srv.Client())
	if err != nil {
		t.Fatal(err)
	}
	out := bytes.NewBuffer(nil)
	result, err := client.WriteGlossaryCSV(context.Background(), GlossaryDownloadInput{ProjectID: "proj-1", APIToken: "token"}, out)
	if err != nil {
		t.Fatalf("write glossary csv: %v", err)
	}
	if result.Terms != 0 || result.Rows != 0 {
		t.Fatalf("result = %+v, want zero", result)
	}
	if got, want := strings.TrimSpace(out.String()), strings.Join(glossaryCSVBaseHeader, ";"); got != want {
		t.Fatalf("csv = %q, want %q", got, want)
	}
}

func TestHTTPClientWriteGlossaryCSVAPIError(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/projects/proj-1/glossary-terms", func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, `{"message":"Unauthorized"}`, http.StatusUnauthorized)
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	client, err := NewHTTPClientWithBaseURL(Config{APIToken: "token"}, srv.URL, srv.Client())
	if err != nil {
		t.Fatal(err)
	}
	_, err = client.WriteGlossaryCSV(context.Background(), GlossaryDownloadInput{ProjectID: "proj-1", APIToken: "token"}, bytes.NewBuffer(nil))
	if err == nil {
		t.Fatalf("expected API error")
	}
	if !strings.Contains(err.Error(), "status=401") || !strings.Contains(err.Error(), "Unauthorized") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func writeLokaliseJSON(t *testing.T, w http.ResponseWriter, value any) {
	t.Helper()
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(value); err != nil {
		t.Fatalf("write json: %v", err)
	}
}

func equalLokaliseStrings(left, right []string) bool {
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
