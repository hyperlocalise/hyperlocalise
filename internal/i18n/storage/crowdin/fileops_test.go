package crowdin

import (
	"context"
	"net/http"
	"reflect"
	"strings"
	"testing"
	"time"
)

func TestListProjectSourceStrings(t *testing.T) {
	client, mux, teardown := newCrowdinHTTPClientForTest(t)
	defer teardown()

	mux.HandleFunc("/api/v2/projects/123/strings", func(w http.ResponseWriter, r *http.Request) {
		assertRequest(t, r, http.MethodGet, "/api/v2/projects/123/strings?limit=500")
		writeJSON(t, w, map[string]any{
			"data": []any{
				map[string]any{"data": map[string]any{
					"id":         9,
					"identifier": "hello",
					"text":       "Hello",
					"context":    "home",
					"fileId":     17,
					"createdAt":  "2026-01-01T00:00:00Z",
				}},
			},
		})
	})

	got, err := client.ListProjectSourceStrings(context.Background(), ListSourceStringsInput{ProjectID: "123"})
	if err != nil {
		t.Fatalf("list source strings: %v", err)
	}
	want := []SourceStringRow{{
		ID:         9,
		Identifier: "hello",
		Text:       "Hello",
		Context:    "home",
		FileID:     17,
		CreatedAt:  "2026-01-01T00:00:00Z",
	}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("strings = %#v, want %#v", got, want)
	}
}

func TestListProjectSourceStringsAcceptsPluralText(t *testing.T) {
	client, mux, teardown := newCrowdinHTTPClientForTest(t)
	defer teardown()

	mux.HandleFunc("/api/v2/projects/123/strings", func(w http.ResponseWriter, r *http.Request) {
		assertRequest(t, r, http.MethodGet, "/api/v2/projects/123/strings?limit=500")
		writeJSON(t, w, map[string]any{
			"data": []any{
				map[string]any{"data": map[string]any{
					"id":         9,
					"identifier": "videos",
					"text":       map[string]any{"one": "1 video", "other": "{count} videos"},
					"fileId":     17,
				}},
			},
		})
	})

	got, err := client.ListProjectSourceStrings(context.Background(), ListSourceStringsInput{ProjectID: "123"})
	if err != nil {
		t.Fatalf("list source strings: %v", err)
	}
	if len(got) != 1 || got[0].Identifier != "videos" {
		t.Fatalf("strings = %#v", got)
	}
	if !strings.Contains(got[0].Text, `"one":"1 video"`) && !strings.Contains(got[0].Text, `"one": "1 video"`) {
		t.Fatalf("plural text = %q", got[0].Text)
	}
}

func TestListProjectSourceStringsFiltersByFilePath(t *testing.T) {
	client, mux, teardown := newCrowdinHTTPClientForTest(t)
	defer teardown()

	stubProjectFiles(t, mux, []ProjectFile{{ID: 17, Name: "messages.json", Path: "/messages.json"}})
	mux.HandleFunc("/api/v2/projects/123/strings", func(w http.ResponseWriter, r *http.Request) {
		assertRequest(t, r, http.MethodGet, "/api/v2/projects/123/strings?fileId=17&filter=hello&limit=500")
		writeJSON(t, w, map[string]any{
			"data": []any{
				map[string]any{"data": map[string]any{
					"id":         9,
					"identifier": "hello",
					"text":       "Hello",
					"fileId":     17,
				}},
			},
		})
	})

	got, err := client.ListProjectSourceStrings(context.Background(), ListSourceStringsInput{
		ProjectID: "123",
		FilePath:  "messages.json",
		Filter:    "hello",
	})
	if err != nil {
		t.Fatalf("list source strings: %v", err)
	}
	if len(got) != 1 || got[0].ID != 9 {
		t.Fatalf("strings = %#v", got)
	}
}

func TestResolveProjectFileMatchesNormalizedPath(t *testing.T) {
	client, mux, teardown := newCrowdinHTTPClientForTest(t)
	defer teardown()

	stubProjectFiles(t, mux, []ProjectFile{{ID: 17, Name: "messages.json", Path: "/src/messages.json"}})

	got, err := client.ResolveProjectFile(context.Background(), "123", "", "src/messages.json")
	if err != nil {
		t.Fatalf("resolve file: %v", err)
	}
	if got.ID != 17 {
		t.Fatalf("file = %#v", got)
	}
}

