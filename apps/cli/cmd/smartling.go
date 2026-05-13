package cmd

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/locales"
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
	cmd.AddCommand(newSmartlingDownloadCmd())
	cmd.AddCommand(newSmartlingGlossaryCmd())
	cmd.AddCommand(newSmartlingTranslationMemoryCmd())
	cmd.AddCommand(newSmartlingUploadCmd())
	return cmd
}

type smartlingDownloadTranslationsOptions struct {
	projectID      string
	targetLocales  []string
	fileURI        string
	output         string
	userIdentifier string
	userSecret     string
	userSecretEnv  string
	force          bool
	dryRun         bool
}

type smartlingDownloadSourcesOptions struct {
	projectID      string
	sourceLocale   string
	fileURI        string
	output         string
	userIdentifier string
	userSecret     string
	userSecretEnv  string
	force          bool
	dryRun         bool
}

func newSmartlingDownloadCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "download",
		Short: "download files from Smartling",
	}
	cmd.AddCommand(newSmartlingDownloadSourcesCmd())
	cmd.AddCommand(newSmartlingDownloadTranslationsCmd())
	return cmd
}

var newSmartlingSourceDownloader = func(cfg smartling.Config) (smartlingSourceDownloader, error) {
	return smartling.NewHTTPClient(cfg)
}

var newSmartlingTranslationDownloader = func(cfg smartling.Config) (smartlingTranslationDownloader, error) {
	return smartling.NewHTTPClient(cfg)
}

type smartlingSourceDownloader interface {
	DownloadSourceFile(context.Context, smartling.SourceDownloadInput) (smartling.SourceDownloadResult, error)
}

type smartlingTranslationDownloader interface {
	DownloadTranslationFile(context.Context, smartling.TranslationDownloadInput) (smartling.TranslationDownloadResult, error)
}

func newSmartlingDownloadSourcesCmd() *cobra.Command {
	o := smartlingDownloadSourcesOptions{}
	cmd := &cobra.Command{
		Use:          "sources",
		Short:        "download source files from Smartling",
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return executeSmartlingDownloadSources(cmd, o)
		},
	}
	cmd.Flags().StringVar(&o.projectID, "project-id", "", "Smartling project ID")
	cmd.Flags().StringVar(&o.sourceLocale, "source-locale", "", "Smartling source locale ID")
	cmd.Flags().StringVar(&o.fileURI, "file-uri", "", "Smartling file URI")
	cmd.Flags().StringVarP(&o.output, "output", "o", "", "output file path; omit or use - for stdout")
	cmd.Flags().StringVar(&o.userIdentifier, "user-id", "", "Smartling user identifier")
	cmd.Flags().StringVar(&o.userSecret, "user-secret", "", "Smartling user secret")
	cmd.Flags().StringVar(&o.userSecretEnv, "user-secret-env", "", "Environment variable for Smartling user secret")
	cmd.Flags().BoolVar(&o.force, "force", false, "overwrite an existing output file")
	cmd.Flags().BoolVar(&o.dryRun, "dry-run", false, "preview command without downloading content")
	_ = cmd.MarkFlagRequired("project-id")
	_ = cmd.MarkFlagRequired("source-locale")
	_ = cmd.MarkFlagRequired("file-uri")
	return cmd
}

func newSmartlingDownloadTranslationsCmd() *cobra.Command {
	o := smartlingDownloadTranslationsOptions{}
	cmd := &cobra.Command{
		Use:          "translations",
		Short:        "download translated files from Smartling",
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return executeSmartlingDownloadTranslations(cmd, o)
		},
	}
	cmd.Flags().StringVar(&o.projectID, "project-id", "", "Smartling project ID")
	cmd.Flags().StringSliceVarP(&o.targetLocales, "target-locale", "l", nil, "target locale ID(s) to download")
	cmd.Flags().StringVar(&o.fileURI, "file-uri", "", "Smartling file URI")
	cmd.Flags().StringVarP(&o.output, "output", "o", "", "output file path; omit or use - for stdout when downloading one locale; use %locale% for multiple locales")
	cmd.Flags().StringVar(&o.userIdentifier, "user-id", "", "Smartling user identifier")
	cmd.Flags().StringVar(&o.userSecret, "user-secret", "", "Smartling user secret")
	cmd.Flags().StringVar(&o.userSecretEnv, "user-secret-env", "", "Environment variable for Smartling user secret")
	cmd.Flags().BoolVar(&o.force, "force", false, "overwrite an existing output file")
	cmd.Flags().BoolVar(&o.dryRun, "dry-run", false, "preview command without downloading content")
	_ = cmd.MarkFlagRequired("project-id")
	_ = cmd.MarkFlagRequired("target-locale")
	_ = cmd.MarkFlagRequired("file-uri")
	return cmd
}

