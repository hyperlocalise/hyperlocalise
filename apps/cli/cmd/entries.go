package cmd

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/translationfileparser"
	"github.com/spf13/cobra"
)

func newEntriesCmd() *cobra.Command {
	var locale string
	var sourcePath string

	cmd := &cobra.Command{
		Use:          "entries <translation-file>",
		Short:        "print parsed translation entries as key/value JSON",
		Args:         cobra.ExactArgs(1),
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			path := strings.TrimSpace(args[0])
			if path == "" {
				return fmt.Errorf("entries translation file path cannot be empty")
			}
			content, err := os.ReadFile(path)
			if err != nil {
				return fmt.Errorf("read entries input %q: %w", path, err)
			}

			entries, err := readEntriesCommandOutput(path, content, strings.TrimSpace(sourcePath), strings.TrimSpace(locale))
			if err != nil {
				return err
			}

			var buf bytes.Buffer
			enc := json.NewEncoder(&buf)
			enc.SetIndent("", "  ")
			enc.SetEscapeHTML(false)
			if err := enc.Encode(entries); err != nil {
				return fmt.Errorf("encode entries output: %w", err)
			}
			_, err = cmd.OutOrStdout().Write(buf.Bytes())
			return err
		},
	}
	cmd.Flags().StringVar(
		&locale,
		"locale",
		"",
		"target locale for multi-locale files such as .xcstrings",
	)
	cmd.Flags().StringVar(
		&sourcePath,
		"source",
		"",
		"source file used to align markdown/MDX target documents onto source slot ids",
	)
	return cmd
}

func readEntriesCommandOutput(path string, content []byte, sourcePath, locale string) (map[string]translationfileparser.EntriesCommandOutputValue, error) {
	if sourcePath != "" {
		ext := strings.ToLower(filepath.Ext(path))
		if ext == ".md" || ext == ".mdx" {
			sourceExt := strings.ToLower(filepath.Ext(sourcePath))
			if sourceExt != ext {
				return nil, fmt.Errorf("entries source extension %q does not match target extension %q", sourceExt, ext)
			}
			sourceContent, err := os.ReadFile(sourcePath)
			if err != nil {
				return nil, fmt.Errorf("read entries source %q: %w", sourcePath, err)
			}
			mdx := ext == ".mdx"
			sourceDoc := translationfileparser.ParseMarkdownDocumentIR(sourceContent, mdx)
			aligned := translationfileparser.AlignMarkdownTargetToSource(sourceContent, content, mdx)
			return translationfileparser.EncodeDocumentEntriesCommandOutput(sourceDoc.WithBlockText(aligned)), nil
		}
	}

	if translationfileparser.IsMarkdownDocumentExtension(path) {
		doc := translationfileparser.ParseMarkdownDocumentIR(content, translationfileparser.IsMarkdownDocumentMDX(path))
		return translationfileparser.EncodeDocumentEntriesCommandOutput(doc), nil
	}

	strategy := translationfileparser.NewDefaultStrategy()
	entries, err := strategy.ParseIngestEntries(path, content, locale)
	if err != nil {
		return nil, err
	}
	return translationfileparser.EncodeEntriesCommandOutput(entries), nil
}
