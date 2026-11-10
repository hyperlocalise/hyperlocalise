package tmscatalog

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sort"
	"sync/atomic"
	"testing"
)

func serveJSON(t *testing.T, routes map[string]any) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, ok := routes[r.URL.Path]
		if !ok {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(body)
	}))
	t.Cleanup(srv.Close)
	return srv
}

func crowdinData(items ...any) map[string]any {
	wrapped := []map[string]any{}
	for _, item := range items {
		wrapped = append(wrapped, map[string]any{"data": item})
	}
	return map[string]any{"data": wrapped}
}

func TestCrowdinListFilesResolvesBranchAndDirectoryPaths(t *testing.T) {
	t.Parallel()
	srv := serveJSON(t, map[string]any{
		"/projects/7/branches": crowdinData(map[string]any{"id": 3, "name": "main"}),
		"/projects/7/directories": crowdinData(
			map[string]any{"id": 10, "directoryId": nil, "name": "docs"},
			map[string]any{"id": 11, "directoryId": 10, "name": "en"},
		),
		"/projects/7/files": crowdinData(
			map[string]any{"id": 1, "branchId": nil, "directoryId": 11, "name": "a.md", "type": "md", "revisionId": 2, "status": "active"},
			map[string]any{"id": 2, "branchId": 3, "directoryId": nil, "name": "b.json", "title": "B", "type": "json", "revisionId": 1, "status": "inactive"},
		),
	})
	reader, err := NewProjectReader("crowdin", Credentials{BaseURL: srv.URL, HeaderName: "Authorization", HeaderValue: "Bearer x"}, srv.Client())
	if err != nil {
		t.Fatal(err)
	}
	files, err := reader.ListFiles(context.Background(), Project{ExternalID: "7"}, "", 0)
	if err != nil {
		t.Fatalf("ListFiles: %v", err)
	}
	paths := map[string]File{}
	for _, file := range files {
		paths[file.SourcePath] = file
	}
	// Branch files come back from the branch scope; root files only once.
	if file, ok := paths["docs/en/a.md"]; !ok || file.SyncState != "synced" || file.ExternalResourceID != "1" {
		t.Fatalf("root file = %+v (all %v)", file, paths)
	}
	if file, ok := paths["main/b.json"]; !ok || file.DisplayName != "B" || file.SyncState != "pending" {
		t.Fatalf("branch file = %+v (all %v)", file, paths)
	}
}

