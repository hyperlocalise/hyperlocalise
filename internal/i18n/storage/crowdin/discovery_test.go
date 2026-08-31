package crowdin

import (
	"context"
	"net/http"
	"reflect"
	"testing"
)

func TestListProjectFiles(t *testing.T) {
	client, mux, teardown := newCrowdinHTTPClientForTest(t)
	defer teardown()

	mux.HandleFunc("/api/v2/projects/123/files", func(w http.ResponseWriter, r *http.Request) {
		assertRequest(t, r, http.MethodGet, "/api/v2/projects/123/files?limit=500")
		writeJSON(t, w, map[string]any{
			"data": []any{
				map[string]any{"data": map[string]any{"id": 17, "name": "messages.json", "path": "/messages.json"}},
			},
		})
	})
	mux.HandleFunc("/api/v2/projects/123/directories", func(w http.ResponseWriter, r *http.Request) {
		assertRequest(t, r, http.MethodGet, "/api/v2/projects/123/directories?limit=500")
		writeJSON(t, w, map[string]any{"data": []any{}})
	})

	got, err := client.ListProjectFiles(context.Background(), "123", "")
	if err != nil {
		t.Fatalf("list files: %v", err)
	}
	want := []ProjectFile{{ID: 17, Name: "messages.json", Path: "/messages.json"}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("files = %#v, want %#v", got, want)
	}
}

func TestListProjectFilesIncludesNestedDirectories(t *testing.T) {
	client, mux, teardown := newCrowdinHTTPClientForTest(t)
	defer teardown()

	mux.HandleFunc("/api/v2/projects/123/files", func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.RawQuery {
		case "limit=500":
			assertRequest(t, r, http.MethodGet, "/api/v2/projects/123/files?limit=500")
			writeJSON(t, w, map[string]any{
				"data": []any{
					map[string]any{"data": map[string]any{"id": 17, "name": "messages.json", "path": "/messages.json"}},
				},
			})
		case "directoryId=9&limit=500&recursion=true":
			assertRequest(t, r, http.MethodGet, "/api/v2/projects/123/files?directoryId=9&limit=500&recursion=true")
			writeJSON(t, w, map[string]any{
				"data": []any{
					map[string]any{"data": map[string]any{"id": 18, "name": "nested.json", "path": "/src/nested.json"}},
				},
			})
		default:
			t.Fatalf("unexpected files query %q", r.URL.RawQuery)
		}
	})
	mux.HandleFunc("/api/v2/projects/123/directories", func(w http.ResponseWriter, r *http.Request) {
		assertRequest(t, r, http.MethodGet, "/api/v2/projects/123/directories?limit=500")
		writeJSON(t, w, map[string]any{
			"data": []any{
				map[string]any{"data": map[string]any{"id": 9, "name": "src", "path": "/src"}},
			},
		})
	})

	got, err := client.ListProjectFiles(context.Background(), "123", "")
	if err != nil {
		t.Fatalf("list files: %v", err)
	}
	want := []ProjectFile{
		{ID: 17, Name: "messages.json", Path: "/messages.json"},
		{ID: 18, Name: "nested.json", Path: "/src/nested.json"},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("files = %#v, want %#v", got, want)
	}
}

func TestListProjectFilesByBranch(t *testing.T) {
	client, mux, teardown := newCrowdinHTTPClientForTest(t)
	defer teardown()

	mux.HandleFunc("/api/v2/projects/123/branches", func(w http.ResponseWriter, r *http.Request) {
		assertRequest(t, r, http.MethodGet, "/api/v2/projects/123/branches?limit=500&name=feature%2Flogin")
		writeJSON(t, w, map[string]any{
			"data": []any{
				map[string]any{"data": map[string]any{"id": 42, "name": "feature/login"}},
			},
		})
	})
	mux.HandleFunc("/api/v2/projects/123/files", func(w http.ResponseWriter, r *http.Request) {
		assertRequest(t, r, http.MethodGet, "/api/v2/projects/123/files?branchId=42&limit=500&recursion=true")
		writeJSON(t, w, map[string]any{
			"data": []any{
				map[string]any{"data": map[string]any{"id": 18, "name": "login.json", "path": "/login.json"}},
			},
		})
	})

	got, err := client.ListProjectFiles(context.Background(), "123", "feature/login")
	if err != nil {
		t.Fatalf("list files: %v", err)
	}
	if !reflect.DeepEqual(got, []ProjectFile{{ID: 18, Name: "login.json", Path: "/login.json"}}) {
		t.Fatalf("files = %#v", got)
	}
}

