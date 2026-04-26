package runsvc

import (
	"context"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/hyperlocalise/hyperlocalise/apps/cli/internal/i18n/lockfile"
	"go.opentelemetry.io/otel/attribute"
)

func (s *Service) Run(ctx context.Context, in Input) (report Report, err error) {
	reportJSONDetail, detailErr := NormalizeReportJSONDetail(in.ReportJSONDetail)
	if detailErr != nil {
		return Report{}, detailErr
	}
	summaryReportMode := reportJSONDetail == ReportJSONDetailSummary

	emitter := newEventEmitter(in.OnEvent)
	defer emitter.close()
	defer func() {
		if !summaryReportMode {
			materializeReportTaskPrompts(&report)
		}
	}()
	emitter.emit(Event{Kind: EventPhase, Phase: PhasePlanning})

	_, planSpan := startRunSpan(ctx, "run.plan")
	cfg, err := s.loadConfig(in.ConfigPath)
	if err != nil {
		endRunSpan(planSpan, err, "load_config")
		return Report{}, fmt.Errorf("load config: %w", err)
	}
	if cfg.Cache.Enabled {
		err = fmt.Errorf("remote cache client not yet implemented")
		endRunSpan(planSpan, err, "cache_unsupported")
		return Report{}, err
	}

	planned, planWarnings, err := s.planTasks(cfg, in.Bucket, in.Group, in.TargetLocales, in.SourcePaths, in.FixTargets, in.FixMarkdownScopes)
	if err != nil {
		endRunSpan(planSpan, err, "plan_tasks")
		return Report{}, err
	}
	legacyPromptWarnings := warningsForLegacyPrompts(planned)
	if in.ExperimentalContextMemory {
		scope, maxChars, normalizeErr := normalizeContextMemoryOptions(in)
		if normalizeErr != nil {
			endRunSpan(planSpan, normalizeErr, "context_memory_options")
			return Report{}, normalizeErr
		}
		reportScope := scope
		in.ContextMemoryScope = reportScope
		in.ContextMemoryMaxChars = maxChars
		assignContextKeys(planned, reportScope)
	}
	endRunSpan(planSpan, nil, "")

	_, lockSpan := startRunSpan(ctx, "run.lock")
	state, err := s.loadLock(in.LockPath)
	if err != nil {
		endRunSpan(lockSpan, err, "load_lock")
		return Report{}, fmt.Errorf("load lock state: %w", err)
	}
	initializeLockState(state)

	activeRunID := ensureActiveRunID(state)
	report, executable, checkpointStaged, lockMigrated, err := applyLockFilterWithReader(planned, state.RunCompleted, state.RunCheckpoint, activeRunID, in.Force, s.readFile)
	if err != nil {
		endRunSpan(lockSpan, err, "lock_filter")
		return Report{}, err
	}
	report.GeneratedAt = s.now()
	report.ConfigPath = in.ConfigPath
	report.Warnings = append(report.Warnings, planWarnings...)
	report.Warnings = append(report.Warnings, legacyPromptWarnings...)
	if in.ExperimentalContextMemory {
		report.ContextMemoryEnabled = true
		report.ContextMemoryScope = in.ContextMemoryScope
	}
	emitter.emit(Event{Kind: EventPlanned, PlannedTotal: report.PlannedTotal, SkippedByLock: report.SkippedByLock, ExecutableTotal: report.ExecutableTotal})
	lockSpan.SetAttributes(
		attribute.Int("run.planned_total", report.PlannedTotal),
		attribute.Int("run.skipped_by_lock", report.SkippedByLock),
		attribute.Int("run.executable_total", report.ExecutableTotal),
	)
	endRunSpan(lockSpan, nil, "")

	_, pruneSpan := startRunSpan(ctx, "run.prune")
	pruneTargets, pruneMetadata, err := s.collectPruneTargets(in, planned, &report, emitter)
	if err != nil {
		endRunSpan(pruneSpan, err, "prune_collect")
		return report, err
	}
	endRunSpan(pruneSpan, nil, "")

	if in.DryRun || (len(executable) == 0 && len(report.PruneCandidates) == 0 && len(checkpointStaged) == 0) {
		if !in.DryRun && lockMigrated {
			if err := s.saveLock(in.LockPath, *state); err != nil {
				return report, fmt.Errorf("persist lock migration: %w", err)
			}
		}
		emitter.emit(completedEvent(report))
		return report, nil
	}

	contextPlan := contextMemoryPlan{}
	if in.ExperimentalContextMemory && len(executable) > 0 {
		_, cmSpan := startRunSpan(ctx, "run.context_memory")
		emitter.emit(Event{Kind: EventPhase, Phase: PhaseContextMemory})
		contextPlan = buildContextMemoryPlan(executable, in.ContextMemoryScope, in.ContextMemoryMaxChars)
		endRunSpan(cmSpan, nil, "")
	}

	if len(executable) > 0 {
		emitter.emit(Event{Kind: EventPhase, Phase: PhaseExecuting})
		if state.ActiveRunID == "" {
			state.ActiveRunID = nextRunID(s.now())
			activeRunID = state.ActiveRunID
		}
	}
	parityRetry := &markdownParityRetryInput{
		cfg:           cfg,
		bucket:        in.Bucket,
		group:         in.Group,
		targetLocales: in.TargetLocales,
		sourcePaths:   in.SourcePaths,
	}
	execCtx, execSpan := startRunSpan(ctx, "run.execute_pool")
	execSpan.SetAttributes(attribute.Int("run.workers", in.Workers))
	staged, flushedTargets, execReport, err := s.executePool(execCtx, executable, checkpointStaged, in.LockPath, state, in.Workers, activeRunID, pruneTargets, contextPlan, emitter, summaryReportMode, parityRetry)
	endRunSpan(execSpan, err, "execute_pool")
	report.Succeeded = execReport.Succeeded
	report.Failed = execReport.Failed
	report.PersistedToLock = execReport.PersistedToLock
	report.TokenUsage = addTokenUsage(report.TokenUsage, execReport.TokenUsage)
	report.LocaleUsage = mergeLocaleUsage(report.LocaleUsage, execReport.LocaleUsage)
	report.Batches = execReport.Batches
	report.Failures = append(report.Failures, execReport.Failures...)
	report.ContextMemoryGenerated = execReport.ContextMemoryGenerated
	report.ContextMemoryFallbackGroups = execReport.ContextMemoryFallbackGroups
	report.Warnings = append(report.Warnings, execReport.Warnings...)
	if err != nil {
		emitter.emit(completedEvent(report))
		return report, err
	}

	emitter.emit(Event{Kind: EventPhase, Phase: PhaseFinalizingOutput})
	remainingPruneTargets, remainingPruneMetadata := remainingPruneTargets(pruneTargets, pruneMetadata, flushedTargets)
	_, outSpan := startRunSpan(ctx, "run.output")
	flushWarnings, err := s.flushOutputs(ctx, parityRetry, staged, remainingPruneTargets, remainingPruneMetadata)
	endRunSpan(outSpan, err, "flush_output")
	report.Warnings = append(report.Warnings, flushWarnings...)
	if err != nil {
		emitter.emit(completedEvent(report))
		return report, err
	}
	if err := s.clearRunCheckpoints(in.LockPath, state); err != nil {
		emitter.emit(completedEvent(report))
		return report, err
	}

	report.PruneApplied = len(report.PruneCandidates)
	emitter.emit(completedEvent(report))
	return report, nil
}

