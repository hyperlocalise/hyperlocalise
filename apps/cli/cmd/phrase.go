package cmd

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/locales"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/storage/phrase"
	"github.com/spf13/cobra"
)

type phraseUploadSourcesOptions struct {
	configPath         string
	projectID          string
	sourceLocale       string
	files              []string
	format             string
	branch             string
	tags               []string
	tokenEnv           string
	apiBaseURL         string
	updateTranslations bool
	skipUploadTags     bool
	dryRun             bool
}

type phraseDownloadSourcesOptions struct {
	projectID    string
	sourceLocale string
	format       string
	output       string
	branch       string
	tags         []string
	tokenEnv     string
	apiBaseURL   string
	force        bool
	dryRun       bool
}

type phraseDownloadTranslationsOptions struct {
	configPath    string
	projectID     string
	targetLocales []string
	format        string
	output        string
	branch        string
	tags          []string
	tokenEnv      string
	apiBaseURL    string
	force         bool
	dryRun        bool
}

type phraseTranslationMemoryDownloadOptions struct {
	translationMemoryID string
	sourceLanguage      string
	targetLanguages     []string
	format              string
	output              string
	tokenEnv            string
	apiBaseURL          string
	force               bool
	dryRun              bool
}

type phraseTranslationMemoryWriter interface {
	WriteTranslationMemoryCSV(context.Context, phrase.TranslationMemoryDownloadInput, io.Writer) (phrase.TranslationMemoryDownloadResult, error)
	WriteTranslationMemoryTMX(context.Context, phrase.TranslationMemoryDownloadInput, io.Writer) (phrase.TranslationMemoryDownloadResult, error)
}

var newPhraseTranslationMemoryWriter = func(apiBaseURL string) (phraseTranslationMemoryWriter, error) {
	return phrase.NewTMSHTTPClientWithBaseURL(phrase.Config{}, apiBaseURL, &http.Client{Timeout: 30 * time.Second})
}

type phraseGlossaryDownloadOptions struct {
	accountID  string
	glossaryID string
	languages  []string
	output     string
	tokenEnv   string
	apiBaseURL string
	force      bool
	dryRun     bool
}

func newPhraseCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "phrase",
		Short: "Phrase file workflow commands",
	}
	cmd.AddCommand(newPhraseConfigCmd())
	cmd.AddCommand(newPhraseUploadCmd())
	cmd.AddCommand(newPhraseDownloadCmd())
	cmd.AddCommand(newPhraseGlossaryCmd())
	cmd.AddCommand(newPhraseTranslationMemoryCmd())
	return cmd
}

func newPhraseConfigCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "config",
		Short: "validate Phrase CLI config",
	}
	cmd.AddCommand(newPhraseConfigValidateCmd())
	return cmd
}

func newPhraseConfigValidateCmd() *cobra.Command {
	var configPath string
	cmd := &cobra.Command{
		Use:          "validate",
		Short:        "validate .phrase.yml",
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			cfg, resolvedPath, err := phrase.LoadCLIConfig(configPath)
			if err != nil {
				return err
			}
			_, err = fmt.Fprintf(cmd.OutOrStdout(), "config=%s push_sources=%d pull_targets=%d file_format=%s host=%s\n", resolvedPath, len(cfg.PushSources), len(cfg.PullTargets), cfg.FileFormat, cfg.APIBaseURL)
			return err
		},
	}
	cmd.Flags().StringVar(&configPath, "config", "", "path to .phrase.yml")
	return cmd
}

func newPhraseUploadCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "upload",
		Short: "upload files to Phrase",
	}
	cmd.AddCommand(newPhraseUploadSourcesCmd())
	return cmd
}

func newPhraseDownloadCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "download",
		Short: "download files from Phrase",
	}
	cmd.AddCommand(newPhraseDownloadSourcesCmd())
	cmd.AddCommand(newPhraseDownloadTranslationsCmd())
	return cmd
}

func newPhraseTranslationMemoryCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:     "tm",
		Aliases: []string{"translation-memory"},
		Short:   "Phrase translation memory commands",
	}
	cmd.AddCommand(newPhraseTranslationMemoryDownloadCmd())
	return cmd
}

func newPhraseTranslationMemoryDownloadCmd() *cobra.Command {
	o := phraseTranslationMemoryDownloadOptions{tokenEnv: "PHRASE_API_TOKEN"}
	cmd := &cobra.Command{
		Use:          "download",
		Short:        "download Phrase translation memory entries",
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return executePhraseTranslationMemoryDownload(cmd, o)
		},
	}
	cmd.Flags().StringVar(&o.translationMemoryID, "tm-id", "", "Phrase translation memory UID")
	cmd.Flags().StringVar(&o.sourceLanguage, "source-language", "", "source language code to export")
	cmd.Flags().StringSliceVarP(&o.targetLanguages, "target-language", "l", nil, "target language code(s) to export")
	cmd.Flags().StringVar(&o.format, "format", "csv", "download format: csv or tmx")
	cmd.Flags().StringVarP(&o.output, "output", "o", "", "output file path; omit or use - for stdout")
	cmd.Flags().StringVar(&o.tokenEnv, "token-env", o.tokenEnv, "environment variable containing the Phrase API token")
	cmd.Flags().StringVar(&o.apiBaseURL, "api-base-url", "", "Phrase TMS API base URL")
	cmd.Flags().BoolVar(&o.force, "force", false, "overwrite an existing output file")
	cmd.Flags().BoolVar(&o.dryRun, "dry-run", false, "preview command without downloading content")
	_ = cmd.MarkFlagRequired("tm-id")
	_ = cmd.MarkFlagRequired("source-language")
	_ = cmd.MarkFlagRequired("target-language")
	return cmd
}

func newPhraseGlossaryCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "glossary",
		Short: "Phrase glossary commands",
	}
	cmd.AddCommand(newPhraseGlossaryDownloadCmd())
	return cmd
}

func newPhraseGlossaryDownloadCmd() *cobra.Command {
	o := phraseGlossaryDownloadOptions{tokenEnv: "PHRASE_API_TOKEN"}
	cmd := &cobra.Command{
		Use:          "download",
		Short:        "download Phrase glossary terms as CSV",
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return executePhraseGlossaryDownload(cmd, o)
		},
	}
	cmd.Flags().StringVar(&o.accountID, "account-id", "", "Phrase account ID")
	cmd.Flags().StringVar(&o.glossaryID, "glossary-id", "", "Phrase glossary ID")
	cmd.Flags().StringSliceVarP(&o.languages, "language", "l", nil, "translation locale(s) to include")
	cmd.Flags().StringVarP(&o.output, "output", "o", "", "output file path; omit or use - for stdout")
	cmd.Flags().StringVar(&o.tokenEnv, "token-env", o.tokenEnv, "environment variable containing the Phrase API token")
	cmd.Flags().StringVar(&o.apiBaseURL, "api-base-url", "", "Phrase API base URL")
	cmd.Flags().BoolVar(&o.force, "force", false, "overwrite an existing output file")
	cmd.Flags().BoolVar(&o.dryRun, "dry-run", false, "preview command without downloading content")
	return cmd
}

