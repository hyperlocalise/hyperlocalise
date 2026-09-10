package lokalise

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestListProjectLanguagesPagesAndOmitsDefault(t *testing.T) {
	oldLimit := lokaliseListPageLimit
	lokaliseListPageLimit = 1
	t.Cleanup(func() { lokaliseListPageLimit = oldLimit })

	mux := http.NewServeMux()
	mux.HandleFunc("/projects/proj-1:feature%2Fnew/languages", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			t.Fatalf("method = %s", r.Method)
		}
		if got := r.Header.Get("X-Api-Token"); got != "token" {
			t.Fatalf("token = %q", got)
		}
		switch r.URL.Query().Get("page") {
		case "1":
			writeLokaliseJSON(t, w, map[string]any{
				"languages": []any{
					map[string]any{"lang_id": 640, "lang_iso": "en", "lang_name": "English", "is_default": true},
				},
			})
		case "2":
			writeLokaliseJSON(t, w, map[string]any{
				"languages": []any{
					map[string]any{"lang_id": 674, "lang_iso": "fr", "lang_name": "French"},
				},
			})
		case "3":
			writeLokaliseJSON(t, w, map[string]any{"languages": []any{}})
		default:
			t.Fatalf("unexpected page %s", r.URL.Query().Get("page"))
		}
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	client, err := NewHTTPClientWithBaseURL(Config{APIToken: "token"}, srv.URL, srv.Client())
	if err != nil {
		t.Fatal(err)
	}
	got, err := client.ListProjectLanguages(context.Background(), LocaleListInput{ProjectID: "proj-1", Branch: "feature/new"})
	if err != nil {
		t.Fatalf("ListProjectLanguages: %v", err)
	}
	if len(got) != 2 || got[0].LanguageISO != "en" || got[1].LanguageISO != "fr" {
		t.Fatalf("languages = %#v", got)
	}
	if got[0].LanguageName != "English" {
		t.Fatalf("name = %q", got[0].LanguageName)
	}
	encoded, err := json.Marshal(got)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(encoded), "is_default") || strings.Contains(string(encoded), `"default"`) {
		t.Fatalf("json leaked invented default field: %s", encoded)
	}
}

func TestListFilesKeepsUnassignedAndFilter(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/projects/proj-1/files", func(w http.ResponseWriter, r *http.Request) {
		if got := r.URL.Query().Get("filter_filename"); got != "en.json" {
			t.Fatalf("filter_filename = %q, want en.json", got)
		}
		writeLokaliseJSON(t, w, map[string]any{
			"files": []any{
				map[string]any{"file_id": 24, "filename": "en.json", "key_count": 32},
				map[string]any{"file_id": -1, "filename": "__unassigned__", "key_count": 11},
			},
		})
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	client, err := NewHTTPClientWithBaseURL(Config{APIToken: "token"}, srv.URL, srv.Client())
	if err != nil {
		t.Fatal(err)
	}
	got, err := client.ListFiles(context.Background(), FileListInput{ProjectID: "proj-1", FilterFilename: "en.json"})
	if err != nil {
		t.Fatalf("ListFiles: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("files = %#v", got)
	}
	if got[1].Filename != "__unassigned__" || got[1].FileID != -1 || got[1].KeyCount != 11 {
		t.Fatalf("unassigned = %#v", got[1])
	}
}

func TestListFilesEmptyProject(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/projects/proj-1/files", func(w http.ResponseWriter, _ *http.Request) {
		writeLokaliseJSON(t, w, map[string]any{"files": []any{}})
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	client, err := NewHTTPClientWithBaseURL(Config{APIToken: "token"}, srv.URL, srv.Client())
	if err != nil {
		t.Fatal(err)
	}
	got, err := client.ListFiles(context.Background(), FileListInput{ProjectID: "proj-1"})
	if err != nil {
		t.Fatalf("ListFiles: %v", err)
	}
	if len(got) != 0 {
		t.Fatalf("files = %#v, want empty", got)
	}
}