func TestListProjectLanguages(t *testing.T) {
	client, mux, teardown := newCrowdinHTTPClientForTest(t)
	defer teardown()

	mux.HandleFunc("/api/v2/projects/123", func(w http.ResponseWriter, r *http.Request) {
		assertRequest(t, r, http.MethodGet, "/api/v2/projects/123")
		writeJSON(t, w, map[string]any{
			"data": map[string]any{
				"id":                123,
				"targetLanguageIds": []string{"fr", "vi"},
				"targetLanguages": []any{
					map[string]any{"id": "fr", "name": "French", "locale": "fr-FR"},
					map[string]any{"id": "vi", "name": "Vietnamese", "locale": "vi-VN"},
				},
			},
		})
	})

	got, err := client.ListProjectLanguages(context.Background(), "123")
	if err != nil {
		t.Fatalf("list languages: %v", err)
	}
	want := []ProjectLanguage{
		{ID: "fr", Name: "French", Locale: "fr-FR"},
		{ID: "vi", Name: "Vietnamese", Locale: "vi-VN"},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("languages = %#v, want %#v", got, want)
	}
}

func TestListProjectLanguagesFallsBackToTargetLanguages(t *testing.T) {
	client, mux, teardown := newCrowdinHTTPClientForTest(t)
	defer teardown()

	mux.HandleFunc("/api/v2/projects/123", func(w http.ResponseWriter, r *http.Request) {
		assertRequest(t, r, http.MethodGet, "/api/v2/projects/123")
		writeJSON(t, w, map[string]any{
			"data": map[string]any{
				"id":                123,
				"targetLanguageIds": []string{},
				"targetLanguages": []any{
					map[string]any{"id": "vi", "name": "Vietnamese", "locale": "vi-VN"},
				},
			},
		})
	})

	got, err := client.ListProjectLanguages(context.Background(), "123")
	if err != nil {
		t.Fatalf("list languages: %v", err)
	}
	want := []ProjectLanguage{{ID: "vi", Name: "Vietnamese", Locale: "vi-VN"}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("languages = %#v, want %#v", got, want)
	}
}

func TestListAllLanguages(t *testing.T) {
	client, mux, teardown := newCrowdinHTTPClientForTest(t)
	defer teardown()

	mux.HandleFunc("/api/v2/languages", func(w http.ResponseWriter, r *http.Request) {
		assertRequest(t, r, http.MethodGet, "/api/v2/languages?limit=500")
		writeJSON(t, w, map[string]any{
			"data": []any{
				map[string]any{"data": map[string]any{"id": "en", "name": "English", "locale": "en-US"}},
			},
		})
	})

	got, err := client.ListAllLanguages(context.Background())
	if err != nil {
		t.Fatalf("list all languages: %v", err)
	}
	if !reflect.DeepEqual(got, []ProjectLanguage{{ID: "en", Name: "English", Locale: "en-US"}}) {
		t.Fatalf("languages = %#v", got)
	}
}