func newPhraseDownloadSourcesCmd() *cobra.Command {
	o := phraseDownloadSourcesOptions{tokenEnv: "PHRASE_API_TOKEN"}
	cmd := &cobra.Command{
		Use:          "sources",
		Short:        "download source content from Phrase",
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return executePhraseDownloadSources(cmd, o)
		},
	}
	cmd.Flags().StringVar(&o.projectID, "project-id", "", "Phrase project ID")
	cmd.Flags().StringVar(&o.sourceLocale, "source-locale", "", "Phrase source locale ID or name")
	cmd.Flags().StringVar(&o.format, "format", "", "Phrase file format, for example json, yml, or strings")
	cmd.Flags().StringVarP(&o.output, "output", "o", "", "output file path; omit or use - for stdout")
	cmd.Flags().StringVar(&o.branch, "branch", "", "Phrase branch name")
	cmd.Flags().StringSliceVar(&o.tags, "tag", nil, "tag(s) to limit downloaded keys")
	cmd.Flags().StringVar(&o.tokenEnv, "token-env", o.tokenEnv, "environment variable containing the Phrase API token")
	cmd.Flags().StringVar(&o.apiBaseURL, "api-base-url", "", "Phrase API base URL")
	cmd.Flags().BoolVar(&o.force, "force", false, "overwrite an existing output file")
	cmd.Flags().BoolVar(&o.dryRun, "dry-run", false, "preview command without downloading content")
	return cmd
}

func newPhraseDownloadTranslationsCmd() *cobra.Command {
	o := phraseDownloadTranslationsOptions{tokenEnv: "PHRASE_API_TOKEN"}
	cmd := &cobra.Command{
		Use:          "translations",
		Short:        "download translated content from Phrase",
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return executePhraseDownloadTranslations(cmd, o)
		},
	}
	cmd.Flags().StringVar(&o.configPath, "config", "", "path to .phrase.yml")
	cmd.Flags().StringVar(&o.projectID, "project-id", "", "Phrase project ID")
	cmd.Flags().StringSliceVarP(&o.targetLocales, "target-locale", "l", nil, "Phrase target locale ID(s) or name(s)")
	cmd.Flags().StringVar(&o.format, "format", "", "Phrase file format, for example json, yml, or strings")
	cmd.Flags().StringVarP(&o.output, "output", "o", "", "output file path; omit or use - for stdout when downloading one locale; use %locale% for multiple locales")
	cmd.Flags().StringVar(&o.branch, "branch", "", "Phrase branch name")
	cmd.Flags().StringSliceVar(&o.tags, "tag", nil, "tag(s) to limit downloaded keys")
	cmd.Flags().StringVar(&o.tokenEnv, "token-env", o.tokenEnv, "environment variable containing the Phrase API token")
	cmd.Flags().StringVar(&o.apiBaseURL, "api-base-url", "", "Phrase API base URL")
	cmd.Flags().BoolVar(&o.force, "force", false, "overwrite an existing output file")
	cmd.Flags().BoolVar(&o.dryRun, "dry-run", false, "preview command without downloading content")
	return cmd
}

func newPhraseUploadSourcesCmd() *cobra.Command {
	o := phraseUploadSourcesOptions{tokenEnv: "PHRASE_API_TOKEN"}
	cmd := &cobra.Command{
		Use:          "sources",
		Short:        "upload source files to Phrase",
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return executePhraseUploadSources(cmd, o)
		},
	}
	cmd.Flags().StringVar(&o.configPath, "config", "", "path to .phrase.yml")
	cmd.Flags().StringVar(&o.projectID, "project-id", "", "Phrase project ID")
	cmd.Flags().StringVar(&o.sourceLocale, "source-locale", "", "Phrase source locale ID or name")
	cmd.Flags().StringArrayVarP(&o.files, "file", "f", nil, "source file path(s) to upload")
	cmd.Flags().StringVar(&o.format, "format", "", "Phrase file format, for example json, yml, or strings")
	cmd.Flags().StringVar(&o.branch, "branch", "", "Phrase branch name")
	cmd.Flags().StringSliceVar(&o.tags, "tag", nil, "tag(s) to assign to uploaded keys")
	cmd.Flags().StringVar(&o.tokenEnv, "token-env", o.tokenEnv, "environment variable containing the Phrase API token")
	cmd.Flags().StringVar(&o.apiBaseURL, "api-base-url", "", "Phrase API base URL")
	cmd.Flags().BoolVar(&o.updateTranslations, "update-translations", false, "update existing translations from the uploaded source file")
	cmd.Flags().BoolVar(&o.skipUploadTags, "skip-upload-tags", false, "do not create upload tags in Phrase")
	cmd.Flags().BoolVar(&o.dryRun, "dry-run", false, "preview command without uploading files")
	return cmd
}

