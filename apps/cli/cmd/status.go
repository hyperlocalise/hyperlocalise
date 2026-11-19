package cmd

import (
	"cmp"
	"context"
	"encoding/csv"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"slices"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/apps/cli/internal/i18n/pathresolver"
	"github.com/hyperlocalise/hyperlocalise/apps/cli/internal/i18n/syncsvc"
	"github.com/hyperlocalise/hyperlocalise/internal/csvsafe"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/storage"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/translationfileparser"
	"github.com/hyperlocalise/hyperlocalise/internal/pathguard"
	"github.com/hyperlocalise/hyperlocalise/pkg/i18nconfig"
	"github.com/spf13/cobra"
	"golang.org/x/sync/errgroup"
)

const statusSourceValueMetadataKey = "status_source_value"

type statusOptions struct {
	configPath  string
	locales     []string
	output      string
	group       string
	bucket      string
	interactive bool
}

func defaultStatusOptions() statusOptions {
	return statusOptions{
		output: "csv",
	}
}

func newStatusCmd() *cobra.Command {
	o := defaultStatusOptions()

	cmd := &cobra.Command{
		Use:   "status",
		Short: "show translation status by locale",
		Long: `Shows translation status for each locale as CSV.
Status values:
  - translated: has a non-empty translation value
  - needs_review: LLM-generated translation not yet curated
  - untranslated: empty translation value`,
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			cfg, err := config.LoadForCLI(o.configPath)
			if err != nil {
				return fmt.Errorf("load config: %w", err)
			}

			locales, err := resolveStatusLocales(cfg, o.locales, o.group)
			if err != nil {
				return err
			}
			if len(locales) == 0 {
				return fmt.Errorf("no locales selected")
			}

			buckets, err := selectedStatusBuckets(cfg, o.group, o.bucket)
			if err != nil {
				return err
			}

			configRoot, err := config.ConfigDirectory(o.configPath)
			if err != nil {
				return fmt.Errorf("resolve config directory: %w", err)
			}

			entries, err := collectStatusEntries(cmd.Context(), cfg, syncsvc.LocalReadRequest{
				Locales: locales,
			}, buckets, configRoot)
			if err != nil {
				return fmt.Errorf("read local translations: %w", err)
			}

			slices.Sort(locales)
			entries = filterByLocale(entries, locales)

			if o.interactive {
				if strings.ToLower(o.output) != "csv" {
					return fmt.Errorf("unsupported output format %q for --interactive (must be csv)", o.output)
				}
				return runStatusDashboard(cmd.OutOrStdout(), entries, locales, o.group, o.bucket)
			}

			switch strings.ToLower(o.output) {
			case "csv":
				return writeStatusCSV(cmd.OutOrStdout(), entries, cfg.Locales.Source)
			default:
				return fmt.Errorf("unsupported output format %q", o.output)
			}
		},
	}

	cmd.Flags().StringVar(&o.configPath, "config", "", "path to i18n config")
	cmd.Flags().StringSliceVar(&o.locales, "locale", nil, "target locale(s) to report")
	cmd.Flags().StringVar(&o.output, "output", o.output, "output format: csv")
	cmd.Flags().StringVar(&o.group, "group", "", "filter by group name")
	cmd.Flags().StringVar(&o.bucket, "bucket", "", "filter by bucket name")
	cmd.Flags().BoolVarP(&o.interactive, "interactive", "i", false, "render interactive status dashboard in TTY")

	return cmd
}

func resolveStatusLocales(cfg *config.I18NConfig, requestedLocales []string, group string) ([]string, error) {
	locales := append([]string(nil), requestedLocales...)
	if len(locales) == 0 {
		locales = append([]string(nil), cfg.Locales.Targets...)
	}
	if group == "" {
		return locales, nil
	}

	g, ok := cfg.Groups[group]
	if !ok {
		return nil, fmt.Errorf("unknown group %q", group)
	}
	if len(g.Targets) == 0 {
		return locales, nil
	}
	if len(requestedLocales) == 0 {
		return append([]string(nil), g.Targets...), nil
	}

	targetSet := make(map[string]struct{}, len(g.Targets))
	for _, target := range g.Targets {
		targetSet[target] = struct{}{}
	}

	var intersection []string
	for _, locale := range requestedLocales {
		if _, ok := targetSet[locale]; ok {
			intersection = append(intersection, locale)
		}
	}
	if len(intersection) == 0 {
		return nil, fmt.Errorf("no locales matched group %q", group)
	}

	return intersection, nil
}

