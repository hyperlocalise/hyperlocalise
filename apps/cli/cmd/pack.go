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

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/translationfileparser"
	"github.com/spf13/cobra"
)

type packOptions struct {
	groupByValue bool
	outFile      string
	prefixID     bool
}

func newPackCmd() *cobra.Command {
	o := packOptions{}

	cmd := &cobra.Command{
		Use:          "pack <translation-file>",
		Short:        "prepare translation JSON by stripping metadata or grouping duplicates",
		Args:         cobra.ExactArgs(1),
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			payload, err := runPack(args[0], o)
			if err != nil {
				return err
			}

			return writePackOutput(cmd, payload, o)
		},
	}

	cmd.Flags().BoolVar(&o.groupByValue, "group-by-value", false, "group ids by shared translation string instead of preserving id-keyed output")
	cmd.Flags().StringVar(&o.outFile, "out-file", "", "write packed translations to a JSON file")
	cmd.Flags().BoolVar(&o.prefixID, "prefix-id", false, "strip extract --prefix-id filename prefixes from packed ids")

	return cmd
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
			return nil, fmt.Errorf(
				"pack --prefix-id: ids %q and %q both strip to %q",
				existingSourceID,
				id,
				packedID,
			)
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
	for id, translation := range values {
		packedID := id
		if options.prefixID {
			packedID = stripPackPrefixID(id, prefixIndex)
		}
		packed[translation] = append(packed[translation], packedID)
	}

	for translation := range packed {
		slices.Sort(packed[translation])
		packed[translation] = slices.Compact(packed[translation])
	}

	return packed, nil
}

func writePackOutput(cmd *cobra.Command, payload any, options packOptions) error {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetIndent("", "  ")
	enc.SetEscapeHTML(false)
	if err := enc.Encode(payload); err != nil {
		return fmt.Errorf("encode pack output: %w", err)
	}

	outFile := strings.TrimSpace(options.outFile)
	if outFile != "" {
		if err := os.MkdirAll(filepath.Dir(outFile), 0o755); err != nil {
			return fmt.Errorf("create pack output directory: %w", err)
		}
		if err := os.WriteFile(outFile, buf.Bytes(), 0o644); err != nil {
			return fmt.Errorf("write pack output file %q: %w", outFile, err)
		}
		return nil
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
