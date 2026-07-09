package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/apps/cli/internal/i18n/runsvc"
	"github.com/spf13/cobra"
)

func newExportCmd() *cobra.Command {
	var (
		sourcePath   string
		targetPath   string
		prefilledPath string
		sourceLocale string
		targetLocale string
		projectRoot  string
		outputPath   string
	)

	cmd := &cobra.Command{
		Use:          "export",
		Short:        "reconstruct a translated file from prefilled entries",
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			sourcePath = strings.TrimSpace(sourcePath)
			targetPath = strings.TrimSpace(targetPath)
			prefilledPath = strings.TrimSpace(prefilledPath)
			sourceLocale = strings.TrimSpace(sourceLocale)
			targetLocale = strings.TrimSpace(targetLocale)
			projectRoot = strings.TrimSpace(projectRoot)
			outputPath = strings.TrimSpace(outputPath)

			if sourcePath == "" {
				return fmt.Errorf("--source is required")
			}
			if targetPath == "" {
				return fmt.Errorf("--target is required")
			}
			if prefilledPath == "" {
				return fmt.Errorf("--prefilled is required")
			}
			if targetLocale == "" {
				return fmt.Errorf("--target-locale is required")
			}

			prefilledRaw, err := os.ReadFile(prefilledPath)
			if err != nil {
				return fmt.Errorf("read --prefilled %q: %w", prefilledPath, err)
			}
			var prefilled map[string]string
			if err := json.Unmarshal(prefilledRaw, &prefilled); err != nil {
				return fmt.Errorf("parse --prefilled %q: %w", prefilledPath, err)
			}
			if len(prefilled) == 0 {
				return fmt.Errorf("--prefilled %q did not contain any entries", prefilledPath)
			}

			content, err := runsvc.ExportPrefilledTarget(runsvc.ExportInput{
				TargetPath:   targetPath,
				SourcePath:   sourcePath,
				SourceLocale: sourceLocale,
				TargetLocale: targetLocale,
				Prefilled:    prefilled,
				ProjectRoot:  projectRoot,
			})
			if err != nil {
				return err
			}

			if outputPath == "" {
				_, err = cmd.OutOrStdout().Write(content)
				return err
			}
			return writeFileAtomic(outputPath, content)
		},
	}

	cmd.Flags().StringVar(&sourcePath, "source", "", "source file path used as the export template")
	cmd.Flags().StringVar(&targetPath, "target", "", "target file path to reconstruct (extension selects format)")
	cmd.Flags().StringVar(&prefilledPath, "prefilled", "", "JSON file containing prefilled translation entries keyed by entry id")
	cmd.Flags().StringVar(&sourceLocale, "source-locale", "", "source locale for locale-aware formats")
	cmd.Flags().StringVar(&targetLocale, "target-locale", "", "target locale for locale-aware formats")
	cmd.Flags().StringVar(&projectRoot, "project-root", "", "project root for resolving relative source/target paths")
	cmd.Flags().StringVar(&outputPath, "output", "", "write reconstructed file to this path instead of stdout")
	return cmd
}
