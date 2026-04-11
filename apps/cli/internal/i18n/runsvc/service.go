package runsvc

import (
	"context"
	"crypto/sha512"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/hyperlocalise/hyperlocalise/apps/cli/internal/i18n/lockfile"
	"github.com/hyperlocalise/hyperlocalise/apps/cli/internal/i18n/pathresolver"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/translationfileparser"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/translator"
	"github.com/hyperlocalise/hyperlocalise/pkg/i18nconfig"
)

const (
	tokenSource = "{{source}}"
	tokenTarget = "{{target}}"
	tokenInput  = "{{input}}"
)

type Input struct {
	ConfigPath                string
	Bucket                    string
	Group                     string
	TargetLocales             []string
	SourcePaths               []string
	DryRun                    bool
	Force                     bool
	Prune                     bool
	PruneLimit                int
	PruneForce                bool
	LockPath                  string
	Workers                   int
	ExperimentalContextMemory bool
	ContextMemoryScope        string
	ContextMemoryMaxChars     int
	OnEvent                   func(Event)
	FixTargets                []FixTarget
	FixMarkdownScopes         []FixMarkdownScope
	// ReportJSONDetail controls --output JSON shape: summary (aggregate-only) or full (complete report).
	// The CLI defaults to summary; an empty value normalizes to full for backward compatibility with
	// library callers that omit the field. Run applies NormalizeReportJSONDetail again (idempotent).
	ReportJSONDetail string
}

// FixTarget selects a subset of planned translation tasks when non-empty.
type FixTarget struct {
	SourcePath   string
	TargetPath   string
	TargetLocale string
	EntryKey     string
}

// FixMarkdownScope requests all translation tasks for one MD/MDX source/target/locale (e.g. AST parity fix).
type FixMarkdownScope struct {
	SourcePath   string
	TargetPath   string
	TargetLocale string
}

func fixTargetMatchKey(sourcePath, targetPath, targetLocale, entryKey string) string {
	return strings.Join([]string{
		filepath.Clean(sourcePath),
		filepath.Clean(targetPath),
		strings.TrimSpace(targetLocale),
		strings.TrimSpace(entryKey),
	}, "\x00")
}

func fixMarkdownScopeKey(sourcePath, targetPath, targetLocale string) string {
	return strings.Join([]string{
		filepath.Clean(sourcePath),
		filepath.Clean(targetPath),
		strings.TrimSpace(targetLocale),
	}, "\x00")
}

const (
	defaultPruneLimit         = 100
	defaultContextMemoryChars = 1200
	ContextMemoryScopeFile    = "file"
	ContextMemoryScopeBucket  = "bucket"
	ContextMemoryScopeGroup   = "group"
)

type EventKind string

const (
	EventPhase         EventKind = "phase"
	EventPlanned       EventKind = "planned"
	EventContextMemory EventKind = "context_memory"
	EventTaskStart     EventKind = "task_start"
	EventTaskDone      EventKind = "task_done"
	EventPersisted     EventKind = "persisted"
	EventCompleted     EventKind = "completed"
)

const (
	ContextMemoryStateProgress = "progress"
	ContextMemoryStateStart    = "start"
	ContextMemoryStateDone     = "done"
)

const (
	PhasePlanning         = "planning"
	PhaseScanningPrune    = "scanning_prune"
	PhaseContextMemory    = "building_context_memory"
	PhaseExecuting        = "executing"
	PhaseFinalizingOutput = "finalizing_output"
)

type Event struct {
	Kind                   EventKind `json:"kind"`
	Phase                  string    `json:"phase,omitempty"`
	PlannedTotal           int       `json:"plannedTotal,omitempty"`
	SkippedByLock          int       `json:"skippedByLock,omitempty"`
	ExecutableTotal        int       `json:"executableTotal,omitempty"`
	Succeeded              int       `json:"succeeded,omitempty"`
	Failed                 int       `json:"failed,omitempty"`
	PersistedToLock        int       `json:"persistedToLock,omitempty"`
	PruneCandidates        int       `json:"pruneCandidates,omitempty"`
	PruneApplied           int       `json:"pruneApplied,omitempty"`
	PromptTokens           int       `json:"promptTokens,omitempty"`
	CompletionTokens       int       `json:"completionTokens,omitempty"`
	TotalTokens            int       `json:"totalTokens,omitempty"`
	TaskSucceeded          bool      `json:"taskSucceeded,omitempty"`
	TargetPath             string    `json:"targetPath,omitempty"`
	EntryKey               string    `json:"entryKey,omitempty"`
	FailureReason          string    `json:"failureReason,omitempty"`
	Message                string    `json:"message,omitempty"`
	ContextMemoryTotal     int       `json:"contextMemoryTotal,omitempty"`
	ContextMemoryProcessed int       `json:"contextMemoryProcessed,omitempty"`
	ContextMemoryFallbacks int       `json:"contextMemoryFallbacks,omitempty"`
	ContextMemoryState     string    `json:"contextMemoryState,omitempty"`
}

