package cmd

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"os/signal"
	"path/filepath"
	"regexp"
	"runtime"
	"slices"
	"strconv"
	"strings"

	"charm.land/lipgloss/v2"
	"github.com/hyperlocalise/hyperlocalise/apps/cli/internal/cliotel"
	"github.com/hyperlocalise/hyperlocalise/apps/cli/internal/i18n/pathresolver"
	"github.com/hyperlocalise/hyperlocalise/apps/cli/internal/i18n/runsvc"
	"github.com/hyperlocalise/hyperlocalise/apps/cli/internal/progressui"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/htmltagparity"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/icuparser"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/storage"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/translationfileparser"
	config "github.com/hyperlocalise/hyperlocalise/pkg/i18nconfig"
	"github.com/mattn/go-isatty"
	"github.com/spf13/cobra"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"
)

var runCheckFixSvc = runsvc.Run

// checkFixProgressMode controls progress UI during check --fix (tests may set to ModeOn to assert wiring).
var checkFixProgressMode = progressui.ModeAuto

const (
	checkNotLocalized      = "not_localized"
	checkSameAsSource      = "same_as_source"
	checkOrphanedKey       = "orphaned_key"
	checkMissingTargetFile = "missing_target_file"
	checkPlaceholder       = "placeholder_mismatch"
	checkHTMLTag           = "html_tag_mismatch"
	checkICUShape          = "icu_shape_mismatch"
	checkMarkdownAST       = "markdown_ast_mismatch"
	checkWhitespaceOnly    = "whitespace_only"
	checkSeverityError     = "error"
	checkSeverityWarning   = "warning"
)

var (
	errCheckFindings = errors.New("check found issues")
	allCheckTypes    = []string{
		checkNotLocalized,
		checkSameAsSource,
		checkOrphanedKey,
		checkMissingTargetFile,
		checkPlaceholder,
		checkHTMLTag,
		checkICUShape,
		checkMarkdownAST,
		checkWhitespaceOnly,
	}
)

type checkOptions struct {
	configPath    string
	locales       []string
	group         string
	bucket        string
	file          string
	key           string
	diffStdin     bool
	diffContent   []byte
	checks        []string
	excludeChecks []string
	format        string
	outputFile    string
	jsonReport    string
	noFail        bool
	fix           bool
	fixDryRun     bool
	workers       int
	quiet         bool
}

type checkFinding struct {
	Type           string `json:"type"`
	Severity       string `json:"severity"`
	Bucket         string `json:"bucket"`
	Locale         string `json:"locale,omitempty"`
	SourceFile     string `json:"sourceFile"`
	TargetFile     string `json:"targetFile,omitempty"`
	Key            string `json:"key,omitempty"`
	Message        string `json:"message,omitempty"`
	AnnotationFile string `json:"annotationFile,omitempty"`
	AnnotationLine int    `json:"annotationLine,omitempty"`
}

type checkSummary struct {
	Total      int            `json:"total"`
	ByCheck    map[string]int `json:"byCheck"`
	BySeverity map[string]int `json:"bySeverity"`
	ByBucket   map[string]int `json:"byBucket"`
	ByLocale   map[string]int `json:"byLocale"`
}

type checkLocationResolver struct {
	content map[string][]byte
}

type checkReport struct {
	Checks   []string       `json:"checks"`
	Findings []checkFinding `json:"findings"`
	Summary  checkSummary   `json:"summary"`
}

type checkSelection struct {
	fileFilterAbs         string
	keyFilter             string
	diffMode              bool
	sourcePaths           map[string]struct{}
	keysBySource          map[string]map[string]struct{}
	keysBySourceAndLocale map[string]map[string]map[string]struct{}
}

type checkDiffPathIndex struct {
	sourceToSource map[string]string
	targetToSource map[string]checkTargetScope
}

type checkTargetScope struct {
	sourcePath string
	locale     string
}

type checkParsedDiff struct {
	files map[string]map[string]struct{}
}

var checkDiffKeyPattern = regexp.MustCompile(`^\s*"((?:\\.|[^"\\])+)\"\s*:`)

func defaultCheckOptions() checkOptions {
	return checkOptions{format: "stylish"}
}

func newCheckCmd() *cobra.Command {
	o := defaultCheckOptions()

	cmd := &cobra.Command{
		Use:          "check",
		Short:        "check localized files for integrity issues",
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			baseCtx := cmd.Context()
			if baseCtx == nil {
				baseCtx = context.Background()
			}
			tr := otel.Tracer(cliotel.InstrumentationName)
			ctx, span := tr.Start(baseCtx, cliotel.CommandSpanName(cmd))
			defer span.End()

			formatLower := strings.ToLower(o.format)
			span.SetAttributes(
				attribute.Bool("cli.check.fix", o.fix),
				attribute.Bool("cli.check.fix_dry_run", o.fixDryRun),
				attribute.Bool("cli.check.no_fail", o.noFail),
				attribute.Bool("cli.check.quiet", o.quiet),
				attribute.String("cli.check.format", checkFormatTelemetryValue(formatLower)),
			)
			if o.fix {
				span.SetAttributes(attribute.Int("cli.workers", o.workers))
			}
			if o.diffStdin && o.diffContent == nil {
				diffContent, err := io.ReadAll(cmd.InOrStdin())
				if err != nil {
					span.SetStatus(codes.Error, "read_diff_stdin")
					return fmt.Errorf("read diff from stdin: %w", err)
				}
				o.diffContent = diffContent
			}

			report, err := runCheck(ctx, o)
			if err != nil {
				span.SetStatus(codes.Error, "check_run")
				return err
			}

			display := applyCheckQuiet(report, o.quiet)

			format := formatLower
			stdout := cmd.OutOrStdout()
			switch {
			case o.outputFile == "":
				if err := writeCheckReport(stdout, display, format); err != nil {
					span.SetStatus(codes.Error, "write_check_output")
					return fmt.Errorf("write check output: %w", err)
				}
			case format == "stylish":
				// Stylish uses *os.File for TTY color detection; MultiWriter would strip stdout color.
				if err := writeCheckReport(stdout, display, format); err != nil {
					span.SetStatus(codes.Error, "write_check_output")
					return fmt.Errorf("write check output: %w", err)
				}
				var buf bytes.Buffer
				if err := writeCheckReport(&buf, display, format); err != nil {
					span.SetStatus(codes.Error, "write_check_output")
					return err
				}
				if err := os.WriteFile(o.outputFile, buf.Bytes(), 0o600); err != nil {
					span.SetStatus(codes.Error, "write_output_file")
					return fmt.Errorf("write output file %q: %w", o.outputFile, err)
				}
			default:
				var buf bytes.Buffer
				if err := writeCheckReport(io.MultiWriter(stdout, &buf), display, format); err != nil {
					span.SetStatus(codes.Error, "write_check_output")
					return fmt.Errorf("write check output: %w", err)
				}
				if err := os.WriteFile(o.outputFile, buf.Bytes(), 0o600); err != nil {
					span.SetStatus(codes.Error, "write_output_file")
					return fmt.Errorf("write output file %q: %w", o.outputFile, err)
				}
			}
			if o.jsonReport != "" {
				if err := writeCheckJSONReportFile(o.jsonReport, display); err != nil {
					span.SetStatus(codes.Error, "write_json_report")
					return err
				}
			}
			if !o.fix {
				applyCheckSpanSummary(span, display.Summary)
				if display.Summary.Total > 0 && !o.noFail {
					span.SetStatus(codes.Error, "check_findings")
					return errCheckFindings
				}
				return nil
			}

			after, err := executeCheckFix(cmd, ctx, o, report)
			if err != nil {
				span.SetStatus(codes.Error, "check_fix")
				return err
			}
			exitReport := display
			if after != nil {
				exitReport = applyCheckQuiet(*after, o.quiet)
			}
			applyCheckSpanSummary(span, exitReport.Summary)
			if o.fix && after != nil {
				span.SetAttributes(attribute.Bool("check.fix_second_pass", true))
			}
			if exitReport.Summary.Total > 0 && !o.noFail {
				span.SetStatus(codes.Error, "check_findings")
				return errCheckFindings
			}
			return nil
		},
	}

	cmd.Flags().StringVar(&o.configPath, "config", "", "path to i18n config")
	cmd.Flags().StringSliceVar(&o.locales, "locale", nil, "target locale(s) to check")
	cmd.Flags().StringVar(&o.group, "group", "", "filter by group name")
	cmd.Flags().StringVar(&o.bucket, "bucket", "", "filter by bucket name")
	cmd.Flags().StringVar(&o.file, "file", "", "filter by source file path")
	cmd.Flags().StringVar(&o.key, "key", "", "filter by translation key")
	cmd.Flags().BoolVar(&o.diffStdin, "diff-stdin", false, "read a unified diff from stdin and only check changed keys in supported key-value files")
	cmd.Flags().StringSliceVar(&o.checks, "check", nil, "check(s) to run")
	cmd.Flags().StringSliceVar(&o.excludeChecks, "exclude-check", nil, "default check(s) to skip")
	cmd.Flags().StringVar(&o.format, "format", o.format, "output format: stylish (default), text, or json")
	cmd.Flags().StringVar(&o.outputFile, "output-file", "", "optional report file path (same format as stdout)")
	cmd.Flags().StringVar(&o.jsonReport, "json-report", "", "write machine-readable JSON report to this path (independent of --format)")
	cmd.Flags().BoolVar(&o.noFail, "no-fail", false, "report findings without exiting non-zero")
	cmd.Flags().BoolVar(&o.fix, "fix", false, "retranslate fixable findings using the same AI pipeline as run (requires API credentials)")
	cmd.Flags().BoolVar(&o.fixDryRun, "fix-dry-run", false, "with --fix, plan translation tasks without writing targets or calling the API")
	cmd.Flags().IntVar(&o.workers, "workers", 0, "with --fix, number of parallel translation workers (default: number of CPU cores)")
	cmd.Flags().BoolVar(&o.quiet, "quiet", false, "omit warning-severity findings from output and JSON report; exit 0 when only warnings exist (errors and --fix still use the full result)")

	return cmd
}

