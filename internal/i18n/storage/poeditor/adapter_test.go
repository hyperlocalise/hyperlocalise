package poeditor

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/storage"
)

type fakeClient struct {
	terms        []TermTranslation
	listRevision string
	upsertIn     UpsertTranslationsInput
	upsertErr    error
	uploads      []UploadTermsFileInput
}

func (f *fakeClient) ListTerms(_ context.Context, _ ListTermsInput) ([]TermTranslation, string, error) {
	return f.terms, f.listRevision, nil
}

func (f *fakeClient) UpsertTranslations(_ context.Context, in UpsertTranslationsInput) (string, error) {
	f.upsertIn = in
	if f.upsertErr != nil {
		return "", f.upsertErr
	}
	return "rev2", nil
}

func (f *fakeClient) UploadTermsFile(_ context.Context, in UploadTermsFileInput) (UploadTermsFileResult, error) {
	f.uploads = append(f.uploads, in)
	return UploadTermsFileResult{}, f.upsertErr
}

func TestParseConfigUsesEnvToken(t *testing.T) {
	t.Setenv("POEDITOR_API_TOKEN", "secret-token")

	cfg, err := ParseConfig(json.RawMessage(`{"projectID":"123"}`))
	if err != nil {
		t.Fatalf("parse config: %v", err)
	}
	if got := cfg.APIToken; got != "secret-token" {
		t.Fatalf("unexpected token from env: %q", got)
	}
}

func TestParseConfigMissingToken(t *testing.T) {
	_ = os.Unsetenv("POEDITOR_API_TOKEN")
	_, err := ParseConfig(json.RawMessage(`{"projectID":"123"}`))
	if err == nil || !strings.Contains(err.Error(), "API token") {
		t.Fatalf("expected missing token error, got %v", err)
	}
}

func TestParseConfigRejectsInlineToken(t *testing.T) {
	t.Setenv("POEDITOR_API_TOKEN", "env-token")
	_, err := ParseConfig(json.RawMessage(`{"projectID":"123","apiToken":"inline"}`))
	if err == nil || !strings.Contains(err.Error(), "apiToken is not supported") {
		t.Fatalf("expected inline token rejection, got %v", err)
	}
}

func TestAdapterPullMapsTermContextLanguage(t *testing.T) {
	client := &fakeClient{
		terms: []TermTranslation{
			{Term: "hello", Context: "home", Locale: "fr", Value: "bonjour"},
		},
		listRevision: "rev1",
	}
	adapter, err := NewWithClient(Config{ProjectID: "123", APIToken: "token"}, client)
	if err != nil {
		t.Fatalf("new adapter: %v", err)
	}

	result, err := adapter.Pull(context.Background(), storage.PullRequest{Locales: []string{"fr"}})
	if err != nil {
		t.Fatalf("pull: %v", err)
	}
	if got := len(result.Snapshot.Entries); got != 1 {
		t.Fatalf("expected 1 entry, got %d", got)
	}
	entry := result.Snapshot.Entries[0]
	if entry.Key != "hello" || entry.Context != "home" || entry.Locale != "fr" || entry.Value != "bonjour" {
		t.Fatalf("unexpected entry mapping: %+v", entry)
	}
}

func TestAdapterPushGroupsEntries(t *testing.T) {
	client := &fakeClient{}
	adapter, err := NewWithClient(Config{ProjectID: "123", APIToken: "token"}, client)
	if err != nil {
		t.Fatalf("new adapter: %v", err)
	}

	_, err = adapter.Push(context.Background(), storage.PushRequest{
		Entries: []storage.Entry{{Key: "hello", Context: "home", Locale: "fr", Value: "bonjour"}},
	})
	if err != nil {
		t.Fatalf("push: %v", err)
	}
	if got := len(client.upsertIn.Entries); got != 1 {
		t.Fatalf("expected 1 upsert entry, got %d", got)
	}
}

func TestAdapterPushAppliedOnlyIncludesSentEntries(t *testing.T) {
	client := &fakeClient{}
	adapter, err := NewWithClient(Config{ProjectID: "123", APIToken: "token"}, client)
	if err != nil {
		t.Fatalf("new adapter: %v", err)
	}

	req := storage.PushRequest{
		Entries: []storage.Entry{
			{Key: "hello", Context: "home", Locale: "fr", Value: "bonjour"},
			{Key: "hello", Context: "home", Locale: "fr", Value: "salut"},
			{Key: "empty", Context: "home", Locale: "fr", Value: "   "},
			{Key: "", Context: "home", Locale: "fr", Value: "skip"},
			{Key: "bye", Context: "home", Locale: "", Value: "skip"},
		},
	}

	result, err := adapter.Push(context.Background(), req)
	if err != nil {
		t.Fatalf("push: %v", err)
	}
	if got := len(client.upsertIn.Entries); got != 1 {
		t.Fatalf("expected 1 sent upsert entry, got %d", got)
	}
	if got := client.upsertIn.Entries[0].Value; got != "salut" {
		t.Fatalf("expected latest duplicate to win, got %q", got)
	}
	if got := len(result.Applied); got != 1 {
		t.Fatalf("expected 1 applied entry id, got %d", got)
	}
	if result.Applied[0] != req.Entries[0].ID() {
		t.Fatalf("unexpected applied entry id: got %v want %v", result.Applied[0], req.Entries[0].ID())
	}
}

