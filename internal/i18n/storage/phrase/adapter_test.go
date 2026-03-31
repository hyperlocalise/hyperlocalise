package phrase

import (
	"context"
	"encoding/json"
	"errors"
	"reflect"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/storage"
)

type fakeClient struct {
	listStringsFn   func(context.Context, ListStringsInput) ([]StringTranslation, string, error)
	upsertStringsFn func(context.Context, UpsertStringsInput) (string, error)
	exportFileFn    func(context.Context, ExportFileInput) ([]storage.Entry, string, error)
	importFileFn    func(context.Context, ImportFileInput) (string, error)
}

func (f *fakeClient) ListStrings(ctx context.Context, in ListStringsInput) ([]StringTranslation, string, error) {
	return f.listStringsFn(ctx, in)
}

func (f *fakeClient) UpsertStrings(ctx context.Context, in UpsertStringsInput) (string, error) {
	return f.upsertStringsFn(ctx, in)
}

func (f *fakeClient) ExportFile(ctx context.Context, in ExportFileInput) ([]storage.Entry, string, error) {
	return f.exportFileFn(ctx, in)
}

func (f *fakeClient) ImportFile(ctx context.Context, in ImportFileInput) (string, error) {
	return f.importFileFn(ctx, in)
}

func TestParseConfigModeAndEnv(t *testing.T) {
	t.Setenv(defaultTokenEnvName, "secret")
	raw := json.RawMessage(`{"projectID":"proj","mode":"files","fileFormat":"json"}`)
	cfg, err := ParseConfig(raw)
	if err != nil {
		t.Fatalf("parse config: %v", err)
	}
	if cfg.APIToken != "secret" || cfg.Mode != ModeFiles {
		t.Fatalf("unexpected cfg: %+v", cfg)
	}
}

func TestParseConfigRejectsInvalidMode(t *testing.T) {
	t.Setenv(defaultTokenEnvName, "secret")
	_, err := ParseConfig(json.RawMessage(`{"projectID":"proj","mode":"invalid"}`))
	if err == nil {
		t.Fatalf("expected error")
	}
}

func TestNewWithClientRequiresClient(t *testing.T) {
	_, err := NewWithClient(Config{ProjectID: "p", APIToken: "x", Mode: ModeStrings}, nil)
	if err == nil {
		t.Fatalf("expected error")
	}
}

func TestAdapterCapabilitiesByMode(t *testing.T) {
	a, err := NewWithClient(Config{ProjectID: "p", APIToken: "x", Mode: ModeFiles, FileFormat: "json"}, &fakeClient{
		listStringsFn:   func(context.Context, ListStringsInput) ([]StringTranslation, string, error) { return nil, "", nil },
		upsertStringsFn: func(context.Context, UpsertStringsInput) (string, error) { return "", nil },
		exportFileFn:    func(context.Context, ExportFileInput) ([]storage.Entry, string, error) { return nil, "", nil },
		importFileFn:    func(context.Context, ImportFileInput) (string, error) { return "", nil },
	})
	if err != nil {
		t.Fatal(err)
	}
	caps := a.Capabilities()
	if caps.SupportsContext || caps.SupportsNamespaces || caps.SupportsVersions {
		t.Fatalf("unexpected caps: %+v", caps)
	}
}

func TestAdapterPullStringsNormalizationAndFiltering(t *testing.T) {
	a, err := NewWithClient(Config{ProjectID: "p", APIToken: "x", Mode: ModeStrings}, &fakeClient{
		listStringsFn: func(context.Context, ListStringsInput) ([]StringTranslation, string, error) {
			return []StringTranslation{{Key: "a", Locale: "fr", Value: "A"}, {Key: "", Locale: "fr", Value: "bad"}, {Key: "b", Locale: "", Value: "bad"}, {Key: "c", Locale: "fr", Value: ""}}, "rev-1", nil
		},
		upsertStringsFn: func(context.Context, UpsertStringsInput) (string, error) { return "", nil },
		exportFileFn:    func(context.Context, ExportFileInput) ([]storage.Entry, string, error) { return nil, "", nil },
		importFileFn:    func(context.Context, ImportFileInput) (string, error) { return "", nil },
	})
	if err != nil {
		t.Fatal(err)
	}
	res, err := a.Pull(context.Background(), storage.PullRequest{})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Snapshot.Entries) != 1 || res.Snapshot.Entries[0].Key != "a" {
		t.Fatalf("unexpected entries: %+v", res.Snapshot.Entries)
	}
}