func checkFormatTelemetryValue(f string) string {
	switch strings.TrimSpace(strings.ToLower(f)) {
	case "stylish", "text", "json":
		return strings.TrimSpace(strings.ToLower(f))
	default:
		return "other"
	}
}

func applyCheckSpanSummary(span trace.Span, s checkSummary) {
	if !span.IsRecording() {
		return
	}
	attrs := []attribute.KeyValue{
		attribute.Int("check.findings_total", s.Total),
		attribute.Int("check.severity_error", summarySeverityCount(s, checkSeverityError)),
		attribute.Int("check.severity_warning", summarySeverityCount(s, checkSeverityWarning)),
	}
	for _, typ := range allCheckTypes {
		if n := s.ByCheck[typ]; n > 0 {
			attrs = append(attrs, attribute.Int("check.type."+typ, n))
		}
	}
	span.SetAttributes(attrs...)
}

func summarySeverityCount(s checkSummary, sev string) int {
	if s.BySeverity == nil {
		return 0
	}
	return s.BySeverity[sev]
}

func runCheck(ctx context.Context, o checkOptions) (checkReport, error) {
	tr := otel.Tracer(cliotel.InstrumentationName)

	_, resolveSpan := tr.Start(ctx, "check.resolve")
	selection, err := newCheckSelection(o.file, o.key, o.diffStdin)
	if err != nil {
		resolveSpan.SetStatus(codes.Error, "resolve_selection")
		resolveSpan.End()
		return checkReport{}, err
	}
	cfg, err := config.Load(o.configPath)
	if err != nil {
		resolveSpan.SetStatus(codes.Error, "load_config")
		resolveSpan.End()
		return checkReport{}, fmt.Errorf("load config: %w", err)
	}
	locales, err := resolveStatusLocales(cfg, o.locales, o.group)
	if err != nil {
		resolveSpan.SetStatus(codes.Error, "resolve_locales")
		resolveSpan.End()
		return checkReport{}, err
	}
	if len(locales) == 0 {
		err = fmt.Errorf("no locales selected")
		resolveSpan.SetStatus(codes.Error, "no_locales")
		resolveSpan.End()
		return checkReport{}, err
	}
	buckets, err := selectedStatusBuckets(cfg, o.group, o.bucket)
	if err != nil {
		resolveSpan.SetStatus(codes.Error, "resolve_buckets")
		resolveSpan.End()
		return checkReport{}, err
	}
	enabledChecks, err := resolveEnabledChecks(o.checks, o.excludeChecks)
	if err != nil {
		resolveSpan.SetStatus(codes.Error, "resolve_checks")
		resolveSpan.End()
		return checkReport{}, err
	}
	if o.diffStdin {
		enabledChecks = filterChecksForDiffScope(enabledChecks)
		if err := selection.loadDiffScope(o.diffContent, cfg, buckets, locales); err != nil {
			resolveSpan.SetStatus(codes.Error, "resolve_diff_scope")
			resolveSpan.End()
			return checkReport{}, err
		}
	}
	resolveSpan.SetAttributes(
		attribute.Int("check.locale_count", len(locales)),
		attribute.Int("check.bucket_count", len(buckets)),
	)
	resolveSpan.End()

	_, collectSpan := tr.Start(ctx, "check.collect_findings")
	findings, err := collectCheckFindings(cfg, buckets, locales, enabledChecks, selection)
	if err != nil {
		collectSpan.SetStatus(codes.Error, "collect_findings")
		collectSpan.End()
		return checkReport{}, err
	}
	collectSpan.End()

	sortCheckFindings(findings)
	return checkReport{Checks: enabledChecks, Findings: findings, Summary: summarizeCheckFindings(findings)}, nil
}

func applyCheckQuiet(r checkReport, quiet bool) checkReport {
	if !quiet {
		return r
	}
	return filterCheckReportErrorsOnly(r)
}

func filterCheckReportErrorsOnly(r checkReport) checkReport {
	out := make([]checkFinding, 0, len(r.Findings))
	for _, f := range r.Findings {
		if f.Severity == checkSeverityError {
			out = append(out, f)
		}
	}
	sortCheckFindings(out)
	return checkReport{
		Checks:   r.Checks,
		Findings: out,
		Summary:  summarizeCheckFindings(out),
	}
}