type Task struct {
	SourceLocale string `json:"sourceLocale"`
	TargetLocale string `json:"targetLocale"`
	SourcePath   string `json:"sourcePath"`
	TargetPath   string `json:"targetPath"`
	EntryKey     string `json:"entryKey"`
	SourceText   string `json:"sourceText"`
	ProfileName  string `json:"profileName"`
	Provider     string `json:"provider"`
	Model        string `json:"model"`
	SystemPrompt string `json:"systemPrompt,omitempty"`
	UserPrompt   string `json:"userPrompt,omitempty"`
	LegacyPrompt bool   `json:"-"`
	// Prompt*Template are profile templates; SystemPrompt/UserPrompt are rendered lazily for memory.
	PromptLegacyTemplate string `json:"-"`
	PromptSystemTemplate string `json:"-"`
	PromptUserTemplate   string `json:"-"`
	// ContextProvider/ContextModel are pre-resolved during planning.
	// They always contain the provider/model used for context-memory generation.
	ContextProvider string `json:"-"`
	ContextModel    string `json:"-"`
	GroupName       string `json:"-"`
	BucketName      string `json:"-"`
	ContextKey      string `json:"-"`
	ContextMemory   string `json:"-"`
	SourceContext   string `json:"-"`
	ParserMode      string `json:"-"`
	PromptVersion   string `json:"-"`

	sourceTextHash           string
	sourceContextFingerprint string
}

type Failure struct {
	TargetPath string `json:"targetPath"`
	EntryKey   string `json:"entryKey"`
	Reason     string `json:"reason"`
}

type TokenUsage struct {
	PromptTokens     int `json:"promptTokens"`
	CompletionTokens int `json:"completionTokens"`
	TotalTokens      int `json:"totalTokens"`
}

type BatchUsage struct {
	TargetLocale string `json:"targetLocale"`
	TargetPath   string `json:"targetPath"`
	EntryKey     string `json:"entryKey"`
	TokenUsage
}

type Report struct {
	GeneratedAt     time.Time `json:"generatedAt"`
	ConfigPath      string    `json:"configPath,omitempty"`
	PlannedTotal    int       `json:"plannedTotal"`
	SkippedByLock   int       `json:"skippedByLock"`
	ExecutableTotal int       `json:"executableTotal"`
	Succeeded       int       `json:"succeeded"`
	Failed          int       `json:"failed"`
	PersistedToLock int       `json:"persistedToLock"`
	TokenUsage
	LocaleUsage                 map[string]TokenUsage `json:"localeUsage,omitempty"`
	Batches                     []BatchUsage          `json:"batches,omitempty"`
	Failures                    []Failure             `json:"failures,omitempty"`
	Executable                  []Task                `json:"executable,omitempty"`
	Skipped                     []Task                `json:"skipped,omitempty"`
	PruneCandidates             []PruneCandidate      `json:"pruneCandidates,omitempty"`
	PruneApplied                int                   `json:"pruneApplied"`
	ContextMemoryEnabled        bool                  `json:"contextMemoryEnabled,omitempty"`
	ContextMemoryScope          string                `json:"contextMemoryScope,omitempty"`
	ContextMemoryGenerated      int                   `json:"contextMemoryGenerated,omitempty"`
	ContextMemoryFallbackGroups int                   `json:"contextMemoryFallbackGroups,omitempty"`
	Warnings                    []string              `json:"warnings,omitempty"`
}

type PruneCandidate struct {
	TargetPath string `json:"targetPath"`
	EntryKey   string `json:"entryKey"`
}

