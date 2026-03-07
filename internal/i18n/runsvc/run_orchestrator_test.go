package runsvc

import (
	"strings"
	"testing"

	"github.com/quiet-circles/hyperlocalise/internal/i18n/lockfile"
)

func TestApplyLockFilterAutoMigratesCompletedRenameIdentity(t *testing.T) {
	task := Task{TargetPath: "/tmp/out.json", SourcePath: "/tmp/source.json", SourceLocale: "en", TargetLocale: "fr", EntryKey: "new", SourceText: "Hello"}
	completed := map[string]lockfile.RunCompletion{
		taskIdentity(task.TargetPath, "old"): {SourceHash: hashSourceText("Hello")},
	}
	report, executable, _, err := applyLockFilter([]Task{task}, completed, map[string]lockfile.RunCheckpoint{}, "", false)
	if err != nil {
		t.Fatalf("apply lock filter: %v", err)
	}
	if len(executable) != 0 {
		t.Fatalf("expected rename to be skipped by migrated lock completion, got %d executable tasks", len(executable))
	}
	if report.SkippedByLock != 1 {
		t.Fatalf("skipped by lock=%d, want 1", report.SkippedByLock)
	}
	warnings := strings.Join(report.Warnings, "\n")
	if !strings.Contains(warnings, `key_rename target="/tmp/out.json" old_key="old" new_key="new"`) {
		t.Fatalf("expected key_rename warning, got %q", warnings)
	}
	if _, ok := completed[taskIdentity(task.TargetPath, "new")]; !ok {
		t.Fatalf("expected migrated completion for new identity")
	}
	if _, ok := completed[taskIdentity(task.TargetPath, "old")]; ok {
		t.Fatalf("expected old identity removed after migration")
	}
}

func TestApplyLockFilterAutoMigratesCheckpointRenameIdentity(t *testing.T) {
	task := Task{TargetPath: "/tmp/out.json", SourcePath: "/tmp/source.json", SourceLocale: "en", TargetLocale: "fr", EntryKey: "new", SourceText: "Hello"}
	checkpoints := map[string]lockfile.RunCheckpoint{
		taskIdentity(task.TargetPath, "old"): {
			RunID:      "run_1",
			SourceHash: hashSourceText("Hello"),
			Value:      "Bonjour",
		},
	}
	report, executable, staged, err := applyLockFilter([]Task{task}, map[string]lockfile.RunCompletion{}, checkpoints, "run_1", false)
	if err != nil {
		t.Fatalf("apply lock filter: %v", err)
	}
	if report.ExecutableTotal != 1 || len(executable) != 1 {
		t.Fatalf("expected task to remain executable after checkpoint staging, got %d", len(executable))
	}
	if got := staged[task.TargetPath].entries[task.EntryKey]; got != "Bonjour" {
		t.Fatalf("staged checkpoint value=%q, want Bonjour", got)
	}
	if _, ok := checkpoints[taskIdentity(task.TargetPath, "old")]; ok {
		t.Fatalf("expected old checkpoint identity removed after migration")
	}
}

func TestApplyLockFilterAutoRenameConflictWhenAmbiguous(t *testing.T) {
	task := Task{TargetPath: "/tmp/out.json", EntryKey: "new", SourceText: "Hello"}
	completed := map[string]lockfile.RunCompletion{
		taskIdentity(task.TargetPath, "old1"): {SourceHash: hashSourceText("Hello")},
		taskIdentity(task.TargetPath, "old2"): {SourceHash: hashSourceText("Hello")},
	}
	report, executable, _, err := applyLockFilter([]Task{task}, completed, map[string]lockfile.RunCheckpoint{}, "", false)
	if err != nil {
		t.Fatalf("apply lock filter: %v", err)
	}
	if len(executable) != 1 {
		t.Fatalf("expected task to remain executable on conflict, got %d", len(executable))
	}
	warnings := strings.Join(report.Warnings, "\n")
	if !strings.Contains(warnings, "key_rename_conflict") {
		t.Fatalf("expected conflict warning, got %q", warnings)
	}
}
