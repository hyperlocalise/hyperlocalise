package runsvc

import (
	"fmt"
	"maps"
	"os"
	"slices"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/apps/cli/internal/i18n/lockfile"
	"github.com/hyperlocalise/hyperlocalise/apps/cli/internal/i18n/pathresolver"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/srx"
	config "github.com/hyperlocalise/hyperlocalise/pkg/i18nconfig"
)

func isCopyTask(task Task) bool {
	return task.TranslationType == config.TranslationTypeCopy
}

func splitCopyTasks(tasks []Task) (copyTasks, other []Task) {
	copyTasks = make([]Task, 0)
	other = make([]Task, 0, len(tasks))
	for _, task := range tasks {
		if isCopyTask(task) {
			copyTasks = append(copyTasks, task)
			continue
		}
		other = append(other, task)
	}
	return copyTasks, other
}

func (s *Service) assignLocaleCopy(cfg *config.I18NConfig, task *Task, file config.BucketFileMapping, sourcePattern, sourcePath string) error {
	origin, ok := cfg.Locales.CopyOrigin(task.TargetLocale)
	if !ok {
		return nil
	}

	originPath, err := s.localeCopyOriginPath(cfg, file, sourcePattern, sourcePath, origin)
	if err != nil {
		return fmt.Errorf("planning tasks: resolve copy origin path for locale %q: %w", task.TargetLocale, err)
	}
	if err := s.validateProjectPath(originPath); err != nil {
		return fmt.Errorf("planning tasks: copy origin path %q: %w", originPath, err)
	}
	if originPath == task.TargetPath {
		return fmt.Errorf("planning tasks: locale copy %q cannot share target path %q with origin %q", task.TargetLocale, task.TargetPath, origin)
	}

	task.CopyFrom = origin
	task.copyFromTargetPath = originPath
	task.TranslationType = config.TranslationTypeCopy
	task.ProfileName = ""
	task.Provider = ""
	task.Model = ""
	task.PromptVersion = ""
	task.ContextProvider = ""
	task.ContextModel = ""
	task.LegacyPrompt = false
	task.PromptLegacyTemplate = ""
	task.PromptSystemTemplate = ""
	task.PromptUserTemplate = ""
	return nil
}

func (s *Service) localeCopyOriginPath(cfg *config.I18NConfig, file config.BucketFileMapping, sourcePattern, sourcePath, origin string) (string, error) {
	if origin == cfg.Locales.Source {
		return sourcePath, nil
	}
	resolvedOriginPattern := pathresolver.ResolveTargetPath(file.To, cfg.Locales.Source, origin)
	return s.resolveProjectTargetPath(sourcePattern, resolvedOriginPattern, sourcePath)
}

func (s *Service) applyLocaleCopies(copyTasks []Task, staged map[string]stagedOutput) (int, error) {
	if len(copyTasks) == 0 {
		return 0, nil
	}
	if staged == nil {
		return 0, fmt.Errorf("copy locales: staged outputs are missing")
	}

	copied := 0
	originCache := map[string]stagedOutput{}
	for _, group := range groupCopyTasksByTarget(copyTasks) {
		origin, err := s.loadCopyOrigin(group, staged, originCache)
		if err != nil {
			return copied, err
		}
		cloned := cloneStagedForLocale(origin, group.locale)
		staged[group.path] = cloned
		copied += countCopiedTasks(group.tasks, cloned)
	}
	return copied, nil
}

func (s *Service) persistCopyLockEntries(lockState *lockfile.File, copyTasks []Task, staged map[string]stagedOutput) int {
	if lockState == nil || len(copyTasks) == 0 {
		return 0
	}
	if lockState.RunCompleted == nil {
		lockState.RunCompleted = map[string]lockfile.RunCompletion{}
	}

	persisted := 0
	for _, task := range copyTasks {
		output, ok := staged[task.TargetPath]
		if !ok {
			continue
		}
		if isImageTask(task) {
			if !output.binaryOutput || len(output.binary) == 0 {
				continue
			}
		} else if _, exists := output.entries[task.EntryKey]; !exists {
			continue
		}
		identity := preferredTaskIdentity(s.projectRoot, task.TargetPath, task.EntryKey)
		lockState.RunCompleted[identity] = lockfile.RunCompletion{
			SourceHash: taskLockSourceHash(task),
			TaskHash:   lockTaskHash(task),
		}
		persisted++
	}
	return persisted
}

