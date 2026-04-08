package crowdin

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/storage"
)

type fakeFileClient struct {
	locales              []string
	ensuredDirectories   []string
	upsertedSources      []string
	uploadedTranslations []string
	downloaded           []string
	downloadOptions      []storage.FileExportOptions
	files                map[string]int
	failFindMissing      bool
}

func (f *fakeFileClient) ResolveLocales(_ context.Context, _ string, requested []string) ([]string, error) {
	if len(requested) > 0 {
		return requested, nil
	}
	return append([]string(nil), f.locales...), nil
}

func (f *fakeFileClient) EnsureDirectory(_ context.Context, _ string, path string) (int, error) {
	f.ensuredDirectories = append(f.ensuredDirectories, path)
	return len(f.ensuredDirectories), nil
}

func (f *fakeFileClient) UpsertSourceFile(_ context.Context, _ string, _ int, name, localPath string, _ storage.FileGroupSpec) (int, error) {
	if f.files == nil {
		f.files = make(map[string]int)
	}
	id := len(f.files) + 1
	f.files[name] = id
	f.upsertedSources = append(f.upsertedSources, name+"="+filepath.Base(localPath))
	return id, nil
}

func (f *fakeFileClient) FindFile(_ context.Context, _ string, _ int, name string) (int, error) {
	if id, ok := f.files[name]; ok {
		return id, nil
	}
	if f.failFindMissing {
		return 0, fmt.Errorf("remote source file %q not found", name)
	}
	id := len(f.files) + 1
	f.files[name] = id
	return id, nil
}

func (f *fakeFileClient) UploadTranslationFile(_ context.Context, _ string, languageID string, fileID int, localPath string) error {
	f.uploadedTranslations = append(f.uploadedTranslations, fmt.Sprintf("%s:%d:%s", languageID, fileID, filepath.Base(localPath)))
	return nil
}

func (f *fakeFileClient) DownloadTranslationFile(_ context.Context, _ string, fileID int, languageID string, opts storage.FileExportOptions) ([]byte, error) {
	f.downloaded = append(f.downloaded, fmt.Sprintf("%s:%d", languageID, fileID))
	f.downloadOptions = append(f.downloadOptions, opts)
	return []byte("translated-" + languageID), nil
}

func TestFileAdapterUploadSourcesRegistersRemoteFiles(t *testing.T) {
	base := t.TempDir()
	sourcePath := writeJSONFixture(t, filepath.Join(base, "src", "messages.json"), `{"hello":"Hello"}`)

	client := &fakeFileClient{failFindMissing: true}
	adapter := mustNewFileAdapterForTest(t, storage.FileWorkflowConfig{
		ProjectID:         "123",
		APIToken:          "token",
		BasePath:          base,
		PreserveHierarchy: true,
		Files: []storage.FileGroupSpec{{
			Source:      "/src/*.json",
			Translation: "/dist/%locale%/%original_file_name%",
		}},
	}, client)

	result, err := adapter.UploadSources(context.Background(), storage.FileUploadSourcesRequest{})
	if err != nil {
		t.Fatalf("upload sources: %v", err)
	}
	if !reflect.DeepEqual(result.Processed, []string{"src/messages.json"}) {
		t.Fatalf("processed = %#v, want src/messages.json", result.Processed)
	}
	if !reflect.DeepEqual(client.upsertedSources, []string{"messages.json=" + filepath.Base(sourcePath)}) {
		t.Fatalf("upserted sources = %#v", client.upsertedSources)
	}
}

func TestFileAdapterUploadTranslationsFailsWhenRemoteFileMissing(t *testing.T) {
	base := t.TempDir()
	writeJSONFixture(t, filepath.Join(base, "src", "messages.json"), `{"hello":"Hello"}`)
	writeJSONFixture(t, filepath.Join(base, "dist", "fr", "messages.json"), `{"hello":"Bonjour"}`)

	client := &fakeFileClient{
		locales:         []string{"fr"},
		failFindMissing: true,
		files:           map[string]int{},
	}
	adapter := mustNewFileAdapterForTest(t, storage.FileWorkflowConfig{
		ProjectID: "123",
		APIToken:  "token",
		BasePath:  base,
		Files: []storage.FileGroupSpec{{
			Source:      "/src/*.json",
			Translation: "/dist/%locale%/%original_file_name%",
		}},
	}, client)

	_, err := adapter.UploadTranslations(context.Background(), storage.FileUploadTranslationsRequest{})
	if err == nil || !strings.Contains(err.Error(), "remote source file") {
		t.Fatalf("expected missing remote file error, got %v", err)
	}
}