func executeCheckFix(cmd *cobra.Command, parentCtx context.Context, o checkOptions, initial checkReport) (*checkReport, error) {
	targets := buildFixTargetsFromFindings(initial.Findings)
	mdScopes := buildFixMarkdownScopesFromFindings(initial.Findings)
	if len(targets) == 0 && len(mdScopes) == 0 {
		_, _ = fmt.Fprintln(cmd.ErrOrStderr(), "check fix: no fixable findings (skipped)")
		return nil, nil
	}
	workers := o.workers
	if workers < 0 {
		return nil, fmt.Errorf("invalid --workers value %d: must be >= 0", workers)
	}
	if workers == 0 {
		workers = runtime.NumCPU()
	}
	if workers < 1 {
		workers = 1
	}
	sourcePaths := uniqueSortedSourcePathsFromFixInputs(targets, mdScopes)

	tr := otel.Tracer(cliotel.InstrumentationName)
	fixCtx, fixSpan := tr.Start(parentCtx, "check.fix.run")
	defer fixSpan.End()
	fixSpan.SetAttributes(
		attribute.Int("check.fix_targets", len(targets)),
		attribute.Int("check.fix_markdown_scopes", len(mdScopes)),
	)

	output := cmd.OutOrStdout()
	runCtx, stop := signal.NotifyContext(fixCtx, os.Interrupt)
	defer stop()

	var renderer *progressui.Renderer
	if progressui.IsEnabled(checkFixProgressMode, output, nil) {
		renderer = progressui.New(output, checkFixProgressMode, progressui.Options{
			Label:       "Fixing translations",
			OnInterrupt: stop,
		})
	}
	if renderer != nil {
		defer renderer.Close()
	}

	runIn := runsvc.Input{
		ConfigPath:        o.configPath,
		Bucket:            o.bucket,
		Group:             o.group,
		SourcePaths:       sourcePaths,
		FixTargets:        targets,
		FixMarkdownScopes: mdScopes,
		Force:             true,
		Prune:             false,
		DryRun:            o.fixDryRun,
		Workers:           workers,
	}
	if renderer != nil {
		runIn.OnEvent = func(event runsvc.Event) {
			applyRunProgressEvent(renderer, event)
		}
	}

	rpt, err := runCheckFixSvc(runCtx, runIn)
	if renderer != nil {
		if err == nil {
			renderer.TokenUsage(rpt.PromptTokens, rpt.CompletionTokens, rpt.TotalTokens)
			renderer.Complete()
		}
	}
	if err != nil {
		fixSpan.SetStatus(codes.Error, "fix_run_service")
		return nil, err
	}
	for _, w := range rpt.Warnings {
		_, _ = fmt.Fprintf(cmd.ErrOrStderr(), "warning: %s\n", w)
	}
	if o.fixDryRun {
		return nil, nil
	}
	if rpt.Failed > 0 {
		fixSpan.SetStatus(codes.Error, "fix_run_failures")
		return nil, fmt.Errorf("check fix: run completed with %d failed task(s)", rpt.Failed)
	}

	_, verifySpan := tr.Start(parentCtx, "check.fix.verify")
	after, err := runCheck(parentCtx, o)
	if err != nil {
		verifySpan.SetStatus(codes.Error, "verify_rerun")
		verifySpan.End()
		return nil, err
	}
	verifySpan.End()
	if _, err := fmt.Fprintln(cmd.OutOrStdout(), ""); err != nil {
		return nil, err
	}
	if _, err := fmt.Fprintln(cmd.OutOrStdout(), "After fix:"); err != nil {
		return nil, err
	}
	format := strings.ToLower(o.format)
	afterOut := applyCheckQuiet(after, o.quiet)
	if err := writeCheckReport(cmd.OutOrStdout(), afterOut, format); err != nil {
		return nil, fmt.Errorf("write check output after fix: %w", err)
	}
	if o.outputFile != "" {
		var buf bytes.Buffer
		if err := writeCheckReport(&buf, afterOut, format); err != nil {
			return nil, fmt.Errorf("write check output file after fix: %w", err)
		}
		if err := os.WriteFile(o.outputFile, buf.Bytes(), 0o600); err != nil {
			return nil, fmt.Errorf("write output file %q: %w", o.outputFile, err)
		}
	}
	if o.jsonReport != "" {
		if err := writeCheckJSONReportFile(o.jsonReport, afterOut); err != nil {
			return nil, err
		}
	}
	return &after, nil
}

func buildFixTargetsFromFindings(findings []checkFinding) []runsvc.FixTarget {
	seen := make(map[string]struct{})
	var out []runsvc.FixTarget
	for _, f := range findings {
		if !isFixableFindingType(f.Type) || strings.TrimSpace(f.Key) == "" {
			continue
		}
		k := fixTargetDedupeKey(f.SourceFile, f.TargetFile, f.Locale, f.Key)
		if _, ok := seen[k]; ok {
			continue
		}
		seen[k] = struct{}{}
		out = append(out, runsvc.FixTarget{
			SourcePath:   f.SourceFile,
			TargetPath:   f.TargetFile,
			TargetLocale: f.Locale,
			EntryKey:     f.Key,
		})
	}
	return out
}

func buildFixMarkdownScopesFromFindings(findings []checkFinding) []runsvc.FixMarkdownScope {
	seen := make(map[string]struct{})
	var out []runsvc.FixMarkdownScope
	for _, f := range findings {
		if f.Type != checkMarkdownAST {
			continue
		}
		if strings.TrimSpace(f.SourceFile) == "" || strings.TrimSpace(f.TargetFile) == "" || strings.TrimSpace(f.Locale) == "" {
			continue
		}
		if !isMarkdownPath(f.TargetFile) {
			continue
		}
		k := fixMarkdownScopeDedupeKey(f.SourceFile, f.TargetFile, f.Locale)
		if _, ok := seen[k]; ok {
			continue
		}
		seen[k] = struct{}{}
		out = append(out, runsvc.FixMarkdownScope{
			SourcePath:   f.SourceFile,
			TargetPath:   f.TargetFile,
			TargetLocale: f.Locale,
		})
	}
	return out
}

func fixMarkdownScopeDedupeKey(sourcePath, targetPath, locale string) string {
	return strings.Join([]string{
		filepath.Clean(sourcePath),
		filepath.Clean(targetPath),
		locale,
	}, "\x00")
}

func fixTargetDedupeKey(sourcePath, targetPath, locale, key string) string {
	return strings.Join([]string{
		filepath.Clean(sourcePath),
		filepath.Clean(targetPath),
		locale,
		key,
	}, "\x00")
}

func isFixableFindingType(t string) bool {
	switch t {
	case checkNotLocalized, checkWhitespaceOnly, checkPlaceholder, checkHTMLTag, checkICUShape:
		return true
	default:
		return false
	}
}

func uniqueSortedSourcePathsFromFixInputs(targets []runsvc.FixTarget, mdScopes []runsvc.FixMarkdownScope) []string {
	seen := make(map[string]struct{})
	var out []string
	for _, t := range targets {
		p := filepath.Clean(t.SourcePath)
		if _, ok := seen[p]; ok {
			continue
		}
		seen[p] = struct{}{}
		out = append(out, t.SourcePath)
	}
	for _, ms := range mdScopes {
		p := filepath.Clean(ms.SourcePath)
		if _, ok := seen[p]; ok {
			continue
		}
		seen[p] = struct{}{}
		out = append(out, ms.SourcePath)
	}
	slices.Sort(out)
	return out
}

func resolveEnabledChecks(includes, excludes []string) ([]string, error) {
	known := make(map[string]struct{}, len(allCheckTypes))
	for _, name := range allCheckTypes {
		known[name] = struct{}{}
	}
	validate := func(values []string, flag string) error {
		for _, value := range values {
			if _, ok := known[value]; !ok {
				return fmt.Errorf("unknown %s %q", flag, value)
			}
		}
		return nil
	}
	if err := validate(includes, "check"); err != nil {
		return nil, err
	}
	if err := validate(excludes, "exclude-check"); err != nil {
		return nil, err
	}
	if len(includes) > 0 {
		if len(excludes) > 0 {
			_, _ = fmt.Fprintln(os.Stderr, "warning: --exclude-check is ignored when --check is provided")
		}
		return slices.Clone(includes), nil
	}
	excluded := make(map[string]struct{}, len(excludes))
	for _, name := range excludes {
		excluded[name] = struct{}{}
	}
	enabled := make([]string, 0, len(allCheckTypes))
	for _, name := range allCheckTypes {
		if _, skip := excluded[name]; skip {
			continue
		}
		enabled = append(enabled, name)
	}
	if len(enabled) == 0 {
		return nil, fmt.Errorf("no checks enabled")
	}
	return enabled, nil
}