func executePhraseTranslationMemoryDownload(cmd *cobra.Command, o phraseTranslationMemoryDownloadOptions) error {
	outputFormat, err := normalizeTranslationMemoryDownloadFormat(o.format)
	if err != nil {
		return fmt.Errorf("phrase translation memory download: %w", err)
	}

	if strings.TrimSpace(o.translationMemoryID) == "" {
		return fmt.Errorf("phrase translation memory download: --tm-id is required")
	}
	if strings.TrimSpace(o.sourceLanguage) == "" {
		return fmt.Errorf("phrase translation memory download: --source-language is required")
	}
	targets := normalizePhraseLocales(o.targetLanguages)
	if len(targets) == 0 {
		return fmt.Errorf("phrase translation memory download: at least one --target-language is required")
	}
	outputPath := strings.TrimSpace(o.output)
	if o.dryRun {
		destination := outputPath
		if destination == "" {
			destination = "-"
		}
		_, err := fmt.Fprintf(cmd.OutOrStdout(), "dry-run action=phrase-translation-memory-download tm_id=%s source_language=%s target_languages=%s output=%s\n", strings.TrimSpace(o.translationMemoryID), strings.TrimSpace(o.sourceLanguage), strings.Join(targets, ","), destination)
		return err
	}
	if err := validatePhraseTranslationMemoryOutputPath(outputPath, o.force); err != nil {
		return err
	}
	token, err := phraseAPIToken("phrase translation memory download", o.tokenEnv)
	if err != nil {
		return err
	}
	client, err := newPhraseTranslationMemoryWriter(o.apiBaseURL)
	if err != nil {
		return err
	}

	out := cmd.OutOrStdout()
	tempPath := ""
	var file *os.File
	if outputPath != "" && outputPath != "-" {
		dir := filepath.Dir(outputPath)
		if dir != "." {
			if err := os.MkdirAll(dir, 0o755); err != nil {
				return fmt.Errorf("phrase translation memory download: mkdir output directory: %w", err)
			}
		}
		file, err = os.CreateTemp(dir, "."+filepath.Base(outputPath)+".tmp-*")
		if err != nil {
			return fmt.Errorf("phrase translation memory download: create temp output file %q: %w", outputPath, err)
		}
		if err := file.Chmod(0o644); err != nil {
			_ = file.Close()
			_ = os.Remove(file.Name())
			return fmt.Errorf("phrase translation memory download: chmod temp output file %q: %w", outputPath, err)
		}
		tempPath = file.Name()
		out = file
	}

	input := phrase.TranslationMemoryDownloadInput{
		TranslationMemoryID: strings.TrimSpace(o.translationMemoryID),
		APIToken:            token,
		SourceLanguage:      strings.TrimSpace(o.sourceLanguage),
		TargetLanguages:     targets,
	}
	result, writeErr := writePhraseTranslationMemory(backgroundContext(), client, input, outputFormat, out)
	if file != nil {
		if syncErr := file.Sync(); syncErr != nil && writeErr == nil {
			writeErr = fmt.Errorf("phrase translation memory download: sync output file %q: %w", outputPath, syncErr)
		}
		if closeErr := file.Close(); closeErr != nil && writeErr == nil {
			writeErr = fmt.Errorf("phrase translation memory download: close output file %q: %w", outputPath, closeErr)
		}
	}
	if writeErr != nil {
		if tempPath != "" {
			if removeErr := os.Remove(tempPath); removeErr != nil && !os.IsNotExist(removeErr) {
				return fmt.Errorf("%w; also failed to remove partial output: %v", writeErr, removeErr)
			}
		}
		return writeErr
	}
	if outputPath != "" && outputPath != "-" {
		if err := os.Rename(tempPath, outputPath); err != nil {
			_ = os.Remove(tempPath)
			return fmt.Errorf("phrase translation memory download: replace output file %q: %w", outputPath, err)
		}
		_, err = writeTranslationMemoryDownloadSummary(cmd.OutOrStdout(), outputPath, outputFormat, result.Rows, result.Segments)
		return err
	}
	return nil
}

func executePhraseGlossaryDownload(cmd *cobra.Command, o phraseGlossaryDownloadOptions) error {
	if strings.TrimSpace(o.accountID) == "" {
		return fmt.Errorf("phrase glossary download: --account-id is required")
	}
	if strings.TrimSpace(o.glossaryID) == "" {
		return fmt.Errorf("phrase glossary download: --glossary-id is required")
	}
	outputPath := strings.TrimSpace(o.output)
	if o.dryRun {
		destination := outputPath
		if destination == "" {
			destination = "-"
		}
		_, err := fmt.Fprintf(cmd.OutOrStdout(), "dry-run action=phrase-glossary-download account_id=%s glossary_id=%s languages=%s output=%s\n", strings.TrimSpace(o.accountID), strings.TrimSpace(o.glossaryID), strings.Join(normalizePhraseLocales(o.languages), ","), destination)
		return err
	}
	if err := validatePhraseGlossaryOutputPath(outputPath, o.force); err != nil {
		return err
	}
	token, err := phraseAPIToken("phrase glossary download", o.tokenEnv)
	if err != nil {
		return err
	}
	client, err := phrase.NewHTTPClientWithBaseURL(phrase.Config{}, o.apiBaseURL, &http.Client{Timeout: 30 * time.Second})
	if err != nil {
		return err
	}

	out := cmd.OutOrStdout()
	tempPath := ""
	var file *os.File
	if outputPath != "" && outputPath != "-" {
		dir := filepath.Dir(outputPath)
		if dir != "." {
			if err := os.MkdirAll(dir, 0o755); err != nil {
				return fmt.Errorf("phrase glossary download: mkdir output directory: %w", err)
			}
		}
		file, err = os.CreateTemp(dir, "."+filepath.Base(outputPath)+".tmp-*")
		if err != nil {
			return fmt.Errorf("phrase glossary download: create temp output file %q: %w", outputPath, err)
		}
		if err := file.Chmod(0o644); err != nil {
			_ = file.Close()
			_ = os.Remove(file.Name())
			return fmt.Errorf("phrase glossary download: chmod temp output file %q: %w", outputPath, err)
		}
		tempPath = file.Name()
		out = file
	}

	result, writeErr := client.WriteGlossaryCSV(backgroundContext(), phrase.GlossaryDownloadInput{
		AccountID:  strings.TrimSpace(o.accountID),
		GlossaryID: strings.TrimSpace(o.glossaryID),
		APIToken:   token,
		Locales:    normalizePhraseLocales(o.languages),
	}, out)
	if file != nil {
		if syncErr := file.Sync(); syncErr != nil && writeErr == nil {
			writeErr = fmt.Errorf("phrase glossary download: sync output file %q: %w", outputPath, syncErr)
		}
		if closeErr := file.Close(); closeErr != nil && writeErr == nil {
			writeErr = fmt.Errorf("phrase glossary download: close output file %q: %w", outputPath, closeErr)
		}
	}
	if writeErr != nil {
		if tempPath != "" {
			if removeErr := os.Remove(tempPath); removeErr != nil && !os.IsNotExist(removeErr) {
				return fmt.Errorf("%w; also failed to remove partial output: %v", writeErr, removeErr)
			}
		}
		return writeErr
	}
	if outputPath != "" && outputPath != "-" {
		if err := os.Rename(tempPath, outputPath); err != nil {
			_ = os.Remove(tempPath)
			return fmt.Errorf("phrase glossary download: replace output file %q: %w", outputPath, err)
		}
		_, err = fmt.Fprintf(cmd.OutOrStdout(), "wrote %s terms=%d rows=%d\n", outputPath, result.Terms, result.Rows)
		return err
	}
	return nil
}