type Service struct {
	loadConfig func(path string) (*config.I18NConfig, error)
	loadLock   func(path string) (*lockfile.File, error)
	saveLock   func(path string, f lockfile.File) error
	readFile   func(path string) ([]byte, error)
	writeFile  func(path string, content []byte) error
	translate  func(ctx context.Context, req translator.Request) (string, error)
	newParser  func() *translationfileparser.Strategy
	now        func() time.Time
	numCPU     func() int

	lockPersistBatchSize     int
	lockPersistFlushInterval time.Duration
}

func New() *Service {
	return &Service{
		loadConfig: config.Load,
		loadLock:   lockfile.Load,
		saveLock:   lockfile.Save,
		readFile:   os.ReadFile,
		writeFile: func(path string, content []byte) error {
			return writeBytesAtomic(path, content)
		},
		translate: translator.Translate,
		newParser: translationfileparser.NewDefaultStrategy,
		now:       func() time.Time { return time.Now().UTC() },
		numCPU:    runtime.NumCPU,

		lockPersistBatchSize:     32,
		lockPersistFlushInterval: 250 * time.Millisecond,
	}
}

func Run(ctx context.Context, in Input) (Report, error) {
	return New().Run(ctx, in)
}

func (s *Service) planTasks(cfg *config.I18NConfig, onlyBucket, onlyGroup string, onlyTargetLocales, onlySourcePaths []string, fixTargets []FixTarget, fixMarkdownScopes []FixMarkdownScope) ([]Task, []string, error) {
	parser := s.newParser()
	sourceCache := map[string]plannedSourceSnapshot{}
	resolvedSourcesCache := map[string][]string{}
	groups := sortedGroupNames(cfg.Groups)
	buckets := sortedBucketNames(cfg.Buckets)
	filteredBucket := strings.TrimSpace(onlyBucket)
	filteredGroup := strings.TrimSpace(onlyGroup)
	filteredTargets, err := normalizeTargetLocales(onlyTargetLocales)
	if err != nil {
		return nil, nil, fmt.Errorf("planning tasks: %w", err)
	}
	filteredSourcePaths, err := normalizeSourcePaths(onlySourcePaths)
	if err != nil {
		return nil, nil, fmt.Errorf("planning tasks: %w", err)
	}
	matchedSourcePaths := make(map[string]struct{}, len(filteredSourcePaths))
	if filteredBucket != "" {
		if _, ok := cfg.Buckets[filteredBucket]; !ok {
			return nil, nil, fmt.Errorf("planning tasks: unknown bucket %q", filteredBucket)
		}
	}
	if filteredGroup != "" {
		if _, ok := cfg.Groups[filteredGroup]; !ok {
			return nil, nil, fmt.Errorf("planning tasks: unknown group %q", filteredGroup)
		}
	}
	if len(filteredTargets) > 0 {
		targetSet := make(map[string]struct{}, len(cfg.Locales.Targets))
		for _, target := range cfg.Locales.Targets {
			targetSet[target] = struct{}{}
		}
		for _, target := range filteredTargets {
			if _, ok := targetSet[target]; !ok {
				return nil, nil, fmt.Errorf("planning tasks: unknown target locale %q", target)
			}
		}
	}

	var fixSet map[string]struct{}
	var matchedFix map[string]struct{}
	if len(fixTargets) > 0 {
		fixSet = make(map[string]struct{}, len(fixTargets))
		for _, ft := range fixTargets {
			fixSet[fixTargetMatchKey(ft.SourcePath, ft.TargetPath, ft.TargetLocale, ft.EntryKey)] = struct{}{}
		}
		matchedFix = make(map[string]struct{}, len(fixSet))
	}

	var markdownScopeSet map[string]struct{}
	var matchedMarkdownScopes map[string]struct{}
	if len(fixMarkdownScopes) > 0 {
		markdownScopeSet = make(map[string]struct{}, len(fixMarkdownScopes))
		for _, ms := range fixMarkdownScopes {
			markdownScopeSet[fixMarkdownScopeKey(ms.SourcePath, ms.TargetPath, ms.TargetLocale)] = struct{}{}
		}
		matchedMarkdownScopes = make(map[string]struct{}, len(markdownScopeSet))
	}

	filterFixes := len(fixSet) > 0 || len(markdownScopeSet) > 0

	tasks := make([]Task, 0)

	for _, groupName := range groups {
		if filteredGroup != "" && groupName != filteredGroup {
			continue
		}
		group := cfg.Groups[groupName]
		profileName, profile, err := resolveProfile(cfg, groupName)
		if err != nil {
			return nil, nil, err
		}
		contextProvider, contextModel := resolveContextMemoryModel(profile, cfg.LLM.ContextMemory)
		promptVersion := resolvePromptVersion(profile)

		targets := group.Targets
		if len(targets) == 0 {
			targets = append([]string(nil), cfg.Locales.Targets...)
		}
		if len(filteredTargets) > 0 {
			targets = intersectLocales(targets, filteredTargets)
			if len(targets) == 0 {
				continue
			}
		}
		slices.Sort(targets)

		selectedBuckets := group.Buckets
		if len(selectedBuckets) == 0 {
			selectedBuckets = append([]string(nil), buckets...)
		}

		for _, bucketName := range selectedBuckets {
			if filteredBucket != "" && bucketName != filteredBucket {
				continue
			}
			bucket, ok := cfg.Buckets[bucketName]
			if !ok {
				return nil, nil, fmt.Errorf("planning tasks: group %q references unknown bucket %q", groupName, bucketName)
			}

			for _, file := range bucket.Files {
				sourcePattern := pathresolver.ResolveSourcePath(file.From, cfg.Locales.Source)
				sources, ok := resolvedSourcesCache[sourcePattern]
				if !ok {
					sources, err = resolveSourcePaths(sourcePattern)
					if err != nil {
						return nil, nil, fmt.Errorf("planning tasks: resolve source paths for %q: %w", sourcePattern, err)
					}
					resolvedSourcesCache[sourcePattern] = sources
				}
				if len(sources) == 0 {
					return nil, nil, fmt.Errorf("planning tasks: source pattern %q matched no files", sourcePattern)
				}

				for _, sourcePath := range sources {
					if len(filteredSourcePaths) > 0 {
						if _, ok := filteredSourcePaths[sourcePath]; !ok {
							continue
						}
					}
					if shouldIgnoreSourcePath(sourcePath, cfg.Locales.Targets) {
						continue
					}
					if len(filteredSourcePaths) > 0 {
						matchedSourcePaths[sourcePath] = struct{}{}
					}
					sourceEntries, sourceContextByKey, parserMode, err := s.loadSourceEntriesCached(parser, sourceCache, sourcePath)
					if err != nil {
						return nil, nil, err
					}
					keys := sortedEntryKeys(sourceEntries)
					for _, target := range targets {
						resolvedTargetPattern := pathresolver.ResolveTargetPath(file.To, cfg.Locales.Source, target)
						targetPath, err := resolveTargetPath(sourcePattern, resolvedTargetPattern, sourcePath)
						if err != nil {
							return nil, nil, fmt.Errorf("planning tasks: resolve target path for source %q: %w", sourcePath, err)
						}
						for _, key := range keys {
							sourceText := sourceEntries[key]
							legacyRendered := renderPrompt(profile.Prompt, cfg.Locales.Source, target, sourceText)
							legacyPromptUsed := strings.TrimSpace(legacyRendered) != "" && strings.TrimSpace(profile.SystemPrompt) == "" && strings.TrimSpace(profile.UserPrompt) == ""
							task := Task{
								SourceLocale:         cfg.Locales.Source,
								TargetLocale:         target,
								SourcePath:           sourcePath,
								TargetPath:           targetPath,
								EntryKey:             key,
								SourceText:           sourceText,
								ProfileName:          profileName,
								Provider:             profile.Provider,
								Model:                profile.Model,
								LegacyPrompt:         legacyPromptUsed,
								PromptLegacyTemplate: profile.Prompt,
								PromptSystemTemplate: profile.SystemPrompt,
								PromptUserTemplate:   profile.UserPrompt,
								SourceContext:        sourceContextByKey[key],
								ContextProvider:      contextProvider,
								ContextModel:         contextModel,
								GroupName:            groupName,
								BucketName:           bucketName,
								ParserMode:           parserMode,
								PromptVersion:        promptVersion,
							}
							precomputeStableTaskCacheFields(&task)
							if filterFixes {
								mk := fixTargetMatchKey(task.SourcePath, task.TargetPath, task.TargetLocale, task.EntryKey)
								sk := fixMarkdownScopeKey(task.SourcePath, task.TargetPath, task.TargetLocale)
								inKey := false
								if len(fixSet) > 0 {
									_, inKey = fixSet[mk]
								}
								inMd := false
								if len(markdownScopeSet) > 0 {
									_, inMd = markdownScopeSet[sk]
								}
								if inKey {
									matchedFix[mk] = struct{}{}
								}
								if inMd {
									matchedMarkdownScopes[sk] = struct{}{}
								}
								if !inKey && !inMd {
									continue
								}
							}
							tasks = append(tasks, task)
						}
					}
				}
			}
		}
	}

	if len(filteredSourcePaths) > 0 {
		unmatched := make([]string, 0)
		for sourcePath := range filteredSourcePaths {
			if _, ok := matchedSourcePaths[sourcePath]; !ok {
				unmatched = append(unmatched, sourcePath)
			}
		}
		slices.Sort(unmatched)
		if len(unmatched) > 0 {
			if len(unmatched) == 1 {
				return nil, nil, fmt.Errorf("planning tasks: unknown source file %q", unmatched[0])
			}
			return nil, nil, fmt.Errorf("planning tasks: unknown source files: %s", strings.Join(unmatched, ", "))
		}
	}

	var planWarnings []string
	if len(fixSet) > 0 {
		seen := make(map[string]struct{})
		for _, ft := range fixTargets {
			mk := fixTargetMatchKey(ft.SourcePath, ft.TargetPath, ft.TargetLocale, ft.EntryKey)
			if _, ok := matchedFix[mk]; ok {
				continue
			}
			if _, dup := seen[mk]; dup {
				continue
			}
			seen[mk] = struct{}{}
			planWarnings = append(planWarnings, fmt.Sprintf(
				"fix target matched no planned task (source=%s target=%s locale=%s key=%s)",
				ft.SourcePath, ft.TargetPath, ft.TargetLocale, ft.EntryKey))
		}
	}
	if len(markdownScopeSet) > 0 {
		seen := make(map[string]struct{})
		for _, ms := range fixMarkdownScopes {
			sk := fixMarkdownScopeKey(ms.SourcePath, ms.TargetPath, ms.TargetLocale)
			if _, ok := matchedMarkdownScopes[sk]; ok {
				continue
			}
			if _, dup := seen[sk]; dup {
				continue
			}
			seen[sk] = struct{}{}
			planWarnings = append(planWarnings, fmt.Sprintf(
				"fix markdown scope matched no planned task (source=%s target=%s locale=%s)",
				ms.SourcePath, ms.TargetPath, ms.TargetLocale))
		}
	}
	slices.Sort(planWarnings)

	return tasks, planWarnings, nil
}