func newCheckSelection(sourceFileFilter, keyFilter string, diffMode bool) (checkSelection, error) {
	selection := checkSelection{
		keyFilter:             strings.TrimSpace(keyFilter),
		diffMode:              diffMode,
		keysBySource:          make(map[string]map[string]struct{}),
		keysBySourceAndLocale: make(map[string]map[string]map[string]struct{}),
	}
	if diffMode && strings.TrimSpace(sourceFileFilter) != "" {
		return checkSelection{}, fmt.Errorf("--diff-stdin cannot be used with --file")
	}
	trimmedFileFilter := strings.TrimSpace(sourceFileFilter)
	if trimmedFileFilter == "" {
		return selection, nil
	}
	fileFilterAbs, err := checkPathKey(trimmedFileFilter)
	if err != nil {
		return checkSelection{}, fmt.Errorf("resolve --file path %q: %w", trimmedFileFilter, err)
	}
	selection.fileFilterAbs = fileFilterAbs
	return selection, nil
}

func filterChecksForDiffScope(enabledChecks []string) []string {
	filtered := make([]string, 0, len(enabledChecks))
	for _, name := range enabledChecks {
		switch name {
		case checkMissingTargetFile, checkOrphanedKey, checkMarkdownAST:
			continue
		default:
			filtered = append(filtered, name)
		}
	}
	return filtered
}

func collectCheckFindings(cfg *config.I18NConfig, buckets, locales, enabledChecks []string, selection checkSelection) ([]checkFinding, error) {
	parser := translationfileparser.NewDefaultStrategy()
	resolver := checkLocationResolver{content: make(map[string][]byte)}
	checkSet := make(map[string]struct{}, len(enabledChecks))
	for _, check := range enabledChecks {
		checkSet[check] = struct{}{}
	}

	var findings []checkFinding
	for _, bucketName := range buckets {
		bucket := cfg.Buckets[bucketName]
		for _, file := range bucket.Files {
			sourcePattern := pathresolver.ResolveSourcePath(file.From, cfg.Locales.Source)
			sourcePaths, err := resolveSourcePathsForStatus(sourcePattern)
			if err != nil {
				return nil, fmt.Errorf("resolve source paths for %q: %w", sourcePattern, err)
			}
			for _, sourcePath := range sourcePaths {
				if shouldIgnoreSourcePathForStatus(sourcePath, cfg.Locales.Targets) {
					continue
				}
				if !selection.matchesSource(sourcePath) {
					continue
				}
				sourceEntries, err := readEntriesForStatus(parser, sourcePath)
				if err != nil {
					return nil, err
				}
				for _, locale := range locales {
					targetPattern := pathresolver.ResolveTargetPath(file.To, cfg.Locales.Source, locale)
					targetPath, err := resolveTargetPathForStatus(sourcePattern, targetPattern, sourcePath)
					if err != nil {
						return nil, fmt.Errorf("resolve target path for source %q: %w", sourcePath, err)
					}

					targetEntries, sourceContent, targetContent, targetExists, err := readCheckTargetEntries(parser, sourcePath, targetPath)
					if err != nil {
						return nil, err
					}
					if !targetExists {
						if selection.allowsFileLevelChecks() {
							if _, ok := checkSet[checkMissingTargetFile]; ok {
								annotationFile, annotationLine := resolver.resolve(sourcePath, targetPath, "", "", "", true)
								findings = append(findings, checkFinding{
									Type:           checkMissingTargetFile,
									Severity:       severityForCheck(checkMissingTargetFile),
									Bucket:         bucketName,
									Locale:         locale,
									SourceFile:     sourcePath,
									TargetFile:     targetPath,
									Message:        "target file does not exist",
									AnnotationFile: annotationFile,
									AnnotationLine: annotationLine,
								})
							}
						}
						continue
					}

					findings = append(findings, collectEntryCheckFindings(&resolver, bucketName, locale, sourcePath, targetPath, sourceEntries, targetEntries, checkSet, selection)...)
					if selection.allowsDocumentLevelChecks() && hasCheck(checkSet, checkMarkdownAST) && isMarkdownPath(targetPath) {
						findings = append(findings, collectMarkdownASTParityFindings(&resolver, bucketName, locale, sourcePath, targetPath, sourceContent, targetContent)...)
					}
				}
			}
		}
	}

	return findings, nil
}

func (s checkSelection) matchesSource(sourcePath string) bool {
	sourceKey, err := checkPathKey(sourcePath)
	if err != nil {
		return false
	}
	if s.fileFilterAbs != "" && sourceKey != s.fileFilterAbs {
		return false
	}
	if len(s.sourcePaths) == 0 {
		return true
	}
	_, ok := s.sourcePaths[sourceKey]
	return ok
}

func (s checkSelection) allowsKey(sourcePath, locale, key string) bool {
	if s.keyFilter != "" && key != s.keyFilter {
		return false
	}
	if !s.diffMode {
		return true
	}

	sourceKey, err := checkPathKey(sourcePath)
	if err != nil {
		return false
	}
	allowedAny := s.keysBySource[sourceKey]
	allowedByLocale := s.keysBySourceAndLocale[sourceKey][locale]

	if len(allowedAny) == 0 && len(allowedByLocale) == 0 {
		return false
	}
	if _, ok := allowedAny[key]; ok {
		return true
	}
	_, ok := allowedByLocale[key]
	return ok
}

func (s checkSelection) allowsFileLevelChecks() bool {
	return !s.diffMode && s.keyFilter == ""
}

func (s checkSelection) allowsDocumentLevelChecks() bool {
	return !s.diffMode && s.keyFilter == ""
}

func (s *checkSelection) loadDiffScope(content []byte, cfg *config.I18NConfig, buckets, locales []string) error {
	if strings.TrimSpace(string(content)) == "" {
		return fmt.Errorf("read diff from stdin: no diff content")
	}

	parsed, err := parseCheckDiff(content)
	if err != nil {
		return err
	}
	index, err := buildCheckDiffPathIndex(cfg, buckets, locales)
	if err != nil {
		return err
	}

	s.sourcePaths = make(map[string]struct{})
	for changedPath, keys := range parsed.files {
		if len(keys) == 0 {
			continue
		}
		if sourcePath, ok := index.sourceToSource[changedPath]; ok {
			sourceKey, err := checkPathKey(sourcePath)
			if err != nil {
				return err
			}
			s.sourcePaths[sourceKey] = struct{}{}
			addCheckSelectionKeys(s.keysBySource, sourceKey, keys)
			continue
		}
		if targetScope, ok := index.targetToSource[changedPath]; ok {
			sourceKey, err := checkPathKey(targetScope.sourcePath)
			if err != nil {
				return err
			}
			s.sourcePaths[sourceKey] = struct{}{}
			addCheckSelectionLocaleKeys(s.keysBySourceAndLocale, sourceKey, targetScope.locale, keys)
		}
	}

	return nil
}

func addCheckSelectionKeys(dst map[string]map[string]struct{}, sourceKey string, keys map[string]struct{}) {
	keySet, ok := dst[sourceKey]
	if !ok {
		keySet = make(map[string]struct{}, len(keys))
		dst[sourceKey] = keySet
	}
	for key := range keys {
		keySet[key] = struct{}{}
	}
}

func addCheckSelectionLocaleKeys(dst map[string]map[string]map[string]struct{}, sourceKey, locale string, keys map[string]struct{}) {
	byLocale, ok := dst[sourceKey]
	if !ok {
		byLocale = make(map[string]map[string]struct{})
		dst[sourceKey] = byLocale
	}
	keySet, ok := byLocale[locale]
	if !ok {
		keySet = make(map[string]struct{}, len(keys))
		byLocale[locale] = keySet
	}
	for key := range keys {
		keySet[key] = struct{}{}
	}
}

