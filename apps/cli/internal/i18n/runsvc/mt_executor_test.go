package runsvc

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/hyperlocalise/hyperlocalise/internal/mt"
	config "github.com/hyperlocalise/hyperlocalise/pkg/i18nconfig"
)

type scriptedMTResult struct {
	resp mt.Response
	err  error
}

// scriptedMTEngine consumes scripted results in order, then echoes sources
// when results are exhausted.
type scriptedMTEngine struct {
	mu      sync.Mutex
	calls   []mt.Request
	results []scriptedMTResult
}

func (e *scriptedMTEngine) Translate(_ context.Context, req mt.Request) (mt.Response, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	i := len(e.calls)
	e.calls = append(e.calls, req)
	if i < len(e.results) {
		return e.results[i].resp, e.results[i].err
	}
	return mt.Response{Translations: append([]string(nil), req.Sources...)}, nil
}

func (e *scriptedMTEngine) callCount() int {
	e.mu.Lock()
	defer e.mu.Unlock()
	return len(e.calls)
}

func (e *scriptedMTEngine) requestAt(i int) mt.Request {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.calls[i]
}

func newMTBatchTestState(t *testing.T, tasks []Task) *executorState {
	t.Helper()
	state, err := newExecutorState(tasks, "", map[string]stagedOutput{}, nil, contextMemoryPlan{}, false)
	if err != nil {
		t.Fatalf("newExecutorState: %v", err)
	}
	return state
}

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

func TestProcessMTBatchOrderedResultsAndBatchBoundary(t *testing.T) {
	tasks := make([]Task, 3)
	for i := range tasks {
		tasks[i] = Task{
			EntryKey:     fmt.Sprintf("k%d", i),
			TargetPath:   "out.json",
			SourcePath:   "in.json",
			SourceLocale: "en",
			TargetLocale: "fr",
			ProfileName:  "p1",
			SourceText:   fmt.Sprintf("hello %d", i),
		}
	}
	key := mtGroupKey{profileName: "p1", sourceLocale: "en", targetLocale: "fr"}
	batches := splitMTBatches(tasks, 2)
	if len(batches) != 2 {
		t.Fatalf("test setup: batches=%d, want 2", len(batches))
	}

	svc := newTestService()
	state := newMTBatchTestState(t, tasks)
	emitter := newEventEmitter(func(Event) {})
	completions := make(chan taskCompletion, len(tasks))
	targetFailures := make(chan string, 1)
	engine := &scriptedMTEngine{}

	for _, batch := range batches {
		svc.processMTBatch(context.Background(), engine, key, batch, completions, targetFailures, state, emitter)
	}
	emitter.close()
	close(completions)

	if got := engine.callCount(); got != 2 {
		t.Fatalf("engine.Translate call count=%d, want 2", got)
	}
	if got := len(engine.requestAt(0).Sources); got != 2 {
		t.Fatalf("first call Sources length=%d, want 2", got)
	}
	if got := len(engine.requestAt(1).Sources); got != 1 {
		t.Fatalf("second call Sources length=%d, want 1", got)
	}

	gotByKey := map[string]string{}
	for c := range completions {
		gotByKey[c.entryKey] = c.value
	}
	for i, task := range tasks {
		want := fmt.Sprintf("hello %d", i) // scriptedMTEngine's default echoes sources back
		if got := gotByKey[task.EntryKey]; got != want {
			t.Fatalf("completion value for %q = %q, want %q", task.EntryKey, got, want)
		}
	}

	if state.report.Succeeded != 3 {
		t.Fatalf("report.Succeeded=%d, want 3", state.report.Succeeded)
	}
	staged := state.staged["out.json"]
	for i, task := range tasks {
		want := fmt.Sprintf("hello %d", i)
		if got := staged.entries[task.EntryKey]; got != want {
			t.Fatalf("staged entry for %q = %q, want %q", task.EntryKey, got, want)
		}
	}
}

