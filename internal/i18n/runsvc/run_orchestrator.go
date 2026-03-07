package runsvc

import (
	"context"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/quiet-circles/hyperlocalise/internal/i18n/cache"
	"github.com/quiet-circles/hyperlocalise/internal/i18n/lockfile"
)

func (s *Service) Run(ctx context.Context, in Input) (Report, error) {
	emitter := newEventEmitter(in.OnEvent)
	defer emitter.close()
	emitter.emit(Event{Kind: EventPhase, Phase: PhasePlanning})

	cfg, err := s.loadConfig(in.ConfigPath)
	if err != nil {
		return Report{}, fmt.Errorf("load config: %w", err)
	}
	var cacheSvc *cache.Service
	if s.newCache != nil {
		var cacheErr error
		cacheSvc, cacheErr = s.newCache(cfg.Cache)
		if cacheErr != nil {
			return Report{}, fmt.Errorf("initialize cache service: %w", cacheErr)
		}
		defer func() {
			if cacheSvc != nil {
				_ = cacheSvc.Close()
			}
		}()
	}

	planned, err := s.planTasks(cfg, in.Bucket, in.Group, in.TargetLocales)
	if err != nil {
		return Report{}, err
	}
	legacyPromptWarnings := warningsForLegacyPrompts(planned)

	state, err := s.loadLock(in.LockPath)
	if err != nil {
		return Report{}, fmt.Errorf("load lock state: %w", err)
	}
	initializeLockState(state)

	activeRunID := ensureActiveRunID(state)
	report, executable, checkpointStaged, err := applyLockFilter(planned, state.RunCompleted, state.RunCheckpoint, activeRunID, in.Force)
	if err != nil {
		return Report{}, err
	}
	report.GeneratedAt = s.now()
	report.ConfigPath = in.ConfigPath
	report.Warnings = append(report.Warnings, legacyPromptWarnings...)
	if in.ExperimentalContextMemory {
		scope, maxChars, normalizeErr := normalizeContextMemoryOptions(in)
		if normalizeErr != nil {
			return report, normalizeErr
		}
		report.ContextMemoryEnabled = true
		report.ContextMemoryScope = scope
		in.ContextMemoryScope = scope
		in.ContextMemoryMaxChars = maxChars
	}
	emitter.emit(Event{Kind: EventPlanned, PlannedTotal: report.PlannedTotal, SkippedByLock: report.SkippedByLock, ExecutableTotal: report.ExecutableTotal})

	pruneTargets, err := s.collectPruneTargets(in, planned, &report, emitter)
	if err != nil {
		return report, err
	}

	if in.DryRun || (len(executable) == 0 && len(report.PruneCandidates) == 0 && len(checkpointStaged) == 0) {
		emitter.emit(completedEvent(report))
		return report, nil
	}

	contextPlan := contextMemoryPlan{}
	if in.ExperimentalContextMemory && len(executable) > 0 {
		emitter.emit(Event{Kind: EventPhase, Phase: PhaseContextMemory})
		contextPlan = buildContextMemoryPlan(executable, in.ContextMemoryScope, in.ContextMemoryMaxChars)
	}

	if len(executable) > 0 {
		emitter.emit(Event{Kind: EventPhase, Phase: PhaseExecuting})
		if state.ActiveRunID == "" {
			state.ActiveRunID = nextRunID(s.now())
			activeRunID = state.ActiveRunID
		}
	}
	var l1Cache cache.ExactCache
	if cacheSvc != nil {
		l1Cache = cacheSvc.L1
	}
	staged, flushedTargets, execReport, err := s.executePool(ctx, executable, checkpointStaged, in.LockPath, state, in.Workers, activeRunID, pruneTargets, contextPlan, l1Cache, emitter)
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
	flushWarnings, err := s.flushOutputs(staged, remainingPruneTargets(pruneTargets, flushedTargets))
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

func applyLockFilter(planned []Task, completed map[string]lockfile.RunCompletion, checkpoints map[string]lockfile.RunCheckpoint, activeRunID string, force bool) (Report, []Task, map[string]stagedOutput, error) {
	report := Report{PlannedTotal: len(planned)}
	executable := make([]Task, 0, len(planned))
	checkpointStaged := map[string]stagedOutput{}
	if force {
		report.Executable = append(report.Executable, planned...)
		report.ExecutableTotal = len(planned)
		return report, planned, checkpointStaged, nil
	}

	activeKeysByTarget := buildActiveKeysByTarget(planned)
	consumedLegacy := map[string]struct{}{}
	seenWarnings := map[string]struct{}{}

	for _, task := range planned {
		identity := taskIdentity(task.TargetPath, task.EntryKey)
		sourceHash := hashSourceText(task.SourceText)

		if cp, ok := checkpoints[identity]; ok && checkpointMatchesActiveRun(cp, activeRunID) && cp.SourceHash == sourceHash {
			if err := stageTaskOutput(checkpointStaged, task.TargetPath, task.SourcePath, task.SourceLocale, task.TargetLocale, task.EntryKey, cp.Value, nil); err != nil {
				return Report{}, nil, nil, fmt.Errorf("stage checkpoint output for %s: %w", identity, err)
			}
		}

		if c, ok := completed[identity]; ok && c.SourceHash == sourceHash {
			report.SkippedByLock++
			report.Skipped = append(report.Skipped, task)
			continue
		}

		legacyIdentity, conflictWarning := inferRenameLegacyIdentity(task, sourceHash, activeKeysByTarget, completed, checkpoints, activeRunID, consumedLegacy)
		if conflictWarning != "" {
			appendUniqueWarning(&report.Warnings, seenWarnings, conflictWarning)
		}
		if legacyIdentity != "" {
			appendUniqueWarning(&report.Warnings, seenWarnings, fmt.Sprintf(`key_rename target=%q old_key=%q new_key=%q`, task.TargetPath, entryKeyFromIdentity(legacyIdentity), task.EntryKey))
			if cp, ok := checkpoints[legacyIdentity]; ok && checkpointMatchesActiveRun(cp, activeRunID) && cp.SourceHash == sourceHash {
				if err := stageTaskOutput(checkpointStaged, task.TargetPath, task.SourcePath, task.SourceLocale, task.TargetLocale, task.EntryKey, cp.Value, nil); err != nil {
					return Report{}, nil, nil, fmt.Errorf("stage checkpoint output for %s (renamed from %s): %w", identity, legacyIdentity, err)
				}
				delete(checkpoints, legacyIdentity)
			}
			if c, ok := completed[legacyIdentity]; ok && c.SourceHash == sourceHash {
				completed[identity] = c
				delete(completed, legacyIdentity)
				report.SkippedByLock++
				report.Skipped = append(report.Skipped, task)
				continue
			}
		}

		report.Executable = append(report.Executable, task)
		executable = append(executable, task)
	}
	report.ExecutableTotal = len(executable)
	return report, executable, checkpointStaged, nil
}

func buildActiveKeysByTarget(tasks []Task) map[string]map[string]struct{} {
	active := make(map[string]map[string]struct{}, len(tasks))
	for _, task := range tasks {
		if _, ok := active[task.TargetPath]; !ok {
			active[task.TargetPath] = map[string]struct{}{}
		}
		active[task.TargetPath][task.EntryKey] = struct{}{}
	}
	return active
}

func inferRenameLegacyIdentity(task Task, sourceHash string, activeKeysByTarget map[string]map[string]struct{}, completed map[string]lockfile.RunCompletion, checkpoints map[string]lockfile.RunCheckpoint, activeRunID string, consumedLegacy map[string]struct{}) (legacyIdentity string, conflictWarning string) {
	candidates := make([]string, 0, 2)
	candidateSet := map[string]struct{}{}
	addCandidate := func(identity string) {
		if _, consumed := consumedLegacy[identity]; consumed {
			return
		}
		if _, exists := candidateSet[identity]; exists {
			return
		}
		candidateSet[identity] = struct{}{}
		candidates = append(candidates, identity)
	}

	for identity, completion := range completed {
		targetPath, entryKey, ok := splitTaskIdentity(identity)
		if !ok || targetPath != task.TargetPath {
			continue
		}
		if completion.SourceHash != sourceHash || entryKey == task.EntryKey {
			continue
		}
		if _, stillActive := activeKeysByTarget[task.TargetPath][entryKey]; stillActive {
			continue
		}
		addCandidate(identity)
	}
	for identity, checkpoint := range checkpoints {
		targetPath, entryKey, ok := splitTaskIdentity(identity)
		if !ok || targetPath != task.TargetPath {
			continue
		}
		if !checkpointMatchesActiveRun(checkpoint, activeRunID) || checkpoint.SourceHash != sourceHash || entryKey == task.EntryKey {
			continue
		}
		if _, stillActive := activeKeysByTarget[task.TargetPath][entryKey]; stillActive {
			continue
		}
		addCandidate(identity)
	}

	if len(candidates) == 1 {
		consumedLegacy[candidates[0]] = struct{}{}
		return candidates[0], ""
	}
	if len(candidates) > 1 {
		keys := make([]string, 0, len(candidates))
		for _, identity := range candidates {
			keys = append(keys, entryKeyFromIdentity(identity))
		}
		sort.Strings(keys)
		return "", fmt.Sprintf(`key_rename_conflict target=%q new_key=%q message="ambiguous rename candidates: %s"`, task.TargetPath, task.EntryKey, strings.Join(keys, ","))
	}
	return "", ""
}

func splitTaskIdentity(identity string) (targetPath, entryKey string, ok bool) {
	targetPath, entryKey, ok = strings.Cut(identity, "::")
	if !ok || strings.TrimSpace(targetPath) == "" || strings.TrimSpace(entryKey) == "" {
		return "", "", false
	}
	return targetPath, entryKey, true
}

func entryKeyFromIdentity(identity string) string {
	_, entryKey, ok := splitTaskIdentity(identity)
	if !ok {
		return ""
	}
	return entryKey
}

func appendUniqueWarning(warnings *[]string, seen map[string]struct{}, warning string) {
	if strings.TrimSpace(warning) == "" {
		return
	}
	if _, ok := seen[warning]; ok {
		return
	}
	seen[warning] = struct{}{}
	*warnings = append(*warnings, warning)
}

func ensureActiveRunID(state *lockfile.File) string {
	return state.ActiveRunID
}

func checkpointMatchesActiveRun(cp lockfile.RunCheckpoint, activeRunID string) bool {
	return activeRunID != "" && cp.RunID == activeRunID
}

func nextRunID(now time.Time) string {
	return "run_" + strconv.FormatInt(now.UnixNano(), 10)
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

func (s *Service) collectPruneTargets(in Input, planned []Task, report *Report, emitter *eventEmitter) (map[string]map[string]struct{}, error) {
	pruneTargets := map[string]map[string]struct{}{}
	if !in.Prune {
		return pruneTargets, nil
	}

	emitter.emit(Event{Kind: EventPhase, Phase: PhaseScanningPrune})
	pruneTargets = buildPlannedTargetKeySet(planned)
	candidates, err := s.planPruneCandidates(pruneTargets)
	if err != nil {
		return nil, err
	}
	report.PruneCandidates = candidates
	if err := validatePruneLimit(in, len(report.PruneCandidates)); err != nil {
		return nil, err
	}
	return pruneTargets, nil
}

func remainingPruneTargets(pruneTargets map[string]map[string]struct{}, flushedTargets map[string]struct{}) map[string]map[string]struct{} {
	remaining := map[string]map[string]struct{}{}
	for path, keep := range pruneTargets {
		if _, alreadyFlushed := flushedTargets[path]; alreadyFlushed {
			continue
		}
		remaining[path] = keep
	}
	return remaining
}

func completedEvent(report Report) Event {
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
		PromptTokens:     report.PromptTokens,
		CompletionTokens: report.CompletionTokens,
		TotalTokens:      report.TotalTokens,
	}
}
