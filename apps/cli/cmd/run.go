package cmd

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/signal"
	"path/filepath"
	"runtime"
	"sort"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/apps/cli/internal/cliotel"
	"github.com/hyperlocalise/hyperlocalise/apps/cli/internal/i18n/runsvc"
	"github.com/hyperlocalise/hyperlocalise/apps/cli/internal/progressui"
	"github.com/spf13/cobra"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
)

type runOptions struct {
	prefilledEntriesPath      string
	prefilledTargetPath       string
	configPath                string
	interactive               bool
	dryRun                    bool
	force                     bool
	prune                     bool
	pruneLimit                int
	pruneForce                bool
	maxTranslations           int
	workers                   int
	progress                  string
	bucket                    string
	group                     string
	locales                   []string
	targetLocaleAlias         []string
	targetLocales             []string
	sourcePaths               []string
	outputPath                string
	experimentalContextMemory bool
	contextMemoryScope        string
	contextMemoryMaxChars     int
	outputDetail              string
}

var runFunc = runsvc.Run

func newRunCmd() *cobra.Command {
	o := runOptions{}

	cmd := &cobra.Command{
		Use:          "run",
		Short:        "generate local translations from source files",
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			if o.interactive {
				result, err := runInteractiveWizard(o, cmd.OutOrStdout())
				if err != nil {
					return err
				}
				if !result.execute {
					return nil
				}
				o = result.options
				syncInteractiveScopeFlags(cmd, o)
			}
			return executeRun(cmd, o)
		},
	}

	cmd.Flags().BoolVarP(&o.interactive, "interactive", "i", false, "launch interactive run selector in TTY")
	cmd.Flags().StringVar(&o.configPath, "config", "", "path to i18n config")
	cmd.Flags().BoolVar(&o.dryRun, "dry-run", o.dryRun, "preview planned translation work without executing")
	cmd.Flags().BoolVar(&o.force, "force", o.force, "rerun all planned tasks and ignore lockfile skip state")
	cmd.Flags().BoolVar(&o.prune, "prune", o.prune, "remove target keys that no longer exist in source files")
	cmd.Flags().IntVar(&o.pruneLimit, "prune-max-deletions", 100, "maximum stale keys that can be deleted in one run before requiring an explicit override")
	cmd.Flags().BoolVar(&o.pruneForce, "prune-force", o.pruneForce, "bypass prune deletion safety limit")
	cmd.Flags().IntVar(&o.maxTranslations, "max-translations", 0, "maximum executable translations to run in this session (0 = unlimited); deferred work remains for a later run")
	cmd.Flags().IntVar(&o.workers, "workers", o.workers, "number of parallel translation workers (default: number of CPU cores)")
	cmd.Flags().StringVar(&o.progress, "progress", string(progressui.ModeAuto), "progress rendering mode: auto|on|off")
	cmd.Flags().StringVar(&o.bucket, "bucket", "", "only run tasks for the given bucket")
	cmd.Flags().StringVar(&o.group, "group", "", "only run tasks for the given group")
	cmd.Flags().StringSliceVar(&o.sourcePaths, "file", nil, "only run tasks for the given source file(s)")
	cmd.Flags().StringSliceVar(&o.locales, "locale", nil, "only run tasks for the given target locale(s)")
	cmd.Flags().StringSliceVar(&o.targetLocaleAlias, "target-locale", nil, "alias for --locale")
	cmd.Flags().StringVar(&o.outputPath, "output", "", "report output JSON path")
	cmd.Flags().StringVar(&o.prefilledEntriesPath, "prefilled-entries", "", "JSON file of prefilled translations: flat {entryId:value} with --prefilled-target-path, or locale-keyed {locale:{entryId:value}}")
	cmd.Flags().StringVar(&o.prefilledTargetPath, "prefilled-target-path", "", "target output path for flat --prefilled-entries (omit for locale-keyed maps)")
	cmd.Flags().BoolVar(&o.experimentalContextMemory, "experimental-context-memory", o.experimentalContextMemory, "enable experimental two-stage context memory generation before translation")
	cmd.Flags().StringVar(&o.contextMemoryScope, "context-memory-scope", runsvc.ContextMemoryScopeFile, "scope for experimental context memory: file|bucket|group")
	cmd.Flags().IntVar(&o.contextMemoryMaxChars, "context-memory-max-chars", 1200, "maximum context memory characters injected into each translation request")
	cmd.Flags().StringVar(&o.outputDetail, "output-detail", runsvc.ReportJSONDetailSummary, "for --output JSON: summary (default; counts, tokens, failures, warnings only—no task or prune lists) or full (complete report including tasks and batches)")

	return cmd
}