func TestProcessMTBatchResponseCountMismatchFailsWholeBatchWithoutStaging(t *testing.T) {
	tasks := []Task{
		{EntryKey: "k0", TargetPath: "out.json", SourcePath: "in.json", SourceLocale: "en", TargetLocale: "fr", ProfileName: "p1", SourceText: "hello"},
		{EntryKey: "k1", TargetPath: "out.json", SourcePath: "in.json", SourceLocale: "en", TargetLocale: "fr", ProfileName: "p1", SourceText: "world"},
	}
	key := mtGroupKey{profileName: "p1", sourceLocale: "en", targetLocale: "fr"}

	svc := newTestService()
	state := newMTBatchTestState(t, tasks)
	var mu sync.Mutex
	var events []Event
	emitter := newEventEmitter(func(ev Event) {
		mu.Lock()
		defer mu.Unlock()
		events = append(events, ev)
	})
	completions := make(chan taskCompletion, len(tasks))
	targetFailures := make(chan string, 1)
	engine := &scriptedMTEngine{results: []scriptedMTResult{
		{resp: mt.Response{Translations: []string{"only-one"}}}, // 1 translation for 2 sources
	}}

	svc.processMTBatch(context.Background(), engine, key, tasks, completions, targetFailures, state, emitter)
	emitter.close()
	close(completions)

	if got := engine.callCount(); got != 1 {
		t.Fatalf("engine.Translate call count=%d, want 1 (no retry at this layer)", got)
	}
	if len(completions) != 0 {
		t.Fatalf("completions channel got %d sends, want 0 (no misaligned results written)", len(completions))
	}
	if staged, ok := state.staged["out.json"]; ok && len(staged.entries) != 0 {
		t.Fatalf("staged entries=%v, want none", staged.entries)
	}
	if state.report.Failed != len(tasks) {
		t.Fatalf("report.Failed=%d, want %d", state.report.Failed, len(tasks))
	}
	if state.report.Succeeded != 0 {
		t.Fatalf("report.Succeeded=%d, want 0", state.report.Succeeded)
	}

	mu.Lock()
	failedDone := 0
	for _, ev := range events {
		if ev.Kind == EventTaskDone && !ev.TaskSucceeded {
			failedDone++
		}
	}
	mu.Unlock()
	if failedDone != len(tasks) {
		t.Fatalf("failed EventTaskDone count=%d, want %d", failedDone, len(tasks))
	}

	select {
	case tp := <-targetFailures:
		if tp != "out.json" {
			t.Fatalf("targetFailures got %q, want out.json", tp)
		}
	default:
		t.Fatalf("expected a targetFailures signal for out.json")
	}
}

