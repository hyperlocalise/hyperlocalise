package cmd

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"slices"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/apps/cli/internal/i18n/pathresolver"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/translationfileparser"
	config "github.com/hyperlocalise/hyperlocalise/pkg/i18nconfig"
	"github.com/spf13/cobra"
)

type packOptions struct {
	groupByValue bool
	outFile      string
	prefixID     bool
	configPath   string
	group        string
	bucket       string
	outSuffix    string
}

func newPackCmd() *cobra.Command {
	o := packOptions{}

	cmd := &cobra.Command{
		Use:   "pack [translation-file]",
		Short: "prepare translation JSON by stripping metadata or grouping duplicates",
		Long: `Prepare translation JSON by stripping metadata or grouping duplicate strings.

Pass a translation file, or omit it to discover react-intl (FormatJS) locale JSON
files from your i18n config (i18n.yml or i18n.jsonc by default).`,
		Args:         cobra.MaximumNArgs(1),
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			if err := validatePackOptions(args, o); err != nil {
				return err
			}

			if len(args) == 1 {
				payload, err := runPack(args[0], o)
				if err != nil {
					return err
				}
				return writePackOutput(cmd, payload, o)
			}

			paths, err := collectPackLocaleFilesFromConfig(o)
			if err != nil {
				return err
			}
			if len(paths) == 0 {
				return fmt.Errorf("pack: no react-intl locale JSON files found")
			}

			for _, path := range paths {
				payload, err := runPack(path, o)
				if err != nil {
					return fmt.Errorf("pack %q: %w", path, err)
				}
				outPath := packOutputPath(path, o.outSuffix)
				if err := writePackPayloadToFile(payload, outPath); err != nil {
					return err
				}
				if outPath == path {
					if _, err := fmt.Fprintf(cmd.ErrOrStderr(), "packed %s\n", path); err != nil {
						return fmt.Errorf("write pack status: %w", err)
					}
					continue
				}
				if _, err := fmt.Fprintf(cmd.ErrOrStderr(), "packed %s -> %s\n", path, outPath); err != nil {
					return fmt.Errorf("write pack status: %w", err)
				}
			}

			return nil
		},
	}

	cmd.Flags().BoolVar(&o.groupByValue, "group-by-value", false, "group ids by shared translation string instead of preserving id-keyed output")
	cmd.Flags().StringVar(&o.outFile, "out-file", "", "write packed translations to a JSON file")
	cmd.Flags().BoolVar(&o.prefixID, "prefix-id", false, "strip extract --prefix-id filename prefixes from packed ids")
	cmd.Flags().StringVar(&o.configPath, "config", "", "path to i18n config (default: i18n.yml or i18n.jsonc in the working directory)")
	cmd.Flags().StringVar(&o.group, "group", "", "filter config discovery by group name")
	cmd.Flags().StringVar(&o.bucket, "bucket", "", "filter config discovery by bucket name")
	cmd.Flags().StringVar(&o.outSuffix, "out-suffix", "", "optional output filename suffix when packing multiple files (for example .packed -> en-US.packed.json; default overwrites each input file in place)")

	return cmd
}

func validatePackOptions(args []string, options packOptions) error {
	hasFile := len(args) == 1

	switch {
	case hasFile && strings.TrimSpace(options.configPath) != "":
		return fmt.Errorf("pack cannot combine a translation file with --config")
	case !hasFile && strings.TrimSpace(options.outFile) != "":
		return fmt.Errorf("pack --out-file requires a translation file")
	case !hasFile && options.groupByValue:
		return fmt.Errorf("pack --group-by-value requires a translation file")
	}

	return nil
}

func collectPackLocaleFilesFromConfig(options packOptions) ([]string, error) {
	cfg, err := config.Load(options.configPath)
	if err != nil {
		return nil, fmt.Errorf("load config: %w", err)
	}

	locales, err := resolveStatusLocales(cfg, nil, options.group)
	if err != nil {
		return nil, err
	}
	if len(locales) == 0 {
		return nil, fmt.Errorf("pack: no locales selected")
	}

	buckets, err := selectedStatusBuckets(cfg, options.group, options.bucket)
	if err != nil {
		return nil, err
	}

	seen := make(map[string]struct{})
	paths := make([]string, 0)
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
				for _, locale := range locales {
					targetPattern := pathresolver.ResolveTargetPath(file.To, cfg.Locales.Source, locale)
					targetPath, err := resolveTargetPathForStatus(sourcePattern, targetPattern, sourcePath)
					if err != nil {
						return nil, fmt.Errorf("resolve target path for source %q: %w", sourcePath, err)
					}
					cleaned := filepath.Clean(targetPath)
					if _, ok := seen[cleaned]; ok {
						continue
					}
					formatJS, err := isPackFormatJSFile(cleaned)
					if err != nil {
						if os.IsNotExist(err) {
							continue
						}
						return nil, fmt.Errorf("inspect %q: %w", cleaned, err)
					}
					if !formatJS {
						continue
					}
					seen[cleaned] = struct{}{}
					paths = append(paths, cleaned)
				}
			}
		}
	}

	slices.Sort(paths)
	return paths, nil
}