func selectedStatusBuckets(cfg *config.I18NConfig, group, bucket string) ([]string, error) {
	if bucket == "" {
		if group != "" {
			g, ok := cfg.Groups[group]
			if !ok {
				return nil, fmt.Errorf("unknown group %q", group)
			}
			if len(g.Buckets) > 0 {
				for _, name := range g.Buckets {
					if _, ok := cfg.Buckets[name]; !ok {
						return nil, fmt.Errorf("group %q references unknown bucket %q", group, name)
					}
				}
				return append([]string(nil), g.Buckets...), nil
			}
		}

		names := make([]string, 0, len(cfg.Buckets))
		for name := range cfg.Buckets {
			names = append(names, name)
		}
		slices.Sort(names)
		return names, nil
	}
	if _, ok := cfg.Buckets[bucket]; !ok {
		return nil, fmt.Errorf("unknown bucket %q", bucket)
	}
	if group != "" {
		g, ok := cfg.Groups[group]
		if !ok {
			return nil, fmt.Errorf("unknown group %q", group)
		}
		if len(g.Buckets) > 0 && !slices.Contains(g.Buckets, bucket) {
			return nil, fmt.Errorf("bucket %q is not part of group %q", bucket, group)
		}
	}
	return []string{bucket}, nil
}

// statusBucketFiles is kept for backwards compatibility with existing tests.
func statusBucketFiles(cfg *config.I18NConfig, bucket string) (map[string]struct{}, error) {
	if bucket == "" {
		return nil, nil
	}
	b, ok := cfg.Buckets[bucket]
	if !ok {
		return nil, fmt.Errorf("unknown bucket %q", bucket)
	}
	files := make(map[string]struct{}, len(b.Files))
	for _, f := range b.Files {
		files[f.From] = struct{}{}
	}
	return files, nil
}

// statusSourceJob is one resolved source file and the bucket file mapping it came from.
type statusSourceJob struct {
	file          config.BucketFileMapping
	sourcePattern string
	sourcePath    string
}

func collectStatusEntries(ctx context.Context, cfg *config.I18NConfig, req syncsvc.LocalReadRequest, buckets []string, configRoot string) ([]storage.Entry, error) {
	locales := req.Locales
	if len(locales) == 0 {
		locales = append([]string(nil), cfg.Locales.Targets...)
	}

	var jobs []statusSourceJob
	for _, bucketName := range buckets {
		bucket := cfg.Buckets[bucketName]
		for _, file := range bucket.Files {
			sourcePattern := pathresolver.ResolveSourcePath(file.From, cfg.Locales.Source)
			sourcePaths, err := resolveSourcePathsForStatus(configRoot, sourcePattern)
			if err != nil {
				return nil, fmt.Errorf("resolve source paths for %q: %w", sourcePattern, err)
			}
			for _, sourcePath := range sourcePaths {
				if shouldIgnoreSourcePathForStatus(sourcePath, configRoot, cfg.Locales.Targets) {
					continue
				}
				jobs = append(jobs, statusSourceJob{file: file, sourcePattern: sourcePattern, sourcePath: sourcePath})
			}
		}
	}

	parser := translationfileparser.NewDefaultStrategy()
	files := newCheckFileCache()
	results := make([][]storage.Entry, len(jobs))
	group, groupCtx := errgroup.WithContext(ctx)
	group.SetLimit(runtime.GOMAXPROCS(0))
	for i, job := range jobs {
		group.Go(func() error {
			if err := groupCtx.Err(); err != nil {
				return err
			}
			entries, err := collectStatusSourceEntries(parser, files, cfg.Locales.Source, locales, configRoot, job)
			if err != nil {
				return err
			}
			results[i] = entries
			return nil
		})
	}
	if err := group.Wait(); err != nil {
		return nil, checkContextError(ctx, err)
	}

	total := 0
	for _, result := range results {
		total += len(result)
	}
	entries := make([]storage.Entry, 0, total)
	for _, result := range results {
		entries = append(entries, result...)
	}
	return entries, nil
}