func executePhraseUploadSources(cmd *cobra.Command, o phraseUploadSourcesOptions) error {
	if shouldUsePhraseCLIConfig(o.configPath, phraseUploadSourcesHasManualFileConfig(o)) {
		return executePhraseUploadSourcesFromConfig(cmd, o)
	}
	if strings.TrimSpace(o.projectID) == "" {
		return fmt.Errorf("phrase upload sources: --project-id is required")
	}
	if strings.TrimSpace(o.sourceLocale) == "" {
		return fmt.Errorf("phrase upload sources: --source-locale is required")
	}
	if strings.TrimSpace(o.format) == "" {
		return fmt.Errorf("phrase upload sources: --format is required")
	}
	files, err := validatePhraseSourceFiles(o.files)
	if err != nil {
		return err
	}

	if o.dryRun {
		_, err := fmt.Fprintf(cmd.OutOrStdout(), "dry-run action=phrase-upload-sources project_id=%s source_locale=%s format=%s files=%d\n", strings.TrimSpace(o.projectID), strings.TrimSpace(o.sourceLocale), strings.TrimSpace(o.format), len(files))
		return err
	}

	token, err := phraseAPIToken("phrase upload sources", o.tokenEnv)
	if err != nil {
		return err
	}
	client, err := phrase.NewHTTPClientWithBaseURL(phrase.Config{}, o.apiBaseURL, &http.Client{Timeout: 30 * time.Second})
	if err != nil {
		return err
	}

	processed := 0
	for _, file := range files {
		result, err := client.UploadSourceFile(backgroundContext(), phrase.SourceUploadInput{
			ProjectID:          strings.TrimSpace(o.projectID),
			APIToken:           token,
			LocaleID:           strings.TrimSpace(o.sourceLocale),
			FilePath:           file,
			FileFormat:         strings.TrimSpace(o.format),
			Branch:             strings.TrimSpace(o.branch),
			Tags:               o.tags,
			UpdateTranslations: o.updateTranslations,
			SkipUploadTags:     o.skipUploadTags,
		})
		if err != nil {
			return fmt.Errorf("phrase upload sources: %w", err)
		}
		processed++
		if _, err := fmt.Fprintf(cmd.OutOrStdout(), "uploaded file=%s upload_id=%s state=%s keys_created=%d keys_updated=%d translations_created=%d translations_updated=%d skipped=%d\n", file, result.ID, result.State, result.Summary.TranslationKeysCreated, result.Summary.TranslationKeysUpdated, result.Summary.TranslationsCreated, result.Summary.TranslationsUpdated, result.Summary.TranslationKeysIgnored); err != nil {
			return err
		}
	}
	_, err = fmt.Fprintf(cmd.OutOrStdout(), "action=phrase-upload-sources processed=%d skipped=0 warnings=0\n", processed)
	return err
}