func isPackFormatJSFile(path string) (bool, error) {
	if strings.ToLower(filepath.Ext(path)) != ".json" {
		return false, nil
	}

	content, err := os.ReadFile(path)
	if err != nil {
		return false, err
	}

	var payload map[string]any
	if err := json.Unmarshal(content, &payload); err != nil {
		return false, fmt.Errorf("json decode: %w", err)
	}
	if payload == nil {
		return false, nil
	}

	return translationfileparser.IsStrictFormatJSRoot(payload)
}

func packOutputPath(inputPath, suffix string) string {
	if strings.TrimSpace(suffix) == "" {
		return inputPath
	}

	ext := filepath.Ext(inputPath)
	base := strings.TrimSuffix(inputPath, ext)
	return base + suffix + ext
}

func writePackPayloadToFile(payload any, outPath string) error {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetIndent("", "  ")
	enc.SetEscapeHTML(false)
	if err := enc.Encode(payload); err != nil {
		return fmt.Errorf("encode pack output: %w", err)
	}

	if err := os.MkdirAll(filepath.Dir(outPath), 0o755); err != nil {
		return fmt.Errorf("create pack output directory: %w", err)
	}
	if err := os.WriteFile(outPath, buf.Bytes(), 0o644); err != nil {
		return fmt.Errorf("write pack output file %q: %w", outPath, err)
	}

	return nil
}

func runPack(path string, options packOptions) (any, error) {
	if options.groupByValue {
		return runPackGrouped(path, options)
	}

	return runPackDefault(path, options)
}

func runPackDefault(path string, options packOptions) (any, error) {
	trimmedPath := strings.TrimSpace(path)
	if trimmedPath == "" {
		return nil, fmt.Errorf("pack translation file path cannot be empty")
	}

	content, err := os.ReadFile(trimmedPath)
	if err != nil {
		return nil, fmt.Errorf("read pack input %q: %w", trimmedPath, err)
	}

	switch strings.ToLower(filepath.Ext(trimmedPath)) {
	case ".json":
		var payload map[string]any
		if err := json.Unmarshal(content, &payload); err != nil {
			return nil, fmt.Errorf("json decode: %w", err)
		}
		if payload == nil {
			payload = map[string]any{}
		}

		formatJS, err := translationfileparser.IsStrictFormatJSRoot(payload)
		if err != nil {
			return nil, err
		}
		if formatJS {
			return buildPackCatalog(payload, options)
		}

		out := make(map[string]string)
		if err := translationfileparser.FlattenJSON(out, "", payload); err != nil {
			return nil, err
		}
		return buildPackFlat(out, options)
	}

	values, err := translationfileparser.NewDefaultStrategy().Parse(trimmedPath, content)
	if err != nil {
		return nil, err
	}

	return buildPackFlat(values, options)
}

func buildPackCatalog(payload map[string]any, options packOptions) (map[string]extractCatalogMessage, error) {
	prefixIndex := packPrefixIndex{}
	if options.prefixID {
		prefixIndex = collectPackPrefixIndex()
	}

	keys := make([]string, 0, len(payload))
	for key := range payload {
		keys = append(keys, key)
	}
	slices.Sort(keys)

	catalog := make(map[string]extractCatalogMessage, len(keys))
	sourceByPackedID := make(map[string]string, len(keys))
	for _, key := range keys {
		message, ok := payload[key].(map[string]any)
		if !ok {
			return nil, fmt.Errorf("json key %q must be object", key)
		}
		raw, ok := message["defaultMessage"]
		if !ok {
			return nil, fmt.Errorf("json key %q missing field %q", key, "defaultMessage")
		}
		defaultMessage, ok := raw.(string)
		if !ok {
			return nil, fmt.Errorf("json key %q field %q must be string, got %T", key, "defaultMessage", raw)
		}

		packedID := key
		if options.prefixID {
			packedID = stripPackPrefixID(key, prefixIndex)
		}
		if existingSourceID, ok := sourceByPackedID[packedID]; ok {
			return nil, packPrefixIDCollisionError(existingSourceID, key, packedID)
		}
		sourceByPackedID[packedID] = key
		catalog[packedID] = extractCatalogMessage{
			DefaultMessage: defaultMessage,
		}
	}

	return catalog, nil
}

