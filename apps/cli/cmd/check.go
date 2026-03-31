package cmd

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"regexp"
	"slices"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/apps/cli/internal/i18n/pathresolver"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/icuparser"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/storage"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/translationfileparser"
	config "github.com/hyperlocalise/hyperlocalise/pkg/i18nconfig"
	"github.com/spf13/cobra"
)

const (
	checkNotLocalized      = "not_localized"
	checkOrphanedKey       = "orphaned_key"
	checkMissingTargetFile = "missing_target_file"
	checkPlaceholder       = "placeholder_mismatch"
	checkHTMLTag           = "html_tag_mismatch"
	checkICUShape          = "icu_shape_mismatch"
	checkWhitespaceOnly    = "whitespace_only"
)

var (
	errCheckFindings = errors.New("check found issues")
	allCheckTypes    = []string{
		checkNotLocalized,
		checkOrphanedKey,
		checkMissingTargetFile,
		checkPlaceholder,
		checkHTMLTag,
		checkICUShape,
		checkWhitespaceOnly,
	}
	htmlTagPattern = regexp.MustCompile(`</?[A-Za-z][^>]*?>`)
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
	noFail        bool
}

type checkFinding struct {
	Type       string `json:"type"`
	Bucket     string `json:"bucket"`
	Locale     string `json:"locale,omitempty"`
	SourceFile string `json:"sourceFile"`
	TargetFile string `json:"targetFile,omitempty"`
	Key        string `json:"key,omitempty"`
	Message    string `json:"message,omitempty"`
}

type checkSummary struct {
	Total    int            `json:"total"`
	ByCheck  map[string]int `json:"byCheck"`
	ByBucket map[string]int `json:"byBucket"`
	ByLocale map[string]int `json:"byLocale"`
}

type checkReport struct {
	Checks   []string       `json:"checks"`
	Findings []checkFinding `json:"findings"`
	Summary  checkSummary   `json:"summary"`
}

func defaultCheckOptions() checkOptions {
	return checkOptions{format: "text"}
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

			payload, err := renderCheckReport(report, strings.ToLower(o.format))
			if err != nil {
				return err
			}
			if _, err := cmd.OutOrStdout().Write(payload); err != nil {
				return fmt.Errorf("write check output: %w", err)
			}
			if o.outputFile != "" {
				if err := os.WriteFile(o.outputFile, payload, 0o600); err != nil {
					return fmt.Errorf("write output file %q: %w", o.outputFile, err)
				}
			}
			if report.Summary.Total > 0 && !o.noFail {
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
	cmd.Flags().StringVar(&o.format, "format", o.format, "output format: text or json")
	cmd.Flags().StringVar(&o.outputFile, "output-file", "", "optional report file path")
	cmd.Flags().BoolVar(&o.noFail, "no-fail", false, "report findings without exiting non-zero")

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

					targetEntries, targetExists, err := readCheckTargetEntries(parser, sourcePath, targetPath)
					if err != nil {
						return nil, err
					}
					if !targetExists {
						if _, ok := checkSet[checkMissingTargetFile]; ok {
							findings = append(findings, checkFinding{
								Type:       checkMissingTargetFile,
								Bucket:     bucketName,
								Locale:     locale,
								SourceFile: sourcePath,
								TargetFile: targetPath,
								Message:    "target file does not exist",
							})
						}
						continue
					}

					findings = append(findings, collectEntryCheckFindings(bucketName, locale, sourcePath, targetPath, sourceEntries, targetEntries, checkSet)...)
				}
			}
		}
	}

	return findings, nil
}

func readCheckTargetEntries(parser *translationfileparser.Strategy, sourcePath, targetPath string) (map[string]string, bool, error) {
	targetEntries, err := readTargetEntriesForStatus(parser, sourcePath, targetPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, false, nil
		}
		return nil, false, err
	}
	return targetEntries, true, nil
}