func mergeRunLocaleFlags(primary, alias []string) []string {
	if len(primary) == 0 && len(alias) == 0 {
		return nil
	}
	seen := make(map[string]struct{}, len(primary)+len(alias))
	out := make([]string, 0, len(primary)+len(alias))
	for _, locale := range primary {
		if _, ok := seen[locale]; ok {
			continue
		}
		seen[locale] = struct{}{}
		out = append(out, locale)
	}
	for _, locale := range alias {
		if _, ok := seen[locale]; ok {
			continue
		}
		seen[locale] = struct{}{}
		out = append(out, locale)
	}
	return out
}

func normalizeRunFileFlags(paths []string) ([]string, error) {
	if len(paths) == 0 {
		return nil, nil
	}
	normalized := make([]string, 0, len(paths))
	for _, path := range paths {
		trimmed := strings.TrimSpace(path)
		if trimmed == "" {
			return nil, fmt.Errorf("invalid --file value: must not be empty")
		}
		normalized = append(normalized, trimmed)
	}
	return normalized, nil
}

type loadedPrefilledEntries struct {
	Flat     map[string]string
	ByLocale map[string]map[string]string
}

func loadPrefilledEntries(path string) (loadedPrefilledEntries, error) {
	trimmed := strings.TrimSpace(path)
	if trimmed == "" {
		return loadedPrefilledEntries{}, nil
	}
	raw, err := os.ReadFile(trimmed)
	if err != nil {
		return loadedPrefilledEntries{}, fmt.Errorf("read --prefilled-entries %q: %w", trimmed, err)
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	var top map[string]json.RawMessage
	if err := decoder.Decode(&top); err != nil {
		return loadedPrefilledEntries{}, fmt.Errorf("parse --prefilled-entries %q: %w", trimmed, err)
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return loadedPrefilledEntries{}, fmt.Errorf("parse --prefilled-entries %q: unexpected trailing data", trimmed)
	}
	if len(top) == 0 {
		return loadedPrefilledEntries{}, nil
	}

	flat := map[string]string{}
	byLocale := map[string]map[string]string{}
	sawString := false
	sawObject := false
	for key, rawValue := range top {
		trimmedKey := strings.TrimSpace(key)
		if trimmedKey == "" {
			return loadedPrefilledEntries{}, fmt.Errorf("parse --prefilled-entries %q: empty top-level key", trimmed)
		}
		rawValue = bytes.TrimSpace(rawValue)
		if len(rawValue) == 0 {
			return loadedPrefilledEntries{}, fmt.Errorf("parse --prefilled-entries %q: empty value for %q", trimmed, trimmedKey)
		}
		switch rawValue[0] {
		case '"':
			sawString = true
			var value string
			if err := json.Unmarshal(rawValue, &value); err != nil {
				return loadedPrefilledEntries{}, fmt.Errorf("parse --prefilled-entries %q: flat value for %q: %w", trimmed, trimmedKey, err)
			}
			flat[trimmedKey] = value
		case '{':
			sawObject = true
			var entries map[string]string
			entryDecoder := json.NewDecoder(bytes.NewReader(rawValue))
			entryDecoder.DisallowUnknownFields()
			if err := entryDecoder.Decode(&entries); err != nil {
				return loadedPrefilledEntries{}, fmt.Errorf("parse --prefilled-entries %q: locale map for %q: %w", trimmed, trimmedKey, err)
			}
			byLocale[trimmedKey] = entries
		default:
			return loadedPrefilledEntries{}, fmt.Errorf("parse --prefilled-entries %q: value for %q must be a string or object", trimmed, trimmedKey)
		}
	}
	if sawString && sawObject {
		return loadedPrefilledEntries{}, fmt.Errorf("parse --prefilled-entries %q: mixed flat and locale-keyed shapes are not allowed", trimmed)
	}
	if sawObject {
		return loadedPrefilledEntries{ByLocale: byLocale}, nil
	}
	return loadedPrefilledEntries{Flat: flat}, nil
}

func executeRun(cmd *cobra.Command, o runOptions) error {
	baseCtx := cmd.Context()
	if baseCtx == nil {
		baseCtx = context.Background()
	}
	tr := otel.Tracer(cliotel.InstrumentationName)
	spanCtx, span := tr.Start(baseCtx, cliotel.CommandSpanName(cmd))
	defer span.End()

	workers := o.workers
	if workers == 0 {
		workers = runtime.NumCPU()
	}
	if workers < 1 {
		span.SetStatus(codes.Error, "invalid_workers")
		return fmt.Errorf("invalid --workers value %d: must be >= 1", workers)
	}
	if o.maxTranslations < 0 {
		span.SetStatus(codes.Error, "invalid_max_translations")
		return fmt.Errorf("invalid --max-translations value %d: must be >= 0", o.maxTranslations)
	}
	var targetLocales []string
	if o.interactive {
		targetLocales = o.targetLocales
	} else if cmd.Flags().Changed("locale") || cmd.Flags().Changed("target-locale") {
		targetLocales = mergeRunLocaleFlags(o.locales, o.targetLocaleAlias)
		if len(targetLocales) == 0 {
			return fmt.Errorf("invalid --locale value: must not be empty")
		}
		for _, locale := range targetLocales {
			if strings.TrimSpace(locale) == "" {
				return fmt.Errorf("invalid --locale value: must not be empty")
			}
		}
	}
	if cmd.Flags().Changed("file") && len(o.sourcePaths) == 0 {
		return fmt.Errorf("invalid --file value: must not be empty")
	}
	sourcePaths, err := normalizeRunFileFlags(o.sourcePaths)
	if err != nil {
		return err
	}
	contextMemoryScope := strings.ToLower(strings.TrimSpace(o.contextMemoryScope))
	if contextMemoryScope == "" {
		contextMemoryScope = runsvc.ContextMemoryScopeFile
	}
	switch contextMemoryScope {
	case runsvc.ContextMemoryScopeFile, runsvc.ContextMemoryScopeBucket, runsvc.ContextMemoryScopeGroup:
	default:
		span.SetStatus(codes.Error, "invalid_context_memory_scope")
		return fmt.Errorf("invalid --context-memory-scope value %q: must be one of %s|%s|%s", o.contextMemoryScope, runsvc.ContextMemoryScopeFile, runsvc.ContextMemoryScopeBucket, runsvc.ContextMemoryScopeGroup)
	}

	progressMode, err := progressui.ParseMode(o.progress)
	if err != nil {
		span.SetStatus(codes.Error, "invalid_progress_mode")
		return err
	}

	jsonDetail, err := runsvc.NormalizeReportJSONDetail(o.outputDetail)
	if err != nil {
		span.SetStatus(codes.Error, "invalid_output_detail")
		return err
	}

	span.SetAttributes(
		attribute.Bool("cli.dry_run", o.dryRun),
		attribute.Bool("cli.force", o.force),
		attribute.Bool("cli.interactive", o.interactive),
		attribute.Bool("cli.prune", o.prune),
		attribute.Int("cli.max_translations", o.maxTranslations),
		attribute.Int("cli.workers", workers),
		attribute.Bool("cli.experimental_context_memory", o.experimentalContextMemory),
	)

	output := cmd.OutOrStdout()
	runCtx, stop := signal.NotifyContext(spanCtx, os.Interrupt)
	defer stop()

	var renderer *progressui.Renderer
	if progressui.IsEnabled(progressMode, output, nil) {
		renderer = progressui.New(output, progressMode, progressui.Options{
			Label:       "Translating",
			OnInterrupt: stop,
		})
	}
	if renderer != nil {
		defer renderer.Close()
	}

	prefilled, err := loadPrefilledEntries(o.prefilledEntriesPath)
	if err != nil {
		return err
	}
	prefilledTargetPath := strings.TrimSpace(o.prefilledTargetPath)
	if len(prefilled.Flat) > 0 && prefilledTargetPath == "" {
		return fmt.Errorf("--prefilled-target-path is required when --prefilled-entries uses a flat entry map")
	}
	if len(prefilled.ByLocale) > 0 && prefilledTargetPath != "" {
		return fmt.Errorf("--prefilled-target-path must not be set when --prefilled-entries uses a locale-keyed map")
	}

	input := runsvc.Input{
		ConfigPath:                o.configPath,
		DryRun:                    o.dryRun,
		Force:                     o.force,
		Prune:                     o.prune,
		PruneLimit:                o.pruneLimit,
		PruneForce:                o.pruneForce,
		MaxTranslations:           o.maxTranslations,
		Workers:                   workers,
		Bucket:                    o.bucket,
		Group:                     o.group,
		TargetLocales:             targetLocales,
		SourcePaths:               sourcePaths,
		ExperimentalContextMemory: o.experimentalContextMemory,
		ContextMemoryScope:        contextMemoryScope,
		ContextMemoryMaxChars:     o.contextMemoryMaxChars,
		ReportJSONDetail:          jsonDetail,
		PrefilledEntries:          prefilled.Flat,
		PrefilledByLocale:         prefilled.ByLocale,
		PrefilledTargetPath:       prefilledTargetPath,
	}
	if renderer != nil {
		input.OnEvent = func(event runsvc.Event) {
			applyRunProgressEvent(renderer, event)
		}
	}

	report, err := runFunc(runCtx, input)
	usage := runsvc.NormalizeTokenUsage(report.TokenUsage)
	if renderer != nil {
		renderer.TokenUsage(usage.PromptTokens, usage.CompletionTokens, usage.TotalTokens)
		renderer.Complete()
	}

	if span.IsRecording() {
		span.SetAttributes(
			attribute.Int("run.planned_total", report.PlannedTotal),
			attribute.Int("run.executable_total", report.ExecutableTotal),
			attribute.Int("run.deferred_by_limit", report.DeferredByLimit),
			attribute.Int("run.succeeded", report.Succeeded),
			attribute.Int("run.failed", report.Failed),
			attribute.Int("run.prune_applied", report.PruneApplied),
			attribute.Int("run.prompt_tokens", usage.PromptTokens),
			attribute.Int("run.completion_tokens", usage.CompletionTokens),
			attribute.Int("run.total_tokens", usage.TotalTokens),
			attribute.Int("run.input_tokens", usage.InputTokens),
			attribute.Int("run.output_tokens", usage.OutputTokens),
			attribute.Int("run.cached_input_tokens", usage.CachedInputTokens),
			attribute.Int("run.reasoning_tokens", usage.ReasoningTokens),
		)
	}

	if writeErr := writeRunReport(output, report, o.dryRun); writeErr != nil {
		span.SetStatus(codes.Error, "write_run_report")
		return fmt.Errorf("write run report: %w", writeErr)
	}
	if writeErr := writeRunReportArtifact(o.outputPath, report, jsonDetail); writeErr != nil {
		span.SetStatus(codes.Error, "write_run_report_artifact")
		return fmt.Errorf("write run report artifact: %w", writeErr)
	}

	if err != nil {
		span.SetStatus(codes.Error, "run_service_error")
		return err
	}
	if report.Failed > 0 {
		span.SetStatus(codes.Error, "run_task_failures")
		return fmt.Errorf("run completed with failures: %d", report.Failed)
	}

	return nil
}

func syncInteractiveScopeFlags(cmd *cobra.Command, o runOptions) {
	if flag := cmd.Flags().Lookup("group"); flag != nil {
		flag.Changed = strings.TrimSpace(o.group) != ""
	}
	if flag := cmd.Flags().Lookup("bucket"); flag != nil {
		flag.Changed = strings.TrimSpace(o.bucket) != ""
	}
	if flag := cmd.Flags().Lookup("file"); flag != nil {
		flag.Changed = len(o.sourcePaths) > 0
	}
	hasLocales := len(o.targetLocales) > 0
	if flag := cmd.Flags().Lookup("locale"); flag != nil {
		flag.Changed = hasLocales
	}
	if flag := cmd.Flags().Lookup("target-locale"); flag != nil {
		flag.Changed = hasLocales
	}
}

func writeRunReportArtifact(path string, report runsvc.Report, jsonDetail string) error {
	trimmed := strings.TrimSpace(path)
	if trimmed == "" {
		return nil
	}
	if err := os.MkdirAll(filepath.Dir(trimmed), 0o755); err != nil {
		return err
	}
	payload, err := runsvc.ReportForJSON(report, jsonDetail)
	if err != nil {
		return err
	}
	out, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return err
	}
	out = append(out, '\n')
	return os.WriteFile(trimmed, out, 0o644)
}