func TestAdapterPushReturnsErrorWithoutAppliedOnFailure(t *testing.T) {
	client := &fakeClient{upsertErr: errors.New("boom")}
	adapter, err := NewWithClient(Config{ProjectID: "123", APIToken: "token"}, client)
	if err != nil {
		t.Fatalf("new adapter: %v", err)
	}

	result, err := adapter.Push(context.Background(), storage.PushRequest{
		Entries: []storage.Entry{{Key: "hello", Context: "home", Locale: "fr", Value: "bonjour"}},
	})
	if err == nil {
		t.Fatalf("expected error")
	}
	if got := len(result.Applied); got != 0 {
		t.Fatalf("expected no applied ids on error, got %d", got)
	}
}

func TestNewBuildsAdapterFromRawConfig(t *testing.T) {
	t.Setenv("POEDITOR_API_TOKEN", "token")

	adapter, err := New(json.RawMessage(`{"projectID":"123"}`))
	if err != nil {
		t.Fatalf("new adapter from raw config: %v", err)
	}

	if got := adapter.Name(); got != AdapterName {
		t.Fatalf("unexpected adapter name: %q", got)
	}
}

func TestAdapterNameAndCapabilities(t *testing.T) {
	adapter, err := NewWithClient(Config{ProjectID: "123", APIToken: "token"}, &fakeClient{})
	if err != nil {
		t.Fatalf("new adapter: %v", err)
	}

	if got := adapter.Name(); got != AdapterName {
		t.Fatalf("unexpected name: %q", got)
	}

	caps := adapter.Capabilities()
	if !caps.SupportsContext {
		t.Fatalf("expected SupportsContext")
	}
	if caps.SupportsVersions {
		t.Fatalf("expected SupportsVersions=false")
	}
	if caps.SupportsNamespaces {
		t.Fatalf("expected SupportsNamespaces=false")
	}
	if caps.SupportsDeletes {
		t.Fatalf("expected SupportsDeletes=false")
	}
}

func TestAdapterFileWorkflowCapabilities(t *testing.T) {
	adapter, err := NewWithClient(Config{ProjectID: "123", APIToken: "token"}, &fakeClient{})
	if err != nil {
		t.Fatalf("new adapter: %v", err)
	}

	caps := adapter.FileWorkflowCapabilities()
	if !caps.SupportsSourceUpload {
		t.Fatalf("expected source upload support")
	}
	if caps.SupportsTranslationUpload || caps.SupportsTranslationExport || caps.SupportsSourceDownload {
		t.Fatalf("unexpected file workflow capabilities: %+v", caps)
	}
}

func TestAdapterUploadSourcesUploadsTermsFiles(t *testing.T) {
	client := &fakeClient{}
	adapter, err := NewWithClient(Config{ProjectID: "123", APIToken: "token"}, client)
	if err != nil {
		t.Fatalf("new adapter: %v", err)
	}

	tempDir := t.TempDir()
	sourcePath := filepath.Join(tempDir, "messages.json")
	if err := os.WriteFile(sourcePath, []byte(`{"hello":"Hello"}`), 0o644); err != nil {
		t.Fatalf("write source file: %v", err)
	}

	result, err := adapter.UploadSources(context.Background(), storage.FileUploadSourcesRequest{
		Config: storage.FileWorkflowConfig{
			BasePath: tempDir,
			Files: []storage.FileGroupSpec{
				{Source: "messages.json"},
			},
		},
	})
	if err != nil {
		t.Fatalf("upload sources: %v", err)
	}
	if got := len(result.Processed); got != 1 {
		t.Fatalf("expected 1 processed source, got %d", got)
	}
	if result.Processed[0] != sourcePath {
		t.Fatalf("unexpected processed source: %q", result.Processed[0])
	}
	if got := len(client.uploads); got != 1 {
		t.Fatalf("expected 1 upload call, got %d", got)
	}
	upload := client.uploads[0]
	if upload.ProjectID != "123" || upload.APIToken != "token" || upload.FilePath != sourcePath {
		t.Fatalf("unexpected upload input: %+v", upload)
	}
}

func TestAdapterUploadSourcesWarnsWhenGlobMatchesNoFiles(t *testing.T) {
	client := &fakeClient{}
	adapter, err := NewWithClient(Config{ProjectID: "123", APIToken: "token"}, client)
	if err != nil {
		t.Fatalf("new adapter: %v", err)
	}

	result, err := adapter.UploadSources(context.Background(), storage.FileUploadSourcesRequest{
		Config: storage.FileWorkflowConfig{
			BasePath: t.TempDir(),
			Files: []storage.FileGroupSpec{
				{Source: "*.po"},
			},
		},
	})
	if err != nil {
		t.Fatalf("upload sources: %v", err)
	}
	if got := len(result.Processed); got != 0 {
		t.Fatalf("expected no processed sources, got %d", got)
	}
	if got := len(client.uploads); got != 0 {
		t.Fatalf("expected no upload calls, got %d", got)
	}
	if got := len(result.Warnings); got != 1 {
		t.Fatalf("expected 1 warning, got %d", got)
	}
	if !strings.Contains(result.Warnings[0].Message, `source pattern "*.po" matched no files`) {
		t.Fatalf("unexpected warning: %+v", result.Warnings[0])
	}
}
