package crowdin

import (
	"context"
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
