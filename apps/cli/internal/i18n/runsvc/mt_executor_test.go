package runsvc

import (
	"fmt"
	"testing"

	config "github.com/hyperlocalise/hyperlocalise/pkg/i18nconfig"
)

func TestPartitionMTTasksStableOrder(t *testing.T) {
	tasks := []Task{
		{EntryKey: "llm-0", TranslationType: config.TranslationTypeLLM},
		{EntryKey: "mt-0", TranslationType: config.TranslationTypeMT},
		{EntryKey: "image-0", TranslationType: config.TranslationTypeLLM, Kind: "image"},
		{EntryKey: "mt-1", TranslationType: config.TranslationTypeMT},
		{EntryKey: "llm-1", TranslationType: config.TranslationTypeLLM},
		{EntryKey: "mt-2", TranslationType: config.TranslationTypeMT},
	}

	llmTasks, mtTasks := partitionMTTasks(tasks)

	wantLLM := []string{"llm-0", "image-0", "llm-1"}
	if got := entryKeys(llmTasks); !equalStrings(got, wantLLM) {
		t.Fatalf("llmTasks entry keys = %v, want %v", got, wantLLM)
	}
	wantMT := []string{"mt-0", "mt-1", "mt-2"}
	if got := entryKeys(mtTasks); !equalStrings(got, wantMT) {
		t.Fatalf("mtTasks entry keys = %v, want %v", got, wantMT)
	}

	if len(llmTasks)+len(mtTasks) != len(tasks) {
		t.Fatalf("partition dropped or duplicated tasks: got %d+%d, want %d", len(llmTasks), len(mtTasks), len(tasks))
	}
	seen := map[string]struct{}{}
	for _, task := range append(append([]Task(nil), llmTasks...), mtTasks...) {
		if _, ok := seen[task.EntryKey]; ok {
			t.Fatalf("entry key %q appeared more than once across the partition", task.EntryKey)
		}
		seen[task.EntryKey] = struct{}{}
	}
}

func TestPartitionMTTasksEmptyInput(t *testing.T) {
	llmTasks, mtTasks := partitionMTTasks(nil)
	if len(llmTasks) != 0 || len(mtTasks) != 0 {
		t.Fatalf("partitioning empty input produced llmTasks=%v mtTasks=%v, want both empty", llmTasks, mtTasks)
	}
}

func TestGroupMTTasksByProfilePreservesOrder(t *testing.T) {
	// Interleave two (profile, sourceLocale, targetLocale) combinations so a
	// naive sort or map-iteration-based grouping would reorder them.
	tasks := []Task{
		{EntryKey: "a-0", ProfileName: "alpha", SourceLocale: "en", TargetLocale: "fr"},
		{EntryKey: "b-0", ProfileName: "beta", SourceLocale: "en", TargetLocale: "de"},
		{EntryKey: "a-1", ProfileName: "alpha", SourceLocale: "en", TargetLocale: "fr"},
		{EntryKey: "b-1", ProfileName: "beta", SourceLocale: "en", TargetLocale: "de"},
		{EntryKey: "a-2", ProfileName: "alpha", SourceLocale: "en", TargetLocale: "fr"},
	}

	groups := groupMTTasksByProfile(tasks)

	if len(groups) != 2 {
		t.Fatalf("groups=%d, want 2", len(groups))
	}
	wantKey0 := mtGroupKey{profileName: "alpha", sourceLocale: "en", targetLocale: "fr"}
	if groups[0].key != wantKey0 {
		t.Fatalf("groups[0].key = %+v, want %+v (first-seen order)", groups[0].key, wantKey0)
	}
	wantKey1 := mtGroupKey{profileName: "beta", sourceLocale: "en", targetLocale: "de"}
	if groups[1].key != wantKey1 {
		t.Fatalf("groups[1].key = %+v, want %+v (first-seen order)", groups[1].key, wantKey1)
	}

	if got, want := entryKeys(groups[0].tasks), []string{"a-0", "a-1", "a-2"}; !equalStrings(got, want) {
		t.Fatalf("groups[0].tasks entry keys = %v, want %v", got, want)
	}
	if got, want := entryKeys(groups[1].tasks), []string{"b-0", "b-1"}; !equalStrings(got, want) {
		t.Fatalf("groups[1].tasks entry keys = %v, want %v", got, want)
	}
}