func TestListGlossariesAndTranslationMemories(t *testing.T) {
	client, mux, teardown := newCrowdinHTTPClientForTest(t)
	defer teardown()

	mux.HandleFunc("/api/v2/glossaries", func(w http.ResponseWriter, r *http.Request) {
		assertRequest(t, r, http.MethodGet, "/api/v2/glossaries?limit=500")
		writeJSON(t, w, map[string]any{
			"data": []any{
				map[string]any{"data": map[string]any{"id": 77, "name": "Product terms"}},
			},
		})
	})
	mux.HandleFunc("/api/v2/tms", func(w http.ResponseWriter, r *http.Request) {
		assertRequest(t, r, http.MethodGet, "/api/v2/tms?limit=500")
		writeJSON(t, w, map[string]any{
			"data": []any{
				map[string]any{"data": map[string]any{"id": 4, "name": "App TM"}},
			},
		})
	})

	glossaries, err := client.ListGlossaries(context.Background(), "123")
	if err != nil {
		t.Fatalf("list glossaries: %v", err)
	}
	if !reflect.DeepEqual(glossaries, []GlossarySummary{{ID: 77, Name: "Product terms"}}) {
		t.Fatalf("glossaries = %#v", glossaries)
	}
	memories, err := client.ListTranslationMemories(context.Background(), "123")
	if err != nil {
		t.Fatalf("list translation memories: %v", err)
	}
	if !reflect.DeepEqual(memories, []TranslationMemorySummary{{ID: 4, Name: "App TM"}}) {
		t.Fatalf("translation memories = %#v", memories)
	}
}

func TestListGlossariesAndTranslationMemoriesFiltersOtherProjects(t *testing.T) {
	client, mux, teardown := newCrowdinHTTPClientForTest(t)
	defer teardown()

	mux.HandleFunc("/api/v2/glossaries", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(t, w, map[string]any{
			"data": []any{
				map[string]any{"data": map[string]any{"id": 77, "name": "This project", "projectIds": []int{123}}},
				map[string]any{"data": map[string]any{"id": 88, "name": "Other project", "projectIds": []int{999}}},
			},
		})
	})
	mux.HandleFunc("/api/v2/tms", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(t, w, map[string]any{
			"data": []any{
				map[string]any{"data": map[string]any{"id": 4, "name": "This TM", "defaultProjectIds": []int{123}}},
				map[string]any{"data": map[string]any{"id": 5, "name": "Other TM", "projectIds": []int{999}}},
			},
		})
	})

	glossaries, err := client.ListGlossaries(context.Background(), "123")
	if err != nil {
		t.Fatalf("list glossaries: %v", err)
	}
	if !reflect.DeepEqual(glossaries, []GlossarySummary{{ID: 77, Name: "This project"}}) {
		t.Fatalf("glossaries = %#v", glossaries)
	}
	memories, err := client.ListTranslationMemories(context.Background(), "123")
	if err != nil {
		t.Fatalf("list translation memories: %v", err)
	}
	if !reflect.DeepEqual(memories, []TranslationMemorySummary{{ID: 4, Name: "This TM"}}) {
		t.Fatalf("translation memories = %#v", memories)
	}
}

