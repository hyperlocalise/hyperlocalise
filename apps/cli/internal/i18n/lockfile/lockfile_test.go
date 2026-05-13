package lockfile

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestLoadMissingFileReturnsEmptyLock(t *testing.T) {
	path := filepath.Join(t.TempDir(), "missing.lock.json")

	f, err := Load(path)
	if err != nil {
		t.Fatalf("load missing lockfile: %v", err)
	}
	if f == nil {
		t.Fatalf("expected lockfile object")
	} else {
		if f.LocaleStates == nil {
			t.Fatalf("expected initialized locale states map")
		}
		if f.RunCompleted == nil {
			t.Fatalf("expected initialized run completed map")
		}
		if f.RunCheckpoint == nil {
			t.Fatalf("expected initialized run checkpoint map")
		}
		if len(f.LocaleStates) != 0 {
			t.Fatalf("expected empty locale states, got %d", len(f.LocaleStates))
		}
	}
}

func TestSaveAndLoadRoundTrip(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "state.lock.json")
	now := time.Unix(1700000000, 0).UTC()

	err := Save(path, File{
		Adapter:     "poeditor",
		ProjectID:   "123",
		LastPullAt:  &now,
		ActiveRunID: "run_1700000000000000000",
		LocaleStates: map[string]LocaleCheckpoint{
			"fr": {
				Revision:  "rev1",
				UpdatedAt: &now,
			},
		},
		RunCompleted: map[string]RunCompletion{
			"locales/fr.json::hello": {
				SourceHash: "abc123",
			},
		},
		RunCheckpoint: map[string]RunCheckpoint{
			"locales/fr.json::hello": {
				RunID:        "run_1700000000000000000",
				TargetPath:   "locales/fr.json",
				SourcePath:   "locales/en.json",
				TargetLocale: "fr",
				EntryKey:     "hello",
				Value:        "Bonjour",
				SourceHash:   "abc123",
				UpdatedAt:    now,
			},
		},
	})
	if err != nil {
		t.Fatalf("save lockfile: %v", err)
	}

	got, err := Load(path)
	if err != nil {
		t.Fatalf("load lockfile: %v", err)
	}
	if got.Adapter != "poeditor" || got.ProjectID != "123" {
		t.Fatalf("unexpected header fields: %+v", got)
	}
	if got.ActiveRunID != "run_1700000000000000000" {
		t.Fatalf("unexpected active run id: %q", got.ActiveRunID)
	}
	checkpoint, ok := got.LocaleStates["fr"]
	if !ok {
		t.Fatalf("expected fr locale checkpoint")
	}
	if checkpoint.Revision != "rev1" {
		t.Fatalf("unexpected revision: %q", checkpoint.Revision)
	}
	if checkpoint.UpdatedAt == nil || !checkpoint.UpdatedAt.Equal(now) {
		t.Fatalf("unexpected updated_at: %+v", checkpoint.UpdatedAt)
	}
	completion, ok := got.RunCompleted["locales/fr.json::hello"]
	if !ok {
		t.Fatalf("expected run completion")
	}
	if completion.SourceHash != "abc123" {
		t.Fatalf("unexpected source hash: %q", completion.SourceHash)
	}
	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read saved lockfile: %v", err)
	}
	if strings.Contains(string(content), "completed_at") {
		t.Fatalf("expected saved lockfile to omit completed_at, got %s", string(content))
	}
	checkpointed, ok := got.RunCheckpoint["locales/fr.json::hello"]
	if !ok {
		t.Fatalf("expected run checkpoint")
	}
	if checkpointed.Value != "Bonjour" || checkpointed.SourceHash != "abc123" {
		t.Fatalf("unexpected checkpoint payload: %+v", checkpointed)
	}
	if checkpointed.RunID != "run_1700000000000000000" {
		t.Fatalf("unexpected checkpoint run id: %q", checkpointed.RunID)
	}
}

func TestLoadInvalidJSON(t *testing.T) {
	path := filepath.Join(t.TempDir(), "broken.lock.json")
	if err := os.WriteFile(path, []byte("{not-json"), 0o644); err != nil {
		t.Fatalf("write invalid lockfile: %v", err)
	}

	_, err := Load(path)
	if err == nil || !strings.Contains(err.Error(), "decode lockfile") {
		t.Fatalf("expected decode error, got %v", err)
	}
}

