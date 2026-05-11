package smartling

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
	items             []StringTranslation
	listRevision      string
	upsertIn          UpsertTranslationsInput
	upsertErr         error
	uploadSourceCalls int
	exportOut         []storage.Entry
	exportErr         error
	importIn          ImportFileInput
	importErr         error
}

func (f *fakeClient) ListTranslations(_ context.Context, _ ListTranslationsInput) ([]StringTranslation, string, error) {
	return f.items, f.listRevision, nil
}

func (f *fakeClient) UpsertTranslations(_ context.Context, in UpsertTranslationsInput) (string, error) {
	f.upsertIn = in
	if f.upsertErr != nil {
		return "", f.upsertErr
	}
	return "rev2", nil
}

func (f *fakeClient) UploadSourceFile(_ context.Context, _ SourceUploadInput) (SourceUploadResult, error) {
	f.uploadSourceCalls++
	return SourceUploadResult{}, f.upsertErr
}

func (f *fakeClient) ExportFile(_ context.Context, in ExportFileInput) ([]storage.Entry, string, error) {
	return f.exportOut, "rev-file", f.exportErr
}

func (f *fakeClient) ImportFile(_ context.Context, in ImportFileInput) (string, error) {
	f.importIn = in
	if f.importErr != nil {
		return "", f.importErr
	}
	return "rev-file", nil
}

func TestParseConfigUsesEnvSecret(t *testing.T) {
	t.Setenv("SMARTLING_USER_SECRET", "secret")

	cfg, err := ParseConfig(json.RawMessage(`{"projectID":"123","userIdentifier":"uid"}`))
	if err != nil {
		t.Fatalf("parse config: %v", err)
	}
	if got := cfg.UserSecret; got != "secret" {
		t.Fatalf("unexpected secret from env: %q", got)
	}
}

func TestParseConfigMissingSecret(t *testing.T) {
	_ = os.Unsetenv("SMARTLING_USER_SECRET")
	_, err := ParseConfig(json.RawMessage(`{"projectID":"123","userIdentifier":"uid"}`))
	if err == nil || !strings.Contains(err.Error(), "user secret") {
		t.Fatalf("expected missing secret error, got %v", err)
	}
}

func TestParseConfigRejectsInlineSecret(t *testing.T) {
	t.Setenv("SMARTLING_USER_SECRET", "env-secret")
	_, err := ParseConfig(json.RawMessage(`{"projectID":"123","userIdentifier":"uid","userSecret":"inline"}`))
	if err == nil || !strings.Contains(err.Error(), "userSecret is not supported") {
		t.Fatalf("expected inline secret rejection, got %v", err)
	}
}

func TestAdapterPullMapsStringContextLanguage(t *testing.T) {
	client := &fakeClient{items: []StringTranslation{{Key: "hello", Context: "home", Locale: "fr", Value: "bonjour"}}, listRevision: "rev1"}
	adapter, err := NewWithClient(Config{ProjectID: "123", UserIdentifier: "uid", UserSecret: "sec", Mode: ModeStrings}, client)
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
	adapter, err := NewWithClient(Config{ProjectID: "123", UserIdentifier: "uid", UserSecret: "sec", Mode: ModeStrings}, client)
	if err != nil {
		t.Fatalf("new adapter: %v", err)
	}

	_, err = adapter.Push(context.Background(), storage.PushRequest{Entries: []storage.Entry{{Key: "hello", Context: "home", Locale: "fr", Value: "bonjour"}}})
	if err != nil {
		t.Fatalf("push: %v", err)
	}
	if got := len(client.upsertIn.Entries); got != 1 {
		t.Fatalf("expected 1 upsert entry, got %d", got)
	}
}