func buildCheckDiffPathIndex(cfg *config.I18NConfig, buckets, locales []string) (checkDiffPathIndex, error) {
	index := checkDiffPathIndex{
		sourceToSource: make(map[string]string),
		targetToSource: make(map[string]checkTargetScope),
	}
	for _, bucketName := range buckets {
		bucket := cfg.Buckets[bucketName]
		for _, file := range bucket.Files {
			sourcePattern := pathresolver.ResolveSourcePath(file.From, cfg.Locales.Source)
			sourcePaths, err := resolveSourcePathsForStatus(sourcePattern)
			if err != nil {
				return checkDiffPathIndex{}, fmt.Errorf("resolve source paths for %q: %w", sourcePattern, err)
			}
			for _, sourcePath := range sourcePaths {
				if shouldIgnoreSourcePathForStatus(sourcePath, cfg.Locales.Targets) {
					continue
				}
				sourceKey, err := checkPathKey(sourcePath)
				if err != nil {
					return checkDiffPathIndex{}, err
				}
				index.sourceToSource[sourceKey] = sourcePath
				for _, locale := range locales {
					targetPattern := pathresolver.ResolveTargetPath(file.To, cfg.Locales.Source, locale)
					targetPath, err := resolveTargetPathForStatus(sourcePattern, targetPattern, sourcePath)
					if err != nil {
						return checkDiffPathIndex{}, fmt.Errorf("resolve target path for source %q: %w", sourcePath, err)
					}
					targetKey, err := checkPathKey(targetPath)
					if err != nil {
						return checkDiffPathIndex{}, err
					}
					index.targetToSource[targetKey] = checkTargetScope{
						sourcePath: sourcePath,
						locale:     locale,
					}
				}
			}
		}
	}
	return index, nil
}

func checkPathKey(path string) (string, error) {
	abs, err := filepath.Abs(path)
	if err != nil {
		return "", err
	}
	return filepath.Clean(abs), nil
}

func parseCheckDiff(content []byte) (checkParsedDiff, error) {
	lines := strings.Split(string(content), "\n")
	parsed := checkParsedDiff{files: make(map[string]map[string]struct{})}

	var oldPath string
	var currentPath string
	sawHeader := false
	for _, line := range lines {
		switch {
		case strings.HasPrefix(line, "diff --git "):
			oldPath = ""
			currentPath = ""
		case strings.HasPrefix(line, "--- "):
			oldPath = parseCheckDiffPath(strings.TrimPrefix(line, "--- "))
		case strings.HasPrefix(line, "+++ "):
			newPath := parseCheckDiffPath(strings.TrimPrefix(line, "+++ "))
			currentPath = chooseCheckDiffPath(oldPath, newPath)
			if currentPath != "" {
				sawHeader = true
				if _, ok := parsed.files[currentPath]; !ok {
					parsed.files[currentPath] = make(map[string]struct{})
				}
			}
		case strings.HasPrefix(line, "@@"):
			if currentPath == "" {
				continue
			}
		default:
			if currentPath == "" || !checkDiffSupportsChangedKeys(currentPath) {
				continue
			}
			if line == "" {
				continue
			}
			if line[0] != '+' && line[0] != '-' {
				continue
			}
			if strings.HasPrefix(line, "+++") || strings.HasPrefix(line, "---") {
				continue
			}
			key, ok := extractCheckDiffKey(line[1:])
			if !ok {
				continue
			}
			parsed.files[currentPath][key] = struct{}{}
		}
	}

	if !sawHeader {
		return checkParsedDiff{}, fmt.Errorf("parse diff from stdin: malformed unified diff")
	}
	return parsed, nil
}

func parseCheckDiffPath(raw string) string {
	path := strings.TrimSpace(raw)
	if idx := strings.IndexByte(path, '\t'); idx >= 0 {
		path = path[:idx]
	}
	if idx := strings.IndexByte(path, ' '); idx >= 0 {
		path = path[:idx]
	}
	path = strings.TrimSpace(path)
	if path == "/dev/null" || path == "" {
		return ""
	}
	if strings.HasPrefix(path, "a/") || strings.HasPrefix(path, "b/") {
		path = path[2:]
	}
	key, err := checkPathKey(path)
	if err != nil {
		return ""
	}
	return key
}

func chooseCheckDiffPath(oldPath, newPath string) string {
	if newPath != "" {
		return newPath
	}
	return oldPath
}

func checkDiffSupportsChangedKeys(path string) bool {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".json", ".jsonc", ".arb":
		return true
	default:
		return false
	}
}

func extractCheckDiffKey(line string) (string, bool) {
	match := checkDiffKeyPattern.FindStringSubmatch(line)
	if len(match) != 2 {
		return "", false
	}
	key, err := strconv.Unquote(`"` + match[1] + `"`)
	if err != nil {
		return "", false
	}
	return key, true
}

func readCheckTargetEntries(parser *translationfileparser.Strategy, sourcePath, targetPath string) (map[string]string, []byte, []byte, bool, error) {
	ext := strings.ToLower(filepath.Ext(targetPath))
	if ext == ".md" || ext == ".mdx" {
		sourceContent, err := os.ReadFile(sourcePath)
		if err != nil {
			return nil, nil, nil, false, err
		}
		targetContent, err := os.ReadFile(targetPath)
		if err != nil {
			if errors.Is(err, fs.ErrNotExist) {
				return nil, nil, nil, false, nil
			}
			return nil, nil, nil, false, err
		}
		targetEntries := translationfileparser.AlignMarkdownTargetToSource(sourceContent, targetContent, ext == ".mdx")
		return targetEntries, sourceContent, targetContent, true, nil
	}

	targetEntries, err := readTargetEntriesForStatus(parser, sourcePath, targetPath)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return nil, nil, nil, false, nil
		}
		return nil, nil, nil, false, err
	}
	return targetEntries, nil, nil, true, nil
}