func TestLoadLegacyRunCompletedWithCompletedAt(t *testing.T) {
	path := filepath.Join(t.TempDir(), "legacy.lock.json")
	content := []byte(`{
	  "run_completed": {
	    "locales/fr.json::hello": {
	      "completed_at": "2026-01-15T12:10:00Z",
	      "source_hash": "abc123"
	    }
	  }
	}`)
	if err := os.WriteFile(path, content, 0o644); err != nil {
		t.Fatalf("write legacy lockfile: %v", err)
	}

	got, err := Load(path)
	if err != nil {
		t.Fatalf("load legacy lockfile: %v", err)
	}
	completion, ok := got.RunCompleted["locales/fr.json::hello"]
	if !ok {
		t.Fatalf("expected legacy run completion entry")
	}
	if completion.SourceHash != "abc123" {
		t.Fatalf("unexpected source hash: %q", completion.SourceHash)
	}

	if err := Save(path, *got); err != nil {
		t.Fatalf("re-save legacy lockfile: %v", err)
	}
	rewritten, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read rewritten lockfile: %v", err)
	}
	if strings.Contains(string(rewritten), "completed_at") {
		t.Fatalf("expected rewritten lockfile to omit completed_at, got %s", string(rewritten))
	}
	if !strings.Contains(string(rewritten), "abc123") {
		t.Fatalf("expected rewritten lockfile to preserve source_hash, got %s", string(rewritten))
	}
}

func TestSaveWritesIndentedGroupedRunCompleted(t *testing.T) {
	path := filepath.Join(t.TempDir(), "state.lock.json")
	fullSourceHash := strings.Repeat("a", 128)
	fullTaskHash := strings.Repeat("B", 128)

	if err := Save(path, File{
		RunCompleted: map[string]RunCompletion{
			"locales/fr.json::hello": {
				SourceHash: fullSourceHash,
				TaskHash:   fullTaskHash,
			},
		},
	}); err != nil {
		t.Fatalf("save lockfile: %v", err)
	}

	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read saved lockfile: %v", err)
	}
	rewritten := string(content)
	if strings.Contains(rewritten, "source_hash") || strings.Contains(rewritten, "task_hash") {
		t.Fatalf("expected compact hash keys, got %s", rewritten)
	}
	if strings.Contains(rewritten, fullSourceHash) || strings.Contains(rewritten, fullTaskHash) {
		t.Fatalf("expected full hashes to be compacted, got %s", rewritten)
	}
	if !strings.Contains(rewritten, "\n  \"run_completed\": {\n") {
		t.Fatalf("expected indented run_completed, got %s", rewritten)
	}
	var payload struct {
		RunCompleted map[string]map[string]diskRunCompletion `json:"run_completed"`
	}
	if err := json.Unmarshal(content, &payload); err != nil {
		t.Fatalf("decode saved lockfile: %v", err)
	}
	completionOnDisk := payload.RunCompleted["locales/fr.json"]["hello"]
	if completionOnDisk.SourceHash != "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" || completionOnDisk.TaskHash != "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" {
		t.Fatalf("expected grouped compact run_completed, got %+v", payload.RunCompleted)
	}

	got, err := Load(path)
	if err != nil {
		t.Fatalf("load compact lockfile: %v", err)
	}
	completion := got.RunCompleted["locales/fr.json::hello"]
	if completion.SourceHash != "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" || completion.TaskHash != "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" {
		t.Fatalf("unexpected compact completion: %+v", completion)
	}
}

func TestLoadGroupedRunCompleted(t *testing.T) {
	path := filepath.Join(t.TempDir(), "grouped.lock.json")
	content := []byte(`{
	  "run_completed": {
	    "locales/fr.json": {
	      "hello": {"s": "source-a", "t": "task-a"},
	      "bye": ["source-b", "task-b"]
	    }
	  }
	}`)
	if err := os.WriteFile(path, content, 0o644); err != nil {
		t.Fatalf("write compact lockfile: %v", err)
	}

	got, err := Load(path)
	if err != nil {
		t.Fatalf("load compact lockfile: %v", err)
	}
	if got.RunCompleted["locales/fr.json::hello"].SourceHash != "source-a" {
		t.Fatalf("expected grouped object completion, got %+v", got.RunCompleted)
	}
	if got.RunCompleted["locales/fr.json::bye"].TaskHash != "task-b" {
		t.Fatalf("expected grouped tuple completion, got %+v", got.RunCompleted)
	}
}