func TestAssignedToCrowdinProject(t *testing.T) {
	cases := []struct {
		name              string
		projectID         int
		defaultProjectIDs []int
		projectIDs        []int
		want              bool
	}{
		{name: "empty assignment lists include all", projectID: 123, want: true},
		{name: "match defaultProjectIDs", projectID: 123, defaultProjectIDs: []int{99, 123}, want: true},
		{name: "match projectIDs only", projectID: 123, projectIDs: []int{123}, want: true},
		{name: "miss both lists", projectID: 123, defaultProjectIDs: []int{1}, projectIDs: []int{2}, want: false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := assignedToCrowdinProject(tc.projectID, tc.defaultProjectIDs, tc.projectIDs)
			if got != tc.want {
				t.Fatalf("assignedToCrowdinProject = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestListGlossariesAndTranslationMemoriesPaginates(t *testing.T) {
	client, mux, teardown := newCrowdinHTTPClientForTest(t)
	defer teardown()

	mux.HandleFunc("/api/v2/glossaries", func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.RawQuery {
		case "limit=500":
			rows := make([]any, 0, pageLimit)
			for i := 1; i <= pageLimit; i++ {
				rows = append(rows, map[string]any{
					"data": map[string]any{"id": i, "name": "glossary", "projectIds": []int{123}},
				})
			}
			writeJSON(t, w, map[string]any{"data": rows})
		case "limit=500&offset=500":
			writeJSON(t, w, map[string]any{
				"data": []any{
					map[string]any{"data": map[string]any{"id": 501, "name": "page-two", "projectIds": []int{123}}},
				},
			})
		default:
			t.Fatalf("unexpected glossaries query %q", r.URL.RawQuery)
		}
	})
	mux.HandleFunc("/api/v2/tms", func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.RawQuery {
		case "limit=500":
			rows := make([]any, 0, pageLimit)
			for i := 1; i <= pageLimit; i++ {
				rows = append(rows, map[string]any{
					"data": map[string]any{"id": i, "name": "tm", "defaultProjectIds": []int{123}},
				})
			}
			writeJSON(t, w, map[string]any{"data": rows})
		case "limit=500&offset=500":
			writeJSON(t, w, map[string]any{
				"data": []any{
					map[string]any{"data": map[string]any{"id": 501, "name": "tm-page-two", "defaultProjectIds": []int{123}}},
				},
			})
		default:
			t.Fatalf("unexpected tms query %q", r.URL.RawQuery)
		}
	})

	glossaries, err := client.ListGlossaries(context.Background(), "123")
	if err != nil {
		t.Fatalf("list glossaries: %v", err)
	}
	if len(glossaries) != pageLimit+1 || glossaries[pageLimit].ID != 501 || glossaries[pageLimit].Name != "page-two" {
		t.Fatalf("glossaries len=%d last=%#v", len(glossaries), glossaries[len(glossaries)-1])
	}
	memories, err := client.ListTranslationMemories(context.Background(), "123")
	if err != nil {
		t.Fatalf("list translation memories: %v", err)
	}
	if len(memories) != pageLimit+1 || memories[pageLimit].ID != 501 || memories[pageLimit].Name != "tm-page-two" {
		t.Fatalf("memories len=%d last=%#v", len(memories), memories[len(memories)-1])
	}
}

func TestListProjectFilesDedupesNestedDuplicates(t *testing.T) {
	client, mux, teardown := newCrowdinHTTPClientForTest(t)
	defer teardown()

	mux.HandleFunc("/api/v2/projects/123/files", func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.RawQuery {
		case "limit=500":
			writeJSON(t, w, map[string]any{
				"data": []any{
					map[string]any{"data": map[string]any{"id": 17, "name": "messages.json", "path": "/messages.json"}},
					map[string]any{"data": map[string]any{"id": 18, "name": "nested.json", "path": "/src/nested.json"}},
				},
			})
		case "directoryId=9&limit=500&recursion=true":
			writeJSON(t, w, map[string]any{
				"data": []any{
					map[string]any{"data": map[string]any{"id": 18, "name": "nested.json", "path": "/src/nested.json"}},
					map[string]any{"data": map[string]any{"id": 19, "name": "deep.json", "path": "/src/deep.json"}},
				},
			})
		default:
			t.Fatalf("unexpected files query %q", r.URL.RawQuery)
		}
	})
	mux.HandleFunc("/api/v2/projects/123/directories", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(t, w, map[string]any{
			"data": []any{
				map[string]any{"data": map[string]any{"id": 9, "name": "src", "path": "/src"}},
			},
		})
	})

	got, err := client.ListProjectFiles(context.Background(), "123", "")
	if err != nil {
		t.Fatalf("list files: %v", err)
	}
	want := []ProjectFile{
		{ID: 17, Name: "messages.json", Path: "/messages.json"},
		{ID: 18, Name: "nested.json", Path: "/src/nested.json"},
		{ID: 19, Name: "deep.json", Path: "/src/deep.json"},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("files = %#v, want %#v", got, want)
	}
}