type copyTargetGroup struct {
	path         string
	locale       string
	originLocale string
	originPath   string
	sourcePath   string
	sourceLocale string
	tasks        []Task
}

func groupCopyTasksByTarget(tasks []Task) []copyTargetGroup {
	index := map[string]int{}
	groups := make([]copyTargetGroup, 0)
	for _, task := range tasks {
		key := task.TargetPath
		if i, ok := index[key]; ok {
			groups[i].tasks = append(groups[i].tasks, task)
			continue
		}
		index[key] = len(groups)
		groups = append(groups, copyTargetGroup{
			path:         task.TargetPath,
			locale:       task.TargetLocale,
			originLocale: task.CopyFrom,
			originPath:   task.copyFromTargetPath,
			sourcePath:   task.SourcePath,
			sourceLocale: task.SourceLocale,
			tasks:        []Task{task},
		})
	}
	slices.SortFunc(groups, func(a, b copyTargetGroup) int {
		return strings.Compare(a.path, b.path)
	})
	return groups
}

func (s *Service) loadCopyOrigin(group copyTargetGroup, staged map[string]stagedOutput, cache map[string]stagedOutput) (stagedOutput, error) {
	if cached, ok := cache[group.originPath]; ok {
		return cached, nil
	}
	if origin, ok := staged[group.originPath]; ok {
		if !origin.binaryOutput {
			existing, _, err := s.loadExistingTargetWithWarnings(group.originPath, group.originLocale)
			if err != nil {
				return stagedOutput{}, fmt.Errorf("copy locale %q from %q: %w", group.locale, group.originLocale, err)
			}
			if len(existing) > 0 {
				merged := maps.Clone(existing)
				maps.Copy(merged, origin.entries)
				origin.entries = merged
			}
		}
		cache[group.originPath] = origin
		return origin, nil
	}
	if group.originLocale == group.sourceLocale {
		origin, err := s.originFromSourceTasks(group)
		if err != nil {
			return stagedOutput{}, err
		}
		cache[group.originPath] = origin
		return origin, nil
	}

	origin, err := s.originFromExistingTarget(group)
	if err != nil {
		return stagedOutput{}, err
	}
	cache[group.originPath] = origin
	return origin, nil
}

func (s *Service) originFromSourceTasks(group copyTargetGroup) (stagedOutput, error) {
	if len(group.tasks) == 0 {
		return stagedOutput{}, fmt.Errorf("copy locale %q from %q: no planned tasks", group.locale, group.originLocale)
	}
	if isImageTask(group.tasks[0]) {
		content, err := s.readProjectFile(group.sourcePath)
		if err != nil {
			if os.IsNotExist(err) {
				return stagedOutput{}, fmt.Errorf("copy locale %q from %q: source file %q does not exist", group.locale, group.originLocale, group.sourcePath)
			}
			return stagedOutput{}, fmt.Errorf("copy locale %q from %q: read source file %q: %w", group.locale, group.originLocale, group.sourcePath, err)
		}
		return stagedOutput{
			sourcePath:   group.sourcePath,
			sourceLocale: group.sourceLocale,
			targetLocale: group.originLocale,
			binary:       append([]byte(nil), content...),
			binaryOutput: true,
		}, nil
	}

	entries := make(map[string]string, len(group.tasks))
	var srxSpec, parserMode string
	for _, task := range group.tasks {
		entries[task.EntryKey] = task.SourceText
		if srxSpec == "" {
			srxSpec = task.SRXSpec
		}
		if parserMode == "" {
			parserMode = task.ParserMode
		}
	}
	return stagedOutput{
		entries:      entries,
		sourcePath:   group.sourcePath,
		sourceLocale: group.sourceLocale,
		targetLocale: group.originLocale,
		srxSpec:      srxSpec,
		parserMode:   parserMode,
	}, nil
}