func collectEntryCheckFindings(resolver *checkLocationResolver, bucketName, locale, sourcePath, targetPath string, sourceEntries, targetEntries map[string]string, checkSet map[string]struct{}, selection checkSelection) []checkFinding {
	keys := make([]string, 0, len(sourceEntries))
	for key := range sourceEntries {
		keys = append(keys, key)
	}
	slices.Sort(keys)

	findings := make([]checkFinding, 0)
	for _, key := range keys {
		if !selection.allowsKey(sourcePath, locale, key) {
			continue
		}
		sourceValue := sourceEntries[key]
		targetValue, hasTargetKey := targetEntries[key]
		isWhitespaceOnlyTarget := hasTargetKey && targetValue != "" && strings.TrimSpace(targetValue) == ""
		reportedMissingOrEmpty := false

		if _, ok := checkSet[checkNotLocalized]; ok && isMissingOrEmptyTarget(sourceValue, targetValue, hasTargetKey) {
			reportedMissingOrEmpty = true
			annotationFile, annotationLine := resolver.resolve(sourcePath, targetPath, key, sourceValue, targetValue, !hasTargetKey)
			findings = append(findings, checkFinding{
				Type:           checkNotLocalized,
				Severity:       severityForCheck(checkNotLocalized),
				Bucket:         bucketName,
				Locale:         locale,
				SourceFile:     sourcePath,
				TargetFile:     targetPath,
				Key:            key,
				Message:        describeNotLocalized(sourceValue, targetValue, hasTargetKey),
				AnnotationFile: annotationFile,
				AnnotationLine: annotationLine,
			})
		}
		if _, ok := checkSet[checkSameAsSource]; ok && isSameAsSourceText(sourceValue, targetValue, hasTargetKey) {
			annotationFile, annotationLine := resolver.resolve(sourcePath, targetPath, key, sourceValue, targetValue, false)
			findings = append(findings, checkFinding{
				Type:           checkSameAsSource,
				Severity:       severityForCheck(checkSameAsSource),
				Bucket:         bucketName,
				Locale:         locale,
				SourceFile:     sourcePath,
				TargetFile:     targetPath,
				Key:            key,
				Message:        describeSameAsSource(),
				AnnotationFile: annotationFile,
				AnnotationLine: annotationLine,
			})
		}
		if !hasTargetKey {
			continue
		}
		if reportedMissingOrEmpty && isWhitespaceOnlyTarget {
			continue
		}
		if _, ok := checkSet[checkWhitespaceOnly]; ok && isWhitespaceOnlyTarget {
			annotationFile, annotationLine := resolver.resolve(sourcePath, targetPath, key, sourceValue, targetValue, false)
			findings = append(findings, checkFinding{
				Type:           checkWhitespaceOnly,
				Severity:       severityForCheck(checkWhitespaceOnly),
				Bucket:         bucketName,
				Locale:         locale,
				SourceFile:     sourcePath,
				TargetFile:     targetPath,
				Key:            key,
				Message:        "target value contains only whitespace",
				AnnotationFile: annotationFile,
				AnnotationLine: annotationLine,
			})
		}
		if _, ok := checkSet[checkHTMLTag]; ok && htmltagparity.Mismatch(sourceValue, targetValue) {
			annotationFile, annotationLine := resolver.resolve(sourcePath, targetPath, key, sourceValue, targetValue, false)
			findings = append(findings, checkFinding{
				Type:           checkHTMLTag,
				Severity:       severityForCheck(checkHTMLTag),
				Bucket:         bucketName,
				Locale:         locale,
				SourceFile:     sourcePath,
				TargetFile:     targetPath,
				Key:            key,
				Message:        "html tag structure differs from source",
				AnnotationFile: annotationFile,
				AnnotationLine: annotationLine,
			})
		}
		shouldCheckInvariant := hasCheck(checkSet, checkPlaceholder) || (hasCheck(checkSet, checkICUShape) && !isMarkdownPath(targetPath))
		if shouldCheckInvariant {
			diags := validateCheckInvariant(storage.Entry{Key: key, Locale: locale, Value: targetValue}, storage.Entry{Key: key, Locale: locale, Value: sourceValue})
			if _, ok := checkSet[checkPlaceholder]; ok {
				for _, diag := range diags {
					if strings.Contains(diag, "placeholder parity mismatch") {
						annotationFile, annotationLine := resolver.resolve(sourcePath, targetPath, key, sourceValue, targetValue, false)
						findings = append(findings, checkFinding{
							Type:           checkPlaceholder,
							Severity:       severityForCheck(checkPlaceholder),
							Bucket:         bucketName,
							Locale:         locale,
							SourceFile:     sourcePath,
							TargetFile:     targetPath,
							Key:            key,
							Message:        diag,
							AnnotationFile: annotationFile,
							AnnotationLine: annotationLine,
						})
					}
				}
			}
			if _, ok := checkSet[checkICUShape]; ok && !isMarkdownPath(targetPath) {
				for _, diag := range diags {
					if strings.Contains(diag, "ICU parity mismatch") || strings.Contains(diag, "invalid ICU/braces structure") || strings.Contains(diag, "duplicate # tokens") {
						annotationFile, annotationLine := resolver.resolve(sourcePath, targetPath, key, sourceValue, targetValue, false)
						findings = append(findings, checkFinding{
							Type:           checkICUShape,
							Severity:       severityForCheck(checkICUShape),
							Bucket:         bucketName,
							Locale:         locale,
							SourceFile:     sourcePath,
							TargetFile:     targetPath,
							Key:            key,
							Message:        diag,
							AnnotationFile: annotationFile,
							AnnotationLine: annotationLine,
						})
					}
				}
			}
		}
	}

	if _, ok := checkSet[checkOrphanedKey]; ok {
		orphanedKeys := make([]string, 0)
		for key := range targetEntries {
			if _, exists := sourceEntries[key]; !exists {
				orphanedKeys = append(orphanedKeys, key)
			}
		}
		slices.Sort(orphanedKeys)
		for _, key := range orphanedKeys {
			if !selection.allowsKey(sourcePath, locale, key) {
				continue
			}
			annotationFile, annotationLine := resolver.resolve(sourcePath, targetPath, key, "", targetEntries[key], false)
			findings = append(findings, checkFinding{
				Type:           checkOrphanedKey,
				Severity:       severityForCheck(checkOrphanedKey),
				Bucket:         bucketName,
				Locale:         locale,
				SourceFile:     sourcePath,
				TargetFile:     targetPath,
				Key:            key,
				Message:        "target key is not present in source",
				AnnotationFile: annotationFile,
				AnnotationLine: annotationLine,
			})
		}
	}

	return findings
}

func collectMarkdownASTParityFindings(resolver *checkLocationResolver, bucketName, locale, sourcePath, targetPath string, sourceContent, targetContent []byte) []checkFinding {
	if len(sourceContent) == 0 || len(targetContent) == 0 {
		return nil
	}
	sourceMDX := strings.EqualFold(filepath.Ext(sourcePath), ".mdx")
	targetMDX := strings.EqualFold(filepath.Ext(targetPath), ".mdx")
	sourcePaths := translationfileparser.MarkdownASTPaths(sourceContent, sourceMDX)
	targetPaths := translationfileparser.MarkdownASTPaths(targetContent, targetMDX)

	sourceSet := make(map[string]struct{}, len(sourcePaths))
	for _, path := range sourcePaths {
		sourceSet[path] = struct{}{}
	}
	targetSet := make(map[string]struct{}, len(targetPaths))
	for _, path := range targetPaths {
		targetSet[path] = struct{}{}
	}

	var findings []checkFinding

	missingPaths := make([]string, 0)
	for _, path := range sourcePaths {
		if _, ok := targetSet[path]; !ok {
			missingPaths = append(missingPaths, path)
		}
	}
	slices.Sort(missingPaths)
	missingAnnotationFile, missingAnnotationLine := resolver.resolve(sourcePath, targetPath, "", "", "", true)
	for _, path := range missingPaths {
		findings = append(findings, checkFinding{
			Type:           checkMarkdownAST,
			Severity:       severityForCheck(checkMarkdownAST),
			Bucket:         bucketName,
			Locale:         locale,
			SourceFile:     sourcePath,
			TargetFile:     targetPath,
			Key:            "",
			Message:        fmt.Sprintf("markdown AST parity mismatch: target is missing source path %q", path),
			AnnotationFile: missingAnnotationFile,
			AnnotationLine: missingAnnotationLine,
		})
	}

	extraPaths := make([]string, 0)
	for _, path := range targetPaths {
		if _, ok := sourceSet[path]; !ok {
			extraPaths = append(extraPaths, path)
		}
	}
	slices.Sort(extraPaths)
	extraAnnotationFile, extraAnnotationLine := resolver.resolve(sourcePath, targetPath, "", "", "", false)
	for _, path := range extraPaths {
		findings = append(findings, checkFinding{
			Type:           checkMarkdownAST,
			Severity:       severityForCheck(checkMarkdownAST),
			Bucket:         bucketName,
			Locale:         locale,
			SourceFile:     sourcePath,
			TargetFile:     targetPath,
			Key:            "",
			Message:        fmt.Sprintf("markdown AST parity mismatch: target has unexpected path %q", path),
			AnnotationFile: extraAnnotationFile,
			AnnotationLine: extraAnnotationLine,
		})
	}

	return findings
}

func hasCheck(checkSet map[string]struct{}, name string) bool {
	_, ok := checkSet[name]
	return ok
}

func isMarkdownPath(path string) bool {
	ext := strings.ToLower(filepath.Ext(path))
	return ext == ".md" || ext == ".mdx"
}