func executePhraseDownloadTranslations(cmd *cobra.Command, o phraseDownloadTranslationsOptions) error {
	if shouldUsePhraseCLIConfig(o.configPath, phraseDownloadTranslationsHasManualFileConfig(o)) {
		return executePhraseDownloadTranslationsFromConfig(cmd, o)
	}
	if strings.TrimSpace(o.projectID) == "" {
		return fmt.Errorf("phrase download translations: --project-id is required")
	}
	locales := normalizePhraseLocales(o.targetLocales)
	if len(locales) == 0 {
		return fmt.Errorf("phrase download translations: at least one --target-locale is required")
	}
	if strings.TrimSpace(o.format) == "" {
		return fmt.Errorf("phrase download translations: --format is required")
	}

	outputPath := strings.TrimSpace(o.output)
	outputs, err := phraseTranslationOutputPaths(outputPath, locales)
	if err != nil {
		return err
	}
	if o.dryRun {
		destination := outputPath
		if destination == "" {
			destination = "-"
		}
		_, err := fmt.Fprintf(cmd.OutOrStdout(), "dry-run action=phrase-download-translations project_id=%s target_locales=%s format=%s output=%s\n", strings.TrimSpace(o.projectID), strings.Join(locales, ","), strings.TrimSpace(o.format), destination)
		return err
	}
	for _, output := range outputs {
		if err := validatePhraseDownloadTranslationsOutputPath(output, o.force); err != nil {
			return err
		}
	}

	token, err := phraseAPIToken("phrase download translations", o.tokenEnv)
	if err != nil {
		return err
	}

	client, err := phrase.NewHTTPClientWithBaseURL(phrase.Config{}, o.apiBaseURL, &http.Client{Timeout: 30 * time.Second})
	if err != nil {
		return err
	}
	writtenOutputs := make([]string, 0, len(outputs))
	for idx, locale := range locales {
		result, err := client.DownloadTranslationFile(backgroundContext(), phrase.TranslationDownloadInput{
			ProjectID:  strings.TrimSpace(o.projectID),
			APIToken:   token,
			LocaleID:   locale,
			FileFormat: strings.TrimSpace(o.format),
			Branch:     strings.TrimSpace(o.branch),
			Tags:       o.tags,
		})
		if err != nil {
			removePhraseDownloadedTranslationOutputs(writtenOutputs)
			return fmt.Errorf("phrase download translations: %w", err)
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
		if err := writePhraseDownloadedTranslation(output, result.Content, o.force); err != nil {
			removePhraseDownloadedTranslationOutputs(writtenOutputs)
			return err
		}
		if !outputExisted {
			writtenOutputs = append(writtenOutputs, output)
		}
		if _, err := fmt.Fprintf(cmd.OutOrStdout(), "downloaded file=%s bytes=%d locale=%s format=%s\n", output, len(result.Content), result.LocaleID, result.Format); err != nil {
			removePhraseDownloadedTranslationOutputs(writtenOutputs)
			return err
		}
	}
	return nil
}

func executePhraseDownloadSources(cmd *cobra.Command, o phraseDownloadSourcesOptions) error {
	if strings.TrimSpace(o.projectID) == "" {
		return fmt.Errorf("phrase download sources: --project-id is required")
	}
	if strings.TrimSpace(o.sourceLocale) == "" {
		return fmt.Errorf("phrase download sources: --source-locale is required")
	}
	if strings.TrimSpace(o.format) == "" {
		return fmt.Errorf("phrase download sources: --format is required")
	}

	outputPath := strings.TrimSpace(o.output)
	if o.dryRun {
		destination := outputPath
		if destination == "" {
			destination = "-"
		}
		_, err := fmt.Fprintf(cmd.OutOrStdout(), "dry-run action=phrase-download-sources project_id=%s source_locale=%s format=%s output=%s\n", strings.TrimSpace(o.projectID), strings.TrimSpace(o.sourceLocale), strings.TrimSpace(o.format), destination)
		return err
	}
	if err := validatePhraseDownloadOutputPath(outputPath, o.force); err != nil {
		return err
	}

	token, err := phraseAPIToken("phrase download sources", o.tokenEnv)
	if err != nil {
		return err
	}

	client, err := phrase.NewHTTPClientWithBaseURL(phrase.Config{}, o.apiBaseURL, &http.Client{Timeout: 30 * time.Second})
	if err != nil {
		return err
	}
	result, err := client.DownloadSourceFile(backgroundContext(), phrase.SourceDownloadInput{
		ProjectID:  strings.TrimSpace(o.projectID),
		APIToken:   token,
		LocaleID:   strings.TrimSpace(o.sourceLocale),
		FileFormat: strings.TrimSpace(o.format),
		Branch:     strings.TrimSpace(o.branch),
		Tags:       o.tags,
	})
	if err != nil {
		return fmt.Errorf("phrase download sources: %w", err)
	}

	if outputPath == "" || outputPath == "-" {
		_, err := cmd.OutOrStdout().Write(result.Content)
		return err
	}
	if err := writePhraseDownloadedSource(outputPath, result.Content, o.force); err != nil {
		return err
	}
	_, err = fmt.Fprintf(cmd.OutOrStdout(), "downloaded file=%s bytes=%d locale=%s format=%s\n", outputPath, len(result.Content), result.LocaleID, result.Format)
	return err
}

type phraseUploadConfigTask struct {
	input phrase.SourceUploadInput
}

type phraseDownloadConfigTask struct {
	input  phrase.TranslationDownloadInput
	output string
}

type phraseLocaleResolver func(projectID, branch string) ([]phrase.LocaleRef, error)

func executePhraseUploadSourcesFromConfig(cmd *cobra.Command, o phraseUploadSourcesOptions) error {
	cfg, resolvedPath, err := phrase.LoadCLIConfig(o.configPath)
	if err != nil {
		return err
	}
	if len(cfg.PushSources) == 0 {
		return fmt.Errorf("phrase upload sources: config %s has no phrase.push.sources entries", resolvedPath)
	}

	var client *phrase.HTTPClient
	var token string
	if !o.dryRun {
		token, err = phraseConfigAPIToken(cmd, cfg, o.tokenEnv, "phrase upload sources")
		if err != nil {
			return err
		}
		client, err = phrase.NewHTTPClientWithBaseURL(phrase.Config{}, phraseConfigAPIBaseURL(cmd, cfg, o.apiBaseURL), &http.Client{Timeout: 30 * time.Second})
		if err != nil {
			return err
		}
	}

	localeCache := map[string][]phrase.LocaleRef{}
	resolveLocales := func(projectID, branch string) ([]phrase.LocaleRef, error) {
		if o.dryRun {
			return nil, fmt.Errorf("phrase upload sources: phrase.push.sources[].params.locale_id or --source-locale is required for dry-run when file uses locale placeholders")
		}
		key := strings.TrimSpace(projectID) + "\x00" + strings.TrimSpace(branch)
		if locales, ok := localeCache[key]; ok {
			return locales, nil
		}
		locales, err := client.ListLocales(backgroundContext(), phrase.LocaleListInput{
			ProjectID: strings.TrimSpace(projectID),
			APIToken:  token,
			Branch:    strings.TrimSpace(branch),
		})
		if err != nil {
			return nil, err
		}
		localeCache[key] = locales
		return locales, nil
	}

	tasks, err := phraseUploadTasksFromConfig(cmd, cfg, token, o, resolveLocales)
	if err != nil {
		return err
	}
	if o.dryRun {
		_, err := fmt.Fprintf(cmd.OutOrStdout(), "dry-run action=phrase-upload-sources config=%s sources=%d files=%d\n", resolvedPath, len(cfg.PushSources), len(tasks))
		return err
	}

	processed := 0
	for _, task := range tasks {
		result, err := client.UploadSourceFile(backgroundContext(), task.input)
		if err != nil {
			return fmt.Errorf("phrase upload sources: %w", err)
		}
		processed++
		if _, err := fmt.Fprintf(cmd.OutOrStdout(), "uploaded file=%s upload_id=%s state=%s keys_created=%d keys_updated=%d translations_created=%d translations_updated=%d skipped=%d\n", task.input.FilePath, result.ID, result.State, result.Summary.TranslationKeysCreated, result.Summary.TranslationKeysUpdated, result.Summary.TranslationsCreated, result.Summary.TranslationsUpdated, result.Summary.TranslationKeysIgnored); err != nil {
			return err
		}
	}
	_, err = fmt.Fprintf(cmd.OutOrStdout(), "action=phrase-upload-sources processed=%d skipped=0 warnings=0\n", processed)
	return err
}

func executePhraseDownloadTranslationsFromConfig(cmd *cobra.Command, o phraseDownloadTranslationsOptions) error {
	cfg, resolvedPath, err := phrase.LoadCLIConfig(o.configPath)
	if err != nil {
		return err
	}
	if len(cfg.PullTargets) == 0 {
		return fmt.Errorf("phrase download translations: config %s has no phrase.pull.targets entries", resolvedPath)
	}

	var client *phrase.HTTPClient
	var token string
	if !o.dryRun {
		token, err = phraseConfigAPIToken(cmd, cfg, o.tokenEnv, "phrase download translations")
		if err != nil {
			return err
		}
		client, err = phrase.NewHTTPClientWithBaseURL(phrase.Config{}, phraseConfigAPIBaseURL(cmd, cfg, o.apiBaseURL), &http.Client{Timeout: 30 * time.Second})
		if err != nil {
			return err
		}
	}

	localeCache := map[string][]phrase.LocaleRef{}
	resolveLocales := func(projectID, branch string) ([]phrase.LocaleRef, error) {
		if o.dryRun {
			return nil, fmt.Errorf("phrase download translations: phrase.pull.targets[].params.locale_id or --target-locale is required for dry-run when file uses locale placeholders")
		}
		key := strings.TrimSpace(projectID) + "\x00" + strings.TrimSpace(branch)
		if locales, ok := localeCache[key]; ok {
			return locales, nil
		}
		locales, err := client.ListLocales(backgroundContext(), phrase.LocaleListInput{
			ProjectID: strings.TrimSpace(projectID),
			APIToken:  token,
			Branch:    strings.TrimSpace(branch),
		})
		if err != nil {
			return nil, err
		}
		localeCache[key] = locales
		return locales, nil
	}

	tasks, err := phraseDownloadTasksFromConfig(cmd, cfg, token, o, resolveLocales)
	if err != nil {
		return err
	}
	if o.dryRun {
		_, err := fmt.Fprintf(cmd.OutOrStdout(), "dry-run action=phrase-download-translations config=%s targets=%d files=%d\n", resolvedPath, len(cfg.PullTargets), len(tasks))
		return err
	}
	if err := validatePhraseDownloadConfigOutputs(tasks, o.force); err != nil {
		return err
	}

	writtenOutputs := make([]string, 0, len(tasks))
	for _, task := range tasks {
		result, err := client.DownloadTranslationFile(backgroundContext(), task.input)
		if err != nil {
			removePhraseDownloadedTranslationOutputs(writtenOutputs)
			return fmt.Errorf("phrase download translations: %w", err)
		}
		if task.output == "" || task.output == "-" {
			_, err := cmd.OutOrStdout().Write(result.Content)
			return err
		}
		outputExisted := false
		if _, err := os.Stat(task.output); err == nil {
			outputExisted = true
		}
		if err := writePhraseDownloadedTranslation(task.output, result.Content, o.force); err != nil {
			removePhraseDownloadedTranslationOutputs(writtenOutputs)
			return err
		}
		if !outputExisted {
			writtenOutputs = append(writtenOutputs, task.output)
		}
		if _, err := fmt.Fprintf(cmd.OutOrStdout(), "downloaded file=%s bytes=%d locale=%s format=%s\n", task.output, len(result.Content), result.LocaleID, result.Format); err != nil {
			removePhraseDownloadedTranslationOutputs(writtenOutputs)
			return err
		}
	}
	return nil
}

func phraseUploadTasksFromConfig(cmd *cobra.Command, cfg phrase.CLIConfig, token string, o phraseUploadSourcesOptions, resolveLocales phraseLocaleResolver) ([]phraseUploadConfigTask, error) {
	tasks := make([]phraseUploadConfigTask, 0)
	for idx, source := range cfg.PushSources {
		projectID := source.ProjectID
		if cmd.Flags().Changed("project-id") {
			projectID = strings.TrimSpace(o.projectID)
		}
		fileFormat := source.FileFormat
		if cmd.Flags().Changed("format") {
			fileFormat = strings.TrimSpace(o.format)
		}
		branch := source.Branch
		if cmd.Flags().Changed("branch") {
			branch = strings.TrimSpace(o.branch)
		}
		tags := source.Tags
		if cmd.Flags().Changed("tag") {
			tags = phrase.SplitCLITags(o.tags)
		}
		locales, err := phraseUploadSourceLocales(cmd, source, o, projectID, branch, resolveLocales)
		if err != nil {
			return nil, fmt.Errorf("phrase config: push.sources[%d]: %w", idx, err)
		}
		tagVariants, err := phraseConfigTagVariants(source.File, tags)
		if err != nil {
			return nil, fmt.Errorf("phrase config: push.sources[%d]: %w", idx, err)
		}

		for _, locale := range locales {
			for _, tag := range tagVariants {
				expanded, err := phrase.ExpandCLIFilePath(source.File, locale, tag, cfg.LocaleMapping)
				if err != nil {
					return nil, fmt.Errorf("phrase config: push.sources[%d]: %w", idx, err)
				}
				sourcePaths, err := expandPhraseConfigSourcePaths(phrase.ResolveCLIFilePath(cfg.BasePath, expanded))
				if err != nil {
					return nil, fmt.Errorf("phrase config: push.sources[%d]: %w", idx, err)
				}
				for _, sourcePath := range sourcePaths {
					input := phrase.SourceUploadInput{
						ProjectID:             projectID,
						APIToken:              token,
						LocaleID:              locale,
						FilePath:              sourcePath,
						FileFormat:            fileFormat,
						Branch:                branch,
						Tags:                  tags,
						UpdateTranslations:    boolPtrValue(source.UpdateTranslations),
						SkipUploadTags:        boolPtrValue(source.SkipUploadTags),
						UpdateTranslationKeys: source.UpdateTranslationKeys,
						UpdateDescriptions:    source.UpdateDescriptions,
						SkipUnverification:    source.SkipUnverification,
						FileEncoding:          source.FileEncoding,
						LocaleMapping:         source.LocaleMapping,
						FormatOptions:         source.FormatOptions,
						Autotranslate:         source.Autotranslate,
						MarkReviewed:          source.MarkReviewed,
					}
					if cmd.Flags().Changed("update-translations") {
						input.UpdateTranslations = o.updateTranslations
					}
					if cmd.Flags().Changed("skip-upload-tags") {
						input.SkipUploadTags = o.skipUploadTags
					}
					tasks = append(tasks, phraseUploadConfigTask{input: input})
				}
			}
		}
	}
	return tasks, nil
}

func phraseDownloadTasksFromConfig(cmd *cobra.Command, cfg phrase.CLIConfig, token string, o phraseDownloadTranslationsOptions, resolveLocales phraseLocaleResolver) ([]phraseDownloadConfigTask, error) {
	tasks := make([]phraseDownloadConfigTask, 0)
	for idx, target := range cfg.PullTargets {
		projectID := target.ProjectID
		if cmd.Flags().Changed("project-id") {
			projectID = strings.TrimSpace(o.projectID)
		}
		fileFormat := target.FileFormat
		if cmd.Flags().Changed("format") {
			fileFormat = strings.TrimSpace(o.format)
		}
		branch := target.Branch
		if cmd.Flags().Changed("branch") {
			branch = strings.TrimSpace(o.branch)
		}
		tags := target.Tags
		if cmd.Flags().Changed("tag") {
			tags = phrase.SplitCLITags(o.tags)
		}
		locales, err := phrasePullTargetLocales(cmd, target, o, projectID, branch, resolveLocales)
		if err != nil {
			return nil, fmt.Errorf("phrase config: pull.targets[%d]: %w", idx, err)
		}
		tagVariants, err := phraseConfigTagVariants(target.File, tags)
		if err != nil {
			return nil, fmt.Errorf("phrase config: pull.targets[%d]: %w", idx, err)
		}
		outputPattern := target.File
		if cmd.Flags().Changed("output") {
			outputPattern = strings.TrimSpace(o.output)
		}

		for _, locale := range locales {
			for _, tag := range tagVariants {
				output, err := phraseConfigOutputPath(cfg, outputPattern, locale, tag)
				if err != nil {
					return nil, fmt.Errorf("phrase config: pull.targets[%d]: %w", idx, err)
				}
				tasks = append(tasks, phraseDownloadConfigTask{
					input: phrase.TranslationDownloadInput{
						ProjectID:  projectID,
						APIToken:   token,
						LocaleID:   locale,
						FileFormat: fileFormat,
						Branch:     branch,
						Tags:       tags,
						DownloadOptions: phrase.DownloadOptions{
							IncludeEmptyTranslations:      target.IncludeEmptyTranslations,
							ExcludeEmptyZeroForms:         target.ExcludeEmptyZeroForms,
							IncludeTranslatedKeys:         target.IncludeTranslatedKeys,
							KeepNotranslateTags:           target.KeepNotranslateTags,
							Encoding:                      target.Encoding,
							IncludeUnverifiedTranslations: target.IncludeUnverifiedTranslations,
							UseLastReviewedVersion:        target.UseLastReviewedVersion,
							FallbackLocaleID:              target.FallbackLocaleID,
							FormatOptions:                 target.FormatOptions,
							SourceLocaleID:                target.SourceLocaleID,
							TranslationKeyPrefix:          target.TranslationKeyPrefix,
							FilterByPrefix:                target.FilterByPrefix,
							UseLocaleFallback:             target.UseLocaleFallback,
							SkipUnverifiedTranslations:    target.SkipUnverifiedTranslations,
						},
					},
					output: output,
				})
			}
		}
	}
	if err := validatePhraseDownloadConfigStdout(tasks); err != nil {
		return nil, err
	}
	return tasks, nil
}

func shouldUsePhraseCLIConfig(configPath string, hasManualFileConfig bool) bool {
	if strings.TrimSpace(configPath) != "" {
		return true
	}
	if hasManualFileConfig {
		return false
	}
	_, err := phrase.ResolveCLIConfigPath("")
	return err == nil
}

func phraseUploadSourcesHasManualFileConfig(o phraseUploadSourcesOptions) bool {
	return strings.TrimSpace(o.projectID) != "" || strings.TrimSpace(o.format) != "" || len(o.files) > 0
}

func phraseDownloadTranslationsHasManualFileConfig(o phraseDownloadTranslationsOptions) bool {
	return strings.TrimSpace(o.projectID) != "" || strings.TrimSpace(o.format) != "" || strings.TrimSpace(o.output) != ""
}

func phraseConfigAPIToken(cmd *cobra.Command, cfg phrase.CLIConfig, tokenEnv, action string) (string, error) {
	if cmd.Flags().Changed("token-env") {
		return phraseAPIToken(action, tokenEnv)
	}
	return cfg.RequireAPIToken(action)
}

func phraseConfigAPIBaseURL(cmd *cobra.Command, cfg phrase.CLIConfig, apiBaseURL string) string {
	if cmd.Flags().Changed("api-base-url") {
		return strings.TrimSpace(apiBaseURL)
	}
	return cfg.APIBaseURL
}

func phraseUploadSourceLocales(cmd *cobra.Command, source phrase.CLIPushSource, o phraseUploadSourcesOptions, projectID, branch string, resolveLocales phraseLocaleResolver) ([]string, error) {
	if cmd.Flags().Changed("source-locale") {
		return []string{strings.TrimSpace(o.sourceLocale)}, nil
	}
	if strings.TrimSpace(source.LocaleID) != "" {
		return []string{strings.TrimSpace(source.LocaleID)}, nil
	}
	refs, err := resolveLocales(projectID, branch)
	if err != nil {
		return nil, err
	}
	if phrase.HasLocalePlaceholder(source.File) {
		return phraseLocaleNames(refs), nil
	}
	defaultLocale := defaultPhraseLocale(refs)
	if defaultLocale == "" {
		return nil, fmt.Errorf("params.locale_id or --source-locale is required")
	}
	return []string{defaultLocale}, nil
}

func phrasePullTargetLocales(cmd *cobra.Command, target phrase.CLIPullTarget, o phraseDownloadTranslationsOptions, projectID, branch string, resolveLocales phraseLocaleResolver) ([]string, error) {
	if cmd.Flags().Changed("target-locale") {
		locales := normalizePhraseLocales(o.targetLocales)
		if len(locales) == 0 {
			return nil, fmt.Errorf("at least one --target-locale is required")
		}
		return locales, nil
	}
	if strings.TrimSpace(target.LocaleID) != "" {
		return []string{strings.TrimSpace(target.LocaleID)}, nil
	}
	refs, err := resolveLocales(projectID, branch)
	if err != nil {
		return nil, err
	}
	locales := phraseLocaleNames(refs)
	if len(locales) == 0 {
		return nil, fmt.Errorf("params.locale_id or --target-locale is required")
	}
	return locales, nil
}

func phraseLocaleNames(refs []phrase.LocaleRef) []string {
	locales := make([]string, 0, len(refs))
	for _, ref := range refs {
		if value := phraseLocaleValue(ref); value != "" {
			locales = append(locales, value)
		}
	}
	return locales
}

func defaultPhraseLocale(refs []phrase.LocaleRef) string {
	for _, ref := range refs {
		if ref.Default {
			return phraseLocaleValue(ref)
		}
	}
	if len(refs) > 0 {
		return phraseLocaleValue(refs[0])
	}
	return ""
}

func phraseLocaleValue(ref phrase.LocaleRef) string {
	if strings.TrimSpace(ref.Name) != "" {
		return strings.TrimSpace(ref.Name)
	}
	if strings.TrimSpace(ref.Code) != "" {
		return strings.TrimSpace(ref.Code)
	}
	return strings.TrimSpace(ref.ID)
}

func phraseConfigTagVariants(pattern string, tags []string) ([]string, error) {
	if !phrase.HasTagPlaceholder(pattern) {
		return []string{""}, nil
	}
	if len(tags) == 0 {
		return nil, fmt.Errorf("tag placeholder requires params.tags or --tag")
	}
	return tags, nil
}

func phraseConfigOutputPath(cfg phrase.CLIConfig, pattern, locale, tag string) (string, error) {
	pattern = strings.ReplaceAll(pattern, "%locale%", locale)
	expanded, err := phrase.ExpandCLIFilePath(pattern, locale, tag, cfg.LocaleMapping)
	if err != nil {
		return "", err
	}
	if expanded == "" || expanded == "-" {
		return expanded, nil
	}
	return phrase.ResolveCLIFilePath(cfg.BasePath, expanded), nil
}

func expandPhraseConfigSourcePaths(pattern string) ([]string, error) {
	if strings.ContainsAny(pattern, "*?[") {
		matches, err := filepath.Glob(pattern)
		if err != nil {
			return nil, fmt.Errorf("glob source file %q: %w", pattern, err)
		}
		if len(matches) == 0 {
			return nil, fmt.Errorf("source pattern %q matched no files", pattern)
		}
		return validatePhraseSourceFiles(matches)
	}
	return validatePhraseSourceFiles([]string{pattern})
}

func validatePhraseDownloadConfigOutputs(tasks []phraseDownloadConfigTask, force bool) error {
	for _, task := range tasks {
		if err := validatePhraseDownloadTranslationsOutputPath(task.output, force); err != nil {
			return err
		}
	}
	return nil
}

func validatePhraseDownloadConfigStdout(tasks []phraseDownloadConfigTask) error {
	stdoutTasks := 0
	for _, task := range tasks {
		if task.output == "" || task.output == "-" {
			stdoutTasks++
		}
	}
	if stdoutTasks > 1 || (stdoutTasks == 1 && len(tasks) > 1) {
		return fmt.Errorf("phrase download translations: config output must resolve to files when downloading multiple targets")
	}
	return nil
}

func boolPtrValue(value *bool) bool {
	return value != nil && *value
}

func phraseAPIToken(action, tokenEnv string) (string, error) {
	tokenEnv = strings.TrimSpace(tokenEnv)
	if tokenEnv == "" {
		tokenEnv = "PHRASE_API_TOKEN"
	}
	token := strings.TrimSpace(os.Getenv(tokenEnv))
	if token == "" && tokenEnv != "PHRASE_API_TOKEN" {
		token = strings.TrimSpace(os.Getenv("PHRASE_API_TOKEN"))
	}
	if token == "" {
		if tokenEnv != "PHRASE_API_TOKEN" {
			return "", fmt.Errorf("%s: API token is required (%s or PHRASE_API_TOKEN)", action, tokenEnv)
		}
		return "", fmt.Errorf("%s: API token is required (%s)", action, tokenEnv)
	}
	return token, nil
}

func writePhraseDownloadedTranslation(path string, content []byte, force bool) error {
	if err := validatePhraseDownloadTranslationsOutputPath(path, force); err != nil {
		return err
	}
	if path == "" || path == "-" {
		return fmt.Errorf("phrase download translations: output file path is required")
	}
	if dir := filepath.Dir(path); dir != "." {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return fmt.Errorf("phrase download translations: mkdir output directory: %w", err)
		}
	}
	if force {
		return writePhraseDownloadedFileAtomic("phrase download translations", path, content, 0o644)
	}
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		if os.IsExist(err) {
			return fmt.Errorf("phrase download translations: output file %q already exists; use --force to overwrite", path)
		}
		return fmt.Errorf("phrase download translations: open output file %q: %w", path, err)
	}
	if _, err := file.Write(content); err != nil {
		_ = file.Close()
		_ = os.Remove(path)
		return fmt.Errorf("phrase download translations: write output file %q: %w", path, err)
	}
	if err := file.Close(); err != nil {
		_ = os.Remove(path)
		return fmt.Errorf("phrase download translations: close output file %q: %w", path, err)
	}
	return nil
}