func executeSmartlingDownloadSources(cmd *cobra.Command, o smartlingDownloadSourcesOptions) error {
	if strings.TrimSpace(o.projectID) == "" {
		return fmt.Errorf("smartling download sources: --project-id is required")
	}
	if strings.TrimSpace(o.sourceLocale) == "" {
		return fmt.Errorf("smartling download sources: --source-locale is required")
	}
	if strings.TrimSpace(o.fileURI) == "" {
		return fmt.Errorf("smartling download sources: --file-uri is required")
	}

	outputPath := strings.TrimSpace(o.output)
	if o.dryRun {
		destination := outputPath
		if destination == "" {
			destination = "-"
		}
		_, err := fmt.Fprintf(cmd.OutOrStdout(), "dry-run action=smartling-download-sources project_id=%s source_locale=%s file_uri=%s output=%s\n", strings.TrimSpace(o.projectID), strings.TrimSpace(o.sourceLocale), strings.TrimSpace(o.fileURI), destination)
		return err
	}
	if err := validateSmartlingDownloadSourcesOutputPath(outputPath, o.force); err != nil {
		return err
	}

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
		return fmt.Errorf("smartling download sources: credentials are required (via flags or SMARTLING_USER_IDENTIFIER/SMARTLING_USER_SECRET)")
	}

	client, err := newSmartlingSourceDownloader(cfg)
	if err != nil {
		return err
	}
	result, err := client.DownloadSourceFile(backgroundContext(), smartling.SourceDownloadInput{
		ProjectID:    strings.TrimSpace(o.projectID),
		FileURI:      strings.TrimSpace(o.fileURI),
		SourceLocale: strings.TrimSpace(o.sourceLocale),
	})
	if err != nil {
		return fmt.Errorf("smartling download sources: %w", err)
	}

	if outputPath == "" || outputPath == "-" {
		_, err := cmd.OutOrStdout().Write(result.Content)
		return err
	}
	if err := writeSmartlingDownloadedSource(outputPath, result.Content, o.force); err != nil {
		return err
	}
	_, err = fmt.Fprintf(cmd.OutOrStdout(), "downloaded file=%s bytes=%d source_locale=%s file_uri=%s\n", outputPath, len(result.Content), result.SourceLocale, result.FileURI)
	return err
}