func validateCheckInvariant(candidate, baseline storage.Entry) []string {
	baseInv, baseErr := icuparser.ParseInvariant(baseline.Value)
	candInv, candErr := icuparser.ParseInvariant(candidate.Value)

	var diags []string
	if baseErr != nil || candErr != nil {
		if baseErr == nil && candErr != nil {
			diags = append(diags, fmt.Sprintf("invalid ICU/braces structure in candidate: %v", candErr))
		}
		return diags
	}
	if !icuparser.SamePlaceholderSet(baseInv.Placeholders, candInv.Placeholders) {
		diags = append(diags, fmt.Sprintf("placeholder parity mismatch (expected %v, got %v)", baseInv.Placeholders, candInv.Placeholders))
	}
	if !icuparser.SameICUBlocks(baseInv.ICUBlocks, candInv.ICUBlocks) {
		diags = append(diags, fmt.Sprintf("ICU parity mismatch (expected %s, got %s)", icuparser.FormatICUBlocks(baseInv.ICUBlocks), icuparser.FormatICUBlocks(candInv.ICUBlocks)))
	}
	if icuparser.HasDuplicatePounds(candInv.ICUBlocks) {
		diags = append(diags, fmt.Sprintf("duplicate # tokens in ICU plural/selectordinal branch (got %s)", icuparser.FormatICUBlocks(candInv.ICUBlocks)))
	}
	return diags
}

// isMissingOrEmptyTarget reports missing target keys or empty target strings (after trim).
func isMissingOrEmptyTarget(sourceValue, targetValue string, hasTargetKey bool) bool {
	if !hasTargetKey {
		return true
	}
	return strings.TrimSpace(targetValue) == ""
}

// isSameAsSourceText reports when the target is present, non-empty, and equals the source (trimmed).
// Legitimate translations may match the source (brands, codes); use check severity or --exclude-check same_as_source to tune CI.
func isSameAsSourceText(sourceValue, targetValue string, hasTargetKey bool) bool {
	if !hasTargetKey {
		return false
	}
	if strings.TrimSpace(targetValue) == "" {
		return false
	}
	s, t := strings.TrimSpace(sourceValue), strings.TrimSpace(targetValue)
	return s != "" && s == t
}

func describeNotLocalized(_ string, _ string, hasTargetKey bool) string {
	if !hasTargetKey {
		return "target key is missing"
	}
	return "target value is empty"
}

func describeSameAsSource() string {
	return "target value matches source"
}

func sortCheckFindings(findings []checkFinding) {
	slices.SortFunc(findings, func(a, b checkFinding) int {
		if cmp := strings.Compare(a.Type, b.Type); cmp != 0 {
			return cmp
		}
		if cmp := strings.Compare(a.AnnotationFile, b.AnnotationFile); cmp != 0 {
			return cmp
		}
		if a.AnnotationLine != b.AnnotationLine {
			return a.AnnotationLine - b.AnnotationLine
		}
		if cmp := strings.Compare(a.Bucket, b.Bucket); cmp != 0 {
			return cmp
		}
		if cmp := strings.Compare(a.Locale, b.Locale); cmp != 0 {
			return cmp
		}
		if cmp := strings.Compare(a.SourceFile, b.SourceFile); cmp != 0 {
			return cmp
		}
		if cmp := strings.Compare(a.TargetFile, b.TargetFile); cmp != 0 {
			return cmp
		}
		return strings.Compare(a.Key, b.Key)
	})
}

func summarizeCheckFindings(findings []checkFinding) checkSummary {
	summary := checkSummary{
		ByCheck:    make(map[string]int),
		BySeverity: make(map[string]int),
		ByBucket:   make(map[string]int),
		ByLocale:   make(map[string]int),
	}
	for _, finding := range findings {
		summary.Total++
		summary.ByCheck[finding.Type]++
		summary.BySeverity[finding.Severity]++
		summary.ByBucket[finding.Bucket]++
		if finding.Locale != "" {
			summary.ByLocale[finding.Locale]++
		}
	}
	return summary
}

func renderCheckReport(report checkReport, format string) ([]byte, error) {
	var buf bytes.Buffer
	if err := writeCheckReport(&buf, report, format); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func writeCheckReport(w io.Writer, report checkReport, format string) error {
	switch format {
	case "text":
		return writeCheckText(w, report)
	case "json":
		payload, err := json.MarshalIndent(report, "", "  ")
		if err != nil {
			return fmt.Errorf("marshal json: %w", err)
		}
		if _, err := w.Write(append(payload, '\n')); err != nil {
			return fmt.Errorf("write json report: %w", err)
		}
		return nil
	case "stylish":
		return writeCheckStylish(w, report)
	default:
		return fmt.Errorf("unsupported output format %q", format)
	}
}

func writeCheckJSONReportFile(path string, report checkReport) error {
	payload, err := json.MarshalIndent(report, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal json: %w", err)
	}
	payload = append(payload, '\n')
	if err := os.WriteFile(path, payload, 0o600); err != nil {
		return fmt.Errorf("write json report %q: %w", path, err)
	}
	return nil
}

type checkStylishStyles struct {
	file     lipgloss.Style
	lineNo   lipgloss.Style
	errSev   lipgloss.Style
	warnSev  lipgloss.Style
	rule     lipgloss.Style
	meta     lipgloss.Style
	okLine   lipgloss.Style
	probLine lipgloss.Style
	colors   bool
}

func newCheckStylishStyles(w io.Writer) checkStylishStyles {
	s := checkStylishStyles{}
	f, ok := w.(*os.File)
	if !ok {
		return s
	}
	if !isatty.IsTerminal(f.Fd()) && !isatty.IsCygwinTerminal(f.Fd()) {
		return s
	}
	s.colors = true
	s.file = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("252"))
	s.lineNo = lipgloss.NewStyle().Foreground(lipgloss.Color("244"))
	s.errSev = lipgloss.NewStyle().Foreground(lipgloss.Color("203")).Bold(true)
	s.warnSev = lipgloss.NewStyle().Foreground(lipgloss.Color("214")).Bold(true)
	s.rule = lipgloss.NewStyle().Foreground(lipgloss.Color("81"))
	s.meta = lipgloss.NewStyle().Foreground(lipgloss.Color("246"))
	s.okLine = lipgloss.NewStyle().Foreground(lipgloss.Color("78")).Bold(true)
	s.probLine = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("252"))
	return s
}

func (s checkStylishStyles) renderFile(path string) string {
	if !s.colors {
		return path
	}
	return s.file.Render(path)
}

func (s checkStylishStyles) renderLineNo(line int) string {
	text := fmt.Sprintf("%d:1", line)
	if !s.colors {
		return text
	}
	return s.lineNo.Render(text)
}

func (s checkStylishStyles) renderSeverity(sev string) string {
	text := fmt.Sprintf("%-7s", sev)
	if !s.colors {
		return text
	}
	switch sev {
	case checkSeverityError:
		return s.errSev.Render(text)
	case checkSeverityWarning:
		return s.warnSev.Render(text)
	default:
		return text
	}
}

func (s checkStylishStyles) renderRule(name string) string {
	if !s.colors {
		return name
	}
	return s.rule.Render(name)
}

func stylishPrimaryPath(f checkFinding) string {
	if f.AnnotationFile != "" {
		return f.AnnotationFile
	}
	return f.SourceFile
}

func stylishLine(f checkFinding) int {
	if f.AnnotationLine > 0 {
		return f.AnnotationLine
	}
	return 1
}

func stylishMetaSuffix(f checkFinding) string {
	path := stylishPrimaryPath(f)
	var parts []string
	if f.Bucket != "" {
		parts = append(parts, "bucket="+f.Bucket)
	}
	if f.Locale != "" {
		parts = append(parts, "locale="+f.Locale)
	}
	if f.Key != "" {
		parts = append(parts, "key="+f.Key)
	}
	if f.TargetFile != "" && f.TargetFile != path {
		parts = append(parts, "target="+f.TargetFile)
	}
	return strings.Join(parts, " ")
}

