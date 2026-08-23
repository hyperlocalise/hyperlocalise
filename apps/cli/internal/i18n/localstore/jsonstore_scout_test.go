package localstore

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/apps/cli/internal/i18n/syncsvc"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/storage"
	"github.com/hyperlocalise/hyperlocalise/pkg/i18nconfig"
)

func TestNewJSONStore_ValidationEdgeCases(t *testing.T) {
	t.Run("nil config", func(t *testing.T) {
		_, err := NewJSONStore(nil)
		if err == nil || !strings.Contains(err.Error(), "config is nil") {
			t.Fatalf("expected config is nil error, got %v", err)
		}
	})

	t.Run("empty buckets map", func(t *testing.T) {
		cfg := &config.I18NConfig{
			Buckets: map[string]config.BucketConfig{},
		}
		_, err := NewJSONStore(cfg)
		if err == nil || !strings.Contains(err.Error(), "buckets is required") {
			t.Fatalf("expected buckets is required error, got %v", err)
		}
	})

	t.Run("buckets with no file To mapping", func(t *testing.T) {
		cfg := &config.I18NConfig{
			Buckets: map[string]config.BucketConfig{
				"main": {
					Files: []config.BucketFileMapping{
						{From: "lang/en.json", To: ""},
					},
				},
			},
		}
		_, err := NewJSONStore(cfg)
		if err == nil || !strings.Contains(err.Error(), "buckets.*.files[].to is required") {
			t.Fatalf("expected buckets.*.files[].to is required error, got %v", err)
		}
	})

	t.Run("bucket ordering is deterministic", func(t *testing.T) {
		cfg := &config.I18NConfig{
			Locales: config.LocaleConfig{Source: "en", Targets: []string{"fr"}},
			Buckets: map[string]config.BucketConfig{
				"z_bucket": {
					Files: []config.BucketFileMapping{{From: "lang/en.json", To: "lang_z/[locale].json"}},
				},
				"a_bucket": {
					Files: []config.BucketFileMapping{{From: "lang/en.json", To: "lang_a/[locale].json"}},
				},
			},
		}
		store, err := NewJSONStore(cfg)
		if err != nil {
			t.Fatalf("NewJSONStore failed: %v", err)
		}
		if store.localePattern != "lang_a/[locale].json" {
			t.Fatalf("expected first alphabetical bucket pattern 'lang_a/[locale].json', got %q", store.localePattern)
		}
	})
}

func TestJSONStore_ReadSnapshot_EdgeCases(t *testing.T) {
	t.Run("empty request locales uses default target locales from config", func(t *testing.T) {
		dir := t.TempDir()
		langDir := filepath.Join(dir, "lang")
		if err := os.MkdirAll(langDir, 0o755); err != nil {
			t.Fatalf("mkdir: %v", err)
		}
		if err := os.WriteFile(filepath.Join(langDir, "fr.json"), []byte(`{"welcome":"bienvenue"}`), 0o644); err != nil {
			t.Fatalf("write file: %v", err)
		}

		store := mustNewStore(t, filepath.Join(dir, "lang", "[locale].json"))
		snap, err := store.ReadSnapshot(context.Background(), syncsvc.LocalReadRequest{Locales: nil})
		if err != nil {
			t.Fatalf("ReadSnapshot failed: %v", err)
		}
		if len(snap.Entries) != 1 || snap.Entries[0].Value != "bienvenue" {
			t.Fatalf("expected default target locale fr entry, got %+v", snap.Entries)
		}
	})

	t.Run("missing locale file returns empty snapshot without error", func(t *testing.T) {
		dir := t.TempDir()
		store := mustNewStore(t, filepath.Join(dir, "nonexistent", "[locale].json"))
		snap, err := store.ReadSnapshot(context.Background(), syncsvc.LocalReadRequest{Locales: []string{"fr"}})
		if err != nil {
			t.Fatalf("expected no error for missing file, got %v", err)
		}
		if len(snap.Entries) != 0 {
			t.Fatalf("expected 0 entries for missing file, got %d", len(snap.Entries))
		}
	})

	t.Run("corrupted locale json file returns wrapped error", func(t *testing.T) {
		dir := t.TempDir()
		langDir := filepath.Join(dir, "lang")
		if err := os.MkdirAll(langDir, 0o755); err != nil {
			t.Fatalf("mkdir: %v", err)
		}
		if err := os.WriteFile(filepath.Join(langDir, "fr.json"), []byte(`{invalid json`), 0o644); err != nil {
			t.Fatalf("write file: %v", err)
		}

		store := mustNewStore(t, filepath.Join(dir, "lang", "[locale].json"))
		_, err := store.ReadSnapshot(context.Background(), syncsvc.LocalReadRequest{Locales: []string{"fr"}})
		if err == nil || !strings.Contains(err.Error(), "read locale file") {
			t.Fatalf("expected read locale file error, got %v", err)
		}
	})

	t.Run("corrupted metadata sidecar returns wrapped error", func(t *testing.T) {
		dir := t.TempDir()
		langDir := filepath.Join(dir, "lang")
		if err := os.MkdirAll(langDir, 0o755); err != nil {
			t.Fatalf("mkdir: %v", err)
		}
		if err := os.WriteFile(filepath.Join(langDir, "fr.json"), []byte(`{"k":"v"}`), 0o644); err != nil {
			t.Fatalf("write locale: %v", err)
		}
		if err := os.WriteFile(filepath.Join(langDir, "fr.meta.json"), []byte(`bad meta`), 0o644); err != nil {
			t.Fatalf("write meta: %v", err)
		}

		store := mustNewStore(t, filepath.Join(dir, "lang", "[locale].json"))
		_, err := store.ReadSnapshot(context.Background(), syncsvc.LocalReadRequest{Locales: []string{"fr"}})
		if err == nil || !strings.Contains(err.Error(), "read locale metadata") {
			t.Fatalf("expected read locale metadata error, got %v", err)
		}
	})

	t.Run("key prefix filtering skips whitespace or empty prefix filters", func(t *testing.T) {
		dir := t.TempDir()
		langDir := filepath.Join(dir, "lang")
		if err := os.MkdirAll(langDir, 0o755); err != nil {
			t.Fatalf("mkdir: %v", err)
		}
		if err := os.WriteFile(filepath.Join(langDir, "fr.json"), []byte(`{"app.title":"Titre","user.name":"Nom"}`), 0o644); err != nil {
			t.Fatalf("write locale: %v", err)
		}

		store := mustNewStore(t, filepath.Join(dir, "lang", "[locale].json"))
		snap, err := store.ReadSnapshot(context.Background(), syncsvc.LocalReadRequest{
			Locales:     []string{"fr"},
			KeyPrefixes: []string{"  ", "", "app."},
		})
		if err != nil {
			t.Fatalf("ReadSnapshot failed: %v", err)
		}
		if len(snap.Entries) != 1 || snap.Entries[0].Key != "app.title" {
			t.Fatalf("expected only app.title entry, got %+v", snap.Entries)
		}
	})
}