// collectStatusSourceEntries returns one entry per key and locale for a single source file.
func collectStatusSourceEntries(parser *translationfileparser.Strategy, files *checkFileCache, sourceLocale string, locales []string, configRoot string, job statusSourceJob) ([]storage.Entry, error) {
	sourcePath := job.sourcePath
	sourceEntries, err := readEntriesForStatus(parser, files, sourcePath, sourceLocale)
	sourceMissing := false
	if err != nil {
		if !os.IsNotExist(err) {
			return nil, err
		}
		sourceMissing = true
		sourceEntries = map[string]string{}
	}
	trackSourceValue := shouldTrackSourceValueForStatus(sourcePath)
	var sourceStatusEntries map[string]string
	if trackSourceValue {
		sourceStatusEntries, err = readSourceEntriesForStatus(parser, files, sourcePath, sourceLocale)
		if err != nil {
			if !os.IsNotExist(err) {
				return nil, err
			}
			sourceStatusEntries = map[string]string{}
		}
	}

	targetByLocale := make(map[string]map[string]string, len(locales))
	keySet := make(map[string]struct{}, len(sourceEntries))
	for key := range sourceEntries {
		keySet[key] = struct{}{}
	}

	for _, locale := range locales {
		targetPattern := pathresolver.ResolveTargetPath(job.file.To, sourceLocale, locale)
		targetPath, err := resolveTargetPathForStatus(configRoot, job.sourcePattern, targetPattern, sourcePath)
		if err != nil {
			return nil, fmt.Errorf("resolve target path for source %q: %w", sourcePath, err)
		}
		targetEntries, err := readTargetEntriesForStatus(parser, files, sourcePath, targetPath, locale)
		if err != nil {
			if !os.IsNotExist(err) {
				return nil, err
			}
			targetEntries = map[string]string{}
		}
		targetByLocale[locale] = targetEntries
		if sourceMissing {
			for key := range targetEntries {
				keySet[key] = struct{}{}
			}
		}
	}

	keys := make([]string, 0, len(keySet))
	for key := range keySet {
		keys = append(keys, key)
	}
	slices.Sort(keys)

	// Every locale's entry for a key shares one read-only metadata map.
	var metadataByKey []map[string]string
	if trackSourceValue {
		metadataByKey = make([]map[string]string, len(keys))
		for i, key := range keys {
			metadataByKey[i] = map[string]string{statusSourceValueMetadataKey: sourceStatusEntries[key]}
		}
	}

	entries := make([]storage.Entry, 0, len(locales)*len(keys))
	for _, locale := range locales {
		targetEntries := targetByLocale[locale]
		for i, key := range keys {
			var metadata map[string]string
			if trackSourceValue {
				metadata = metadataByKey[i]
			}
			entries = append(entries, storage.Entry{
				Key:       key,
				Namespace: job.file.From,
				Locale:    locale,
				Value:     targetEntries[key],
				Metadata:  metadata,
				Provenance: storage.EntryProvenance{
					Origin: storage.OriginUnknown,
				},
			})
		}
	}
	return entries, nil
}

func readEntriesForStatus(parser *translationfileparser.Strategy, files *checkFileCache, path, locale string) (map[string]string, error) {
	content, err := files.read(path)
	if err != nil {
		return nil, err
	}
	entries, _, err := parser.ParseSource(path, content, locale)
	if err != nil {
		return nil, fmt.Errorf("parse translation file %q: %w", path, err)
	}
	return entries, nil
}