func TestProcessMTBatchPartialValidationFailureAllowsSiblingsToSucceed(t *testing.T) {
	tasks := []Task{
		{EntryKey: "good0", TargetPath: "out.json", SourcePath: "in.json", SourceLocale: "en", TargetLocale: "fr", ProfileName: "p1", SourceText: "hello"},
		{EntryKey: "bad1", TargetPath: "out.json", SourcePath: "in.json", SourceLocale: "en", TargetLocale: "fr", ProfileName: "p1", SourceText: "Hello {name}"},
		{EntryKey: "good2", TargetPath: "out.json", SourcePath: "in.json", SourceLocale: "en", TargetLocale: "fr", ProfileName: "p1", SourceText: "world"},
	}
	key := mtGroupKey{profileName: "p1", sourceLocale: "en", targetLocale: "fr"}

	svc := newTestService()
	state := newMTBatchTestState(t, tasks)
	emitter := newEventEmitter(func(Event) {})
	completions := make(chan taskCompletion, len(tasks))
	targetFailures := make(chan string, 1)
	// bad1 changes the ICU placeholder, triggering placeholder-parity validation.
	engine := &scriptedMTEngine{results: []scriptedMTResult{
		{resp: mt.Response{Translations: []string{"bonjour", "Hi {user}", "monde"}}},
	}}

	svc.processMTBatch(context.Background(), engine, key, tasks, completions, targetFailures, state, emitter)
	emitter.close()
	close(completions)

	if got := engine.callCount(); got != 1 {
		t.Fatalf("engine.Translate call count=%d, want 1 (no retry for a validation failure)", got)
	}
	if state.report.Succeeded != 2 {
		t.Fatalf("report.Succeeded=%d, want 2", state.report.Succeeded)
	}
	if state.report.Failed != 1 {
		t.Fatalf("report.Failed=%d, want 1", state.report.Failed)
	}
	if len(state.report.Failures) != 1 || state.report.Failures[0].EntryKey != "bad1" {
		t.Fatalf("report.Failures=%+v, want exactly one failure for bad1", state.report.Failures)
	}

	gotByKey := map[string]string{}
	for c := range completions {
		gotByKey[c.entryKey] = c.value
	}
	if got, want := gotByKey["good0"], "bonjour"; got != want {
		t.Fatalf("completion for good0=%q, want %q", got, want)
	}
	if got, want := gotByKey["good2"], "monde"; got != want {
		t.Fatalf("completion for good2=%q, want %q", got, want)
	}
	if _, ok := gotByKey["bad1"]; ok {
		t.Fatalf("bad1 must not be staged/completed")
	}

	staged := state.staged["out.json"]
	if _, ok := staged.entries["bad1"]; ok {
		t.Fatalf("bad1 must not appear in staged output")
	}
	if staged.entries["good0"] != "bonjour" || staged.entries["good2"] != "monde" {
		t.Fatalf("staged entries=%v, want good0/good2 only", staged.entries)
	}
}

func TestIsRetryableMTError(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want bool
	}{
		{"rate_limited", &mt.Error{Code: mt.ErrorCodeRateLimited}, true},
		{"upstream_unavailable", &mt.Error{Code: mt.ErrorCodeUpstreamUnavailable}, true},
		{"deadline_exceeded", context.DeadlineExceeded, true},
		{"auth_failed", &mt.Error{Code: mt.ErrorCodeAuthFailed}, false},
		{"validation", &mt.Error{Code: mt.ErrorCodeValidation}, false},
		{"unsupported_language_pair", &mt.Error{Code: mt.ErrorCodeUnsupportedLanguagePair}, false},
		{"generic_upstream", &mt.Error{Code: mt.ErrorCodeUpstream}, false},
		{"canceled", context.Canceled, false},
		{"unclassified", errors.New("boom"), false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := isRetryableMTError(tt.err); got != tt.want {
				t.Fatalf("isRetryableMTError(%v) = %v, want %v", tt.err, got, tt.want)
			}
		})
	}
}

func TestTranslateMTBatchWithRetryRetrySucceeds(t *testing.T) {
	originalSleep := sleepWithContext
	t.Cleanup(func() { sleepWithContext = originalSleep })
	sleepCalls := 0
	sleepWithContext = func(_ context.Context, _ time.Duration) error {
		sleepCalls++
		return nil
	}

	engine := &scriptedMTEngine{results: []scriptedMTResult{
		{err: &mt.Error{Code: mt.ErrorCodeRateLimited, Message: "slow down"}},
	}}
	svc := newTestService()
	req := mt.Request{SourceLocale: "en", TargetLocale: "fr", Sources: []string{"hello"}}

	resp, err := svc.translateMTBatchWithRetry(context.Background(), engine, req)
	if err != nil {
		t.Fatalf("translateMTBatchWithRetry: %v", err)
	}
	if got := engine.callCount(); got != 2 {
		t.Fatalf("engine.Translate call count=%d, want 2", got)
	}
	if sleepCalls != 1 {
		t.Fatalf("sleepWithContext calls=%d, want 1", sleepCalls)
	}
	if len(resp.Translations) != 1 || resp.Translations[0] != "hello" {
		t.Fatalf("resp=%+v, want the echoed source from the second (successful) call", resp)
	}
}

