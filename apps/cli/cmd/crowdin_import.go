package cmd

import (
	"fmt"
	"path/filepath"
	"strings"

	crowdinstorage "github.com/hyperlocalise/hyperlocalise/internal/i18n/storage/crowdin"
	"github.com/spf13/cobra"
)

type crowdinImportOptions struct {
	configPath   string
	identityPath string
	id           int
	inputPath    string
}

func newCrowdinTranslationMemoryUploadCmd() *cobra.Command {
	o := crowdinImportOptions{}
	cmd := &cobra.Command{
		Use:          "upload",
		Short:        "upload a TMX file into a Crowdin translation memory",
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			if err := requireInputExtension(o.inputPath, ".tmx"); err != nil {
				return fmt.Errorf("crowdin translation memory upload: %w", err)
			}
			cfg, _, err := crowdinstorage.LoadClientConfig(o.configPath, o.identityPath)
			if err != nil {
				return err
			}
			client, err := newCrowdinTranslationMemoryImporter(cfg)
			if err != nil {
				return err
			}
			result, err := client.ImportTranslationMemoryFile(cmd.Context(), o.id, o.inputPath)
			if err != nil {
				return err
			}
			_, err = fmt.Fprintf(cmd.OutOrStdout(), "imported tm_id=%d status=%s progress=%d\n", o.id, result.Status, result.Progress)
			return err
		},
	}
	cmd.Flags().StringVar(&o.configPath, "config", "", "path to crowdin.yml")
	cmd.Flags().StringVar(&o.identityPath, "identity", "", "path to Crowdin identity file")
	cmd.Flags().IntVar(&o.id, "tm-id", 0, "Crowdin translation memory identifier")
	cmd.Flags().StringVar(&o.inputPath, "input", "", "path to a TMX file")
	_ = cmd.MarkFlagRequired("tm-id")
	_ = cmd.MarkFlagRequired("input")
	return cmd
}

func newCrowdinGlossaryUploadCmd() *cobra.Command {
	o := crowdinImportOptions{}
	cmd := &cobra.Command{
		Use:          "upload",
		Short:        "upload a TBX file into a Crowdin glossary",
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			if err := requireInputExtension(o.inputPath, ".tbx"); err != nil {
				return fmt.Errorf("crowdin glossary upload: %w", err)
			}
			cfg, _, err := crowdinstorage.LoadClientConfig(o.configPath, o.identityPath)
			if err != nil {
				return err
			}
			client, err := newCrowdinGlossaryImporter(cfg)
			if err != nil {
				return err
			}
			result, err := client.ImportGlossaryFile(cmd.Context(), o.id, o.inputPath)
			if err != nil {
				return err
			}
			_, err = fmt.Fprintf(cmd.OutOrStdout(), "imported glossary_id=%d status=%s progress=%d\n", o.id, result.Status, result.Progress)
			return err
		},
	}
	cmd.Flags().StringVar(&o.configPath, "config", "", "path to crowdin.yml")
	cmd.Flags().StringVar(&o.identityPath, "identity", "", "path to Crowdin identity file")
	cmd.Flags().IntVar(&o.id, "glossary-id", 0, "Crowdin glossary identifier")
	cmd.Flags().StringVar(&o.inputPath, "input", "", "path to a TBX file")
	_ = cmd.MarkFlagRequired("glossary-id")
	_ = cmd.MarkFlagRequired("input")
	return cmd
}

func requireInputExtension(path, wantExt string) error {
	path = strings.TrimSpace(path)
	if path == "" {
		return fmt.Errorf("input path is required")
	}
	if !strings.EqualFold(filepath.Ext(path), wantExt) {
		return fmt.Errorf("input file must be %s", wantExt)
	}
	return nil
}