func readSourceEntriesForStatus(parser *translationfileparser.Strategy, files *checkFileCache, path, locale string) (map[string]string, error) {
	ext := strings.ToLower(filepath.Ext(path))
	if ext == ".md" || ext == ".mdx" {
		doc, err := files.markdownDocument(path, ext == ".mdx")
		if err != nil {
			return nil, err
		}
		return doc.AlignTargetDocument(doc), nil
	}
	if translationfileparser.IsAsciiDocDocumentExtension(path) {
		doc, err := files.asciiDocDocument(path)
		if err != nil {
			return nil, err
		}
		return doc.AlignTargetDocument(doc), nil
	}
	if translationfileparser.IsPlainTextDocumentExtension(path) {
		content, err := files.read(path)
		if err != nil {
			return nil, err
		}
		return translationfileparser.AlignPlainTextTargetToSource(content, content), nil
	}
	return readEntriesForStatus(parser, files, path, locale)
}

func readTargetEntriesForStatus(parser *translationfileparser.Strategy, files *checkFileCache, sourcePath, targetPath, locale string) (map[string]string, error) {
	ext := strings.ToLower(filepath.Ext(targetPath))
	if ext == ".md" || ext == ".mdx" {
		mdx := ext == ".mdx"
		sourceDoc, err := files.markdownDocument(sourcePath, mdx)
		if err != nil {
			return nil, err
		}
		targetDoc, err := files.markdownDocument(targetPath, mdx)
		if err != nil {
			return nil, err
		}
		return sourceDoc.AlignTargetDocument(targetDoc), nil
	}
	if translationfileparser.IsAsciiDocDocumentExtension(targetPath) {
		sourceDoc, err := files.asciiDocDocument(sourcePath)
		if err != nil {
			return nil, err
		}
		targetDoc, err := files.asciiDocDocument(targetPath)
		if err != nil {
			return nil, err
		}
		return sourceDoc.AlignTargetDocument(targetDoc), nil
	}
	if translationfileparser.IsPlainTextDocumentExtension(targetPath) {
		sourceContent, err := files.read(sourcePath)
		if err != nil {
			return nil, err
		}
		targetContent, err := files.read(targetPath)
		if err != nil {
			return nil, err
		}
		return translationfileparser.AlignPlainTextTargetToSource(sourceContent, targetContent), nil
	}
	if ext == ".xcstrings" || ext == ".csv" || ext == ".tsv" {
		content, err := files.read(targetPath)
		if err != nil {
			return nil, err
		}
		entries, err := parser.ParseWithLocale(targetPath, content, locale)
		if err != nil {
			return nil, fmt.Errorf("parse translation file %q: %w", targetPath, err)
		}
		return entries, nil
	}
	return readEntriesForStatus(parser, files, targetPath, "")
}

func filterByLocale(entries []storage.Entry, locales []string) []storage.Entry {
	var filtered []storage.Entry

	for _, e := range entries {
		if !slices.Contains(locales, e.Locale) {
			continue
		}
		filtered = append(filtered, e)
	}

	return filtered
}

// filterByLocaleAndBucket is kept for backwards compatibility with existing tests.
func filterByLocaleAndBucket(entries []storage.Entry, locales []string, bucket string, bucketFiles map[string]struct{}) []storage.Entry {
	filtered := filterByLocale(entries, locales)
	if bucket == "" {
		return filtered
	}
	withBucket := make([]storage.Entry, 0, len(filtered))
	for _, e := range filtered {
		if _, ok := bucketFiles[e.Namespace]; ok {
			withBucket = append(withBucket, e)
		}
	}
	return withBucket
}

func shouldIgnoreSourcePathForStatus(sourcePath, configRoot string, targetLocales []string) bool {
	pathForScan := sourcePath
	configRelative := false
	if root := strings.TrimSpace(configRoot); root != "" {
		if rel, err := filepath.Rel(root, sourcePath); err == nil {
			rel = filepath.ToSlash(rel)
			if rel != ".." && !strings.HasPrefix(rel, "../") {
				pathForScan = rel
				configRelative = true
			}
		}
	}

	normalized := filepath.ToSlash(pathForScan)
	segments := strings.Split(normalized, "/")
	if len(segments) < 2 {
		return false
	}

	targets := make(map[string]struct{}, len(targetLocales))
	for _, locale := range targetLocales {
		targets[locale] = struct{}{}
	}

	start := 1
	if configRelative {
		start = 0
	}
	for i := start; i < len(segments)-1; i++ {
		if _, ok := targets[segments[i]]; ok {
			return true
		}
	}
	return false
}