func (s *Service) originFromExistingTarget(group copyTargetGroup) (stagedOutput, error) {
	if len(group.tasks) > 0 && isImageTask(group.tasks[0]) {
		content, err := s.readProjectFile(group.originPath)
		if err != nil {
			if os.IsNotExist(err) {
				return stagedOutput{}, fmt.Errorf("copy locale %q from %q: origin target %q does not exist; translate %q first", group.locale, group.originLocale, group.originPath, group.originLocale)
			}
			return stagedOutput{}, fmt.Errorf("copy locale %q from %q: read origin target %q: %w", group.locale, group.originLocale, group.originPath, err)
		}
		if len(content) == 0 {
			return stagedOutput{}, fmt.Errorf("copy locale %q from %q: origin target %q is empty", group.locale, group.originLocale, group.originPath)
		}
		return stagedOutput{
			sourcePath:   group.sourcePath,
			sourceLocale: group.sourceLocale,
			targetLocale: group.originLocale,
			binary:       append([]byte(nil), content...),
			binaryOutput: true,
		}, nil
	}

	entries, _, err := s.loadExistingTargetWithWarnings(group.originPath, group.originLocale)
	if err != nil {
		return stagedOutput{}, fmt.Errorf("copy locale %q from %q: %w", group.locale, group.originLocale, err)
	}
	if len(entries) == 0 {
		if _, statErr := s.readProjectFile(group.originPath); statErr != nil && os.IsNotExist(statErr) {
			return stagedOutput{}, fmt.Errorf("copy locale %q from %q: origin target %q does not exist; translate %q first", group.locale, group.originLocale, group.originPath, group.originLocale)
		}
	}

	var srxSpec, parserMode string
	if len(group.tasks) > 0 {
		srxSpec = group.tasks[0].SRXSpec
		parserMode = group.tasks[0].ParserMode
	}
	// Files on disk are already joined. Staging them with an SRX spec would
	// try to re-join span keys that are no longer present.
	if !copyEntriesHaveSpanKeys(entries) {
		srxSpec = ""
	}
	return stagedOutput{
		entries:      entries,
		sourcePath:   group.sourcePath,
		sourceLocale: group.sourceLocale,
		targetLocale: group.originLocale,
		srxSpec:      srxSpec,
		parserMode:   parserMode,
	}, nil
}

func copyEntriesHaveSpanKeys(entries map[string]string) bool {
	for key := range entries {
		if _, _, ok := srx.SplitSpanKey(key); ok {
			return true
		}
	}
	return false
}

func cloneStagedForLocale(origin stagedOutput, locale string) stagedOutput {
	cloned := stagedOutput{
		sourcePath:   origin.sourcePath,
		sourceLocale: origin.sourceLocale,
		targetLocale: locale,
		srxSpec:      origin.srxSpec,
		parserMode:   origin.parserMode,
		binaryOutput: origin.binaryOutput,
	}
	if origin.entries != nil {
		cloned.entries = maps.Clone(origin.entries)
	} else {
		cloned.entries = map[string]string{}
	}
	if len(origin.binary) > 0 {
		cloned.binary = append([]byte(nil), origin.binary...)
	}
	return cloned
}

func countCopiedTasks(tasks []Task, output stagedOutput) int {
	copied := 0
	for _, task := range tasks {
		if isImageTask(task) {
			if output.binaryOutput && len(output.binary) > 0 {
				copied++
			}
			continue
		}
		if _, ok := output.entries[task.EntryKey]; ok {
			copied++
			continue
		}
		if fileKey, _, isSpan := srx.SplitSpanKey(task.EntryKey); isSpan {
			if _, ok := output.entries[fileKey]; ok {
				copied++
			}
		}
	}
	return copied
}