func TestFileAdapterUploadTranslationsRespectsLanguagesMappingAndExclusions(t *testing.T) {
	base := t.TempDir()
	writeJSONFixture(t, filepath.Join(base, "src", "messages.json"), `{"hello":"Hello"}`)
	writeJSONFixture(t, filepath.Join(base, "dist", "french", "messages.json"), `{"hello":"Bonjour"}`)
	writeJSONFixture(t, filepath.Join(base, "dist", "de", "messages.json"), `{"hello":"Hallo"}`)

	client := &fakeFileClient{
		locales:         []string{"fr-FR", "de"},
		failFindMissing: true,
	}
	adapter := mustNewFileAdapterForTest(t, storage.FileWorkflowConfig{
		ProjectID: "123",
		APIToken:  "token",
		BasePath:  base,
		Files: []storage.FileGroupSpec{{
			Source:      "/src/*.json",
			Translation: "/dist/%two_letters_code%/%original_file_name%",
			LanguagesMapping: map[string]map[string]string{
				"two_letters_code": {
					"fr-FR": "french",
				},
			},
			ExcludedTargetLanguages: []string{"de"},
		}},
	}, client)

	if _, err := adapter.UploadSources(context.Background(), storage.FileUploadSourcesRequest{}); err != nil {
		t.Fatalf("upload sources: %v", err)
	}

	result, err := adapter.UploadTranslations(context.Background(), storage.FileUploadTranslationsRequest{})
	if err != nil {
		t.Fatalf("upload translations: %v", err)
	}
	if !reflect.DeepEqual(result.Processed, []string{filepath.Join(base, "dist", "french", "messages.json")}) {
		t.Fatalf("processed = %#v", result.Processed)
	}
	if !reflect.DeepEqual(result.Skipped, []string{"messages.json@de"}) {
		t.Fatalf("skipped = %#v", result.Skipped)
	}
	if got, want := client.uploadedTranslations, []string{"fr-FR:1:messages.json"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("uploaded translations = %#v, want %#v", got, want)
	}
}

func TestFileAdapterDownloadTranslationsPropagatesExportOptions(t *testing.T) {
	base := t.TempDir()
	writeJSONFixture(t, filepath.Join(base, "src", "messages.json"), `{"hello":"Hello"}`)

	client := &fakeFileClient{
		locales:         []string{"fr"},
		failFindMissing: true,
	}
	adapter := mustNewFileAdapterForTest(t, storage.FileWorkflowConfig{
		ProjectID: "123",
		APIToken:  "token",
		BasePath:  base,
		Files: []storage.FileGroupSpec{{
			Source:      "/src/*.json",
			Translation: "/download/%locale%/%original_file_name%",
			Export: storage.FileExportOptions{
				SkipUntranslatedStrings: boolPtr(true),
				SkipUntranslatedFiles:   boolPtr(true),
				ExportOnlyApproved:      boolPtr(true),
			},
		}},
	}, client)

	if _, err := adapter.UploadSources(context.Background(), storage.FileUploadSourcesRequest{}); err != nil {
		t.Fatalf("upload sources: %v", err)
	}

	result, err := adapter.DownloadTranslations(context.Background(), storage.FileDownloadTranslationsRequest{})
	if err != nil {
		t.Fatalf("download translations: %v", err)
	}
	wantPath := filepath.Join(base, "download", "fr", "messages.json")
	if !reflect.DeepEqual(result.Processed, []string{wantPath}) {
		t.Fatalf("processed = %#v, want %#v", result.Processed, []string{wantPath})
	}
	if len(client.downloadOptions) != 1 {
		t.Fatalf("download options len = %d, want 1", len(client.downloadOptions))
	}
	if got, want := client.downloadOptions[0], (storage.FileExportOptions{
		SkipUntranslatedStrings: boolPtr(true),
		SkipUntranslatedFiles:   boolPtr(true),
		ExportOnlyApproved:      boolPtr(true),
	}); !reflect.DeepEqual(got, want) {
		t.Fatalf("download options = %#v, want %#v", got, want)
	}
	payload, err := os.ReadFile(wantPath)
	if err != nil {
		t.Fatalf("read downloaded file: %v", err)
	}
	if string(payload) != "translated-fr" {
		t.Fatalf("payload = %q, want translated-fr", string(payload))
	}
}

func TestFileAdapterUploadSourcesFlattensWhenHierarchyDisabled(t *testing.T) {
	base := t.TempDir()
	writeJSONFixture(t, filepath.Join(base, "src", "nested", "messages.json"), `{"hello":"Hello"}`)

	client := &fakeFileClient{failFindMissing: true}
	adapter := mustNewFileAdapterForTest(t, storage.FileWorkflowConfig{
		ProjectID:         "123",
		APIToken:          "token",
		BasePath:          base,
		PreserveHierarchy: false,
		Files: []storage.FileGroupSpec{{
			Source:      "/src/**/*.json",
			Translation: "/dist/%locale%/%original_file_name%",
		}},
	}, client)

	result, err := adapter.UploadSources(context.Background(), storage.FileUploadSourcesRequest{})
	if err != nil {
		t.Fatalf("upload sources: %v", err)
	}
	if !reflect.DeepEqual(result.Processed, []string{"messages.json"}) {
		t.Fatalf("processed = %#v, want flattened path", result.Processed)
	}
}

func mustNewFileAdapterForTest(t *testing.T, cfg storage.FileWorkflowConfig, client *fakeFileClient) *FileAdapter {
	t.Helper()
	adapter, err := NewFileAdapterWithClient(cfg, client)
	if err != nil {
		t.Fatalf("new file adapter: %v", err)
	}
	return adapter
}

func writeJSONFixture(t *testing.T, path, content string) string {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir fixture dir: %v", err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write fixture: %v", err)
	}
	return path
}

func TestResolveCrowdinSourcePathsSupportsBracketClassesWithDoublestar(t *testing.T) {
	base := t.TempDir()
	writeJSONFixture(t, filepath.Join(base, "nested", "en.JSON"), `{"hello":"Hello"}`)

	matches, err := resolveCrowdinSourcePaths(base, "/**/en.[jJ][sS][oO][nN]")
	if err != nil {
		t.Fatalf("resolve source paths: %v", err)
	}
	want := []string{filepath.Join(base, "nested", "en.JSON")}
	if !reflect.DeepEqual(matches, want) {
		t.Fatalf("matches = %#v, want %#v", matches, want)
	}
}

func boolPtr(value bool) *bool {
	return &value
}