func writeCheckStylish(w io.Writer, report checkReport) error {
	styles := newCheckStylishStyles(w)
	if report.Summary.Total == 0 {
		line := "✔ No problems."
		if styles.colors {
			line = styles.okLine.Render(line)
		}
		if _, err := fmt.Fprintln(w, line); err != nil {
			return fmt.Errorf("write stylish report: %w", err)
		}
		return nil
	}

	byFile := make(map[string][]checkFinding)
	for _, f := range report.Findings {
		p := stylishPrimaryPath(f)
		byFile[p] = append(byFile[p], f)
	}
	files := make([]string, 0, len(byFile))
	for p := range byFile {
		files = append(files, p)
	}
	slices.Sort(files)

	for _, file := range files {
		list := byFile[file]
		slices.SortFunc(list, func(a, b checkFinding) int {
			if la, lb := stylishLine(a), stylishLine(b); la != lb {
				return la - lb
			}
			if c := strings.Compare(a.Type, b.Type); c != 0 {
				return c
			}
			if c := strings.Compare(a.Locale, b.Locale); c != 0 {
				return c
			}
			if c := strings.Compare(a.Key, b.Key); c != 0 {
				return c
			}
			return strings.Compare(a.Message, b.Message)
		})

		if _, err := fmt.Fprintln(w, styles.renderFile(file)); err != nil {
			return fmt.Errorf("write stylish report: %w", err)
		}
		for _, f := range list {
			msg := f.Message
			if msg == "" {
				msg = "(no message)"
			}
			line := fmt.Sprintf("  %s  %s  %s  %s",
				styles.renderLineNo(stylishLine(f)),
				styles.renderSeverity(f.Severity),
				styles.renderRule(f.Type),
				msg,
			)
			if meta := stylishMetaSuffix(f); meta != "" {
				if styles.colors {
					line += "  " + styles.meta.Render(meta)
				} else {
					line += "  " + meta
				}
			}
			if _, err := fmt.Fprintln(w, line); err != nil {
				return fmt.Errorf("write stylish report: %w", err)
			}
		}
		if _, err := fmt.Fprintln(w); err != nil {
			return fmt.Errorf("write stylish report: %w", err)
		}
	}

	return writeCheckStylishFooter(w, report.Summary, styles)
}

func writeCheckStylishFooter(w io.Writer, summary checkSummary, styles checkStylishStyles) error {
	errN := summary.BySeverity[checkSeverityError]
	warnN := summary.BySeverity[checkSeverityWarning]
	probWord := "problems"
	if summary.Total == 1 {
		probWord = "problem"
	}
	errWord := "errors"
	if errN == 1 {
		errWord = "error"
	}
	warnWord := "warnings"
	if warnN == 1 {
		warnWord = "warning"
	}
	line := fmt.Sprintf("✖ %d %s (%d %s, %d %s)", summary.Total, probWord, errN, errWord, warnN, warnWord)
	if styles.colors {
		line = styles.probLine.Render(line)
	}
	if _, err := fmt.Fprintln(w, line); err != nil {
		return fmt.Errorf("write stylish report: %w", err)
	}
	return nil
}

func writeCheckText(w io.Writer, report checkReport) error {
	if _, err := fmt.Fprintf(w, "Checks: %s\n", strings.Join(report.Checks, ", ")); err != nil {
		return fmt.Errorf("write text report: %w", err)
	}
	if report.Summary.Total == 0 {
		_, err := io.WriteString(w, "No findings.\n")
		return err
	}
	currentType := ""
	for _, finding := range report.Findings {
		if finding.Type != currentType {
			currentType = finding.Type
			if _, err := fmt.Fprintf(w, "\n[%s]\n", currentType); err != nil {
				return fmt.Errorf("write text report: %w", err)
			}
		}
		line := fmt.Sprintf("- bucket=%s locale=%s source=%s", finding.Bucket, finding.Locale, finding.SourceFile)
		if finding.TargetFile != "" {
			line += fmt.Sprintf(" target=%s", finding.TargetFile)
		}
		if finding.Key != "" {
			line += fmt.Sprintf(" key=%s", finding.Key)
		}
		if finding.Message != "" {
			line += fmt.Sprintf(" message=%q", finding.Message)
		}
		if finding.AnnotationFile != "" {
			line += fmt.Sprintf(" annotation=%s:%d", finding.AnnotationFile, finding.AnnotationLine)
		}
		if _, err := fmt.Fprintln(w, line); err != nil {
			return fmt.Errorf("write text report: %w", err)
		}
	}
	if _, err := fmt.Fprintf(w, "\nSummary: total=%d\n", report.Summary.Total); err != nil {
		return fmt.Errorf("write text report: %w", err)
	}
	if err := writeCheckSummaryMap(w, "By check", report.Summary.ByCheck); err != nil {
		return err
	}
	if err := writeCheckSummaryMap(w, "By severity", report.Summary.BySeverity); err != nil {
		return err
	}
	if err := writeCheckSummaryMap(w, "By bucket", report.Summary.ByBucket); err != nil {
		return err
	}
	return writeCheckSummaryMap(w, "By locale", report.Summary.ByLocale)
}

func severityForCheck(name string) string {
	switch name {
	case checkOrphanedKey, checkWhitespaceOnly, checkSameAsSource:
		return checkSeverityWarning
	default:
		return checkSeverityError
	}
}

func (r *checkLocationResolver) resolve(sourcePath, targetPath, key, sourceValue, targetValue string, preferSource bool) (string, int) {
	primaryPath, primaryValue := targetPath, targetValue
	secondaryPath, secondaryValue := sourcePath, sourceValue
	if preferSource {
		primaryPath, primaryValue, secondaryPath, secondaryValue = sourcePath, sourceValue, targetPath, targetValue
	}
	if file, line := r.resolveInFile(primaryPath, key, primaryValue); file != "" {
		return file, line
	}
	if file, line := r.resolveInFile(secondaryPath, key, secondaryValue); file != "" {
		return file, line
	}
	if primaryPath != "" {
		return primaryPath, 1
	}
	if secondaryPath != "" {
		return secondaryPath, 1
	}
	return "", 0
}

func (r *checkLocationResolver) resolveInFile(filePath, key, value string) (string, int) {
	if filePath == "" {
		return "", 0
	}
	if r.content == nil {
		r.content = make(map[string][]byte)
	}
	content, ok := r.content[filePath]
	if !ok {
		data, err := os.ReadFile(filePath)
		if err != nil {
			return "", 0
		}
		content = data
		r.content[filePath] = data
	}
	ext := strings.ToLower(filepath.Ext(filePath))
	if (ext == ".md" || ext == ".mdx") && strings.HasPrefix(key, "md.") {
		if line := translationfileparser.LineForMarkdownKey(content, ext == ".mdx", key); line > 0 {
			return filePath, line
		}
	}
	if line := lineForKey(content, key); line > 0 {
		return filePath, line
	}
	if line := lineForValue(content, value); line > 0 {
		return filePath, line
	}
	return filePath, 1
}

func lineForKey(content []byte, key string) int {
	key = strings.TrimSpace(key)
	if key == "" {
		return 0
	}
	segments := strings.Split(key, ".")
	for i := len(segments) - 1; i >= 0; i-- {
		segment := strings.TrimSpace(segments[i])
		if segment == "" {
			continue
		}
		if line := lineForValue(content, `"`+segment+`"`); line > 0 {
			return line
		}
	}
	return 0
}

func lineForValue(content []byte, value string) int {
	needle := strings.TrimSpace(value)
	if needle == "" {
		return 0
	}
	lines := strings.Split(string(content), "\n")
	for i, line := range lines {
		if strings.Contains(line, needle) {
			return i + 1
		}
	}
	return 0
}

func writeCheckSummaryMap(w io.Writer, heading string, counts map[string]int) error {
	if _, err := fmt.Fprintf(w, "%s:\n", heading); err != nil {
		return fmt.Errorf("write summary heading: %w", err)
	}
	keys := make([]string, 0, len(counts))
	for key := range counts {
		keys = append(keys, key)
	}
	slices.Sort(keys)
	for _, key := range keys {
		if _, err := fmt.Fprintf(w, "- %s=%d\n", key, counts[key]); err != nil {
			return fmt.Errorf("write summary item: %w", err)
		}
	}
	return nil
}