func TestAdapterPushAppliedOnlyIncludesSentEntries(t *testing.T) {
	client := &fakeClient{}
	adapter, err := NewWithClient(Config{ProjectID: "123", UserIdentifier: "uid", UserSecret: "sec", Mode: ModeStrings}, client)
	if err != nil {
		t.Fatalf("new adapter: %v", err)
	}

	req := storage.PushRequest{Entries: []storage.Entry{
		{Key: "hello", Context: "home", Locale: "fr", Value: "bonjour"},
		{Key: "goodbye", Context: "home", Locale: "fr", Value: "   "},
		{Key: "   ", Context: "home", Locale: "fr", Value: "au revoir"},
	}}
	result, err := adapter.Push(context.Background(), req)
	if err != nil {
		t.Fatalf("push: %v", err)
	}
	if got := len(client.upsertIn.Entries); got != 1 {
		t.Fatalf("expected 1 upsert entry, got %d", got)
	}
	if got := len(result.Applied); got != 1 {
		t.Fatalf("expected 1 applied entry, got %d", got)
	}
	if result.Applied[0] != req.Entries[0].ID() {
		t.Fatalf("unexpected applied entry id: got %v want %v", result.Applied[0], req.Entries[0].ID())
	}
}

func TestAdapterPushPreservesTranslationWhitespace(t *testing.T) {
	client := &fakeClient{}
	adapter, err := NewWithClient(Config{ProjectID: "123", UserIdentifier: "uid", UserSecret: "sec", Mode: ModeStrings}, client)
	if err != nil {
		t.Fatalf("new adapter: %v", err)
	}

	value := "  Bonjour  "
	_, err = adapter.Push(context.Background(), storage.PushRequest{Entries: []storage.Entry{
		{Key: "hello", Context: "home", Locale: "fr", Value: value},
	}})
	if err != nil {
		t.Fatalf("push: %v", err)
	}
	if got := client.upsertIn.Entries[0].Value; got != value {
		t.Fatalf("unexpected pushed value: got %q want %q", got, value)
	}
}

func TestAdapterPushDeduplicatesByEntryID(t *testing.T) {
	client := &fakeClient{}
	adapter, err := NewWithClient(Config{ProjectID: "123", UserIdentifier: "uid", UserSecret: "sec", Mode: ModeStrings}, client)
	if err != nil {
		t.Fatalf("new adapter: %v", err)
	}

	first := storage.Entry{Key: "hello", Context: "home", Locale: "fr", Value: "bonjour"}
	second := storage.Entry{Key: "hello", Context: "home", Locale: "fr", Value: "salut"}
	third := storage.Entry{Key: "hello", Context: "home", Locale: "de", Value: "hallo"}

	result, err := adapter.Push(context.Background(), storage.PushRequest{Entries: []storage.Entry{
		first,
		second,
		third,
	}})
	if err != nil {
		t.Fatalf("push: %v", err)
	}

	if got := len(client.upsertIn.Entries); got != 2 {
		t.Fatalf("expected 2 upsert entries after dedup, got %d", got)
	}
	if got := client.upsertIn.Entries[0].Value; got != "salut" {
		t.Fatalf("expected latest duplicate value to win, got %q", got)
	}
	if got := len(result.Applied); got != 2 {
		t.Fatalf("expected 2 applied entries after dedup, got %d", got)
	}
	if result.Applied[0] != first.ID() {
		t.Fatalf("unexpected first applied id: got %v want %v", result.Applied[0], first.ID())
	}
	if result.Applied[1] != third.ID() {
		t.Fatalf("unexpected second applied id: got %v want %v", result.Applied[1], third.ID())
	}
}