func TestJSONStore_ApplyPull_EdgeCases(t *testing.T) {
	t.Run("pulling to source locale is allowed", func(t *testing.T) {
		dir := t.TempDir()
		store := mustNewStore(t, filepath.Join(dir, "lang", "[locale].json"))

		res, err := store.ApplyPull(context.Background(), syncsvc.ApplyPullPlan{
			Creates: []storage.Entry{{
				Key:    "hello",
				Locale: "en", // Source locale
				Value:  "Hello",
			}},
		})
		if err != nil {
			t.Fatalf("expected ApplyPull to source locale to succeed, got %v", err)
		}
		if len(res.Applied) != 1 {
			t.Fatalf("expected 1 applied entry, got %d", len(res.Applied))
		}
	})

	t.Run("merges updates and creates with pre-existing locale and sidecar files", func(t *testing.T) {
		dir := t.TempDir()
		langDir := filepath.Join(dir, "lang")
		if err := os.MkdirAll(langDir, 0o755); err != nil {
			t.Fatalf("mkdir: %v", err)
		}
		if err := os.WriteFile(filepath.Join(langDir, "fr.json"), []byte(`{"existing":"existant"}`), 0o644); err != nil {
			t.Fatalf("write locale: %v", err)
		}

		store := mustNewStore(t, filepath.Join(dir, "lang", "[locale].json"))
		_, err := store.ApplyPull(context.Background(), syncsvc.ApplyPullPlan{
			Creates: []storage.Entry{{
				Key:    "new_key",
				Locale: "fr",
				Value:  "nouveau",
				Provenance: storage.EntryProvenance{
					Origin: storage.OriginLLM,
					State:  storage.StateDraft,
				},
			}},
			Updates: []storage.Entry{{
				Key:    "existing",
				Locale: "fr",
				Value:  "existant_mis_a_jour",
			}},
		})
		if err != nil {
			t.Fatalf("ApplyPull failed: %v", err)
		}

		snap, err := store.ReadSnapshot(context.Background(), syncsvc.LocalReadRequest{Locales: []string{"fr"}})
		if err != nil {
			t.Fatalf("ReadSnapshot failed: %v", err)
		}
		if len(snap.Entries) != 2 {
			t.Fatalf("expected 2 merged entries, got %d", len(snap.Entries))
		}

		entryMap := make(map[string]storage.Entry)
		for _, e := range snap.Entries {
			entryMap[e.Key] = e
		}

		if entryMap["existing"].Value != "existant_mis_a_jour" {
			t.Fatalf("expected updated value for existing, got %q", entryMap["existing"].Value)
		}
		if entryMap["new_key"].Provenance.Origin != storage.OriginLLM {
			t.Fatalf("expected LLM origin for new_key, got %q", entryMap["new_key"].Provenance.Origin)
		}
	})

	t.Run("fails when pre-existing locale file contains malformed json", func(t *testing.T) {
		dir := t.TempDir()
		langDir := filepath.Join(dir, "lang")
		if err := os.MkdirAll(langDir, 0o755); err != nil {
			t.Fatalf("mkdir: %v", err)
		}
		if err := os.WriteFile(filepath.Join(langDir, "fr.json"), []byte(`not valid json`), 0o644); err != nil {
			t.Fatalf("write locale: %v", err)
		}

		store := mustNewStore(t, filepath.Join(dir, "lang", "[locale].json"))
		_, err := store.ApplyPull(context.Background(), syncsvc.ApplyPullPlan{
			Creates: []storage.Entry{{
				Key:    "hello",
				Locale: "fr",
				Value:  "bonjour",
			}},
		})
		if err == nil || !strings.Contains(err.Error(), "read locale file") {
			t.Fatalf("expected read locale file error before apply, got %v", err)
		}
	})
}

func TestMetaPathFor_Scout(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{input: "lang/fr.json", want: "lang/fr.meta.json"},
		{input: "lang/fr.i18n.json", want: "lang/fr.i18n.meta.json"},
		{input: "lang/fr", want: "lang/fr.meta.json"},
	}

	for _, tc := range tests {
		got := metaPathFor(tc.input)
		if got != tc.want {
			t.Errorf("metaPathFor(%q) = %q, want %q", tc.input, got, tc.want)
		}
	}
}