func TestAdapterPushStringsDedupesByEntryIDAndFiltersEmptyValues(t *testing.T) {
	var got []StringTranslation
	a, err := NewWithClient(Config{ProjectID: "p", APIToken: "x", Mode: ModeStrings}, &fakeClient{
		listStringsFn: func(context.Context, ListStringsInput) ([]StringTranslation, string, error) { return nil, "", nil },
		upsertStringsFn: func(_ context.Context, in UpsertStringsInput) (string, error) {
			got = append(got, in.Entries...)
			return "rev-2", nil
		},
		exportFileFn: func(context.Context, ExportFileInput) ([]storage.Entry, string, error) { return nil, "", nil },
		importFileFn: func(context.Context, ImportFileInput) (string, error) { return "", nil },
	})
	if err != nil {
		t.Fatal(err)
	}
	entries := []storage.Entry{{Key: "a", Locale: "fr", Value: "first"}, {Key: "a", Locale: "fr", Value: "second"}, {Key: "b", Locale: "fr", Value: ""}}
	res, err := a.Push(context.Background(), storage.PushRequest{Entries: entries})
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0].Value != "second" {
		t.Fatalf("unexpected payload: %+v", got)
	}
	if !reflect.DeepEqual(res.Applied, []storage.EntryID{{Key: "a", Locale: "fr"}}) {
		t.Fatalf("unexpected applied: %+v", res.Applied)
	}
}

func TestAdapterPushStringsReturnsPartialAppliedOnFailure(t *testing.T) {
	a, err := NewWithClient(Config{ProjectID: "p", APIToken: "x", Mode: ModeStrings}, &fakeClient{
		listStringsFn: func(context.Context, ListStringsInput) ([]StringTranslation, string, error) { return nil, "", nil },
		upsertStringsFn: func(_ context.Context, in UpsertStringsInput) (string, error) {
			return "", &partialUpsertError{sentIndexes: []int{0}, cause: errors.New("boom")}
		},
		exportFileFn: func(context.Context, ExportFileInput) ([]storage.Entry, string, error) { return nil, "", nil },
		importFileFn: func(context.Context, ImportFileInput) (string, error) { return "", nil },
	})
	if err != nil {
		t.Fatal(err)
	}
	res, err := a.Push(context.Background(), storage.PushRequest{Entries: []storage.Entry{{Key: "a", Locale: "fr", Value: "A"}, {Key: "b", Locale: "fr", Value: "B"}}})
	if err == nil {
		t.Fatalf("expected error")
	}
	if len(res.Applied) != 1 || res.Applied[0].Key != "a" {
		t.Fatalf("unexpected partial applied: %+v", res.Applied)
	}
}

func TestAdapterPushFilesAndPullFiles(t *testing.T) {
	var imported []storage.Entry
	a, err := NewWithClient(Config{ProjectID: "p", APIToken: "x", Mode: ModeFiles, FileFormat: "json"}, &fakeClient{
		listStringsFn:   func(context.Context, ListStringsInput) ([]StringTranslation, string, error) { return nil, "", nil },
		upsertStringsFn: func(context.Context, UpsertStringsInput) (string, error) { return "", nil },
		exportFileFn: func(context.Context, ExportFileInput) ([]storage.Entry, string, error) {
			return []storage.Entry{{Key: "a", Locale: "fr", Value: "A"}, {Key: "", Locale: "fr", Value: "bad"}}, "rev-3", nil
		},
		importFileFn: func(_ context.Context, in ImportFileInput) (string, error) {
			imported = append(imported, in.Entries...)
			return "rev-4", nil
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	pull, err := a.Pull(context.Background(), storage.PullRequest{})
	if err != nil || len(pull.Snapshot.Entries) != 1 {
		t.Fatalf("pull result: entries=%d err=%v", len(pull.Snapshot.Entries), err)
	}
	push, err := a.Push(context.Background(), storage.PushRequest{Entries: []storage.Entry{{Key: "x", Locale: "fr", Value: "X"}, {Key: "y", Locale: "fr", Value: ""}}})
	if err != nil {
		t.Fatal(err)
	}
	if len(imported) != 1 || imported[0].Key != "x" || len(push.Applied) != 1 {
		t.Fatalf("unexpected import/push: imported=%+v applied=%+v", imported, push.Applied)
	}
}

func TestParseConfigFallbackEnv(t *testing.T) {
	t.Setenv("CUSTOM_PHRASE_TOKEN", "")
	t.Setenv(defaultTokenEnvName, "fallback-token")
	cfg, err := ParseConfig(json.RawMessage(`{"projectID":"proj","apiTokenEnv":"CUSTOM_PHRASE_TOKEN"}`))
	if err != nil {
		t.Fatalf("parse config: %v", err)
	}
	if cfg.APIToken != "fallback-token" {
		t.Fatalf("unexpected token: %q", cfg.APIToken)
	}
}