func TestTranslateMTBatchWithRetryExhaustsRetries(t *testing.T) {
	originalSleep := sleepWithContext
	t.Cleanup(func() { sleepWithContext = originalSleep })
	sleepCalls := 0
	sleepWithContext = func(_ context.Context, _ time.Duration) error {
		sleepCalls++
		return nil
	}

	persistentErr := &mt.Error{Code: mt.ErrorCodeUpstreamUnavailable, Message: "down"}
	engine := &scriptedMTEngine{results: []scriptedMTResult{
		{err: persistentErr},
		{err: persistentErr},
		{err: persistentErr},
	}}
	svc := newTestService()
	req := mt.Request{SourceLocale: "en", TargetLocale: "fr", Sources: []string{"hello"}}

	_, err := svc.translateMTBatchWithRetry(context.Background(), engine, req)
	if err == nil {
		t.Fatal("expected error after exhausting retries")
	}
	if got := engine.callCount(); got != mtBatchMaxAttempts {
		t.Fatalf("engine.Translate call count=%d, want %d", got, mtBatchMaxAttempts)
	}
	if sleepCalls != mtBatchMaxAttempts-1 {
		t.Fatalf("sleepWithContext calls=%d, want %d", sleepCalls, mtBatchMaxAttempts-1)
	}
	var mtErr *mt.Error
	if !errors.As(err, &mtErr) {
		t.Fatalf("error type=%T, want it to unwrap to *mt.Error via errors.As", err)
	}
	if mtErr.Code != mt.ErrorCodeUpstreamUnavailable {
		t.Fatalf("mtErr.Code=%q, want %q", mtErr.Code, mt.ErrorCodeUpstreamUnavailable)
	}
}

func TestTranslateMTBatchWithRetryNonRetryableErrorReturnsImmediately(t *testing.T) {
	originalSleep := sleepWithContext
	t.Cleanup(func() { sleepWithContext = originalSleep })
	sleepWithContext = func(_ context.Context, _ time.Duration) error {
		t.Fatal("sleepWithContext should not be called for a non-retryable error")
		return nil
	}

	engine := &scriptedMTEngine{results: []scriptedMTResult{
		{err: &mt.Error{Code: mt.ErrorCodeAuthFailed, Message: "bad key"}},
	}}
	svc := newTestService()
	req := mt.Request{SourceLocale: "en", TargetLocale: "fr", Sources: []string{"hello"}}

	_, err := svc.translateMTBatchWithRetry(context.Background(), engine, req)
	if err == nil {
		t.Fatal("expected error")
	}
	if got := engine.callCount(); got != 1 {
		t.Fatalf("engine.Translate call count=%d, want 1 (non-retryable errors must not retry)", got)
	}
	var mtErr *mt.Error
	if !errors.As(err, &mtErr) || mtErr.Code != mt.ErrorCodeAuthFailed {
		t.Fatalf("err=%v, want it to unwrap to *mt.Error{Code: ErrorCodeAuthFailed}", err)
	}
}

