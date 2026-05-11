package cmd

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/storage/smartling"
	"github.com/spf13/cobra"
)

type smartlingGlossaryDownloadOptions struct {
	accountUID     string
	glossaryUID    string
	userIdentifier string
	userSecret     string
	userSecretEnv  string
	languages      []string
	outputPath     string
}

func newSmartlingCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "smartling",
		Short: "Smartling compatibility subcommands",
	}
	cmd.AddCommand(newSmartlingGlossaryCmd())
	cmd.AddCommand(newSmartlingTranslationMemoryCmd())
	cmd.AddCommand(newSmartlingUploadCmd())
	return cmd
}

func newSmartlingGlossaryCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "glossary",
		Short: "Smartling glossary commands",
	}
	cmd.AddCommand(newSmartlingGlossaryDownloadCmd())
	return cmd
}

func newSmartlingGlossaryDownloadCmd() *cobra.Command {
	o := smartlingGlossaryDownloadOptions{}
	cmd := &cobra.Command{
		Use:          "download",
		Short:        "download Smartling glossary terms as CSV",
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			ctx := context.Background()
			cfg := smartling.Config{
				UserIdentifier: strings.TrimSpace(o.userIdentifier),
				UserSecret:     strings.TrimSpace(o.userSecret),
				UserSecretEnv:  strings.TrimSpace(o.userSecretEnv),
			}

			// UserSecret will be resolved from Env in ParseConfig if not explicitly set
			// but NewHTTPClient doesn't call ParseConfig.
			// Let's use a temporary way to resolve credentials if needed.
			if cfg.UserSecret == "" {
				envVar := cfg.UserSecretEnv
				if envVar == "" {
					envVar = "SMARTLING_USER_SECRET"
				}
				cfg.UserSecret = os.Getenv(envVar)
			}

			if cfg.UserIdentifier == "" {
				cfg.UserIdentifier = os.Getenv("SMARTLING_USER_IDENTIFIER")
			}

			if cfg.UserIdentifier == "" || cfg.UserSecret == "" {
				return fmt.Errorf("smartling glossary download: credentials are required (via flags or SMARTLING_USER_IDENTIFIER/SMARTLING_USER_SECRET)")
			}

			client, err := smartling.NewHTTPClient(cfg)
			if err != nil {
				return err
			}

			outputPath := strings.TrimSpace(o.outputPath)
			out := cmd.OutOrStdout()
			var closeOut func() error
			var tempPath string
			if outputPath != "" {
				file, err := os.CreateTemp(filepath.Dir(outputPath), "."+filepath.Base(outputPath)+".*.tmp")
				if err != nil {
					return fmt.Errorf("create temporary glossary csv: %w", err)
				}
				out = file
				tempPath = file.Name()
				closeOut = file.Close
			}

			result, err := client.WriteGlossaryCSV(ctx, smartling.GlossaryDownloadRequest{
				AccountUID:  o.accountUID,
				GlossaryUID: o.glossaryUID,
				Languages:   o.languages,
			}, out)

			if closeOut != nil {
				if closeErr := closeOut(); closeErr != nil && err == nil {
					err = fmt.Errorf("close glossary csv: %w", closeErr)
				}
			}

			if err != nil {
				if tempPath != "" {
					_ = os.Remove(tempPath)
				}
				return err
			}

			if outputPath != "" {
				if err := os.Rename(tempPath, outputPath); err != nil {
					_ = os.Remove(tempPath)
					return fmt.Errorf("replace glossary csv: %w", err)
				}
				_, _ = fmt.Fprintf(cmd.OutOrStdout(), "wrote %s entries=%d\n", outputPath, result.Entries)
			}

			return nil
		},
	}

	cmd.Flags().StringVar(&o.accountUID, "account-uid", "", "Smartling account UID")
	cmd.Flags().StringVar(&o.glossaryUID, "glossary-uid", "", "Smartling glossary UID")
	cmd.Flags().StringVar(&o.userIdentifier, "user-id", "", "Smartling user identifier")
	cmd.Flags().StringVar(&o.userSecret, "user-secret", "", "Smartling user secret")
	cmd.Flags().StringVar(&o.userSecretEnv, "user-secret-env", "", "Environment variable for Smartling user secret")
	cmd.Flags().StringSliceVarP(&o.languages, "language", "l", nil, "term language(s) to include")
	cmd.Flags().StringVarP(&o.outputPath, "output", "o", "", "write CSV to file instead of stdout")

	_ = cmd.MarkFlagRequired("account-uid")
	_ = cmd.MarkFlagRequired("glossary-uid")

	return cmd
}

type smartlingTranslationMemoryDownloadOptions struct {
	accountUID           string
	translationMemoryUID string
	userIdentifier       string
	userSecret           string
	userSecretEnv        string
	sourceLanguage       string
	targetLanguages      []string
	format               string
	outputPath           string
}

func newSmartlingTranslationMemoryCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:     "tm",
		Aliases: []string{"translation-memory"},
		Short:   "Smartling translation memory commands",
	}
	cmd.AddCommand(newSmartlingTranslationMemoryDownloadCmd())
	return cmd
}

func newSmartlingTranslationMemoryDownloadCmd() *cobra.Command {
	o := smartlingTranslationMemoryDownloadOptions{}
	cmd := &cobra.Command{
		Use:          "download",
		Short:        "download Smartling translation memory entries",
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			outputFormat, err := normalizeTranslationMemoryDownloadFormat(o.format)
			if err != nil {
				return fmt.Errorf("smartling tm download: %w", err)
			}

			ctx := context.Background()
			cfg := smartling.Config{
				UserIdentifier: strings.TrimSpace(o.userIdentifier),
				UserSecret:     strings.TrimSpace(o.userSecret),
				UserSecretEnv:  strings.TrimSpace(o.userSecretEnv),
			}

			if cfg.UserSecret == "" {
				envVar := cfg.UserSecretEnv
				if envVar == "" {
					envVar = "SMARTLING_USER_SECRET"
				}
				cfg.UserSecret = os.Getenv(envVar)
			}
			if cfg.UserIdentifier == "" {
				cfg.UserIdentifier = os.Getenv("SMARTLING_USER_IDENTIFIER")
			}
			if cfg.UserIdentifier == "" || cfg.UserSecret == "" {
				return fmt.Errorf("smartling tm download: credentials are required (via flags or SMARTLING_USER_IDENTIFIER/SMARTLING_USER_SECRET)")
			}

			client, err := smartling.NewHTTPClient(cfg)
			if err != nil {
				return err
			}

			outputPath := strings.TrimSpace(o.outputPath)
			out := cmd.OutOrStdout()
			var closeOut func() error
			var tempPath string
			if outputPath != "" {
				file, err := os.CreateTemp(filepath.Dir(outputPath), "."+filepath.Base(outputPath)+".*.tmp")
				if err != nil {
					return fmt.Errorf("create temporary translation memory output: %w", err)
				}
				out = file
				tempPath = file.Name()
				closeOut = file.Close
			}

			result, err := writeSmartlingTranslationMemory(ctx, client, smartling.TranslationMemoryDownloadRequest{
				AccountUID:           o.accountUID,
				TranslationMemoryUID: o.translationMemoryUID,
				SourceLanguage:       o.sourceLanguage,
				TargetLanguages:      o.targetLanguages,
			}, outputFormat, out)

			if closeOut != nil {
				if closeErr := closeOut(); closeErr != nil && err == nil {
					err = fmt.Errorf("close translation memory output: %w", closeErr)
				}
			}

			if err != nil {
				if tempPath != "" {
					_ = os.Remove(tempPath)
				}
				return err
			}

			if outputPath != "" {
				if err := os.Rename(tempPath, outputPath); err != nil {
					_ = os.Remove(tempPath)
					return fmt.Errorf("replace translation memory output: %w", err)
				}
				_, _ = writeTranslationMemoryDownloadSummary(cmd.OutOrStdout(), outputPath, outputFormat, result.Rows, result.Segments)
			}

			return nil
		},
	}

	cmd.Flags().StringVar(&o.accountUID, "account-uid", "", "Smartling account UID")
	cmd.Flags().StringVar(&o.translationMemoryUID, "tm-uid", "", "Smartling translation memory UID")
	cmd.Flags().StringVar(&o.userIdentifier, "user-id", "", "Smartling user identifier")
	cmd.Flags().StringVar(&o.userSecret, "user-secret", "", "Smartling user secret")
	cmd.Flags().StringVar(&o.userSecretEnv, "user-secret-env", "", "Environment variable for Smartling user secret")
	cmd.Flags().StringVar(&o.sourceLanguage, "source-language", "", "source language ID to export")
	cmd.Flags().StringSliceVarP(&o.targetLanguages, "target-language", "l", nil, "target language ID(s) to export")
	cmd.Flags().StringVar(&o.format, "format", "csv", "download format: csv or tmx")
	cmd.Flags().StringVarP(&o.outputPath, "output", "o", "", "write output to file instead of stdout")

	_ = cmd.MarkFlagRequired("account-uid")
	_ = cmd.MarkFlagRequired("tm-uid")
	_ = cmd.MarkFlagRequired("source-language")

	return cmd
}


type smartlingUploadSourcesOptions struct {
	projectID      string
	fileURI        string
	filePaths      []string
	fileType       string
	authorize      bool
	userIdentifier string
	userSecret     string
	userSecretEnv  string
	dryRun         bool
}

func newSmartlingUploadCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "upload",
		Short: "upload sources or translations to Smartling",
	}
	cmd.AddCommand(newSmartlingUploadSourcesCmd())
	return cmd
}

