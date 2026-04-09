package runsvc

import (
	"strings"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/apps/cli/internal/i18n/lockfile"
)

func TestApplyLockFilterSkipsOnlyWhenTaskHashMatches(t *testing.T) {
	task := baseCacheTask()
	task.TargetPath = "/tmp/out.json"
	task.SourcePath = "/tmp/source.json"
	task.EntryKey = "hello"
	task.SourceLocale = "en"
	task.TargetLocale = "fr"

	completed := map[string]lockfile.RunCompletion{
		taskIdentity(task.TargetPath, task.EntryKey): {
			SourceHash: hashSourceText(task.SourceText),
			TaskHash:   lockTaskHash(task),
		},
	}

	report, executable, checkpointStaged, _, err := applyLockFilter([]Task{task}, completed, nil, "", false)
	if err != nil {
		t.Fatalf("applyLockFilter: %v", err)
	}
	if report.SkippedByLock != 1 {
		t.Fatalf("expected task to be skipped, got report %+v", report)
	}
	if len(executable) != 0 {
		t.Fatalf("expected no executable tasks, got %d", len(executable))
	}
	if len(checkpointStaged) != 0 {
		t.Fatalf("expected no checkpoint staging, got %+v", checkpointStaged)
	}
}

func TestApplyLockFilterDoesNotSkipWhenTaskHashChanges(t *testing.T) {
	task := baseCacheTask()
	task.TargetPath = "/tmp/out.json"
	task.SourcePath = "/tmp/source.json"
	task.EntryKey = "hello"
	task.SourceLocale = "en"
	task.TargetLocale = "fr"

	old := task
	old.PromptVersion = "p0"

	completed := map[string]lockfile.RunCompletion{
		taskIdentity(task.TargetPath, task.EntryKey): {
			SourceHash: hashSourceText(task.SourceText),
			TaskHash:   lockTaskHash(old),
		},
	}

	report, executable, _, _, err := applyLockFilter([]Task{task}, completed, nil, "", false)
	if err != nil {
		t.Fatalf("applyLockFilter: %v", err)
	}
	if report.SkippedByLock != 0 {
		t.Fatalf("expected changed task hash to invalidate skip, got report %+v", report)
	}
	if len(executable) != 1 {
		t.Fatalf("expected task to remain executable, got %d", len(executable))
	}
}

func TestApplyLockFilterLegacyFullTaskHashMatchesShortFingerprint(t *testing.T) {
	task := baseCacheTask()
	task.TargetPath = "/tmp/out.json"
	task.SourcePath = "/tmp/source.json"
	task.EntryKey = "hello"
	task.SourceLocale = "en"
	task.TargetLocale = "fr"

	precomputeStableTaskCacheFields(&task)
	canonical := task.stableExactCacheKeyPrefix +
		"\nretrieval_corpus_snapshot_version=" + strings.TrimSpace(task.RAGSnapshot) +
		"\ncontext_key=" + strings.TrimSpace(task.ContextKey) +
		"\ncontext_provider=" + strings.TrimSpace(task.ContextProvider) +
		"\ncontext_model=" + strings.TrimSpace(task.ContextModel)
	legacyFullTaskHash := hashSourceText(canonical)

	completed := map[string]lockfile.RunCompletion{
		taskIdentity(task.TargetPath, task.EntryKey): {
			SourceHash: lockStoredFingerprint(task.SourceText),
			TaskHash:   legacyFullTaskHash,
		},
	}

	report, executable, _, _, err := applyLockFilter([]Task{task}, completed, nil, "", false)
	if err != nil {
		t.Fatalf("applyLockFilter: %v", err)
	}
	if report.SkippedByLock != 1 {
		t.Fatalf("expected legacy full task_hash to match short fingerprint, got report %+v", report)
	}
	if len(executable) != 0 {
		t.Fatalf("expected no executable tasks, got %d", len(executable))
	}
}

func TestApplyLockFilterFallsBackToLegacySourceHash(t *testing.T) {
	task := baseCacheTask()
	task.TargetPath = "/tmp/out.json"
	task.SourcePath = "/tmp/source.json"
	task.EntryKey = "hello"
	task.SourceLocale = "en"
	task.TargetLocale = "fr"

	completed := map[string]lockfile.RunCompletion{
		taskIdentity(task.TargetPath, task.EntryKey): {
			SourceHash: hashSourceText(task.SourceText),
		},
	}

	report, executable, _, _, err := applyLockFilter([]Task{task}, completed, nil, "", false)
	if err != nil {
		t.Fatalf("applyLockFilter: %v", err)
	}
	if report.SkippedByLock != 1 {
		t.Fatalf("expected legacy source-hash skip, got report %+v", report)
	}
	if len(executable) != 0 {
		t.Fatalf("expected no executable tasks, got %d", len(executable))
	}
}

func TestApplyLockFilterDoesNotStageCheckpointWhenTaskHashChanges(t *testing.T) {
	task := baseCacheTask()
	task.TargetPath = "/tmp/out.json"
	task.SourcePath = "/tmp/source.json"
	task.EntryKey = "hello"
	task.SourceLocale = "en"
	task.TargetLocale = "fr"

	old := task
	old.Model = "gpt-4.1-mini"

	checkpoints := map[string]lockfile.RunCheckpoint{
		taskIdentity(task.TargetPath, task.EntryKey): {
			RunID:        "run_1",
			TargetPath:   task.TargetPath,
			SourcePath:   task.SourcePath,
			TargetLocale: task.TargetLocale,
			EntryKey:     task.EntryKey,
			Value:        "Bonjour",
			SourceHash:   hashSourceText(task.SourceText),
			TaskHash:     lockTaskHash(old),
		},
	}

	report, executable, checkpointStaged, _, err := applyLockFilter([]Task{task}, nil, checkpoints, "run_1", false)
	if err != nil {
		t.Fatalf("applyLockFilter: %v", err)
	}
	if report.SkippedByLock != 0 {
		t.Fatalf("expected no skip from stale checkpoint, got report %+v", report)
	}
	if len(executable) != 1 {
		t.Fatalf("expected task to remain executable, got %d", len(executable))
	}
	if len(checkpointStaged) != 0 {
		t.Fatalf("expected stale checkpoint not to be staged, got %+v", checkpointStaged)
	}
}
