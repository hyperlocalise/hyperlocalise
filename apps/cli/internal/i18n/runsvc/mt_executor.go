package runsvc

import (
	"context"
	"errors"
	"fmt"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/translator"
	"github.com/hyperlocalise/hyperlocalise/internal/mt"
	config "github.com/hyperlocalise/hyperlocalise/pkg/i18nconfig"
)

// mtBatchSize is a provider-neutral run-service bound.
// Provider-specific batching remains inside internal/mt.
const mtBatchSize = 50

// mtBatchMaxAttempts bounds retries of a single mt.Engine.Translate call.
const mtBatchMaxAttempts = 3

type mtGroupKey struct {
	profileName  string
	sourceLocale string
	targetLocale string
}

type mtTaskGroup struct {
	key   mtGroupKey
	tasks []Task
}

func partitionMTTasks(tasks []Task) (llmTasks []Task, mtTasks []Task) {
	llmTasks = make([]Task, 0, len(tasks))
	mtTasks = make([]Task, 0)
	for _, task := range tasks {
		if task.TranslationType == config.TranslationTypeMT {
			mtTasks = append(mtTasks, task)
			continue
		}
		llmTasks = append(llmTasks, task)
	}
	return llmTasks, mtTasks
}

func groupMTTasksByProfile(tasks []Task) []mtTaskGroup {
	groups := make([]mtTaskGroup, 0)
	index := make(map[mtGroupKey]int, len(tasks))
	for _, task := range tasks {
		key := mtGroupKey{
			profileName:  task.ProfileName,
			sourceLocale: task.SourceLocale,
			targetLocale: task.TargetLocale,
		}
		i, ok := index[key]
		if !ok {
			i = len(groups)
			index[key] = i
			groups = append(groups, mtTaskGroup{key: key})
		}
		groups[i].tasks = append(groups[i].tasks, task)
	}
	return groups
}

func splitMTBatches(tasks []Task, batchSize int) [][]Task {
	if len(tasks) == 0 {
		return nil
	}
	if batchSize <= 0 {
		batchSize = len(tasks)
	}
	batches := make([][]Task, 0, (len(tasks)+batchSize-1)/batchSize)
	for start := 0; start < len(tasks); start += batchSize {
		end := start + batchSize
		if end > len(tasks) {
			end = len(tasks)
		}
		batches = append(batches, tasks[start:end])
	}
	return batches
}

func (s *Service) processMTBatch(ctx context.Context, engine mt.Engine, key mtGroupKey, batch []Task, completions chan<- taskCompletion, targetFailures chan<- string, state *executorState, emitter *eventEmitter) {
	if len(batch) == 0 {
		return
	}

	state.reportMu.Lock()
	startedSucceeded := state.report.Succeeded
	startedFailed := state.report.Failed
	state.reportMu.Unlock()
	for _, task := range batch {
		emitter.emit(Event{
			Kind:            EventTaskStart,
			TargetPath:      task.TargetPath,
			EntryKey:        task.EntryKey,
			Succeeded:       startedSucceeded,
			Failed:          startedFailed,
			ExecutableTotal: state.total,
		})
	}

	req := mt.Request{
		SourceLocale: key.sourceLocale,
		TargetLocale: key.targetLocale,
		Sources:      make([]string, len(batch)),
	}
	for i, task := range batch {
		req.Sources[i] = task.SourceText
	}

	resp, err := s.translateMTBatchWithRetry(ctx, engine, req)
	if err != nil {
		s.failMTBatch(ctx, batch, fmt.Errorf("mt batch translation failed for profile %q (%s -> %s): %w", key.profileName, key.sourceLocale, key.targetLocale, err), targetFailures, state, emitter)
		return
	}

	if len(resp.Translations) != len(batch) {
		mismatchErr := fmt.Errorf("mt: provider returned %d translations for %d source texts (profile %q, %s -> %s)", len(resp.Translations), len(batch), key.profileName, key.sourceLocale, key.targetLocale)
		s.failMTBatch(ctx, batch, mismatchErr, targetFailures, state, emitter)
		return
	}

	for i, task := range batch {
		translated := resp.Translations[i]
		if verr := validateTranslatedOutput(task, translated); verr != nil {
			s.failMTTask(ctx, task, verr, targetFailures, state, emitter)
			continue
		}
		if serr := stageTaskOutput(state.staged, task, translated, &state.stageMu); serr != nil {
			s.failMTTask(ctx, task, serr, targetFailures, state, emitter)
			continue
		}
		s.recordMTTaskSuccess(ctx, task, translated, state, emitter, completions)
	}
}