func executeSmartlingDownloadTranslations(cmd *cobra.Command, o smartlingDownloadTranslationsOptions) error {
	if strings.TrimSpace(o.projectID) == "" {
		return fmt.Errorf("smartling download translations: --project-id is required")
	}
	locales := normalizeSmartlingLocales(o.targetLocales)
	if len(locales) == 0 {
		return fmt.Errorf("smartling download translations: at least one --target-locale is required")
	}
	if strings.TrimSpace(o.fileURI) == "" {
		return fmt.Errorf("smartling download translations: --file-uri is required")
	}

	outputPath := strings.TrimSpace(o.output)
	outputs, err := smartlingTranslationOutputPaths(outputPath, locales)
	if err != nil {
		return err
	}
	if o.dryRun {
		destination := outputPath
		if destination == "" {
			destination = "-"
		}
		_, err := fmt.Fprintf(cmd.OutOrStdout(), "dry-run action=smartling-download-translations project_id=%s target_locales=%s file_uri=%s output=%s\n", strings.TrimSpace(o.projectID), strings.Join(locales, ","), strings.TrimSpace(o.fileURI), destination)
		return err
	}
	for _, output := range outputs {
		if err := validateSmartlingDownloadTranslationsOutputPath(output, o.force); err != nil {
			return err
		}
	}

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
		return fmt.Errorf("smartling download translations: credentials are required (via flags or SMARTLING_USER_IDENTIFIER/SMARTLING_USER_SECRET)")
	}

	client, err := newSmartlingTranslationDownloader(cfg)
	if err != nil {
		return err
	}

	writtenOutputs := make([]string, 0, len(outputs))
	for idx, locale := range locales {
		result, err := client.DownloadTranslationFile(backgroundContext(), smartling.TranslationDownloadInput{
			ProjectID: strings.TrimSpace(o.projectID),
			FileURI:   strings.TrimSpace(o.fileURI),
			LocaleID:  locale,
		})
		if err != nil {
			removeSmartlingDownloadedTranslationOutputs(writtenOutputs)
			return fmt.Errorf("smartling download translations: %w", err)
		}

		output := outputs[idx]
		if output == "" || output == "-" {
			_, err := cmd.OutOrStdout().Write(result.Content)
			return err
		}
		outputExisted := false
		if _, err := os.Stat(output); err == nil {
			outputExisted = true
		}
		if err := writeSmartlingDownloadedTranslation(output, result.Content, o.force); err != nil {
			removeSmartlingDownloadedTranslationOutputs(writtenOutputs)
			return err
		}
		if !outputExisted {
			writtenOutputs = append(writtenOutputs, output)
		}
		if _, err := fmt.Fprintf(cmd.OutOrStdout(), "downloaded file=%s bytes=%d locale=%s file_uri=%s\n", output, len(result.Content), result.LocaleID, strings.TrimSpace(o.fileURI)); err != nil {
			removeSmartlingDownloadedTranslationOutputs(writtenOutputs)
			return err
		}
	}
	return nil
}

func normalizeSmartlingLocales(values []string) []string {
	return locales.NormalizeList(values)
}

func smartlingTranslationOutputPaths(output string, locales []string) ([]string, error) {
	if len(locales) == 0 {
		return nil, nil
	}
	if len(locales) == 1 {
		if strings.Contains(output, "%locale%") {
			return []string{strings.ReplaceAll(output, "%locale%", locales[0])}, nil
		}
		return []string{output}, nil
	}
	if output == "" || output == "-" {
		return nil, fmt.Errorf("smartling download translations: --output with %%locale%% is required when downloading multiple target locales")
	}
	if !strings.Contains(output, "%locale%") {
		return nil, fmt.Errorf("smartling download translations: --output must include %%locale%% when downloading multiple target locales")
	}
	paths := make([]string, 0, len(locales))
	for _, locale := range locales {
		paths = append(paths, strings.ReplaceAll(output, "%locale%", locale))
	}
	return paths, nil
}

func validateSmartlingDownloadTranslationsOutputPath(path string, force bool) error {
	if path == "" || path == "-" {
		return nil
	}
	if info, err := os.Stat(path); err == nil {
		if info.IsDir() {
			return fmt.Errorf("smartling download translations: output file %q is a directory", path)
		}
		if !force {
			return fmt.Errorf("smartling download translations: output file %q already exists; use --force to overwrite", path)
		}
	} else if err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("smartling download translations: stat output file %q: %w", path, err)
	}
	return nil
}

func validateSmartlingDownloadSourcesOutputPath(path string, force bool) error {
	if path == "" || path == "-" {
		return nil
	}
	if info, err := os.Stat(path); err == nil {
		if info.IsDir() {
			return fmt.Errorf("smartling download sources: output file %q is a directory", path)
		}
		if !force {
			return fmt.Errorf("smartling download sources: output file %q already exists; use --force to overwrite", path)
		}
	} else if err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("smartling download sources: stat output file %q: %w", path, err)
	}
	return nil
}