type plannedSourceSnapshot struct {
	entries      map[string]string
	entryContext map[string]string
	parserMode   string
}

func normalizeTargetLocales(locales []string) ([]string, error) {
	if len(locales) == 0 {
		return nil, nil
	}

	seen := make(map[string]struct{}, len(locales))
	normalized := make([]string, 0, len(locales))
	for _, locale := range locales {
		trimmed := strings.TrimSpace(locale)
		if trimmed == "" {
			return nil, fmt.Errorf("target locale must not be empty")
		}
		if _, ok := seen[trimmed]; ok {
			continue
		}
		seen[trimmed] = struct{}{}
		normalized = append(normalized, trimmed)
	}

	return normalized, nil
}

func normalizeSourcePaths(paths []string) (map[string]struct{}, error) {
	if len(paths) == 0 {
		return nil, nil
	}

	normalized := make(map[string]struct{}, len(paths))
	for _, path := range paths {
		trimmed := strings.TrimSpace(path)
		if trimmed == "" {
			return nil, fmt.Errorf("invalid source file value: must not be empty")
		}
		normalized[filepath.Clean(trimmed)] = struct{}{}
	}
	return normalized, nil
}

func intersectLocales(locales, selected []string) []string {
	if len(locales) == 0 || len(selected) == 0 {
		return nil
	}

	selectedSet := make(map[string]struct{}, len(selected))
	for _, locale := range selected {
		selectedSet[locale] = struct{}{}
	}

	intersection := make([]string, 0, len(locales))
	for _, locale := range locales {
		if _, ok := selectedSet[locale]; ok {
			intersection = append(intersection, locale)
		}
	}

	return intersection
}