func resolveConfigRelativePath(configRoot, path string) (string, error) {
	trimmed := strings.TrimSpace(path)
	if trimmed == "" {
		return "", fmt.Errorf("path is empty")
	}
	if filepath.IsAbs(trimmed) {
		return filepath.Clean(trimmed), nil
	}
	root := strings.TrimSpace(configRoot)
	if root == "" {
		return filepath.Clean(trimmed), nil
	}
	return filepath.Join(root, trimmed), nil
}

func relativizeConfigPath(configRoot, path string) (string, error) {
	root := strings.TrimSpace(configRoot)
	trimmed := strings.TrimSpace(path)
	if trimmed == "" {
		return "", fmt.Errorf("path is empty")
	}
	if root == "" {
		return filepath.Clean(trimmed), nil
	}
	abs, err := resolveConfigRelativePath(root, trimmed)
	if err != nil {
		return "", err
	}
	rel, err := filepath.Rel(root, abs)
	if err != nil {
		return "", fmt.Errorf("relativize path %q against config root: %w", trimmed, err)
	}
	rel = filepath.ToSlash(rel)
	if rel == ".." || strings.HasPrefix(rel, "../") {
		return "", fmt.Errorf("path %q escapes config root %q", trimmed, root)
	}
	return rel, nil
}

func checkPathLookupCandidates(configRoot, path string) []string {
	trimmed := strings.TrimSpace(path)
	if trimmed == "" {
		return nil
	}

	seen := make(map[string]struct{})
	add := func(candidate string) {
		candidate = filepath.Clean(candidate)
		if candidate == "" {
			return
		}
		if _, ok := seen[candidate]; ok {
			return
		}
		seen[candidate] = struct{}{}
	}

	add(trimmed)
	if abs, err := filepath.Abs(trimmed); err == nil {
		add(abs)
	}
	if root := strings.TrimSpace(configRoot); root != "" {
		if resolved, err := resolveConfigRelativePath(root, trimmed); err == nil {
			add(resolved)
		}
		if rel, err := relativizeConfigPath(root, trimmed); err == nil {
			add(rel)
		}
	}

	candidates := make([]string, 0, len(seen))
	for candidate := range seen {
		candidates = append(candidates, candidate)
	}
	slices.Sort(candidates)
	return candidates
}

func lookupCheckSourceDescriptor(index *checkConfigIndex, configRoot, path string) (checkSourceDescriptor, bool) {
	for _, candidate := range checkPathLookupCandidates(configRoot, path) {
		if desc, ok := index.sourceByPath[candidate]; ok {
			return desc, true
		}
	}
	return checkSourceDescriptor{}, false
}

func lookupCheckTargetLookup(index *checkConfigIndex, configRoot, path string) (checkTargetLookup, bool) {
	for _, candidate := range checkPathLookupCandidates(configRoot, path) {
		if lookup, ok := index.targetToSource[candidate]; ok {
			return lookup, true
		}
	}
	return checkTargetLookup{}, false
}

func resolveSourcePathsForStatus(configRoot, sourcePattern string) ([]string, error) {
	resolvedPattern, err := resolveConfigRelativePath(configRoot, sourcePattern)
	if err != nil {
		return nil, err
	}

	matches, err := pathresolver.ResolveGlob(resolvedPattern)
	if err != nil {
		return nil, err
	}

	if err := ensureStatusPathsUnderConfigRoot(configRoot, matches); err != nil {
		return nil, err
	}
	return matches, nil
}

func ensureStatusPathsUnderConfigRoot(configRoot string, paths []string) error {
	root := strings.TrimSpace(configRoot)
	if root == "" {
		return nil
	}
	for _, path := range paths {
		if err := pathguard.EnsureUnderRoot(root, path); err != nil {
			return fmt.Errorf("resolved path %q: %w", path, err)
		}
	}
	return nil
}