func writeSmartlingDownloadedTranslation(path string, content []byte, force bool) error {
	if err := validateSmartlingDownloadTranslationsOutputPath(path, force); err != nil {
		return err
	}
	if path == "" || path == "-" {
		return fmt.Errorf("smartling download translations: output file path is required")
	}
	if dir := filepath.Dir(path); dir != "." {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return fmt.Errorf("smartling download translations: mkdir output directory: %w", err)
		}
	}
	if force {
		return writeSmartlingDownloadedFileAtomic("smartling download translations", path, content, 0o644)
	}
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		if os.IsExist(err) {
			return fmt.Errorf("smartling download translations: output file %q already exists; use --force to overwrite", path)
		}
		return fmt.Errorf("smartling download translations: open output file %q: %w", path, err)
	}
	if _, err := file.Write(content); err != nil {
		_ = file.Close()
		_ = os.Remove(path)
		return fmt.Errorf("smartling download translations: write output file %q: %w", path, err)
	}
	if err := file.Close(); err != nil {
		_ = os.Remove(path)
		return fmt.Errorf("smartling download translations: close output file %q: %w", path, err)
	}
	return nil
}

func writeSmartlingDownloadedSource(path string, content []byte, force bool) error {
	if err := validateSmartlingDownloadSourcesOutputPath(path, force); err != nil {
		return err
	}
	if path == "" || path == "-" {
		return fmt.Errorf("smartling download sources: output file path is required")
	}
	if dir := filepath.Dir(path); dir != "." {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return fmt.Errorf("smartling download sources: mkdir output directory: %w", err)
		}
	}
	if force {
		return writeSmartlingDownloadedFileAtomic("smartling download sources", path, content, 0o644)
	}
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		if os.IsExist(err) {
			return fmt.Errorf("smartling download sources: output file %q already exists; use --force to overwrite", path)
		}
		return fmt.Errorf("smartling download sources: open output file %q: %w", path, err)
	}
	if _, err := file.Write(content); err != nil {
		_ = file.Close()
		_ = os.Remove(path)
		return fmt.Errorf("smartling download sources: write output file %q: %w", path, err)
	}
	if err := file.Close(); err != nil {
		_ = os.Remove(path)
		return fmt.Errorf("smartling download sources: close output file %q: %w", path, err)
	}
	return nil
}

func writeSmartlingDownloadedFileAtomic(action, path string, content []byte, perm os.FileMode) error {
	dir := filepath.Dir(path)
	file, err := os.CreateTemp(dir, "."+filepath.Base(path)+".tmp-*")
	if err != nil {
		return fmt.Errorf("%s: create temp output file %q: %w", action, path, err)
	}
	tempPath := file.Name()
	renamed := false
	defer func() {
		if !renamed {
			_ = os.Remove(tempPath)
		}
	}()
	if _, err := file.Write(content); err != nil {
		_ = file.Close()
		return fmt.Errorf("%s: write temp output file %q: %w", action, path, err)
	}
	if err := file.Chmod(perm); err != nil {
		_ = file.Close()
		return fmt.Errorf("%s: chmod temp output file %q: %w", action, path, err)
	}
	if err := file.Sync(); err != nil {
		_ = file.Close()
		return fmt.Errorf("%s: sync temp output file %q: %w", action, path, err)
	}
	if err := file.Close(); err != nil {
		return fmt.Errorf("%s: close temp output file %q: %w", action, path, err)
	}
	if err := os.Rename(tempPath, path); err != nil {
		return fmt.Errorf("%s: replace output file %q: %w", action, path, err)
	}
	renamed = true
	return nil
}

func removeSmartlingDownloadedTranslationOutputs(paths []string) {
	for i := len(paths) - 1; i >= 0; i-- {
		_ = os.Remove(paths[i])
	}
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

	var client *smartling.HTTPClient
	if !o.dryRun {
		if cfg.UserIdentifier == "" || cfg.UserSecret == "" {
			return fmt.Errorf("smartling upload sources: credentials are required (via flags or SMARTLING_USER_IDENTIFIER/SMARTLING_USER_SECRET)")
		}
		var err error
		client, err = smartling.NewHTTPClient(cfg)
		if err != nil {
			return err
		}
	}

	processed := 0
	for _, path := range o.filePaths {
		fileUri := o.fileURI
		if fileUri == "" {
			fileUri = filepath.ToSlash(path)
		}

		fileType := o.fileType
		if fileType == "" {
			fileType = smartling.FileTypeForExtension(filepath.Ext(path))
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
