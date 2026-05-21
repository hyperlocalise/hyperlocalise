package cmd

import (
 	"bytes"
 	"encoding/json"
 	"fmt"
 	"os"
 	"strings"

 	"github.com/hyperlocalise/hyperlocalise/internal/i18n/translationfileparser"
 	"github.com/spf13/cobra"
)

func newEntriesCmd() *cobra.Command {
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
			entries, err := translationfileparser.NewDefaultStrategy().Parse(path, content)
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
	return cmd
}