func removePhraseDownloadedTranslationOutputs(paths []string) {
	for i := len(paths) - 1; i >= 0; i-- {
		_ = os.Remove(paths[i])
	}
}

func writePhraseDownloadedSource(path string, content []byte, force bool) error {
	if err := validatePhraseDownloadOutputPath(path, force); err != nil {
		return err
	}
	if path == "" || path == "-" {
		return fmt.Errorf("phrase download sources: output file path is required")
	}
	if dir := filepath.Dir(path); dir != "." {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return fmt.Errorf("phrase download sources: mkdir output directory: %w", err)
		}
	}
	if force {
		return writePhraseDownloadedFileAtomic("phrase download sources", path, content, 0o644)
	}
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		if os.IsExist(err) {
			return fmt.Errorf("phrase download sources: output file %q already exists; use --force to overwrite", path)
		}
		return fmt.Errorf("phrase download sources: open output file %q: %w", path, err)
	}
	if _, err := file.Write(content); err != nil {
		_ = file.Close()
		return fmt.Errorf("phrase download sources: write output file %q: %w", path, err)
	}
	if err := file.Close(); err != nil {
		return fmt.Errorf("phrase download sources: close output file %q: %w", path, err)
	}
	return nil
}

func writePhraseDownloadedFileAtomic(action, path string, content []byte, perm os.FileMode) error {
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

func validatePhraseTranslationMemoryOutputPath(path string, force bool) error {
	if path == "" || path == "-" {
		return nil
	}
	if info, err := os.Stat(path); err == nil {
		if info.IsDir() {
			return fmt.Errorf("phrase translation memory download: output file %q is a directory", path)
		}
		if !force {
			return fmt.Errorf("phrase translation memory download: output file %q already exists; use --force to overwrite", path)
		}
	} else if err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("phrase translation memory download: stat output file %q: %w", path, err)
	}
	return nil
}