func resolveTargetPathForStatus(configRoot, sourcePattern, targetPattern, sourcePath string) (string, error) {
	resolvedSourcePattern, err := resolveConfigRelativePath(configRoot, sourcePattern)
	if err != nil {
		return "", err
	}
	resolvedTargetPattern, err := resolveConfigRelativePath(configRoot, targetPattern)
	if err != nil {
		return "", err
	}
	resolvedSourcePath, err := resolveConfigRelativePath(configRoot, sourcePath)
	if err != nil {
		return "", err
	}

	var targetPath string
	if !strings.ContainsAny(resolvedSourcePattern, "*?[") {
		targetPath = resolvedTargetPattern
	} else {
		if !strings.ContainsAny(resolvedTargetPattern, "*?[") {
			return "", fmt.Errorf("target pattern %q must include glob tokens when source pattern %q includes globs", resolvedTargetPattern, resolvedSourcePattern)
		}
		sourceBase := globBaseDirForStatus(resolvedSourcePattern)
		targetBase := globBaseDirForStatus(resolvedTargetPattern)
		relative, err := filepath.Rel(sourceBase, resolvedSourcePath)
		if err != nil {
			return "", err
		}
		parentPrefix := ".." + string(filepath.Separator)
		if relative == ".." || strings.HasPrefix(relative, parentPrefix) {
			return "", fmt.Errorf("source path %q escapes source base %q", resolvedSourcePath, sourceBase)
		}
		targetPath = filepath.Join(targetBase, relative)
	}

	if err := ensureStatusPathsUnderConfigRoot(configRoot, []string{targetPath}); err != nil {
		return "", err
	}
	return targetPath, nil
}

func globBaseDirForStatus(pattern string) string {
	return pathresolver.GlobBaseDir(pattern)
}

func computeStatus(entry storage.Entry) string {
	if strings.TrimSpace(entry.Value) == "" {
		return "untranslated"
	}
	if sourceValue, ok := entry.Metadata[statusSourceValueMetadataKey]; ok &&
		sourceValue != "" &&
		strings.TrimSpace(sourceValue) == strings.TrimSpace(entry.Value) {
		return "source_match"
	}
	if entry.Provenance.Origin == storage.OriginLLM && entry.Provenance.State == storage.StateDraft {
		return "needs_review"
	}
	return "translated"
}

func shouldTrackSourceValueForStatus(path string) bool {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".md", ".mdx", ".adoc", ".asciidoc", ".asc":
		return true
	default:
		return false
	}
}

func writeStatusCSV(w io.Writer, entries []storage.Entry, _ string) error {
	// Order rows by namespace, key, then locale. The stable sort keeps duplicates of one
	// namespace/key/locale in input order, and only the last of them is written.
	order := make([]int, len(entries))
	for i := range order {
		order[i] = i
	}
	slices.SortStableFunc(order, func(a, b int) int {
		ea, eb := &entries[a], &entries[b]
		if c := cmp.Compare(ea.Namespace, eb.Namespace); c != 0 {
			return c
		}
		if c := cmp.Compare(ea.Key, eb.Key); c != 0 {
			return c
		}
		return cmp.Compare(ea.Locale, eb.Locale)
	})

	csvWriter := csv.NewWriter(w)
	if err := csvWriter.Write([]string{"key", "namespace", "locale", "status", "origin", "state"}); err != nil {
		return fmt.Errorf("write csv: %w", err)
	}
	record := make([]string, 6)
	for i, idx := range order {
		entry := &entries[idx]
		if i+1 < len(order) {
			next := &entries[order[i+1]]
			if next.Namespace == entry.Namespace && next.Key == entry.Key && next.Locale == entry.Locale {
				continue
			}
		}
		record[0] = csvsafe.EscapeFormula(entry.Key)
		record[1] = csvsafe.EscapeFormula(entry.Namespace)
		record[2] = csvsafe.EscapeFormula(entry.Locale)
		record[3] = csvsafe.EscapeFormula(computeStatus(*entry))
		record[4] = csvsafe.EscapeFormula(entry.Provenance.Origin)
		record[5] = csvsafe.EscapeFormula(entry.Provenance.State)
		if err := csvWriter.Write(record); err != nil {
			return fmt.Errorf("write csv: %w", err)
		}
	}
	csvWriter.Flush()
	if err := csvWriter.Error(); err != nil {
		return fmt.Errorf("write csv: %w", err)
	}

	return nil
}