func TestResolveProjectFilePrefersExactPathOverSharedName(t *testing.T) {
	client, mux, teardown := newCrowdinHTTPClientForTest(t)
	defer teardown()

	stubProjectFiles(t, mux, []ProjectFile{
		{ID: 17, Name: "messages.json", Path: "/messages.json"},
		{ID: 18, Name: "messages.json", Path: "/src/messages.json"},
	})

	got, err := client.ResolveProjectFile(context.Background(), "123", "", "messages.json")
	if err != nil {
		t.Fatalf("resolve file: %v", err)
	}
	if got.ID != 17 {
		t.Fatalf("file = %#v, want root messages.json", got)
	}

	got, err = client.ResolveProjectFile(context.Background(), "123", "", "/src/messages.json")
	if err != nil {
		t.Fatalf("resolve nested file: %v", err)
	}
	if got.ID != 18 {
		t.Fatalf("file = %#v, want nested messages.json", got)
	}
}

func TestResolveProjectFileNameFallbackIsUnique(t *testing.T) {
	client, mux, teardown := newCrowdinHTTPClientForTest(t)
	defer teardown()

	stubProjectFiles(t, mux, []ProjectFile{
		{ID: 18, Name: "messages.json", Path: "/src/messages.json"},
		{ID: 19, Name: "other.json", Path: "/src/other.json"},
	})

	got, err := client.ResolveProjectFile(context.Background(), "123", "", "messages.json")
	if err != nil {
		t.Fatalf("resolve file: %v", err)
	}
	if got.ID != 18 {
		t.Fatalf("file = %#v", got)
	}
}

func TestResolveProjectFileAmbiguousName(t *testing.T) {
	client, mux, teardown := newCrowdinHTTPClientForTest(t)
	defer teardown()

	stubProjectFiles(t, mux, []ProjectFile{
		{ID: 17, Name: "messages.json", Path: "/en/messages.json"},
		{ID: 18, Name: "messages.json", Path: "/fr/messages.json"},
	})

	_, err := client.ResolveProjectFile(context.Background(), "123", "", "messages.json")
	if err == nil || !strings.Contains(err.Error(), "ambiguous") {
		t.Fatalf("error = %v", err)
	}
}

func TestUploadProjectFileAddsSource(t *testing.T) {
	client, mux, teardown := newCrowdinHTTPClientForTest(t)
	defer teardown()

	localPath := writeHTTPClientFixture(t, "messages.json", `{"hello":"Hello"}`)
	mux.HandleFunc("/api/v2/storages", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Fatalf("storage method = %s", r.Method)
		}
		writeJSON(t, w, map[string]any{"data": map[string]any{"id": 61, "fileName": "messages.json"}})
	})
	mux.HandleFunc("/api/v2/projects/123/files", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method + " " + r.RequestURI {
		case http.MethodGet + " /api/v2/projects/123/files?filter=messages.json&limit=500":
			writeJSON(t, w, map[string]any{"data": []any{}})
		case http.MethodPost + " /api/v2/projects/123/files":
			assertJSONBody(t, r, map[string]any{
				"storageId": float64(61),
				"name":      "messages.json",
			})
			writeJSON(t, w, map[string]any{"data": map[string]any{"id": 17, "name": "messages.json"}})
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.RequestURI)
		}
	})

	id, err := client.UploadProjectFile(context.Background(), "123", "", "messages.json", localPath)
	if err != nil {
		t.Fatalf("upload file: %v", err)
	}
	if id != 17 {
		t.Fatalf("file id = %d", id)
	}
}