func resolvePromptVersion(profile config.LLMProfile) string {
	return hashSourceText(strings.Join([]string{
		"prompt_template=" + strings.TrimSpace(profile.Prompt),
		"system_template=" + strings.TrimSpace(profile.SystemPrompt),
		"user_template=" + strings.TrimSpace(profile.UserPrompt),
	}, "\n"))
}

func (s *Service) loadSourceEntries(parser *translationfileparser.Strategy, sourcePath string) (map[string]string, map[string]string, string, error) {
	content, err := s.readFile(sourcePath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil, "", fmt.Errorf("planning tasks: source file %q does not exist", sourcePath)
		}
		return nil, nil, "", fmt.Errorf("planning tasks: read source file %q: %w", sourcePath, err)
	}

	entries, entryContext, err := parser.ParseWithContext(sourcePath, content)
	if err != nil {
		return nil, nil, "", fmt.Errorf("planning tasks: parse source file %q: %w", sourcePath, err)
	}

	return entries, entryContext, parserModeForSource(sourcePath, content), nil
}

func (s *Service) loadSourceEntriesCached(parser *translationfileparser.Strategy, sourceCache map[string]plannedSourceSnapshot, sourcePath string) (map[string]string, map[string]string, string, error) {
	if cached, ok := sourceCache[sourcePath]; ok {
		return cached.entries, cached.entryContext, cached.parserMode, nil
	}

	entries, entryContext, parserMode, err := s.loadSourceEntries(parser, sourcePath)
	if err != nil {
		return nil, nil, "", err
	}
	sourceCache[sourcePath] = plannedSourceSnapshot{
		entries:      entries,
		entryContext: entryContext,
		parserMode:   parserMode,
	}
	return entries, entryContext, parserMode, nil
}