func TestProcessMTBatchNonRetryableErrorFailsImmediatelyPreservingErrorCode(t *testing.T) {
	originalSleep := sleepWithContext
	t.Cleanup(func() { sleepWithContext = originalSleep })
	sleepWithContext = func(_ context.Context, _ time.Duration) error {
		t.Fatal("sleepWithContext should not be called for a non-retryable error")
		return nil
	}

	tasks := []Task{
		{EntryKey: "k0", TargetPath: "out.json", SourcePath: "in.json", SourceLocale: "en", TargetLocale: "fr", ProfileName: "p1", SourceText: "hello"},
	}
	key := mtGroupKey{profileName: "p1", sourceLocale: "en", targetLocale: "fr"}
	svc := newTestService()
	state := newMTBatchTestState(t, tasks)
	emitter := newEventEmitter(func(Event) {})
	completions := make(chan taskCompletion, 1)
	targetFailures := make(chan string, 1)
	engine := &scriptedMTEngine{results: []scriptedMTResult{
		{err: &mt.Error{Code: mt.ErrorCodeAuthFailed, Message: "bad key"}},
	}}

	svc.processMTBatch(context.Background(), engine, key, tasks, completions, targetFailures, state, emitter)
	emitter.close()

	if got := engine.callCount(); got != 1 {
		t.Fatalf("engine.Translate call count=%d, want 1", got)
	}
	if state.report.Failed != 1 || state.report.Succeeded != 0 {
		t.Fatalf("report.Failed=%d report.Succeeded=%d, want 1/0", state.report.Failed, state.report.Succeeded)
	}
	if len(state.report.Failures) != 1 {
		t.Fatalf("report.Failures=%+v, want exactly one entry", state.report.Failures)
	}
	if !strings.Contains(state.report.Failures[0].Reason, string(mt.ErrorCodeAuthFailed)) {
		t.Fatalf("failure reason=%q, want it to preserve the mt error code %q", state.report.Failures[0].Reason, mt.ErrorCodeAuthFailed)
	}
}

// blockingMTEngine blocks Translate until cancelled or explicitly unblocked.
type blockingMTEngine struct {
	unblock chan struct{}
	calls   atomic.Int32
}

func (e *blockingMTEngine) Translate(ctx context.Context, req mt.Request) (mt.Response, error) {
	e.calls.Add(1)
	select {
	case <-ctx.Done():
		return mt.Response{}, ctx.Err()
	case <-e.unblock:
		return mt.Response{Translations: append([]string(nil), req.Sources...)}, nil
	}
}

func TestTranslateMTBatchWithRetryCancellationDuringInFlightRequest(t *testing.T) {
	engine := &blockingMTEngine{unblock: make(chan struct{})}
	defer close(engine.unblock)
	ctx, cancel := context.WithCancel(context.Background())
	req := mt.Request{SourceLocale: "en", TargetLocale: "fr", Sources: []string{"hello"}}

	svc := newTestService()
	done := make(chan struct{})
	var err error
	go func() {
		_, err = svc.translateMTBatchWithRetry(ctx, engine, req)
		close(done)
	}()

	cancel()

	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("translateMTBatchWithRetry did not return promptly after cancellation")
	}
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("err=%v, want context.Canceled", err)
	}
	if got := engine.calls.Load(); got != 1 {
		t.Fatalf("engine.Translate call count=%d, want 1 (a cancelled in-flight request must not be retried)", got)
	}
}

func TestTranslateMTBatchWithRetryCancellationDuringBackoffSleep(t *testing.T) {
	originalSleep := sleepWithContext
	t.Cleanup(func() { sleepWithContext = originalSleep })
	ctx, cancel := context.WithCancel(context.Background())
	sleepWithContext = func(sleepCtx context.Context, _ time.Duration) error {
		cancel() // simulate cancellation arriving while backoff is in progress
		<-sleepCtx.Done()
		return sleepCtx.Err()
	}

	engine := &scriptedMTEngine{results: []scriptedMTResult{
		{err: &mt.Error{Code: mt.ErrorCodeRateLimited, Message: "slow down"}},
	}}
	svc := newTestService()
	req := mt.Request{SourceLocale: "en", TargetLocale: "fr", Sources: []string{"hello"}}

	_, err := svc.translateMTBatchWithRetry(ctx, engine, req)
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("err=%v, want context.Canceled", err)
	}
	if got := engine.callCount(); got != 1 {
		t.Fatalf("engine.Translate call count=%d, want 1 (must not retry after the backoff sleep was cancelled)", got)
	}
}
