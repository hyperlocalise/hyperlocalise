package crowdin

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/storage"
)

func TestFileAdapterDownloadSourcesWritesConfiguredPaths(t *testing.T) {
	base := t.TempDir()
	sourcePath := filepath.Join(base, "src", "messages.json")

	client := &fakeFileClient{
		directories:           map[string]int{"src": 1},
		files:                 map[string]int{"messages.json": 9},
		failFindMissing:       true,
		sourceDownloadPayload: []byte(`{"hello":"Remote"}`),
	}
	adapter := mustNewFileAdapterForTest(t, storage.FileWorkflowConfig{
		ProjectID:         "123",
		APIToken:          "token",
		BasePath:          base,
		PreserveHierarchy: true,
		Files: []storage.FileGroupSpec{{
			Source:      "/src/messages.json",
			Translation: "/download/%locale%/%original_file_name%",
		}},
	}, client)

	result, err := adapter.DownloadSources(context.Background(), storage.FileDownloadSourcesRequest{})
	if err != nil {
		t.Fatalf("download sources: %v", err)
	}
	if got, want := result.Processed, []string{"src/messages.json"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("processed = %#v, want %#v", got, want)
	}
	if got, want := client.downloadedSources, []int{9}; !reflect.DeepEqual(got, want) {
		t.Fatalf("downloaded sources = %#v, want %#v", got, want)
	}
	sourcePayload, err := os.ReadFile(sourcePath)
	if err != nil {
		t.Fatalf("read source: %v", err)
	}
	if string(sourcePayload) != `{"hello":"Remote"}` {
		t.Fatalf("source payload = %q", string(sourcePayload))
	}
}

func TestFileAdapterDownloadSourcesFiltersBySourcePath(t *testing.T) {
	base := t.TempDir()
	sourcePath := writeJSONFixture(t, filepath.Join(base, "src", "messages.json"), `{"hello":"Remote"}`)
	otherPath := filepath.Join(base, "src", "other.json")

	client := &fakeFileClient{
		directories:           map[string]int{"src": 1},
		files:                 map[string]int{"messages.json": 9, "other.json": 10},
		failFindMissing:       true,
		sourceDownloadPayload: []byte(`{"hello":"Remote"}`),
	}
	adapter := mustNewFileAdapterForTest(t, storage.FileWorkflowConfig{
		ProjectID:         "123",
		APIToken:          "token",
		BasePath:          base,
		PreserveHierarchy: true,
		Files: []storage.FileGroupSpec{{
			Source:      "/src/*.json",
			Translation: "/download/%locale%/%original_file_name%",
		}},
	}, client)

	result, err := adapter.DownloadSources(context.Background(), storage.FileDownloadSourcesRequest{
		SourcePaths: []string{"src/messages.json"},
	})
	if err != nil {
		t.Fatalf("download sources: %v", err)
	}
	if got, want := result.Processed, []string{"src/messages.json"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("processed = %#v, want %#v", got, want)
	}
	if got, want := client.downloadedSources, []int{9}; !reflect.DeepEqual(got, want) {
		t.Fatalf("downloaded sources = %#v, want %#v", got, want)
	}
	if _, err := os.Stat(sourcePath); err != nil {
		t.Fatalf("expected downloaded source file: %v", err)
	}
	if _, err := os.Stat(otherPath); !os.IsNotExist(err) {
		t.Fatalf("expected other source file to remain absent, got err=%v", err)
	}
}

func TestDownloadSourceFileByIDRejectsInvalidInput(t *testing.T) {
	ctx := t.Context()
	cfg := Config{ProjectID: "123", APIToken: "token"}
	if _, err := DownloadSourceFileByID(ctx, cfg, 0); err == nil {
		t.Fatal("expected file id error")
	}
	if _, err := DownloadSourceFileByID(ctx, Config{APIToken: "token"}, 7); err == nil {
		t.Fatal("expected project id error")
	}
	if _, err := DownloadSourceFileByID(ctx, Config{ProjectID: "  ", APIToken: "token"}, 7); err == nil {
		t.Fatal("expected blank project id error")
	}
	if _, err := DownloadSourceFileByID(ctx, Config{ProjectID: "123"}, 7); err == nil {
		t.Fatal("expected api token error")
	}
	_, err := DownloadSourceFileByID(ctx, Config{ProjectID: "123", APIToken: "token", APIBaseURL: "http://%"}, 7)
	if err == nil {
		t.Fatal("expected client init error")
	}
}

func TestDownloadSourceFileByID(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/v2/projects/123/files/17/download", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			t.Errorf("method = %s", r.Method)
		}
		_, _ = io.WriteString(w, `{"data":{"url":"https://api.crowdin.com/downloads/source-17.json"}}`)
	})
	mux.HandleFunc("/downloads/source-17.json", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = io.WriteString(w, `{"hello":"Hello"}`)
	})
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)

	payload, err := DownloadSourceFileByID(t.Context(), Config{
		ProjectID:  "123",
		APIToken:   "token",
		APIBaseURL: server.URL,
	}, 17)
	if err != nil {
		t.Fatalf("download: %v", err)
	}
	if string(payload) != `{"hello":"Hello"}` {
		t.Fatalf("payload = %q", payload)
	}
}