func warningsForLegacyPrompts(tasks []Task) []string {
	seenProfiles := map[string]struct{}{}
	for _, task := range tasks {
		if !task.LegacyPrompt {
			continue
		}
		if strings.TrimSpace(task.ProfileName) == "" {
			continue
		}
		seenProfiles[task.ProfileName] = struct{}{}
	}
	if len(seenProfiles) == 0 {
		return nil
	}

	profiles := make([]string, 0, len(seenProfiles))
	for profileName := range seenProfiles {
		profiles = append(profiles, profileName)
	}
	sort.Strings(profiles)

	warnings := make([]string, 0, len(profiles))
	for _, profileName := range profiles {
		warnings = append(warnings, fmt.Sprintf(
			`legacy_prompt profile=%s message="llm.profiles.%s.prompt is deprecated; migrate to system_prompt and user_prompt"`,
			profileName,
			profileName,
		))
	}
	return warnings
}

func initializeLockState(state *lockfile.File) {
	if state.RunCompleted == nil {
		state.RunCompleted = map[string]lockfile.RunCompletion{}
	}
	if state.RunCheckpoint == nil {
		state.RunCheckpoint = map[string]lockfile.RunCheckpoint{}
	}
}

func applyLockFilter(planned []Task, completed map[string]lockfile.RunCompletion, checkpoints map[string]lockfile.RunCheckpoint, activeRunID string, force bool) (Report, []Task, map[string]stagedOutput, bool, error) {
	return applyLockFilterWithReader(planned, completed, checkpoints, activeRunID, force, nil)
}