func validatePhraseGlossaryOutputPath(path string, force bool) error {
	if path == "" || path == "-" {
		return nil
	}
	if info, err := os.Stat(path); err == nil {
		if info.IsDir() {
			return fmt.Errorf("phrase glossary download: output file %q is a directory", path)
		}
		if !force {
			return fmt.Errorf("phrase glossary download: output file %q already exists; use --force to overwrite", path)
		}
	} else if err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("phrase glossary download: stat output file %q: %w", path, err)
	}
	return nil
}

func validatePhraseDownloadTranslationsOutputPath(path string, force bool) error {
	if path == "" || path == "-" {
		return nil
	}
	if info, err := os.Stat(path); err == nil {
		if info.IsDir() {
			return fmt.Errorf("phrase download translations: output file %q is a directory", path)
		}
		if !force {
			return fmt.Errorf("phrase download translations: output file %q already exists; use --force to overwrite", path)
		}
	} else if err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("phrase download translations: stat output file %q: %w", path, err)
	}
	return nil
}

func validatePhraseDownloadOutputPath(path string, force bool) error {
	if path == "" || path == "-" {
		return nil
	}
	if info, err := os.Stat(path); err == nil {
		if info.IsDir() {
			return fmt.Errorf("phrase download sources: output file %q is a directory", path)
		}
		if !force {
			return fmt.Errorf("phrase download sources: output file %q already exists; use --force to overwrite", path)
		}
	} else if err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("phrase download sources: stat output file %q: %w", path, err)
	}
	return nil
}

