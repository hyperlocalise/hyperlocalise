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

func TestApplyLockFilterMigratesLegacyMarkdownWhenInsertedParagraphShiftsStructuralPath(t *testing.T) {
	task := baseLockTask()
	task.TargetPath = "/tmp/out.md"
	task.SourcePath = "/tmp/source.md"
	task.EntryKey = "md.0123456789abcdef"
	task.SourceText = "Keep this translated."
	task.ParserMode = "other"
	task.SourceContext = strings.Join([]string{
		"Markdown translatable segment.",
		"Preserve every internal placeholder token matching the pattern \\x1eHLMDPH_...\\x1f exactly (do not translate, remove, or rename them).",
		"Structural path: Paragraph[3]/line[0]",
	}, "\n")

	old := task
	old.SourceContext = strings.ReplaceAll(task.SourceContext, "Paragraph[3]", "Paragraph[2]")

	completed := map[string]lockfile.RunCompletion{
		taskIdentity(task.TargetPath, task.EntryKey): {
			SourceHash: hashSourceText(old.SourceText),
			TaskHash:   legacyContextSensitiveLockTaskHash(old),
		},
	}

	report, executable, _, migrated, err := applyLockFilter([]Task{task}, completed, nil, "", false)
	if err != nil {
		t.Fatalf("applyLockFilter: %v", err)
	}
	if report.SkippedByLock != 1 {
		t.Fatalf("expected unchanged markdown segment to be skipped, got report %+v", report)
	}
	if len(executable) != 0 {
		t.Fatalf("expected no executable tasks, got %d", len(executable))
	}
	if !migrated {
		t.Fatalf("expected legacy markdown task hash to migrate")
	}
	if got, want := completed[taskIdentity(task.TargetPath, task.EntryKey)].TaskHash, lockTaskHash(task); got != want {
		t.Fatalf("expected migrated task hash %q, got %q", want, got)
	}
}

func TestLockTaskHashIgnoresMarkdownPromptContext(t *testing.T) {
	task := baseLockTask()
	task.TargetPath = "/tmp/out.md"
	task.SourcePath = "/tmp/source.md"
	task.EntryKey = "md.0123456789abcdef"
	task.SourceText = "Keep this translated."
	task.ParserMode = "other"
	task.SourceContext = strings.Join([]string{
		"Markdown translatable segment.",
		"Structural path: List[0]/ListItem[2]/Paragraph[0]/line[0]",
		"Adjacent source before (context only; do not translate this line): - ",
	}, "\n")

	changedContext := task
	changedContext.SourceContext = strings.Join([]string{
		"Markdown translatable segment.",
		"Structural path: List[0]/ListItem[3]/Paragraph[0]/line[0]",
		"Adjacent source before (context only; do not translate this line): New item.",
	}, "\n")

	if lockTaskHash(task) != lockTaskHash(changedContext) {
		t.Fatalf("expected markdown prompt context changes to stay out of lock task hash")
	}
}

func TestLockTaskHashStillIncludesNonMarkdownSourceContext(t *testing.T) {
	task := baseLockTask()
	task.TargetPath = "/tmp/out.json"
	task.SourcePath = "/tmp/source.json"
	task.EntryKey = "hello"
	task.SourceContext = "Description: short greeting"

	changed := task
	changed.SourceContext = "Description: CTA label"

	if lockTaskHash(task) == lockTaskHash(changed) {
		t.Fatalf("expected non-markdown source context changes to affect task hash")
	}
}

func TestApplyLockFilterMigratesLegacyMarkdownContextSensitiveTaskHash(t *testing.T) {
	task := baseLockTask()
	task.TargetPath = "/tmp/out.md"
	task.SourcePath = "/tmp/source.md"
	task.EntryKey = "md.0123456789abcdef"
	task.SourceText = "Keep this translated."
	task.ParserMode = "other"
	task.SourceContext = strings.Join([]string{
		"Markdown translatable segment.",
		"Structural path: Paragraph[2]/line[0]",
	}, "\n")

	completed := map[string]lockfile.RunCompletion{
		taskIdentity(task.TargetPath, task.EntryKey): {
			SourceHash: hashSourceText(task.SourceText),
			TaskHash:   legacyContextSensitiveLockTaskHash(task),
		},
	}

	report, executable, _, migrated, err := applyLockFilter([]Task{task}, completed, nil, "", false)
	if err != nil {
		t.Fatalf("applyLockFilter: %v", err)
	}
	if report.SkippedByLock != 1 || len(executable) != 0 {
		t.Fatalf("expected legacy markdown task hash to skip, report=%+v executable=%d", report, len(executable))
	}
	if !migrated {
		t.Fatalf("expected legacy markdown task hash to migrate")
	}
	if got, want := completed[taskIdentity(task.TargetPath, task.EntryKey)].TaskHash, lockTaskHash(task); got != want {
		t.Fatalf("expected migrated task hash %q, got %q", want, got)
	}
}

func TestLockTaskHashCandidatesOmitsMarkdownLegacyDefaultLockTaskHash(t *testing.T) {
	task := baseLockTask()
	task.TargetPath = "/tmp/out.md"
	task.SourcePath = "/tmp/source.md"
	task.EntryKey = "md.0123456789abcdef"
	task.SourceText = "Keep this translated."
	task.ParserMode = "other"
	task.SourceContext = strings.Join([]string{
		"Markdown translatable segment.",
		"Structural path: Paragraph[2]/line[0]",
	}, "\n")

	candidates := lockTaskHashCandidates(task)
	deadCandidate := legacyDefaultLockTaskHash(task)
	for _, candidate := range candidates {
		if candidate == deadCandidate {
			t.Fatalf("expected markdown candidates to omit legacy default lock task hash")
		}
	}

	contextSensitiveLegacyDefault := legacyDefaultContextSensitiveLockTaskHash(task)
	for _, candidate := range candidates {
		if candidate == contextSensitiveLegacyDefault {
			return
		}
	}
	t.Fatalf("expected markdown candidates to include context-sensitive legacy default task hash")
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