func applyLockFilterWithReader(planned []Task, completed map[string]lockfile.RunCompletion, checkpoints map[string]lockfile.RunCheckpoint, activeRunID string, force bool, readFile func(string) ([]byte, error)) (Report, []Task, map[string]stagedOutput, bool, error) {
	report := Report{PlannedTotal: len(planned)}
	executable := make([]Task, 0, len(planned))
	checkpointStaged := map[string]stagedOutput{}
	lockMigrated := false
	if force {
		report.Executable = append(report.Executable, planned...)
		report.ExecutableTotal = len(planned)
		return report, planned, checkpointStaged, lockMigrated, nil
	}

	for _, task := range planned {
		identity := taskIdentity(task.TargetPath, task.EntryKey)
		sourceHash := taskLockSourceHash(task)
		taskHash := lockTaskHash(task)
		legacyTaskHash := legacyDefaultLockTaskHash(task)
		if cp, ok := checkpoints[identity]; ok && checkpointMatchesActiveRun(cp, activeRunID) && checkpointMatchesTask(cp, sourceHash, taskHash, legacyTaskHash) {
			if strings.TrimSpace(cp.TaskHash) == "" {
				cp.TaskHash = taskHash
				checkpoints[identity] = cp
				lockMigrated = true
			}
			var stageErr error
			if isImageTask(task) {
				content, err := readImageCheckpointContent(cp.Value, task.TargetPath, readFile)
				if err != nil {
					if isImageCheckpointHash(cp.Value) {
						report.Executable = append(report.Executable, task)
						executable = append(executable, task)
						continue
					}
					return Report{}, nil, nil, false, fmt.Errorf("stage checkpoint output for %s: %w", identity, err)
				}
				stageErr = stageImageOutput(checkpointStaged, task.TargetPath, task.SourcePath, task.SourceLocale, task.TargetLocale, content, nil)
			} else {
				stageErr = stageTaskOutput(checkpointStaged, task.TargetPath, task.SourcePath, task.SourceLocale, task.TargetLocale, task.EntryKey, cp.Value, nil)
			}
			if stageErr != nil {
				return Report{}, nil, nil, false, fmt.Errorf("stage checkpoint output for %s: %w", identity, stageErr)
			}
		}
		if c, ok := completed[identity]; ok && completionMatchesTask(c, sourceHash, taskHash, legacyTaskHash) {
			if strings.TrimSpace(c.TaskHash) == "" {
				c.TaskHash = taskHash
				completed[identity] = c
				lockMigrated = true
			}
			report.SkippedByLock++
			report.Skipped = append(report.Skipped, task)
			continue
		}
		report.Executable = append(report.Executable, task)
		executable = append(executable, task)
	}
	report.ExecutableTotal = len(executable)
	return report, executable, checkpointStaged, lockMigrated, nil
}

func taskLockSourceHash(task Task) string {
	if isImageTask(task) {
		return strings.TrimSpace(task.sourceFingerprint)
	}
	return lockStoredFingerprint(task.SourceText)
}

func ensureActiveRunID(state *lockfile.File) string {
	return state.ActiveRunID
}

func checkpointMatchesActiveRun(cp lockfile.RunCheckpoint, activeRunID string) bool {
	return activeRunID != "" && cp.RunID == activeRunID
}