func collectEntryCheckFindings(bucketName, locale, sourcePath, targetPath string, sourceEntries, targetEntries map[string]string, checkSet map[string]struct{}) []checkFinding {
	keys := make([]string, 0, len(sourceEntries))
	for key := range sourceEntries {
		keys = append(keys, key)
	}
	slices.Sort(keys)

	findings := make([]checkFinding, 0)
	for _, key := range keys {
		sourceValue := sourceEntries[key]
		targetValue, hasTargetKey := targetEntries[key]

		if _, ok := checkSet[checkNotLocalized]; ok && isNotLocalized(sourceValue, targetValue, hasTargetKey) {
			findings = append(findings, checkFinding{
				Type:       checkNotLocalized,
				Bucket:     bucketName,
				Locale:     locale,
				SourceFile: sourcePath,
				TargetFile: targetPath,
				Key:        key,
				Message:    describeNotLocalized(sourceValue, targetValue, hasTargetKey),
			})
		}
		if !hasTargetKey {
			continue
		}
		if _, ok := checkSet[checkWhitespaceOnly]; ok && targetValue != "" && strings.TrimSpace(targetValue) == "" {
			findings = append(findings, checkFinding{
				Type:       checkWhitespaceOnly,
				Bucket:     bucketName,
				Locale:     locale,
				SourceFile: sourcePath,
				TargetFile: targetPath,
				Key:        key,
				Message:    "target value contains only whitespace",
			})
		}
		if _, ok := checkSet[checkHTMLTag]; ok && hasHTMLTagMismatch(sourceValue, targetValue) {
			findings = append(findings, checkFinding{
				Type:       checkHTMLTag,
				Bucket:     bucketName,
				Locale:     locale,
				SourceFile: sourcePath,
				TargetFile: targetPath,
				Key:        key,
				Message:    "html tag structure differs from source",
			})
		}
		if _, ok := checkSet[checkPlaceholder]; ok || hasCheck(checkSet, checkICUShape) {
			diags := validateCheckInvariant(storage.Entry{Key: key, Locale: locale, Value: targetValue}, storage.Entry{Key: key, Locale: locale, Value: sourceValue})
			if _, ok := checkSet[checkPlaceholder]; ok {
				for _, diag := range diags {
					if strings.Contains(diag, "placeholder parity mismatch") {
						findings = append(findings, checkFinding{
							Type:       checkPlaceholder,
							Bucket:     bucketName,
							Locale:     locale,
							SourceFile: sourcePath,
							TargetFile: targetPath,
							Key:        key,
							Message:    diag,
						})
					}
				}
			}
			if _, ok := checkSet[checkICUShape]; ok {
				for _, diag := range diags {
					if strings.Contains(diag, "ICU parity mismatch") || strings.Contains(diag, "invalid ICU/braces structure") || strings.Contains(diag, "duplicate # tokens") {
						findings = append(findings, checkFinding{
							Type:       checkICUShape,
							Bucket:     bucketName,
							Locale:     locale,
							SourceFile: sourcePath,
							TargetFile: targetPath,
							Key:        key,
							Message:    diag,
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
			findings = append(findings, checkFinding{
				Type:       checkOrphanedKey,
				Bucket:     bucketName,
				Locale:     locale,
				SourceFile: sourcePath,
				TargetFile: targetPath,
				Key:        key,
				Message:    "target key is not present in source",
			})
		}
	}

	return findings
}

func hasCheck(checkSet map[string]struct{}, name string) bool {
	_, ok := checkSet[name]
	return ok
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

func isNotLocalized(sourceValue, targetValue string, hasTargetKey bool) bool {
	if !hasTargetKey {
		return true
	}
	if strings.TrimSpace(targetValue) == "" {
		return true
	}
	return strings.TrimSpace(sourceValue) != "" && strings.TrimSpace(sourceValue) == strings.TrimSpace(targetValue)
}

func describeNotLocalized(sourceValue, targetValue string, hasTargetKey bool) string {
	if !hasTargetKey {
		return "target key is missing"
	}
	if strings.TrimSpace(targetValue) == "" {
		return "target value is empty"
	}
	if strings.TrimSpace(sourceValue) == strings.TrimSpace(targetValue) {
		return "target value matches source"
	}
	return "target is not localized"
}

func hasHTMLTagMismatch(sourceValue, targetValue string) bool {
	sourceTags := normalizeHTMLTags(htmlTagPattern.FindAllString(sourceValue, -1))
	targetTags := normalizeHTMLTags(htmlTagPattern.FindAllString(targetValue, -1))
	return !slices.Equal(sourceTags, targetTags)
}

func normalizeHTMLTags(tags []string) []string {
	out := make([]string, 0, len(tags))
	for _, tag := range tags {
		normalized := strings.ToLower(strings.TrimSpace(tag))
		normalized = strings.TrimSuffix(normalized, "/>")
		normalized = strings.TrimSuffix(normalized, ">")
		normalized = strings.TrimPrefix(normalized, "<")
		parts := strings.Fields(normalized)
		if len(parts) == 0 {
			continue
		}
		out = append(out, parts[0])
	}
	return out
}

func sortCheckFindings(findings []checkFinding) {
	slices.SortFunc(findings, func(a, b checkFinding) int {
		if cmp := strings.Compare(a.Type, b.Type); cmp != 0 {
			return cmp
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
		ByCheck:  make(map[string]int),
		ByBucket: make(map[string]int),
		ByLocale: make(map[string]int),
	}
	for _, finding := range findings {
		summary.Total++
		summary.ByCheck[finding.Type]++
		summary.ByBucket[finding.Bucket]++
		if finding.Locale != "" {
			summary.ByLocale[finding.Locale]++
		}
	}
	return summary
}

func renderCheckReport(report checkReport, format string) ([]byte, error) {
	switch format {
	case "text":
		var buf bytes.Buffer
		if err := writeCheckText(&buf, report); err != nil {
			return nil, err
		}
		return buf.Bytes(), nil
	case "json":
		payload, err := json.MarshalIndent(report, "", "  ")
		if err != nil {
			return nil, fmt.Errorf("marshal json: %w", err)
		}
		return append(payload, '\n'), nil
	default:
		return nil, fmt.Errorf("unsupported output format %q", format)
	}
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
	if err := writeCheckSummaryMap(w, "By bucket", report.Summary.ByBucket); err != nil {
		return err
	}
	return writeCheckSummaryMap(w, "By locale", report.Summary.ByLocale)
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