type eventEmitter struct {
	notify func(Event)
	events chan Event
	done   chan struct{}
	mu     sync.Mutex
	closed bool
}

const (
	eventEmitterBufferSize = 1024
)

func newEventEmitter(onEvent func(Event)) *eventEmitter {
	if onEvent == nil {
		return nil
	}

	e := &eventEmitter{
		notify: onEvent,
		events: make(chan Event, eventEmitterBufferSize),
		done:   make(chan struct{}),
	}
	go e.run()
	return e
}

func (e *eventEmitter) run() {
	defer close(e.done)
	for ev := range e.events {
		e.notify(ev)
	}
}

func (e *eventEmitter) emit(ev Event) {
	if e == nil {
		return
	}

	e.mu.Lock()
	defer e.mu.Unlock()
	if e.closed {
		return
	}
	if e.isDroppable(ev) {
		select {
		case e.events <- ev:
		default:
		}
		return
	}
	e.events <- ev
}

func (e *eventEmitter) close() {
	if e == nil {
		return
	}

	e.mu.Lock()
	if e.closed {
		e.mu.Unlock()
		return
	}
	e.closed = true
	close(e.events)
	e.mu.Unlock()
	<-e.done
}

func (e *eventEmitter) isDroppable(ev Event) bool {
	switch ev.Kind {
	case EventTaskStart, EventTaskDone, EventPersisted:
		return true
	case EventContextMemory:
		return ev.ContextMemoryState == ContextMemoryStateProgress
	default:
		return false
	}
}

func resolveProfile(cfg *config.I18NConfig, groupName string) (string, config.LLMProfile, error) {
	bestPriority := -1
	bestProfile := ""

	for _, rule := range cfg.LLM.Rules {
		if rule.Group != groupName {
			continue
		}
		if rule.Priority > bestPriority {
			bestPriority = rule.Priority
			bestProfile = rule.Profile
		}
	}

	if strings.TrimSpace(bestProfile) == "" {
		bestProfile = "default"
	}

	profile, ok := cfg.LLM.Profiles[bestProfile]
	if !ok {
		return "", config.LLMProfile{}, fmt.Errorf("planning tasks: unresolvable profile %q for group %q", bestProfile, groupName)
	}

	return bestProfile, profile, nil
}

func resolveContextMemoryModel(profile config.LLMProfile, contextProfile *config.LLMContextMemoryProfile) (provider, model string) {
	provider = strings.TrimSpace(profile.Provider)
	model = strings.TrimSpace(profile.Model)
	if contextProfile == nil {
		return provider, model
	}
	if override := strings.TrimSpace(contextProfile.Provider); override != "" {
		provider = override
	}
	if override := strings.TrimSpace(contextProfile.Model); override != "" {
		model = override
	}
	return provider, model
}

