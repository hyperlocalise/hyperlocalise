package cmd

import (
	"embed"
	"fmt"
	"os"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/storage"
	crowdinstorage "github.com/hyperlocalise/hyperlocalise/internal/i18n/storage/crowdin"
	"github.com/spf13/cobra"
)

const crowdinTemplateFilename = "crowdin.yml"

//go:embed templates/crowdin.yml
var crowdinTemplateFS embed.FS

type crowdinCommonOptions struct {
	configPath   string
	identityPath string
	languages    []string
	dryRun       bool
}

func newCrowdinCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "crowdin",
		Short: "Crowdin-compatible file workflow commands",
	}

	cmd.AddCommand(newCrowdinInitCmd())
	cmd.AddCommand(newCrowdinConfigCmd())
	cmd.AddCommand(newCrowdinUploadCmd())
	cmd.AddCommand(newCrowdinDownloadCmd())

	return cmd
}

func newCrowdinInitCmd() *cobra.Command {
	var force bool

	cmd := &cobra.Command{
		Use:          "init",
		Short:        "write a starter crowdin.yml template",
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			template, err := crowdinTemplateFS.ReadFile("templates/crowdin.yml")
			if err != nil {
				return fmt.Errorf("read crowdin init template: %w", err)
			}
			if _, err := os.Stat(crowdinTemplateFilename); err == nil && !force {
				return fmt.Errorf("%s already exists; use --force to overwrite", crowdinTemplateFilename)
			} else if err != nil && !os.IsNotExist(err) {
				return fmt.Errorf("check %s: %w", crowdinTemplateFilename, err)
			}
			if err := os.WriteFile(crowdinTemplateFilename, template, 0o644); err != nil {
				return fmt.Errorf("write %s: %w", crowdinTemplateFilename, err)
			}
			_, err = fmt.Fprintf(cmd.OutOrStdout(), "wrote %s\n", crowdinTemplateFilename)
			return err
		},
	}

	cmd.Flags().BoolVar(&force, "force", false, "overwrite existing crowdin.yml")
	return cmd
}

func newCrowdinConfigCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "config",
		Short: "validate Crowdin-compatible config",
	}
	cmd.AddCommand(newCrowdinConfigValidateCmd())
	return cmd
}

func newCrowdinConfigValidateCmd() *cobra.Command {
	o := crowdinCommonOptions{}
	cmd := &cobra.Command{
		Use:          "validate",
		Short:        "validate crowdin.yml",
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg, resolvedPath, err := loadCrowdinWorkflowConfig(o.configPath, o.identityPath)
			if err != nil {
				return err
			}
			_, err = fmt.Fprintf(cmd.OutOrStdout(), "config=%s files=%d preserve_hierarchy=%t base_path=%s\n", resolvedPath, len(cfg.Files), cfg.PreserveHierarchy, cfg.BasePath)
			return err
		},
	}
	addCrowdinCommonFlags(cmd, &o, false)
	return cmd
}

func newCrowdinUploadCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "upload",
		Short: "upload sources or translations using crowdin.yml",
	}
	cmd.AddCommand(newCrowdinUploadSourcesCmd())
	cmd.AddCommand(newCrowdinUploadTranslationsCmd())
	return cmd
}

func newCrowdinUploadSourcesCmd() *cobra.Command {
	o := crowdinCommonOptions{}
	cmd := &cobra.Command{
		Use:          "sources",
		Short:        "upload source files defined in crowdin.yml",
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg, _, err := loadCrowdinWorkflowConfig(o.configPath, o.identityPath)
			if err != nil {
				return err
			}
			if o.dryRun {
				_, err := fmt.Fprintf(cmd.OutOrStdout(), "dry-run action=upload-sources files=%d\n", len(cfg.Files))
				return err
			}
			adapter, err := crowdinstorage.NewFileAdapter(cfg)
			if err != nil {
				return err
			}
			result, err := adapter.UploadSources(backgroundContext(), crowdinstorageRequestSources(cfg))
			return writeCrowdinResultError(cmd, "upload-sources", result, err)
		},
	}
	addCrowdinCommonFlags(cmd, &o, false)
	return cmd
}