func newSmartlingUploadSourcesCmd() *cobra.Command {
	o := smartlingUploadSourcesOptions{}
	cmd := &cobra.Command{
		Use:          "sources",
		Short:        "upload source files to Smartling",
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return executeSmartlingUploadSources(cmd, o)
		},
	}

	cmd.Flags().StringVar(&o.projectID, "project-id", "", "Smartling project ID")
	cmd.Flags().StringVar(&o.fileURI, "file-uri", "", "Smartling file URI")
	cmd.Flags().StringArrayVarP(&o.filePaths, "file", "f", nil, "source file path(s) to upload")
	cmd.Flags().StringVar(&o.fileType, "file-type", "", "Smartling file type (e.g. json, yaml, ios, android, gettext, html, markdown)")
	cmd.Flags().BoolVar(&o.authorize, "authorize", true, "authorize strings for translation")
	cmd.Flags().StringVar(&o.userIdentifier, "user-id", "", "Smartling user identifier")
	cmd.Flags().StringVar(&o.userSecret, "user-secret", "", "Smartling user secret")
	cmd.Flags().StringVar(&o.userSecretEnv, "user-secret-env", "", "Environment variable for Smartling user secret")
	cmd.Flags().BoolVar(&o.dryRun, "dry-run", false, "preview upload without sending files")

	_ = cmd.MarkFlagRequired("project-id")

	return cmd
}

func executeSmartlingUploadSources(cmd *cobra.Command, o smartlingUploadSourcesOptions) error {
	if len(o.filePaths) == 0 {
		return fmt.Errorf("smartling upload sources: at least one --file is required")
	}

	ctx := context.Background()
	cfg := smartling.Config{
		ProjectID:      strings.TrimSpace(o.projectID),
		UserIdentifier: strings.TrimSpace(o.userIdentifier),
		UserSecret:     strings.TrimSpace(o.userSecret),
		UserSecretEnv:  strings.TrimSpace(o.userSecretEnv),
	}

	if cfg.UserSecret == "" {
		envVar := cfg.UserSecretEnv
		if envVar == "" {
			envVar = "SMARTLING_USER_SECRET"
		}
		cfg.UserSecret = os.Getenv(envVar)
	}
	if cfg.UserIdentifier == "" {
		cfg.UserIdentifier = os.Getenv("SMARTLING_USER_IDENTIFIER")
	}
	if cfg.UserIdentifier == "" || cfg.UserSecret == "" {
		return fmt.Errorf("smartling upload sources: credentials are required (via flags or SMARTLING_USER_IDENTIFIER/SMARTLING_USER_SECRET)")
	}

	client, err := smartling.NewHTTPClient(cfg)
	if err != nil {
		return err
	}

	processed := 0
	for _, path := range o.filePaths {
		fileUri := o.fileURI
		if fileUri == "" {
			fileUri = filepath.ToSlash(path)
		}

		fileType := o.fileType
		if fileType == "" {
			ext := strings.ToLower(filepath.Ext(path))
			switch ext {
			case ".json":
				fileType = "json"
			case ".yaml", ".yml":
				fileType = "yaml"
			case ".xml":
				fileType = "xml"
			case ".html", ".htm":
				fileType = "html"
			case ".csv":
				fileType = "csv"
			case ".strings":
				fileType = "ios"
			case ".stringsdict":
				fileType = "ios_stringsdict"
			case ".properties":
				fileType = "javaProperties"
			case ".xliff", ".xlf":
				fileType = "xliff"
			case ".md", ".markdown":
				fileType = "markdown"
			}
		}
		if fileType == "" {
			return fmt.Errorf("smartling upload sources: could not determine file type for %q; use --file-type", path)
		}

		if o.dryRun {
			_, _ = fmt.Fprintf(cmd.OutOrStdout(), "dry-run action=smartling-upload-source file=%s uri=%s type=%s authorize=%t\n", path, fileUri, fileType, o.authorize)
			processed++
			continue
		}

		result, err := client.UploadSourceFile(ctx, smartling.SourceUploadInput{
			ProjectID: cfg.ProjectID,
			FileURI:   fileUri,
			FilePath:  path,
			FileType:  fileType,
			Authorize: o.authorize,
		})
		if err != nil {
			return fmt.Errorf("smartling upload source %q: %w", path, err)
		}
		processed++
		_, _ = fmt.Fprintf(cmd.OutOrStdout(), "uploaded file=%s uri=%s strings=%d words=%d overwritten=%t\n", path, fileUri, result.StringCount, result.WordCount, result.OverWritten)
	}

	action := "smartling-upload-sources"
	if o.dryRun {
		action = "dry-run " + action
	}
	_, _ = fmt.Fprintf(cmd.OutOrStdout(), "action=%s processed=%d skipped=0 warnings=0\n", action, processed)
	return nil
}
