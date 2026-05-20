package cmd

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
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

	packed := make(map[string][]string, len(values))
	for id, translation := range values {
		packedID := id
		if options.prefixID {
			packedID = stripPackPrefixID(id)
		}
		packed[translation] = append(packed[translation], packedID)
	}

	for translation := range packed {
		slices.Sort(packed[translation])
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

func stripPackPrefixID(id string) string {
	index := strings.LastIndex(id, ".")
	if index < 0 || index == len(id)-1 {
		return id
	}

	return id[index+1:]
}