func completionMatchesTask(completion lockfile.RunCompletion, sourceHash, taskHash, legacyTaskHash string) bool {
	if strings.TrimSpace(completion.TaskHash) != "" {
		return lockFingerprintEqual(completion.TaskHash, taskHash) ||
			lockFingerprintEqual(completion.TaskHash, legacyTaskHash)
	}
	return lockFingerprintEqual(completion.SourceHash, sourceHash)
}

func checkpointMatchesTask(checkpoint lockfile.RunCheckpoint, sourceHash, taskHash, legacyTaskHash string) bool {
	if strings.TrimSpace(checkpoint.TaskHash) != "" {
		return lockFingerprintEqual(checkpoint.TaskHash, taskHash) ||
			lockFingerprintEqual(checkpoint.TaskHash, legacyTaskHash)
	}
	return lockFingerprintEqual(checkpoint.SourceHash, sourceHash)
}

func nextRunID(now time.Time) string {
	return "run_" + strconv.FormatInt(now.UnixNano(), 10)
}

func assignContextKeys(tasks []Task, scope string) {
	for i := range tasks {
		tasks[i].ContextKey = contextMemoryKey(tasks[i], scope)
	}
}

func (s *Service) clearRunCheckpoints(lockPath string, state *lockfile.File) error {
	if len(state.RunCheckpoint) == 0 && state.ActiveRunID == "" {
		return nil
	}
	state.RunCheckpoint = map[string]lockfile.RunCheckpoint{}
	state.ActiveRunID = ""
	if err := s.saveLock(lockPath, *state); err != nil {
		return fmt.Errorf("clear run checkpoints: %w", err)
	}
	return nil
}

func (s *Service) collectPruneTargets(in Input, planned []Task, report *Report, emitter *eventEmitter) (map[string]map[string]struct{}, map[string]stagedOutput, error) {
	pruneTargets := map[string]map[string]struct{}{}
	pruneMetadata := map[string]stagedOutput{}
	if !in.Prune {
		return pruneTargets, pruneMetadata, nil
	}

	emitter.emit(Event{Kind: EventPhase, Phase: PhaseScanningPrune})
	var err error
	pruneMetadata, err = buildPlannedTargetMetadata(planned)
	if err != nil {
		return nil, nil, err
	}
	pruneTargets = buildPlannedTargetKeySet(planned)
	candidates, err := s.planPruneCandidates(pruneTargets)
	if err != nil {
		return nil, nil, err
	}
	report.PruneCandidates = candidates
	if err := validatePruneLimit(in, len(report.PruneCandidates)); err != nil {
		return nil, nil, err
	}
	return pruneTargets, pruneMetadata, nil
}

func remainingPruneTargets(pruneTargets map[string]map[string]struct{}, pruneMetadata map[string]stagedOutput, flushedTargets map[string]struct{}) (map[string]map[string]struct{}, map[string]stagedOutput) {
	remaining := map[string]map[string]struct{}{}
	remainingMetadata := map[string]stagedOutput{}
	for path, keep := range pruneTargets {
		if _, alreadyFlushed := flushedTargets[path]; alreadyFlushed {
			continue
		}
		remaining[path] = keep
		if metadata, ok := pruneMetadata[path]; ok {
			remainingMetadata[path] = metadata
		}
	}
	return remaining, remainingMetadata
}

func completedEvent(report Report) Event {
	usage := NormalizeTokenUsage(report.TokenUsage)
	return Event{
		Kind:             EventCompleted,
		PlannedTotal:     report.PlannedTotal,
		SkippedByLock:    report.SkippedByLock,
		ExecutableTotal:  report.ExecutableTotal,
		Succeeded:        report.Succeeded,
		Failed:           report.Failed,
		PersistedToLock:  report.PersistedToLock,
		PruneCandidates:  len(report.PruneCandidates),
		PruneApplied:     report.PruneApplied,
		PromptTokens:     usage.PromptTokens,
		CompletionTokens: usage.CompletionTokens,
		TotalTokens:      usage.TotalTokens,
	}
}
