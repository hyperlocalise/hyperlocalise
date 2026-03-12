package poeditor

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"strings"
	"testing"

	"github.com/quiet-circles/hyperlocalise/internal/i18n/storage"
)

type fakeClient struct {
	available    []string
	availableErr error
	exportOut    []TermTranslation
	listRevision string
	uploads      []UploadFileInput
}

func (f *fakeClient) ListTerms(_ context.Context, _ ListTermsInput) ([]TermTranslation, string, error) {
	return nil, "", nil
}

func (f *fakeClient) ListProjectTerms(_ context.Context, _ ListTermsInput) ([]TermKey, string, error) {
	return nil, "", nil
}

func (f *fakeClient) AvailableLanguages(_ context.Context, _ string) ([]string, error) {
	if f.availableErr != nil {
		err := f.availableErr
		f.availableErr = nil
		return nil, err
	}
	return f.available, nil
}

func (f *fakeClient) AddTerms(_ context.Context, _ TermMutationInput) (string, error) {
	return "", nil
}

func (f *fakeClient) DeleteTerms(_ context.Context, _ TermMutationInput) (string, error) {
	return "", nil
}

func (f *fakeClient) UpsertTranslations(_ context.Context, _ UpsertTranslationsInput) (string, error) {
	return "", nil
}

func (f *fakeClient) ExportFile(_ context.Context, _ ExportFileInput) ([]TermTranslation, string, error) {
	return f.exportOut, f.listRevision, nil
}

func (f *fakeClient) UploadFile(_ context.Context, in UploadFileInput) (UploadFileResult, string, error) {
	f.uploads = append(f.uploads, in)
	return UploadFileResult{
		TermsParsed:         len(in.Entries),
		TranslationsParsed:  len(in.Entries),
		TranslationsUpdated: len(in.Entries),
	}, "rev2", nil
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

func TestAdapterPullUsesExportedFileEntries(t *testing.T) {
	client := &fakeClient{
		exportOut:    []TermTranslation{{Term: "hello", Locale: "fr", Value: "bonjour"}},
		available:    []string{"fr"},
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
	if entry.Key != "hello" || entry.Locale != "fr" || entry.Value != "bonjour" {
		t.Fatalf("unexpected entry mapping: %+v", entry)
	}
}

func TestAdapterPushUploadsGroupedLocales(t *testing.T) {
	client := &fakeClient{available: []string{"fr", "en-us"}}
	adapter, err := NewWithClient(Config{ProjectID: "123", APIToken: "token", SourceLanguage: "en"}, client)
	if err != nil {
		t.Fatalf("new adapter: %v", err)
	}

	_, err = adapter.Push(context.Background(), storage.PushRequest{
		Entries: []storage.Entry{{Key: "hello", Locale: "fr", Value: "bonjour"}},
	})
	if err != nil {
		t.Fatalf("push: %v", err)
	}
	if got := len(client.uploads); got != 1 {
		t.Fatalf("expected 1 upload, got %d", got)
	}
	if got := client.uploads[0].Locale; got != "fr" {
		t.Fatalf("expected fr upload, got %+v", client.uploads[0])
	}
	if got := client.uploads[0].Updating; got != "translations" {
		t.Fatalf("expected translations mode, got %q", got)
	}
}

func TestAdapterPushSourceLocaleUsesTermsTranslationsAndFullSync(t *testing.T) {
	client := &fakeClient{available: []string{"en-us"}}
	adapter, err := NewWithClient(Config{ProjectID: "123", APIToken: "token", SourceLanguage: "en-US"}, client)
	if err != nil {
		t.Fatalf("new adapter: %v", err)
	}

	_, err = adapter.Push(context.Background(), storage.PushRequest{
		Options: map[string]string{"scope": "full"},
		Entries: []storage.Entry{{Key: "hello", Locale: "en-US", Value: "Hello"}},
	})
	if err != nil {
		t.Fatalf("push: %v", err)
	}
	if got := len(client.uploads); got != 1 {
		t.Fatalf("expected 1 upload, got %d", got)
	}
	if got := client.uploads[0].Updating; got != "terms_translations" {
		t.Fatalf("expected terms_translations mode, got %q", got)
	}
	if !client.uploads[0].SyncTerms {
		t.Fatalf("expected full-scope source upload to sync terms")
	}
}

func TestAdapterPushRejectsContextForUploadMode(t *testing.T) {
	client := &fakeClient{available: []string{"fr"}}
	adapter, err := NewWithClient(Config{ProjectID: "123", APIToken: "token", SourceLanguage: "en"}, client)
	if err != nil {
		t.Fatalf("new adapter: %v", err)
	}

	_, err = adapter.Push(context.Background(), storage.PushRequest{
		Entries: []storage.Entry{{Key: "hello", Context: "home", Locale: "fr", Value: "bonjour"}},
	})
	if err == nil || !strings.Contains(err.Error(), "does not support entry context") {
		t.Fatalf("expected context rejection, got %v", err)
	}
}

func TestAdapterNormalizesLocalesToPOEditorCodes(t *testing.T) {
	client := &fakeClient{available: []string{"en-us", "vi", "zh-Hans"}}
	adapter, err := NewWithClient(Config{ProjectID: "123", APIToken: "token", SourceLanguage: "en-US"}, client)
	if err != nil {
		t.Fatalf("new adapter: %v", err)
	}

	_, err = adapter.Push(context.Background(), storage.PushRequest{
		Entries: []storage.Entry{{Key: "hello", Locale: "vi-VN", Value: "Xin chao"}},
	})
	if err != nil {
		t.Fatalf("push: %v", err)
	}
	if got := client.uploads[0].Locale; got != "vi" {
		t.Fatalf("expected vi-VN normalized to vi, got %q", got)
	}
}

func TestAdapterLocaleMapOverrideWins(t *testing.T) {
	client := &fakeClient{available: []string{"en-us", "vi", "vi-VN"}}
	adapter, err := NewWithClient(Config{
		ProjectID:      "123",
		APIToken:       "token",
		SourceLanguage: "en-US",
		LocaleMap:      map[string]string{"vi-VN": "vi-VN"},
	}, client)
	if err != nil {
		t.Fatalf("new adapter: %v", err)
	}
	_, err = adapter.Push(context.Background(), storage.PushRequest{
		Entries: []storage.Entry{{Key: "hello", Locale: "vi-VN", Value: "Xin chao"}},
	})
	if err != nil {
		t.Fatalf("push: %v", err)
	}
	if got := client.uploads[0].Locale; got != "vi-VN" {
		t.Fatalf("expected locale override preserved, got %q", got)
	}
}

func TestAdapterSupportedLanguagesRetriesAfterFailure(t *testing.T) {
	client := &fakeClient{
		available:    []string{"fr"},
		availableErr: errors.New("temporary outage"),
	}
	adapter, err := NewWithClient(Config{ProjectID: "123", APIToken: "token", SourceLanguage: "en"}, client)
	if err != nil {
		t.Fatalf("new adapter: %v", err)
	}

	_, err = adapter.supportedLanguages(context.Background())
	if err == nil || !strings.Contains(err.Error(), "temporary outage") {
		t.Fatalf("expected transient failure, got %v", err)
	}

	supported, err := adapter.supportedLanguages(context.Background())
	if err != nil {
		t.Fatalf("expected retry to succeed, got %v", err)
	}
	if got := supported["fr"]; got != "fr" {
		t.Fatalf("expected cached locale after retry, got %#v", supported)
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
	if caps.SupportsContext {
		t.Fatalf("expected SupportsContext=false")
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