func newCrowdinUploadTranslationsCmd() *cobra.Command {
	o := crowdinCommonOptions{}
	cmd := &cobra.Command{
		Use:          "translations",
		Short:        "upload translated files defined in crowdin.yml",
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg, _, err := loadCrowdinWorkflowConfig(o.configPath, o.identityPath)
			if err != nil {
				return err
			}
			if o.dryRun {
				_, err := fmt.Fprintf(cmd.OutOrStdout(), "dry-run action=upload-translations files=%d languages=%s\n", len(cfg.Files), strings.Join(o.languages, ","))
				return err
			}
			adapter, err := crowdinstorage.NewFileAdapter(cfg)
			if err != nil {
				return err
			}
			result, err := adapter.UploadTranslations(backgroundContext(), crowdinstorageRequestTranslations(cfg, o.languages))
			return writeCrowdinResultError(cmd, "upload-translations", result, err)
		},
	}
	addCrowdinCommonFlags(cmd, &o, true)
	return cmd
}

func newCrowdinDownloadCmd() *cobra.Command {
	o := crowdinCommonOptions{}
	cmd := &cobra.Command{
		Use:          "download",
		Short:        "download translated files defined in crowdin.yml",
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg, _, err := loadCrowdinWorkflowConfig(o.configPath, o.identityPath)
			if err != nil {
				return err
			}
			if o.dryRun {
				_, err := fmt.Fprintf(cmd.OutOrStdout(), "dry-run action=download-translations files=%d languages=%s\n", len(cfg.Files), strings.Join(o.languages, ","))
				return err
			}
			adapter, err := crowdinstorage.NewFileAdapter(cfg)
			if err != nil {
				return err
			}
			result, err := adapter.DownloadTranslations(backgroundContext(), crowdinstorageRequestDownload(cfg, o.languages))
			return writeCrowdinResultError(cmd, "download-translations", result, err)
		},
	}
	addCrowdinCommonFlags(cmd, &o, true)
	return cmd
}

func addCrowdinCommonFlags(cmd *cobra.Command, o *crowdinCommonOptions, includeLanguages bool) {
	cmd.Flags().StringVar(&o.configPath, "config", "", "path to crowdin.yml")
	cmd.Flags().StringVar(&o.identityPath, "identity", "", "path to Crowdin identity file")
	cmd.Flags().BoolVar(&o.dryRun, "dry-run", false, "preview command without applying remote or local changes")
	if includeLanguages {
		cmd.Flags().StringSliceVarP(&o.languages, "language", "l", nil, "target language(s) to process")
	}
}

func loadCrowdinWorkflowConfig(configPath, identityPath string) (storage.FileWorkflowConfig, string, error) {
	cfg, resolvedPath, err := crowdinstorage.LoadFileWorkflowConfig(configPath, identityPath)
	if err != nil {
		return storage.FileWorkflowConfig{}, "", err
	}
	return cfg, resolvedPath, nil
}

func writeCrowdinFileResult(cmd *cobra.Command, action string, result storage.FileOperationResult) error {
	_, err := fmt.Fprintf(cmd.OutOrStdout(), "action=%s processed=%d skipped=%d warnings=%d\n", action, len(result.Processed), len(result.Skipped), len(result.Warnings))
	return err
}

func writeCrowdinResultError(cmd *cobra.Command, action string, result storage.FileOperationResult, opErr error) error {
	if writeErr := writeCrowdinFileResult(cmd, action, result); writeErr != nil && opErr == nil {
		return writeErr
	}
	return opErr
}

func crowdinstorageRequestSources(cfg storage.FileWorkflowConfig) storage.FileUploadSourcesRequest {
	return storage.FileUploadSourcesRequest{Config: cfg}
}

func crowdinstorageRequestTranslations(cfg storage.FileWorkflowConfig, languages []string) storage.FileUploadTranslationsRequest {
	return storage.FileUploadTranslationsRequest{Config: cfg, Languages: languages}
}

func crowdinstorageRequestDownload(cfg storage.FileWorkflowConfig, languages []string) storage.FileDownloadTranslationsRequest {
	return storage.FileDownloadTranslationsRequest{Config: cfg, Languages: languages}
}
