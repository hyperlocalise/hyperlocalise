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
	"runtime"
	"slices"
	"strings"

	"charm.land/lipgloss/v2"
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
			report, err := runCheck(context.Background(), o)
			if err != nil {
				return err
			}

			display := applyCheckQuiet(report, o.quiet)

			format := strings.ToLower(o.format)
			stdout := cmd.OutOrStdout()
			switch {
			case o.outputFile == "":
				if err := writeCheckReport(stdout, display, format); err != nil {
					return fmt.Errorf("write check output: %w", err)
				}
			case format == "stylish":
				// Stylish uses *os.File for TTY color detection; MultiWriter would strip stdout color.
				if err := writeCheckReport(stdout, display, format); err != nil {
					return fmt.Errorf("write check output: %w", err)
				}
				var buf bytes.Buffer
				if err := writeCheckReport(&buf, display, format); err != nil {
					return err
				}
				if err := os.WriteFile(o.outputFile, buf.Bytes(), 0o600); err != nil {
					return fmt.Errorf("write output file %q: %w", o.outputFile, err)
				}
			default:
				var buf bytes.Buffer
				if err := writeCheckReport(io.MultiWriter(stdout, &buf), display, format); err != nil {
					return fmt.Errorf("write check output: %w", err)
				}
				if err := os.WriteFile(o.outputFile, buf.Bytes(), 0o600); err != nil {
					return fmt.Errorf("write output file %q: %w", o.outputFile, err)
				}
			}
			if o.jsonReport != "" {
				if err := writeCheckJSONReportFile(o.jsonReport, display); err != nil {
					return err
				}
			}
			if !o.fix {
				if display.Summary.Total > 0 && !o.noFail {
					return errCheckFindings
				}
				return nil
			}

			after, err := executeCheckFix(cmd, o, report)
			if err != nil {
				return err
			}
			exitReport := display
			if after != nil {
				exitReport = applyCheckQuiet(*after, o.quiet)
			}
			if exitReport.Summary.Total > 0 && !o.noFail {
				return errCheckFindings
			}
			return nil
		},
	}

	cmd.Flags().StringVar(&o.configPath, "config", "", "path to i18n config")
	cmd.Flags().StringSliceVar(&o.locales, "locale", nil, "target locale(s) to check")
	cmd.Flags().StringVar(&o.group, "group", "", "filter by group name")
	cmd.Flags().StringVar(&o.bucket, "bucket", "", "filter by bucket name")
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

func runCheck(_ context.Context, o checkOptions) (checkReport, error) {
	cfg, err := config.Load(o.configPath)
	if err != nil {
		return checkReport{}, fmt.Errorf("load config: %w", err)
	}
	locales, err := resolveStatusLocales(cfg, o.locales, o.group)
	if err != nil {
		return checkReport{}, err
	}
	if len(locales) == 0 {
		return checkReport{}, fmt.Errorf("no locales selected")
	}
	buckets, err := selectedStatusBuckets(cfg, o.group, o.bucket)
	if err != nil {
		return checkReport{}, err
	}
	enabledChecks, err := resolveEnabledChecks(o.checks, o.excludeChecks)
	if err != nil {
		return checkReport{}, err
	}
	findings, err := collectCheckFindings(cfg, buckets, locales, enabledChecks)
	if err != nil {
		return checkReport{}, err
	}
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

func executeCheckFix(cmd *cobra.Command, o checkOptions, initial checkReport) (*checkReport, error) {
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

	output := cmd.OutOrStdout()
	runCtx, stop := signal.NotifyContext(backgroundContext(), os.Interrupt)
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
		return nil, err
	}
	for _, w := range rpt.Warnings {
		_, _ = fmt.Fprintf(cmd.ErrOrStderr(), "warning: %s\n", w)
	}
	if o.fixDryRun {
		return nil, nil
	}
	if rpt.Failed > 0 {
		return nil, fmt.Errorf("check fix: run completed with %d failed task(s)", rpt.Failed)
	}
	after, err := runCheck(context.Background(), o)
	if err != nil {
		return nil, err
	}
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

func collectCheckFindings(cfg *config.I18NConfig, buckets, locales, enabledChecks []string) ([]checkFinding, error) {
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
						continue
					}

					findings = append(findings, collectEntryCheckFindings(&resolver, bucketName, locale, sourcePath, targetPath, sourceEntries, targetEntries, checkSet)...)
					if hasCheck(checkSet, checkMarkdownAST) && isMarkdownPath(targetPath) {
						findings = append(findings, collectMarkdownASTParityFindings(&resolver, bucketName, locale, sourcePath, targetPath, sourceContent, targetContent)...)
					}
				}
			}
		}
	}

	return findings, nil
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

func collectEntryCheckFindings(resolver *checkLocationResolver, bucketName, locale, sourcePath, targetPath string, sourceEntries, targetEntries map[string]string, checkSet map[string]struct{}) []checkFinding {
	keys := make([]string, 0, len(sourceEntries))
	for key := range sourceEntries {
		keys = append(keys, key)
	}
	slices.Sort(keys)

	findings := make([]checkFinding, 0)
	for _, key := range keys {
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