func sortedGroupNames(groups map[string]config.GroupConfig) []string {
	names := make([]string, 0, len(groups))
	for name := range groups {
		names = append(names, name)
	}
	slices.Sort(names)
	return names
}

func sortedBucketNames(buckets map[string]config.BucketConfig) []string {
	names := make([]string, 0, len(buckets))
	for name := range buckets {
		names = append(names, name)
	}
	slices.Sort(names)
	return names
}

func sortedEntryKeys(entries map[string]string) []string {
	keys := make([]string, 0, len(entries))
	for key := range entries {
		keys = append(keys, key)
	}
	slices.Sort(keys)
	return keys
}

func renderPrompt(prompt, sourceLocale, targetLocale, sourceText string) string {
	rendered := strings.ReplaceAll(prompt, tokenSource, sourceLocale)
	rendered = strings.ReplaceAll(rendered, tokenTarget, targetLocale)
	rendered = strings.ReplaceAll(rendered, tokenInput, sourceText)
	return rendered
}

func materializeTaskPrompts(task *Task) {
	if task == nil {
		return
	}
	// Invariant: assignment sites set SystemPrompt and UserPrompt together after rendering. The OR guard
	// is only safe under that pairing—if one field were set alone, returning here could skip filling the other.
	if strings.TrimSpace(task.SystemPrompt) != "" || strings.TrimSpace(task.UserPrompt) != "" {
		return
	}
	legacyRendered := renderPrompt(task.PromptLegacyTemplate, task.SourceLocale, task.TargetLocale, task.SourceText)
	systemRendered := renderPrompt(task.PromptSystemTemplate, task.SourceLocale, task.TargetLocale, task.SourceText)
	userRendered := renderPrompt(task.PromptUserTemplate, task.SourceLocale, task.TargetLocale, task.SourceText)
	if strings.TrimSpace(systemRendered) == "" {
		systemRendered = legacyRendered
	}
	task.SystemPrompt = systemRendered
	task.UserPrompt = userRendered
}

func materializeReportTaskPrompts(r *Report) {
	if r == nil {
		return
	}
	for i := range r.Executable {
		materializeTaskPrompts(&r.Executable[i])
	}
	for i := range r.Skipped {
		materializeTaskPrompts(&r.Skipped[i])
	}
}

func taskIdentity(targetPath, entryKey string) string {
	return targetPath + "::" + entryKey
}

func hashSourceText(source string) string {
	sum := sha512.Sum512([]byte(source))
	return fmt.Sprintf("%x", sum)
}

// lockStoredFingerprint is a compact SHA-512 prefix (32 hex chars) stored in the lockfile.
// hashSourceText remains full-length for exact-cache keys and other non-lock uses.
func lockStoredFingerprint(preimage string) string {
	sum := sha512.Sum512([]byte(preimage))
	return fmt.Sprintf("%x", sum[:16])
}

// lockFingerprintEqual reports whether a fingerprint stored in the lockfile
// equals a freshly computed compact fingerprint (32 hex chars).
// stored may be either the compact 32-char form or a legacy full-length
// 128-char SHA-512 hex digest; computed must always be the 32-char form.
// Argument order is load-bearing: do not pass (computed, stored).
func lockFingerprintEqual(stored, computed string) bool {
	if stored == computed {
		return true
	}
	if len(stored) != 128 {
		return false
	}
	decoded, err := hex.DecodeString(stored)
	if err != nil || len(decoded) != 64 {
		return false
	}
	return fmt.Sprintf("%x", decoded[:16]) == computed
}

func parserModeForSource(path string, content []byte) string {
	normalized := strings.ToLower(filepath.ToSlash(strings.TrimSpace(path)))
	switch {
	case strings.HasSuffix(normalized, ".arb"):
		return "arb"
	case strings.HasSuffix(normalized, ".json"):
		if isStrictFormatJSON(content) {
			return "formatjs"
		}
		return "json"
	default:
		return "other"
	}
}

func isStrictFormatJSON(content []byte) bool {
	var payload map[string]any
	if err := json.Unmarshal(content, &payload); err != nil {
		return false
	}
	if len(payload) == 0 {
		return false
	}
	for _, value := range payload {
		message, ok := value.(map[string]any)
		if !ok {
			return false
		}
		raw, ok := message["defaultMessage"]
		if !ok {
			return false
		}
		if _, ok := raw.(string); !ok {
			return false
		}
	}
	return true
}