func TestSaveAndLoadGroupedRunCheckpoint(t *testing.T) {
	path := filepath.Join(t.TempDir(), "checkpoint.lock.json")
	now := time.Unix(1700000000, 0).UTC()
	fullSourceHash := strings.Repeat("c", 128)
	fullTaskHash := strings.Repeat("D", 128)

	if err := Save(path, File{
		ActiveRunID: "run_1",
		RunCheckpoint: map[string]RunCheckpoint{
			"locales/fr.json::hello": {
				RunID:        "run_1",
				TargetPath:   "locales/fr.json",
				SourcePath:   "locales/en.json",
				TargetLocale: "fr",
				EntryKey:     "hello",
				Value:        "Bonjour",
				SourceHash:   fullSourceHash,
				TaskHash:     fullTaskHash,
				UpdatedAt:    now,
			},
		},
	}); err != nil {
		t.Fatalf("save checkpoint lockfile: %v", err)
	}

	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read saved lockfile: %v", err)
	}
	rewritten := string(content)
	for _, legacyKey := range []string{"target_path", "entry_key", "source_hash", "task_hash", fullSourceHash, fullTaskHash} {
		if strings.Contains(rewritten, legacyKey) {
			t.Fatalf("expected compact checkpoint encoding without %q, got %s", legacyKey, rewritten)
		}
	}

	got, err := Load(path)
	if err != nil {
		t.Fatalf("load checkpoint lockfile: %v", err)
	}
	checkpoint := got.RunCheckpoint["locales/fr.json::hello"]
	if checkpoint.TargetPath != "locales/fr.json" || checkpoint.EntryKey != "hello" {
		t.Fatalf("expected identity to round-trip from grouped checkpoint, got %+v", checkpoint)
	}
	if checkpoint.SourcePath != "locales/en.json" || checkpoint.TargetLocale != "fr" || checkpoint.Value != "Bonjour" {
		t.Fatalf("unexpected checkpoint payload: %+v", checkpoint)
	}
	if checkpoint.SourceHash != "cccccccccccccccccccccccccccccccc" || checkpoint.TaskHash != "dddddddddddddddddddddddddddddddd" {
		t.Fatalf("unexpected compact checkpoint hashes: %+v", checkpoint)
	}
	if !checkpoint.UpdatedAt.Equal(now) {
		t.Fatalf("unexpected checkpoint updated_at: %+v", checkpoint.UpdatedAt)
	}
}

func TestLoadLegacyFlatRunCheckpoint(t *testing.T) {
	path := filepath.Join(t.TempDir(), "legacy-checkpoint.lock.json")
	fullSourceHash := strings.Repeat("e", 128)
	content := []byte(`{
	  "active_run_id": "run_1",
	  "run_checkpoint": {
	    "locales/fr.json::hello": {
	      "run_id": "run_1",
	      "target_path": "locales/fr.json",
	      "source_path": "locales/en.json",
	      "target_locale": "fr",
	      "entry_key": "hello",
	      "value": "Bonjour",
	      "source_hash": "` + fullSourceHash + `",
	      "updated_at": "2023-11-14T22:13:20Z"
	    }
	  }
	}`)
	if err := os.WriteFile(path, content, 0o644); err != nil {
		t.Fatalf("write legacy checkpoint lockfile: %v", err)
	}

	got, err := Load(path)
	if err != nil {
		t.Fatalf("load legacy checkpoint lockfile: %v", err)
	}
	checkpoint := got.RunCheckpoint["locales/fr.json::hello"]
	if checkpoint.RunID != "run_1" || checkpoint.SourcePath != "locales/en.json" || checkpoint.Value != "Bonjour" {
		t.Fatalf("unexpected legacy checkpoint: %+v", checkpoint)
	}
	if checkpoint.SourceHash != "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" {
		t.Fatalf("expected compacted legacy checkpoint hash, got %+v", checkpoint)
	}
}

func TestSaveDefaultPath(t *testing.T) {
	dir := t.TempDir()
	wd, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd: %v", err)
	}
	t.Cleanup(func() {
		if chErr := os.Chdir(wd); chErr != nil {
			t.Fatalf("restore cwd: %v", chErr)
		}
	})
	if err := os.Chdir(dir); err != nil {
		t.Fatalf("chdir temp dir: %v", err)
	}

	if err := Save("", File{}); err != nil {
		t.Fatalf("save default lockfile: %v", err)
	}
	if _, err := os.Stat(DefaultPath); err != nil {
		t.Fatalf("stat default lockfile: %v", err)
	}
}
