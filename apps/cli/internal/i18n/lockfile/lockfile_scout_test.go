package lockfile

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestLoad_NullFieldsInitialization_Scout(t *testing.T) {
	path := filepath.Join(t.TempDir(), "null_fields.lock.json")
	content := []byte(`{
	  "adapter": "crowdin",
	  "project_id": "999",
	  "locale_states": null,
	  "run_completed": null,
	  "run_checkpoint": null
	}`)
	if err := os.WriteFile(path, content, 0o644); err != nil {
		t.Fatalf("failed writing test file: %v", err)
	}

	got, err := Load(path)
	if err != nil {
		t.Fatalf("unexpected load error: %v", err)
	}

	if got.LocaleStates == nil {
		t.Errorf("expected initialized non-nil LocaleStates map")
	}
	if got.RunCompleted == nil {
		t.Errorf("expected initialized non-nil RunCompleted map")
	}
	if got.RunCheckpoint == nil {
		t.Errorf("expected initialized non-nil RunCheckpoint map")
	}
}

func TestSaveAndLoad_FingerprintCompactionBoundaries_Scout(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "fingerprints.lock.json")

	// 128-char hex string (should compact to first 32 lowercase hex characters)
	valid128Hex := strings.Repeat("A1b2C3d4E5f6", 10) + "12345678" // 120 + 8 = 128 chars
	expectedCompacted := strings.ToLower(valid128Hex[:32])

	// 128-char non-hex string containing 'g' (should NOT compact)
	nonHex128 := strings.Repeat("g1b2C3d4E5f6", 10) + "12345678"

	// 64-char hex string (should NOT compact because len != 128)
	hex64 := strings.Repeat("a1b2c3d4", 8)

	f := File{
		RunCompleted: map[string]RunCompletion{
			"valid_hex::k1": {
				SourceHash: valid128Hex,
				TaskHash:   expectedCompacted,
			},
			"non_hex::k2": {
				SourceHash: nonHex128,
				TaskHash:   hex64,
			},
		},
		RunCheckpoint: map[string]RunCheckpoint{
			"locales/es.json::k3": {
				TargetPath:   "locales/es.json",
				EntryKey:     "k3",
				TargetLocale: "es",
				SourceHash:   valid128Hex,
				TaskHash:     nonHex128,
			},
		},
	}

	if err := Save(path, f); err != nil {
		t.Fatalf("Save failed: %v", err)
	}

	loaded, err := Load(path)
	if err != nil {
		t.Fatalf("Load failed: %v", err)
	}

	// Assert completion compacting
	c1, ok := loaded.RunCompleted["valid_hex::k1"]
	if !ok {
		t.Fatalf("missing valid_hex::k1 completion")
	}
	if c1.SourceHash != expectedCompacted {
		t.Errorf("expected compacted hash %q, got %q", expectedCompacted, c1.SourceHash)
	}

	c2, ok := loaded.RunCompleted["non_hex::k2"]
	if !ok {
		t.Fatalf("missing non_hex::k2 completion")
	}
	if c2.SourceHash != nonHex128 {
		t.Errorf("expected non-compacted nonHex128 %q, got %q", nonHex128, c2.SourceHash)
	}
	if c2.TaskHash != hex64 {
		t.Errorf("expected hex64 %q, got %q", hex64, c2.TaskHash)
	}

	// Assert checkpoint compacting
	cp3, ok := loaded.RunCheckpoint["locales/es.json::k3"]
	if !ok {
		t.Fatalf("missing checkpoint for locales/es.json::k3")
	}
	if cp3.SourceHash != expectedCompacted {
		t.Errorf("expected compacted checkpoint SourceHash %q, got %q", expectedCompacted, cp3.SourceHash)
	}
	if cp3.TaskHash != nonHex128 {
		t.Errorf("expected non-compacted checkpoint TaskHash %q, got %q", nonHex128, cp3.TaskHash)
	}
}

func TestSaveAndLoad_CheckpointIdentityFallback_Scout(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "fallback_identity.lock.json")
	now := time.Now().UTC().Truncate(time.Second)

	// Key without :: delimiter, relying on TargetPath and EntryKey fields
	f := File{
		RunCheckpoint: map[string]RunCheckpoint{
			"raw_key_without_delimiter": {
				TargetPath:   "locales/de.json",
				EntryKey:     "welcome_message",
				SourcePath:   "locales/en.json",
				TargetLocale: "de",
				Value:        "Willkommen",
				UpdatedAt:    now,
			},
		},
	}

	if err := Save(path, f); err != nil {
		t.Fatalf("Save failed: %v", err)
	}

	loaded, err := Load(path)
	if err != nil {
		t.Fatalf("Load failed: %v", err)
	}

	// Should be grouped and saved under TargetPath ("locales/de.json") and EntryKey ("welcome_message")
	cp, ok := loaded.RunCheckpoint["locales/de.json::welcome_message"]
	if !ok {
		t.Fatalf("expected checkpoint reconstituted under 'locales/de.json::welcome_message'")
	}
	if cp.TargetPath != "locales/de.json" || cp.EntryKey != "welcome_message" {
		t.Errorf("unexpected checkpoint TargetPath/EntryKey: %+v", cp)
	}
	if cp.Value != "Willkommen" || cp.TargetLocale != "de" {
		t.Errorf("unexpected checkpoint values: %+v", cp)
	}
}

func TestLoad_MalformedDecodingErrors_Scout(t *testing.T) {
	tests := []struct {
		name        string
		jsonContent string
		wantErrSub  string
	}{
		{
			name:        "invalid top-level json",
			jsonContent: `{ "run_completed": `,
			wantErrSub:  "decode lockfile",
		},
		{
			name:        "malformed tuple in run_completed",
			jsonContent: `{ "run_completed": { "locales/fr.json::key": [123, true] } }`,
			wantErrSub:  "decode lockfile run_completed",
		},
		{
			name:        "malformed object payload in run_completed",
			jsonContent: `{ "run_completed": { "locales/fr.json::key": "not-an-object-or-array" } }`,
			wantErrSub:  "decode lockfile run_completed",
		},
		{
			name:        "malformed nested group in run_checkpoint",
			jsonContent: `{ "run_checkpoint": { "locales/fr.json": "invalid-nested-map" } }`,
			wantErrSub:  "decode lockfile run_checkpoint",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "malformed.lock.json")
			if err := os.WriteFile(path, []byte(tt.jsonContent), 0o644); err != nil {
				t.Fatalf("write file: %v", err)
			}

			_, err := Load(path)
			if err == nil {
				t.Fatalf("expected error containing %q, got nil", tt.wantErrSub)
			}
			if !strings.Contains(err.Error(), tt.wantErrSub) {
				t.Errorf("expected error containing %q, got %v", tt.wantErrSub, err)
			}
		})
	}
}
