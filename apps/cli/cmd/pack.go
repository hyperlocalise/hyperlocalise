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
	prefixID bool
}

func newPackCmd() *cobra.Command {
	o := packOptions{}

	cmd := &cobra.Command{
		Use:          "pack <translation-file>",
		Short:        "group translation ids by shared string value",
		Args:         cobra.ExactArgs(1),
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			packed, err := runPack(args[0], o)
			if err != nil {
				return err
			}

			return writePackOutput(cmd, packed)
		},
	}

	cmd.Flags().BoolVar(&o.prefixID, "prefix-id", false, "strip extract --prefix-id filename prefixes from packed ids")

	return cmd
}

func runPack(path string, options packOptions) (map[string][]string, error) {
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

func writePackOutput(cmd *cobra.Command, packed map[string][]string) error {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetIndent("", "  ")
	enc.SetEscapeHTML(false)
	if err := enc.Encode(packed); err != nil {
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
