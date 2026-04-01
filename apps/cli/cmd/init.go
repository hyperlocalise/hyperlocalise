package cmd

import (
	"embed"
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

const configTemplateFilename = "i18n.yml"

//go:embed templates/i18n.yml
var initTemplateFS embed.FS

type initOptions struct {
	force bool
}

func newInitCmd() *cobra.Command {
	o := &initOptions{}

	cmd := &cobra.Command{
		Use:          "init",
		Short:        "write the latest i18n.yml template",
		Args:         cobra.NoArgs,
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			template, err := initTemplateFS.ReadFile("templates/i18n.yml")
			if err != nil {
				return fmt.Errorf("read init template: %w", err)
			}

			if _, err := os.Stat(configTemplateFilename); err == nil && !o.force {
				return fmt.Errorf("%s already exists; use --force to overwrite", configTemplateFilename)
			} else if err != nil && !os.IsNotExist(err) {
				return fmt.Errorf("check %s: %w", configTemplateFilename, err)
			}

			if err := os.WriteFile(configTemplateFilename, template, 0o644); err != nil {
				return fmt.Errorf("write %s: %w", configTemplateFilename, err)
			}

			if _, err := fmt.Fprintf(cmd.OutOrStdout(), "wrote %s\n", configTemplateFilename); err != nil {
				return fmt.Errorf("write init output: %w", err)
			}

			return nil
		},
	}

	cmd.Flags().BoolVar(&o.force, "force", o.force, "overwrite existing i18n.yml")

	return cmd
}