func buildPackFlat(values map[string]string, options packOptions) (map[string]string, error) {
	prefixIndex := packPrefixIndex{}
	if options.prefixID {
		prefixIndex = collectPackPrefixIndex()
	}

	out := make(map[string]string, len(values))
	sourceByPackedID := make(map[string]string, len(values))
	ids := make([]string, 0, len(values))
	for id := range values {
		ids = append(ids, id)
	}
	slices.Sort(ids)

	for _, id := range ids {
		translation := values[id]
		packedID := id
		if options.prefixID {
			packedID = stripPackPrefixID(id, prefixIndex)
		}
		if existingSourceID, ok := sourceByPackedID[packedID]; ok {
			return nil, packPrefixIDCollisionError(existingSourceID, id, packedID)
		}
		sourceByPackedID[packedID] = id
		out[packedID] = translation
	}

	return out, nil
}

func runPackGrouped(path string, options packOptions) (map[string][]string, error) {
	trimmedPath := strings.TrimSpace(path)
	if trimmedPath == "" {
		return nil, fmt.Errorf("pack translation file path cannot be empty")
	}

	content, err := os.ReadFile(trimmedPath)
	if err != nil {
		return nil, fmt.Errorf("read pack input %q: %w", trimmedPath, err)
	}

	values, err := translationfileparser.NewDefaultStrategy().Parse(trimmedPath, content)
	if err != nil {
		return nil, err
	}

	prefixIndex := packPrefixIndex{}
	if options.prefixID {
		prefixIndex = collectPackPrefixIndex()
	}

	packed := make(map[string][]string, len(values))
	sourceByPackedID := make(map[string]string, len(values))
	for id, translation := range values {
		packedID := id
		if options.prefixID {
			packedID = stripPackPrefixID(id, prefixIndex)
		}
		if existingSourceID, ok := sourceByPackedID[packedID]; ok {
			return nil, packPrefixIDCollisionError(existingSourceID, id, packedID)
		}
		sourceByPackedID[packedID] = id
		packed[translation] = append(packed[translation], packedID)
	}

	for translation := range packed {
		slices.Sort(packed[translation])
		packed[translation] = slices.Compact(packed[translation])
	}

	return packed, nil
}

func packPrefixIDCollisionError(existingSourceID, sourceID, packedID string) error {
	return fmt.Errorf(
		"pack --prefix-id: ids %q and %q both strip to %q",
		existingSourceID,
		sourceID,
		packedID,
	)
}

func writePackOutput(cmd *cobra.Command, payload any, options packOptions) error {
	outFile := strings.TrimSpace(options.outFile)
	if outFile != "" {
		return writePackPayloadToFile(payload, outFile)
	}

	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetIndent("", "  ")
	enc.SetEscapeHTML(false)
	if err := enc.Encode(payload); err != nil {
		return fmt.Errorf("encode pack output: %w", err)
	}

	if _, err := cmd.OutOrStdout().Write(buf.Bytes()); err != nil {
		return fmt.Errorf("write pack output: %w", err)
	}

	return nil
}

type packPrefixIndex struct {
	originalIDs map[string]string
	prefixes    map[string]struct{}
}

func collectPackPrefixIndex() packPrefixIndex {
	index := packPrefixIndex{
		originalIDs: make(map[string]string),
		prefixes:    make(map[string]struct{}),
	}
	_ = filepath.WalkDir(".", func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return nil
		}
		if entry.IsDir() {
			if path != "." && shouldSkipExtractDir(entry.Name()) {
				return filepath.SkipDir
			}
			return nil
		}
		if isExtractSourceFile(path) {
			prefix := normalizedExtractFilename(path)
			index.prefixes[prefix] = struct{}{}
			content, err := os.ReadFile(path)
			if err != nil {
				return nil
			}
			messages, err := extractMessagesFromReactIntlSource(string(content), path)
			if err != nil {
				return nil
			}
			for _, message := range messages {
				index.originalIDs[prefix+"."+message.ID] = message.ID
			}
		}

		return nil
	})

	return index
}

func stripPackPrefixID(id string, indexes ...packPrefixIndex) string {
	prefixIndex := packPrefixIndex{}
	if len(indexes) > 0 {
		prefixIndex = indexes[0]
	} else {
		prefixIndex = collectPackPrefixIndex()
	}
	if originalID, ok := prefixIndex.originalIDs[id]; ok {
		return originalID
	}

	for dot := strings.LastIndex(id, "."); dot > 0; dot = strings.LastIndex(id[:dot], ".") {
		if dot == len(id)-1 {
			continue
		}
		if _, ok := prefixIndex.prefixes[id[:dot]]; ok {
			return id[dot+1:]
		}
	}
	if stripped, ok := stripPackHyphenatedPrefixID(id); ok {
		return stripped
	}

	index := strings.LastIndex(id, ".")
	if index < 0 || index == len(id)-1 {
		return id
	}

	return id[index+1:]
}

func stripPackHyphenatedPrefixID(id string) (string, bool) {
	parts := strings.Split(id, ".")
	for i := 0; i <= len(parts)-2; i++ {
		if strings.Contains(parts[i], "-") {
			return strings.Join(parts[i+1:], "."), true
		}
	}

	return "", false
}