func TestAdapterPushReturnsErrorWithoutAppliedOnFailure(t *testing.T) {
	client := &fakeClient{upsertErr: errors.New("boom")}
	adapter, err := NewWithClient(Config{ProjectID: "123", UserIdentifier: "uid", UserSecret: "sec", Mode: ModeStrings}, client)
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

func TestParseConfigDefaultsToStringsMode(t *testing.T) {
	t.Setenv("SMARTLING_USER_SECRET", "secret")
	cfg, err := ParseConfig(json.RawMessage(`{"projectID":"123","userIdentifier":"uid"}`))
	if err != nil {
		t.Fatalf("parse config: %v", err)
	}
	if cfg.Mode != ModeStrings {
		t.Fatalf("expected default mode %q, got %q", ModeStrings, cfg.Mode)
	}
}

func TestParseConfigRejectsInvalidMode(t *testing.T) {
	t.Setenv("SMARTLING_USER_SECRET", "secret")
	_, err := ParseConfig(json.RawMessage(`{"projectID":"123","userIdentifier":"uid","mode":"invalid"}`))
	if err == nil || !strings.Contains(err.Error(), "mode must") {
		t.Fatalf("expected mode validation error, got %v", err)
	}
}

func TestParseConfigRequiresFileURIInFilesMode(t *testing.T) {
	t.Setenv("SMARTLING_USER_SECRET", "secret")
	_, err := ParseConfig(json.RawMessage(`{"projectID":"123","userIdentifier":"uid","mode":"files"}`))
	if err == nil || !strings.Contains(err.Error(), "fileURI is required") {
		t.Fatalf("expected fileURI required error, got %v", err)
	}
}

func TestAdapterCapabilitiesInStringsMode(t *testing.T) {
	t.Setenv("SMARTLING_USER_SECRET", "secret")
	adapter, err := NewWithClient(Config{ProjectID: "123", UserIdentifier: "uid", UserSecret: "sec", Mode: ModeStrings}, &fakeClient{})
	if err != nil {
		t.Fatalf("new adapter: %v", err)
	}
	caps := adapter.Capabilities()
	if !caps.SupportsContext {
		t.Fatal("expected context support in strings mode")
	}
}

func TestAdapterCapabilitiesInFilesMode(t *testing.T) {
	t.Setenv("SMARTLING_USER_SECRET", "secret")
	adapter, err := NewWithClient(Config{ProjectID: "123", UserIdentifier: "uid", UserSecret: "sec", Mode: ModeFiles, FileURI: "translations.json", FileFormat: "json"}, &fakeClient{})
	if err != nil {
		t.Fatalf("new adapter: %v", err)
	}
	caps := adapter.Capabilities()
	if caps.SupportsContext {
		t.Fatal("expected no context support in files mode")
	}
}

func TestAdapterPullFilesDelegatesToExportFile(t *testing.T) {
	client := &fakeClient{exportOut: []storage.Entry{{Key: "hello", Locale: "fr", Value: "bonjour"}}}
	adapter, err := NewWithClient(Config{ProjectID: "123", UserIdentifier: "uid", UserSecret: "sec", Mode: ModeFiles, FileURI: "translations.json", FileFormat: "json"}, client)
	if err != nil {
		t.Fatalf("new adapter: %v", err)
	}

	result, err := adapter.Pull(context.Background(), storage.PullRequest{Locales: []string{"fr"}})
	if err != nil {
		t.Fatalf("pull files: %v", err)
	}
	if got := len(result.Snapshot.Entries); got != 1 {
		t.Fatalf("expected 1 entry, got %d", got)
	}
	entry := result.Snapshot.Entries[0]
	if entry.Key != "hello" || entry.Locale != "fr" || entry.Value != "bonjour" {
		t.Fatalf("unexpected entry mapping: %+v", entry)
	}
}

func TestAdapterPullFilesPreservesPartialResultsOnError(t *testing.T) {
	client := &fakeClient{
		exportOut: []storage.Entry{{Key: "hello", Locale: "fr", Value: "bonjour"}},
		exportErr: errors.New("some locales failed"),
	}
	adapter, err := NewWithClient(Config{ProjectID: "123", UserIdentifier: "uid", UserSecret: "sec", Mode: ModeFiles, FileURI: "translations.json", FileFormat: "json"}, client)
	if err != nil {
		t.Fatalf("new adapter: %v", err)
	}

	result, err := adapter.Pull(context.Background(), storage.PullRequest{Locales: []string{"fr", "de"}})
	if err == nil {
		t.Fatal("expected error")
	}
	if got := len(result.Snapshot.Entries); got != 1 {
		t.Fatalf("expected 1 partial entry, got %d", got)
	}
	if result.Snapshot.Entries[0].Value != "bonjour" {
		t.Fatalf("unexpected partial entry: %+v", result.Snapshot.Entries[0])
	}
}

func TestAdapterPushFilesDelegatesToImportFile(t *testing.T) {
	client := &fakeClient{}
	adapter, err := NewWithClient(Config{ProjectID: "123", UserIdentifier: "uid", UserSecret: "sec", Mode: ModeFiles, FileURI: "translations.json", FileFormat: "json"}, client)
	if err != nil {
		t.Fatalf("new adapter: %v", err)
	}

	_, err = adapter.Push(context.Background(), storage.PushRequest{Entries: []storage.Entry{{Key: "hello", Locale: "fr", Value: "bonjour"}}})
	if err != nil {
		t.Fatalf("push files: %v", err)
	}
	if got := len(client.importIn.Entries); got != 1 {
		t.Fatalf("expected 1 import entry, got %d", got)
	}
	if client.importIn.FileURI != "translations.json" || client.importIn.FileType != "json" {
		t.Fatalf("unexpected import input: uri=%q type=%q", client.importIn.FileURI, client.importIn.FileType)
	}
}

func TestNewBuildsAdapterFromRawConfig(t *testing.T) {
	t.Setenv("SMARTLING_USER_SECRET", "secret")
	adapter, err := New(json.RawMessage(`{"projectID":"123","userIdentifier":"uid"}`))
	if err != nil {
		t.Fatalf("new adapter from raw config: %v", err)
	}
	if got := adapter.Name(); got != AdapterName {
		t.Fatalf("unexpected adapter name: %q", got)
	}
}

func TestAdapterUploadSources(t *testing.T) {
	client := &fakeClient{}
	adapter, err := NewWithClient(Config{ProjectID: "123", UserIdentifier: "uid", UserSecret: "sec", Mode: ModeStrings}, client)
	if err != nil {
		t.Fatalf("new adapter: %v", err)
	}

	tempDir := t.TempDir()
	tempFile := filepath.Join(tempDir, "test.json")
	if err := os.WriteFile(tempFile, []byte(`{"k":"v"}`), 0o644); err != nil {
		t.Fatalf("write temp file: %v", err)
	}

	req := storage.FileUploadSourcesRequest{
		Config: storage.FileWorkflowConfig{
			ProjectID: "123",
			BasePath:  tempDir,
			Files: []storage.FileGroupSpec{
				{Source: "test.json"},
			},
		},
	}

	result, err := adapter.UploadSources(context.Background(), req)
	if err != nil {
		t.Fatalf("upload sources: %v", err)
	}

	if got := len(result.Processed); got != 1 {
		t.Fatalf("expected 1 processed file, got %d", got)
	}
	if result.Processed[0] != tempFile {
		t.Fatalf("unexpected processed file: %q", result.Processed[0])
	}
}

func TestAdapterUploadSourcesWarnsWhenSourcePatternMatchesNoFiles(t *testing.T) {
	client := &fakeClient{}
	adapter, err := NewWithClient(Config{ProjectID: "123", UserIdentifier: "uid", UserSecret: "sec", Mode: ModeStrings}, client)
	if err != nil {
		t.Fatalf("new adapter: %v", err)
	}

	tempDir := t.TempDir()
	if err := os.Mkdir(filepath.Join(tempDir, "locales"), 0o755); err != nil {
		t.Fatalf("make locales dir: %v", err)
	}

	req := storage.FileUploadSourcesRequest{
		Config: storage.FileWorkflowConfig{
			ProjectID: "123",
			BasePath:  tempDir,
			Files: []storage.FileGroupSpec{
				{Source: "locales/**/*.json"},
			},
		},
	}

	result, err := adapter.UploadSources(context.Background(), req)
	if err != nil {
		t.Fatalf("upload sources: %v", err)
	}

	if got := len(result.Processed); got != 0 {
		t.Fatalf("expected no processed files, got %d", got)
	}
	if got := client.uploadSourceCalls; got != 0 {
		t.Fatalf("expected no upload calls, got %d", got)
	}
	if got := len(result.Warnings); got != 1 {
		t.Fatalf("expected 1 warning, got %d", got)
	}
	if !strings.Contains(result.Warnings[0].Message, `source pattern "locales/**/*.json" matched no files`) {
		t.Fatalf("unexpected warning: %+v", result.Warnings[0])
	}
}