func TestCrowdinWebOrigin(t *testing.T) {
	t.Parallel()
	cases := map[string]string{
		"https://api.crowdin.com/api/v2":      "https://crowdin.com",
		"https://acme.api.crowdin.com/api/v2": "https://acme.api.crowdin.com",
		"":                                    "https://crowdin.com",
	}
	for in, want := range cases {
		if got := crowdinWebOrigin(in); got != want {
			t.Errorf("crowdinWebOrigin(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestLokaliseListFilesGroupsKeysByFilename(t *testing.T) {
	t.Parallel()
	srv := serveJSON(t, map[string]any{
		"/projects/p1/keys": map[string]any{"keys": []any{
			map[string]any{"key_id": 1, "filenames": map[string]string{"web": "en.json", "ios": ""}, "modified_at": "2024-01-01 00:00:00 (Etc/UTC)"},
			map[string]any{"key_id": 2, "filenames": map[string]string{"web": "en.json"}, "modified_at": "2025-01-01 00:00:00 (Etc/UTC)"},
			map[string]any{"key_id": 3, "filenames": "Localizable.strings"},
		}},
	})
	reader := newLokalise(Credentials{BaseURL: srv.URL, HeaderName: "X-Api-Token", HeaderValue: "x"}, srv.Client())
	source := "en"
	files, err := reader.ListFiles(context.Background(), Project{ExternalID: "p1", SourceLocale: &source, TargetLocales: []string{"fr"}}, "", 0)
	if err != nil {
		t.Fatalf("ListFiles: %v", err)
	}
	paths := []string{}
	for _, file := range files {
		paths = append(paths, file.SourcePath)
		if file.ExternalResourceID == "web::en.json" && (file.Revision == nil || *file.Revision != "2025-01-01 00:00:00 (Etc/UTC)") {
			t.Errorf("revision = %v, want the latest key's", file.Revision)
		}
	}
	sort.Strings(paths)
	want := []string{
		"locales/en/android/Localizable.strings",
		"locales/en/ios/Localizable.strings",
		"locales/en/other/Localizable.strings",
		"locales/en/web/Localizable.strings",
		"locales/en/web/en.json",
	}
	if len(paths) != len(want) {
		t.Fatalf("paths = %v, want %v", paths, want)
	}
	for index := range want {
		if paths[index] != want[index] {
			t.Fatalf("paths = %v, want %v", paths, want)
		}
	}
}

func TestPhrasePaths(t *testing.T) {
	t.Parallel()
	en := "en"
	if got := phraseUploadSourcePath(&en, "app.json", ""); got != "locales/en/app.json" {
		t.Errorf("upload path = %q", got)
	}
	if got := phraseUploadSourcePath(nil, "app.json", "feature x"); got != "branches/feature%20x/uploads/app.json" {
		t.Errorf("branch upload path = %q", got)
	}
	if got := phraseScopedID("dev", "u1"); got != "dev::u1" {
		t.Errorf("scoped id = %q", got)
	}
}

func TestNewProjectReaderRejectsPhraseOAuth(t *testing.T) {
	t.Parallel()
	if _, err := NewProjectReader("phrase", Credentials{AuthMode: "oauth"}, http.DefaultClient); err != ErrUnsupported {
		t.Fatalf("err = %v, want ErrUnsupported", err)
	}
}

func TestSmartlingListFilesStopsListingStringsAtLimit(t *testing.T) {
	t.Parallel()
	var stringCalls atomic.Int32
	files := []map[string]any{}
	for index := range 20 {
		files = append(files, map[string]any{"fileUri": fmt.Sprintf("f%02d.json", index)})
	}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var data any
		switch r.URL.Path {
		case "/projects-api/v2/projects/p1":
			data = map[string]any{"accountUid": "acc", "projectId": "p1", "sourceLocaleId": "en-US"}
		case "/files-api/v2/projects/p1/files/list":
			data = map[string]any{"items": files, "totalCount": len(files)}
		case "/strings-api/v2/projects/p1/source-strings":
			stringCalls.Add(1)
			data = map[string]any{"items": []any{
				map[string]any{"hashcode": r.URL.Query().Get("fileUri") + "-h1"},
				map[string]any{"hashcode": r.URL.Query().Get("fileUri") + "-h2"},
			}}
		default:
			http.NotFound(w, r)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"response": map[string]any{"code": "SUCCESS", "data": data}})
	}))
	t.Cleanup(srv.Close)

	reader := newSmartling(Credentials{BaseURL: srv.URL, HeaderName: "Authorization", HeaderValue: "Bearer x", AccountID: "acc"}, srv.Client())
	got, err := reader.ListFiles(context.Background(), Project{ExternalID: "p1"}, "", 30)
	if err != nil {
		t.Fatalf("ListFiles: %v", err)
	}
	if len(got) != 30 {
		t.Fatalf("len = %d, want the limit, 30", len(got))
	}
	// 20 files fill most of the limit; one batch of string listings fills the rest.
	if calls := stringCalls.Load(); calls != smartlingStringsParallel {
		t.Fatalf("source-strings calls = %d, want one batch of %d", calls, smartlingStringsParallel)
	}
	if got[20].SourcePath != "f00.json/keys/f00.json-h1" || got[20].ExternalURL == nil {
		t.Fatalf("first key = %+v, want f00's first string, linked", got[20])
	}

	stringCalls.Store(0)
	all, err := reader.ListFiles(context.Background(), Project{ExternalID: "p1"}, "", 0)
	if err != nil {
		t.Fatalf("ListFiles without limit: %v", err)
	}
	if len(all) != 60 || stringCalls.Load() != 20 {
		t.Fatalf("len = %d, calls = %d; want 60 resources from 20 calls", len(all), stringCalls.Load())
	}
}
