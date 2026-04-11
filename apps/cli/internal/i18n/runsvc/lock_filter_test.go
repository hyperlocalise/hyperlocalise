package runsvc

import (
	"strings"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/apps/cli/internal/i18n/lockfile"
)

func baseLockTask() Task {
	return Task{
		SourceLocale:  "en-US",
		TargetLocale:  "fr-FR",
		SourceText:    "Hello",
		Provider:      "openai",
		Model:         "gpt-5.2",
		ProfileName:   "default",
		PromptVersion: "p1",
		ParserMode:    "json",
		ContextKey:    "file:a",
		SourceContext: "Checkout submit button",
		ContextMemory: "memory-A",
	}
}

func TestApplyLockFilterSkipsOnlyWhenTaskHashMatches(t *testing.T) {
	task := baseLockTask()
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
	task := baseLockTask()
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
	task := baseLockTask()
	task.TargetPath = "/tmp/out.json"
	task.SourcePath = "/tmp/source.json"
	task.EntryKey = "hello"
	task.SourceLocale = "en"
	task.TargetLocale = "fr"

	precomputeStableTaskCacheFields(&task)
	canonical := strings.Join([]string{
		"source_norm_hash=" + task.sourceTextHash,
		"source_locale=" + strings.TrimSpace(task.SourceLocale),
		"target_locale=" + strings.TrimSpace(task.TargetLocale),
		"provider=" + strings.TrimSpace(task.Provider),
		"model=" + strings.TrimSpace(task.Model),
		"profile=" + strings.TrimSpace(task.ProfileName),
		"prompt_version_hash=" + strings.TrimSpace(task.PromptVersion),
		"glossary_termbase_version_hash=none",
		"parser_mode=" + strings.TrimSpace(task.ParserMode),
		"source_context_fingerprint=" + task.sourceContextFingerprint,
		"retrieval_corpus_snapshot_version=" + legacyDefaultRetrievalSnapshot(),
		"context_key=" + strings.TrimSpace(task.ContextKey),
		"context_provider=" + strings.TrimSpace(task.ContextProvider),
		"context_model=" + strings.TrimSpace(task.ContextModel),
	}, "\n")
	legacyFullTaskHash := hashSourceText(canonical)

	completed := map[string]lockfile.RunCompletion{
		taskIdentity(task.TargetPath, task.EntryKey): {
			SourceHash: hashSourceText(task.SourceText),
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
	task := baseLockTask()
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
	task := baseLockTask()
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