func TestDownloadProjectFileByPath(t *testing.T) {
	client, mux, teardown := newCrowdinHTTPClientForTest(t)
	defer teardown()

	stubProjectFiles(t, mux, []ProjectFile{{ID: 17, Name: "messages.json", Path: "/messages.json"}})
	mux.HandleFunc("/api/v2/projects/123/files/17/download", func(w http.ResponseWriter, r *http.Request) {
		assertRequest(t, r, http.MethodGet, "/api/v2/projects/123/files/17/download")
		writeJSON(t, w, map[string]any{"data": map[string]any{"url": "https://api.crowdin.com/downloads/source-17.json"}})
	})
	mux.HandleFunc("/downloads/source-17.json", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"hello":"Hello"}`))
	})

	payload, err := client.DownloadProjectFile(context.Background(), "123", "", "/messages.json", "")
	if err != nil {
		t.Fatalf("download file: %v", err)
	}
	if string(payload) != `{"hello":"Hello"}` {
		t.Fatalf("payload = %q", payload)
	}
}

func TestDeleteProjectFileByPath(t *testing.T) {
	client, mux, teardown := newCrowdinHTTPClientForTest(t)
	defer teardown()

	stubProjectFiles(t, mux, []ProjectFile{{ID: 17, Name: "messages.json", Path: "/messages.json"}})
	mux.HandleFunc("/api/v2/projects/123/files/17", func(w http.ResponseWriter, r *http.Request) {
		assertRequest(t, r, http.MethodDelete, "/api/v2/projects/123/files/17")
		w.WriteHeader(http.StatusNoContent)
	})

	if err := client.DeleteProjectFile(context.Background(), "123", "", "messages.json"); err != nil {
		t.Fatalf("delete file: %v", err)
	}
}

func TestApplyPreTranslationAndWait(t *testing.T) {
	client, mux, teardown := newCrowdinHTTPClientForTest(t)
	defer teardown()

	oldInterval := importPollInterval
	importPollInterval = time.Millisecond
	t.Cleanup(func() { importPollInterval = oldInterval })

	stubProjectFiles(t, mux, []ProjectFile{{ID: 17, Name: "messages.json", Path: "/messages.json"}})
	stubResolveFrench(t, mux)
	mux.HandleFunc("/api/v2/projects/123/pre-translations", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v2/projects/123/pre-translations" {
			return
		}
		assertRequest(t, r, http.MethodPost, "/api/v2/projects/123/pre-translations")
		assertJSONBody(t, r, map[string]any{
			"languageIds": []any{"fr"},
			"fileIds":     []any{float64(17)},
			"method":      "tm",
		})
		writeJSON(t, w, map[string]any{
			"data": map[string]any{
				"identifier": "pre-1",
				"status":     "created",
				"progress":   0,
			},
		})
	})
	mux.HandleFunc("/api/v2/projects/123/pre-translations/pre-1", func(w http.ResponseWriter, r *http.Request) {
		assertRequest(t, r, http.MethodGet, "/api/v2/projects/123/pre-translations/pre-1")
		writeJSON(t, w, map[string]any{
			"data": map[string]any{
				"identifier": "pre-1",
				"status":     "finished",
				"progress":   100,
			},
		})
	})

	result, err := client.ApplyPreTranslationAndWait(context.Background(), PreTranslationInput{
		ProjectID: "123",
		Languages: []string{"fr"},
		FilePath:  "messages.json",
	})
	if err != nil {
		t.Fatalf("auto-translate: %v", err)
	}
	if result.Identifier != "pre-1" || result.Status != "finished" {
		t.Fatalf("result = %#v", result)
	}
}

func TestApplyPreTranslationAndWaitFailed(t *testing.T) {
	client, mux, teardown := newCrowdinHTTPClientForTest(t)
	defer teardown()

	oldInterval := importPollInterval
	importPollInterval = time.Millisecond
	t.Cleanup(func() { importPollInterval = oldInterval })

	mux.HandleFunc("/api/v2/projects/123/branches", func(w http.ResponseWriter, r *http.Request) {
		assertRequest(t, r, http.MethodGet, "/api/v2/projects/123/branches?limit=500&name=feature%2Flogin")
		writeJSON(t, w, map[string]any{
			"data": []any{map[string]any{"data": map[string]any{"id": 42, "name": "feature/login"}}},
		})
	})
	stubResolveFrench(t, mux)
	mux.HandleFunc("/api/v2/projects/123/pre-translations", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(t, w, map[string]any{
			"data": map[string]any{"identifier": "pre-2", "status": "created", "progress": 0},
		})
	})
	mux.HandleFunc("/api/v2/projects/123/pre-translations/pre-2", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(t, w, map[string]any{
			"data": map[string]any{"identifier": "pre-2", "status": "failed", "progress": 40},
		})
	})

	_, err := client.ApplyPreTranslationAndWait(context.Background(), PreTranslationInput{
		ProjectID: "123",
		Languages: []string{"fr"},
		Branch:    "feature/login",
	})
	if err == nil || err.Error() != "pre-translation failed" {
		t.Fatalf("error = %v", err)
	}
}

func TestApplyPreTranslationRejectsBlankLanguages(t *testing.T) {
	client, _, teardown := newCrowdinHTTPClientForTest(t)
	defer teardown()

	_, err := client.ApplyPreTranslationAndWait(context.Background(), PreTranslationInput{
		ProjectID: "123",
		Languages: []string{" ", ""},
		FilePath:  "messages.json",
	})
	if err == nil || !strings.Contains(err.Error(), "at least one language is required") {
		t.Fatalf("error = %v", err)
	}
}

func TestApplyPreTranslationRequiresScope(t *testing.T) {
	client, _, teardown := newCrowdinHTTPClientForTest(t)
	defer teardown()

	_, err := client.ApplyPreTranslationAndWait(context.Background(), PreTranslationInput{
		ProjectID: "123",
		Languages: []string{"fr"},
	})
	if err == nil {
		t.Fatal("expected scope error")
	}
}

func TestSplitCrowdinDest(t *testing.T) {
	dir, name, err := splitCrowdinDest("/src/locales/messages.json")
	if err != nil {
		t.Fatalf("split dest: %v", err)
	}
	if dir != "src/locales" || name != "messages.json" {
		t.Fatalf("dir=%q name=%q", dir, name)
	}
}

func TestDownloadProjectFileTranslationLanguage(t *testing.T) {
	client, mux, teardown := newCrowdinHTTPClientForTest(t)
	defer teardown()

	stubProjectFiles(t, mux, []ProjectFile{{ID: 17, Name: "messages.json", Path: "/messages.json"}})
	stubResolveFrench(t, mux)
	mux.HandleFunc("/api/v2/projects/123/translations/builds/files/17", func(w http.ResponseWriter, r *http.Request) {
		assertRequest(t, r, http.MethodPost, "/api/v2/projects/123/translations/builds/files/17")
		assertJSONBody(t, r, map[string]any{"targetLanguageId": "fr"})
		writeJSON(t, w, map[string]any{"data": map[string]any{"url": "https://api.crowdin.com/downloads/fr-17.json"}})
	})
	mux.HandleFunc("/downloads/fr-17.json", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"hello":"Bonjour"}`))
	})

	payload, err := client.DownloadProjectFile(context.Background(), "123", "", "messages.json", "fr")
	if err != nil {
		t.Fatalf("download translation: %v", err)
	}
	if string(payload) != `{"hello":"Bonjour"}` {
		t.Fatalf("payload = %q", payload)
	}
}

func stubProjectFiles(t *testing.T, mux *http.ServeMux, files []ProjectFile) {
	t.Helper()
	mux.HandleFunc("/api/v2/projects/123/files", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			t.Fatalf("files method = %s", r.Method)
		}
		rows := make([]any, 0, len(files))
		for _, file := range files {
			rows = append(rows, map[string]any{
				"data": map[string]any{"id": file.ID, "name": file.Name, "path": file.Path},
			})
		}
		writeJSON(t, w, map[string]any{"data": rows})
	})
	mux.HandleFunc("/api/v2/projects/123/directories", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(t, w, map[string]any{"data": []any{}})
	})
}

func stubResolveFrench(t *testing.T, mux *http.ServeMux) {
	t.Helper()
	mux.HandleFunc("/api/v2/projects/123", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(t, w, map[string]any{
			"data": map[string]any{
				"id":                123,
				"targetLanguageIds": []string{"fr"},
				"targetLanguages":   []any{},
			},
		})
	})
	mux.HandleFunc("/api/v2/languages", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(t, w, map[string]any{
			"data": []any{
				map[string]any{"data": map[string]any{"id": "fr", "name": "French", "locale": "fr-FR"}},
			},
		})
	})
}
