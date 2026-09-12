package cmd

import (
	"bytes"
	"context"
	"strings"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/apps/cli/internal/i18n/syncsvc"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/storage"
	config "github.com/hyperlocalise/hyperlocalise/pkg/i18nconfig"
)

type recordingAdapter struct {
	pullReqs []storage.PullRequest
}

func (r *recordingAdapter) Name() string                       { return "recording" }
func (r *recordingAdapter) Capabilities() storage.Capabilities { return storage.Capabilities{} }
func (r *recordingAdapter) Pull(_ context.Context, req storage.PullRequest) (storage.PullResult, error) {
	r.pullReqs = append(r.pullReqs, req)
	return storage.PullResult{Snapshot: storage.CatalogSnapshot{}}, nil
}

func (r *recordingAdapter) Push(_ context.Context, _ storage.PushRequest) (storage.PushResult, error) {
	return storage.PushResult{}, nil
}

type emptyLocalStore struct{}

func (emptyLocalStore) ReadSnapshot(_ context.Context, _ syncsvc.LocalReadRequest) (storage.CatalogSnapshot, error) {
	return storage.CatalogSnapshot{}, nil
}

func (emptyLocalStore) BuildPushSnapshot(_ context.Context, _ syncsvc.LocalReadRequest) (storage.CatalogSnapshot, error) {
	return storage.CatalogSnapshot{}, nil
}

func (emptyLocalStore) ApplyPull(_ context.Context, _ syncsvc.ApplyPullPlan) (syncsvc.ApplyResult, error) {
	return syncsvc.ApplyResult{}, nil
}

func TestSyncTMSLocales(t *testing.T) {
	cfg := &config.I18NConfig{
		Locales: config.LocaleConfig{
			Source:  "en",
			Targets: []string{"fr", "vi"},
		},
	}

	got, err := resolveTMSLocales(cfg, nil)
	if err != nil {
		t.Fatalf("empty requested: %v", err)
	}
	if strings.Join(got, ",") != "fr,vi" {
		t.Fatalf("empty requested = %#v, want [fr vi]", got)
	}

	got, err = resolveTMSLocales(cfg, []string{"vi"})
	if err != nil {
		t.Fatalf("explicit locale: %v", err)
	}
	if strings.Join(got, ",") != "vi" {
		t.Fatalf("explicit locale = %#v, want [vi]", got)
	}

	got, err = resolveTMSLocales(cfg, []string{"en"})
	if err != nil {
		t.Fatalf("source locale: %v", err)
	}
	if strings.Join(got, ",") != "en" {
		t.Fatalf("source locale = %#v, want [en]", got)
	}

	_, err = resolveTMSLocales(cfg, []string{"de"})
	if err == nil || !strings.Contains(err.Error(), "locales.source or locales.targets") {
		t.Fatalf("unknown locale error = %v", err)
	}
}

func TestSyncTMSPullPassesLocalesToAdapter(t *testing.T) {
	adapter := &recordingAdapter{}
	read := syncsvc.LocalReadRequest{Locales: []string{"vi"}}
	if _, err := runTMSPull(context.Background(), adapter, emptyLocalStore{}, read, syncsvc.PullOptions{DryRun: true}); err != nil {
		t.Fatalf("run TMS pull: %v", err)
	}
	if len(adapter.pullReqs) != 1 {
		t.Fatalf("expected 1 pull request, got %d", len(adapter.pullReqs))
	}
	if strings.Join(adapter.pullReqs[0].Locales, ",") != "vi" {
		t.Fatalf("pull locales = %#v, want [vi]", adapter.pullReqs[0].Locales)
	}
}

func TestSyncTMSPushPassesLocalesToBaselinePull(t *testing.T) {
	adapter := &recordingAdapter{}
	read := syncsvc.LocalReadRequest{Locales: []string{"vi"}}
	if _, err := runTMSPush(context.Background(), adapter, emptyLocalStore{}, read, syncsvc.PushOptions{
		DryRun:         true,
		FailOnConflict: true,
		ForceConflicts: true,
	}); err != nil {
		t.Fatalf("run TMS push: %v", err)
	}
	if len(adapter.pullReqs) != 1 {
		t.Fatalf("expected 1 baseline pull request, got %d", len(adapter.pullReqs))
	}
	if strings.Join(adapter.pullReqs[0].Locales, ",") != "vi" {
		t.Fatalf("baseline pull locales = %#v, want [vi]", adapter.pullReqs[0].Locales)
	}
}

func TestSyncTMSReportTextOmitsTranslationValues(t *testing.T) {
	report := syncsvc.Report{
		Action: "pull",
		Creates: []storage.Entry{{
			Key:    "hello",
			Locale: "fr",
			Value:  "bonjour-secret",
		}},
		Conflicts: []storage.Conflict{{
			ID:          storage.EntryID{Key: "hello", Locale: "fr"},
			Reason:      "curated_value_mismatch",
			LocalValue:  "local-secret",
			RemoteValue: "remote-secret",
		}},
	}
	var buf bytes.Buffer
	if err := writeTMSReport(&buf, report, "text", true); err != nil {
		t.Fatalf("write text report: %v", err)
	}
	out := buf.String()
	if !strings.Contains(out, "action=pull") || !strings.Contains(out, "creates=1") || !strings.Contains(out, "conflicts=1") {
		t.Fatalf("unexpected text report: %s", out)
	}
	for _, secret := range []string{"bonjour-secret", "local-secret", "remote-secret"} {
		if strings.Contains(out, secret) {
			t.Fatalf("text report leaked translation value %q: %s", secret, out)
		}
	}
}

func TestSyncTMSReportMarkdownOmitsTranslationValues(t *testing.T) {
	report := syncsvc.Report{
		Action: "push",
		Conflicts: []storage.Conflict{{
			ID:          storage.EntryID{Key: "hello", Locale: "fr", Context: "button"},
			Reason:      "draft_vs_curated_remote",
			LocalValue:  "local-secret",
			RemoteValue: "remote-secret",
		}},
	}
	var buf bytes.Buffer
	if err := writeTMSReport(&buf, report, "markdown", false); err != nil {
		t.Fatalf("write markdown report: %v", err)
	}
	out := buf.String()
	if !strings.Contains(out, "draft_vs_curated_remote") || !strings.Contains(out, "`hello`") {
		t.Fatalf("unexpected markdown report: %s", out)
	}
	if strings.Contains(out, "local-secret") || strings.Contains(out, "remote-secret") {
		t.Fatalf("markdown report leaked translation values: %s", out)
	}
}