func normalizePhraseLocales(values []string) []string {
	return locales.NormalizeList(values)
}

func phraseTranslationOutputPaths(output string, locales []string) ([]string, error) {
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
		return nil, fmt.Errorf("phrase download translations: --output with %%locale%% is required when downloading multiple target locales")
	}
	if !strings.Contains(output, "%locale%") {
		return nil, fmt.Errorf("phrase download translations: --output must include %%locale%% when downloading multiple target locales")
	}
	paths := make([]string, 0, len(locales))
	for _, locale := range locales {
		paths = append(paths, strings.ReplaceAll(output, "%locale%", locale))
	}
	return paths, nil
}

func validatePhraseSourceFiles(paths []string) ([]string, error) {
	files := make([]string, 0, len(paths))
	for _, path := range paths {
		trimmed := strings.TrimSpace(path)
		if trimmed == "" {
			continue
		}
		info, err := os.Stat(trimmed)
		if err != nil {
			return nil, fmt.Errorf("phrase upload sources: stat source file %q: %w", trimmed, err)
		}
		if info.IsDir() {
			return nil, fmt.Errorf("phrase upload sources: source file %q is a directory", trimmed)
		}
		files = append(files, trimmed)
	}
	if len(files) == 0 {
		return nil, fmt.Errorf("phrase upload sources: at least one --file is required")
	}
	return files, nil
}