func (s *Service) recordMTTaskSuccess(ctx context.Context, task Task, value string, state *executorState, emitter *eventEmitter, completions chan<- taskCompletion) {
	completion := taskCompletion{
		identity:     preferredTaskIdentity(s.projectRoot, task.TargetPath, task.EntryKey),
		entryKey:     task.EntryKey,
		value:        value,
		sourceHash:   taskLockSourceHash(task),
		taskHash:     lockTaskHash(task),
		targetPath:   task.TargetPath,
		sourcePath:   task.SourcePath,
		targetLocale: task.TargetLocale,
	}
	select {
	case completions <- completion:
	case <-ctx.Done():
		return
	}

	usage := toRunTokenUsage(translator.Usage{})
	state.reportMu.Lock()
	state.report.Succeeded++
	state.report.TokenUsage = addTokenUsage(state.report.TokenUsage, usage)
	localeUsage := state.report.LocaleUsage[task.TargetLocale]
	state.report.LocaleUsage[task.TargetLocale] = addTokenUsage(localeUsage, usage)
	if !state.omitPerEntryBatches {
		state.report.Batches = append(state.report.Batches, BatchUsage{
			TargetLocale: task.TargetLocale,
			TargetPath:   task.TargetPath,
			EntryKey:     task.EntryKey,
			TokenUsage:   usage,
		})
	}
	succeeded := state.report.Succeeded
	failed := state.report.Failed
	tokenUsage := state.report.TokenUsage
	state.reportMu.Unlock()

	emitter.emit(eventWithTokenUsage(Event{
		Kind:            EventTaskDone,
		TaskSucceeded:   true,
		TargetPath:      task.TargetPath,
		EntryKey:        task.EntryKey,
		Succeeded:       succeeded,
		Failed:          failed,
		ExecutableTotal: state.total,
	}, tokenUsage))
}

func (s *Service) failMTTask(ctx context.Context, task Task, err error, targetFailures chan<- string, state *executorState, emitter *eventEmitter) {
	recordTaskFailure(&state.report, &state.reportMu, state.total, task, err, emitter)
	markTargetFailed(task.TargetPath, &state.pendingMu, state.failedTargets, targetFailures, ctx)
	if ferr := s.flushIfTargetCompleted(task.TargetPath, task.SourcePath, state); ferr != nil {
		recordTaskFailure(&state.report, &state.reportMu, state.total, task, ferr, emitter)
	}
}

func (s *Service) failMTBatch(ctx context.Context, batch []Task, err error, targetFailures chan<- string, state *executorState, emitter *eventEmitter) {
	for _, task := range batch {
		s.failMTTask(ctx, task, err, targetFailures, state, emitter)
	}
}

func (s *Service) translateMTBatchWithRetry(ctx context.Context, engine mt.Engine, req mt.Request) (mt.Response, error) {
	for attempt := 0; attempt < mtBatchMaxAttempts; attempt++ {
		resp, err := engine.Translate(ctx, req)
		if err == nil {
			return resp, nil
		}
		if !isRetryableMTError(err) || attempt+1 >= mtBatchMaxAttempts {
			return mt.Response{}, err
		}
		delay := translationRetryDelay(attempt)
		if waitErr := sleepWithContext(ctx, delay); waitErr != nil {
			return mt.Response{}, waitErr
		}
	}
	panic("unreachable")
}

// internal/mt has no timeout error code, so DeadlineExceeded is treated as
// the retryable timeout case.
func isRetryableMTError(err error) bool {
	if errors.Is(err, context.Canceled) {
		return false
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return true
	}
	if mtErr, ok := mt.AsError(err); ok {
		switch mtErr.Code {
		case mt.ErrorCodeRateLimited, mt.ErrorCodeUpstreamUnavailable:
			return true
		default: // ErrorCodeAuthFailed, ErrorCodeValidation, ErrorCodeUnsupportedLanguagePair, ErrorCodeUpstream
			return false
		}
	}
	return false
}

// runMTTasks executes MT groups and batches sequentially.
// batchSize is parameterized for deterministic batch-boundary tests.
func (s *Service) runMTTasks(ctx context.Context, tasks []Task, batchSize int, mtEngines *mtEngineFactory, completions chan<- taskCompletion, targetFailures chan<- string, state *executorState, emitter *eventEmitter) {
	if len(tasks) == 0 {
		return
	}
	if mtEngines == nil {
		s.failMTBatch(ctx, tasks, errors.New("mt: engine factory not initialized"), targetFailures, state, emitter)
		return
	}

	for _, group := range groupMTTasksByProfile(tasks) {
		if ctx.Err() != nil {
			return
		}
		engine, err := mtEngines.Engine(group.key.profileName)
		if err != nil {
			s.failMTBatch(ctx, group.tasks, fmt.Errorf("mt: resolve engine for profile %q: %w", group.key.profileName, err), targetFailures, state, emitter)
			continue
		}
		for _, batch := range splitMTBatches(group.tasks, batchSize) {
			if ctx.Err() != nil {
				return
			}
			s.processMTBatch(ctx, engine, group.key, batch, completions, targetFailures, state, emitter)
		}
	}
}