func TestGroupMTTasksByProfileDistinguishesLocalePairs(t *testing.T) {
	tasks := []Task{
		{EntryKey: "fr-0", ProfileName: "alpha", SourceLocale: "en", TargetLocale: "fr"},
		{EntryKey: "de-0", ProfileName: "alpha", SourceLocale: "en", TargetLocale: "de"},
		{EntryKey: "fr-1", ProfileName: "alpha", SourceLocale: "en", TargetLocale: "fr"},
	}

	groups := groupMTTasksByProfile(tasks)

	if len(groups) != 2 {
		t.Fatalf("groups=%d, want 2 (distinct target locales must not merge)", len(groups))
	}
	if got, want := entryKeys(groups[0].tasks), []string{"fr-0", "fr-1"}; !equalStrings(got, want) {
		t.Fatalf("groups[0].tasks entry keys = %v, want %v", got, want)
	}
	if got, want := entryKeys(groups[1].tasks), []string{"de-0"}; !equalStrings(got, want) {
		t.Fatalf("groups[1].tasks entry keys = %v, want %v", got, want)
	}
}

func TestGroupMTTasksByProfileEmptyInput(t *testing.T) {
	groups := groupMTTasksByProfile(nil)
	if len(groups) != 0 {
		t.Fatalf("groups=%d, want 0 for empty input", len(groups))
	}
}

func TestSplitMTBatchesBoundaryBehavior(t *testing.T) {
	tasks := tasksWithEntryKeys(3)
	batches := splitMTBatches(tasks, 2)
	if len(batches) != 2 {
		t.Fatalf("batches=%d, want 2", len(batches))
	}
	if got, want := entryKeys(batches[0]), []string{"t0", "t1"}; !equalStrings(got, want) {
		t.Fatalf("batches[0] entry keys = %v, want %v", got, want)
	}
	if got, want := entryKeys(batches[1]), []string{"t2"}; !equalStrings(got, want) {
		t.Fatalf("batches[1] entry keys = %v, want %v", got, want)
	}
}

func TestSplitMTBatchesExactMultiple(t *testing.T) {
	tasks := tasksWithEntryKeys(4)
	batches := splitMTBatches(tasks, 2)
	if len(batches) != 2 {
		t.Fatalf("batches=%d, want 2", len(batches))
	}
	for i, batch := range batches {
		if len(batch) != 2 {
			t.Fatalf("batches[%d] size=%d, want 2", i, len(batch))
		}
	}
	if got, want := entryKeys(batches[0]), []string{"t0", "t1"}; !equalStrings(got, want) {
		t.Fatalf("batches[0] entry keys = %v, want %v", got, want)
	}
	if got, want := entryKeys(batches[1]), []string{"t2", "t3"}; !equalStrings(got, want) {
		t.Fatalf("batches[1] entry keys = %v, want %v", got, want)
	}
}

func TestSplitMTBatchesEmptyInput(t *testing.T) {
	if batches := splitMTBatches(nil, 50); len(batches) != 0 {
		t.Fatalf("batches=%d, want 0 for empty input", len(batches))
	}
}

func TestSplitMTBatchesNonPositiveBatchSizeIsSingleBatch(t *testing.T) {
	tasks := tasksWithEntryKeys(5)
	batches := splitMTBatches(tasks, 0)
	if len(batches) != 1 {
		t.Fatalf("batches=%d, want 1 for non-positive batchSize", len(batches))
	}
	if got, want := entryKeys(batches[0]), entryKeys(tasks); !equalStrings(got, want) {
		t.Fatalf("batches[0] entry keys = %v, want %v", got, want)
	}
}

func TestSplitMTBatchesProductionSize(t *testing.T) {
	tasks := tasksWithEntryKeys(mtBatchSize + 1)
	batches := splitMTBatches(tasks, mtBatchSize)
	if len(batches) != 2 {
		t.Fatalf("batches=%d, want 2", len(batches))
	}
	if len(batches[0]) != mtBatchSize {
		t.Fatalf("batches[0] size=%d, want %d", len(batches[0]), mtBatchSize)
	}
	if len(batches[1]) != 1 {
		t.Fatalf("batches[1] size=%d, want 1", len(batches[1]))
	}
}

func tasksWithEntryKeys(n int) []Task {
	tasks := make([]Task, n)
	for i := range tasks {
		tasks[i] = Task{EntryKey: fmt.Sprintf("t%d", i)}
	}
	return tasks
}

func entryKeys(tasks []Task) []string {
	keys := make([]string, len(tasks))
	for i, task := range tasks {
		keys[i] = task.EntryKey
	}
	return keys
}

func equalStrings(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