func writeRunReport(w io.Writer, report runsvc.Report, dryRun bool) error {
	if _, err := fmt.Fprintf(
		w,
		"planned_total=%d skipped_by_lock=%d executable_total=%d deferred_by_limit=%d\n",
		report.PlannedTotal,
		report.SkippedByLock,
		report.ExecutableTotal,
		report.DeferredByLimit,
	); err != nil {
		return err
	}

	if len(report.Executable) > 0 {
		if _, err := fmt.Fprintln(w, "tasks:"); err != nil {
			return err
		}
		for _, task := range report.Executable {
			if _, err := fmt.Fprintf(
				w,
				"- target=%s key=%s source=%s target_locale=%s profile=%s\n",
				task.TargetPath,
				task.EntryKey,
				task.SourceLocale,
				task.TargetLocale,
				task.ProfileName,
			); err != nil {
				return err
			}
		}
	}

	if len(report.Skipped) > 0 {
		if _, err := fmt.Fprintln(w, "skipped_by_lock:"); err != nil {
			return err
		}
		for _, task := range report.Skipped {
			if _, err := fmt.Fprintf(w, "- target=%s key=%s\n", task.TargetPath, task.EntryKey); err != nil {
				return err
			}
		}
	}

	if dryRun {
		if len(report.PruneCandidates) > 0 {
			if _, err := fmt.Fprintf(w, "prune_candidates=%d\n", len(report.PruneCandidates)); err != nil {
				return err
			}
			for _, candidate := range report.PruneCandidates {
				if _, err := fmt.Fprintf(w, "prune target=%s key=%s\n", candidate.TargetPath, candidate.EntryKey); err != nil {
					return err
				}
			}
		}
		for _, warning := range report.Warnings {
			if _, err := fmt.Fprintf(w, "warning=%s\n", warning); err != nil {
				return err
			}
		}
		_, err := fmt.Fprintln(w, "dry_run=true")
		return err
	}

	if _, err := fmt.Fprintf(
		w,
		"succeeded=%d failed=%d persisted_to_lock=%d\n",
		report.Succeeded,
		report.Failed,
		report.PersistedToLock,
	); err != nil {
		return err
	}
	usage := runsvc.NormalizeTokenUsage(report.TokenUsage)
	if _, err := fmt.Fprintf(w, "prompt_tokens=%d completion_tokens=%d total_tokens=%d\n", usage.PromptTokens, usage.CompletionTokens, usage.TotalTokens); err != nil {
		return err
	}
	if hasRichTokenUsage(usage) {
		if _, err := fmt.Fprintf(w, "input_tokens=%d output_tokens=%d cached_input_tokens=%d reasoning_tokens=%d\n", usage.InputTokens, usage.OutputTokens, usage.CachedInputTokens, usage.ReasoningTokens); err != nil {
			return err
		}
	}
	if report.ContextMemoryEnabled {
		if _, err := fmt.Fprintf(
			w,
			"context_memory_enabled=%t context_memory_scope=%s context_memory_generated=%d context_memory_fallback_groups=%d\n",
			report.ContextMemoryEnabled,
			report.ContextMemoryScope,
			report.ContextMemoryGenerated,
			report.ContextMemoryFallbackGroups,
		); err != nil {
			return err
		}
	}
	if len(report.LocaleUsage) > 0 {
		locales := make([]string, 0, len(report.LocaleUsage))
		for locale := range report.LocaleUsage {
			locales = append(locales, locale)
		}
		sort.Strings(locales)
		for _, locale := range locales {
			usage := runsvc.NormalizeTokenUsage(report.LocaleUsage[locale])
			if _, err := fmt.Fprintf(w, "locale_usage locale=%s prompt_tokens=%d completion_tokens=%d total_tokens=%d\n", locale, usage.PromptTokens, usage.CompletionTokens, usage.TotalTokens); err != nil {
				return err
			}
		}
	}

	for _, failure := range report.Failures {
		if _, err := fmt.Fprintf(w, "failure target=%s key=%s reason=%s\n", failure.TargetPath, failure.EntryKey, failure.Reason); err != nil {
			return err
		}
	}
	for _, warning := range report.Warnings {
		if _, err := fmt.Fprintf(w, "warning=%s\n", warning); err != nil {
			return err
		}
	}

	if _, err := fmt.Fprintf(w, "prune_applied=%d\n", report.PruneApplied); err != nil {
		return err
	}

	return nil
}

func hasRichTokenUsage(usage runsvc.TokenUsage) bool {
	return usage.CachedInputTokens != 0 ||
		usage.CacheWriteInputTokens != 0 ||
		usage.ReasoningTokens != 0 ||
		usage.TextInputTokens != 0 ||
		usage.ImageInputTokens != 0 ||
		usage.AudioInputTokens != 0 ||
		usage.TextOutputTokens != 0 ||
		usage.ImageOutputTokens != 0 ||
		usage.AudioOutputTokens != 0 ||
		usage.ToolInputTokens != 0 ||
		usage.AcceptedPredictionTokens != 0 ||
		usage.RejectedPredictionTokens != 0
}
