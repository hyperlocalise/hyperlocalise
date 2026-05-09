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

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/storage/phrase"
	"github.com/spf13/cobra"
)

type phraseUploadSourcesOptions struct {
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
	output              string
	tokenEnv            string
	apiBaseURL          string
	force               bool
	dryRun              bool
}

type phraseTranslationMemoryCSVWriter interface {
	WriteTranslationMemoryCSV(context.Context, phrase.TranslationMemoryDownloadInput, io.Writer) (phrase.TranslationMemoryDownloadResult, error)
}

var newPhraseTranslationMemoryCSVWriter = func(apiBaseURL string) (phraseTranslationMemoryCSVWriter, error) {
	return phrase.NewTMSHTTPClientWithBaseURL(phrase.Config{}, apiBaseURL, &http.Client{})
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
	cmd.AddCommand(newPhraseUploadCmd())
	cmd.AddCommand(newPhraseDownloadCmd())
	cmd.AddCommand(newPhraseGlossaryCmd())
	cmd.AddCommand(newPhraseTranslationMemoryCmd())
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
		Short:        "download Phrase translation memory entries as CSV",
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return executePhraseTranslationMemoryDownload(cmd, o)
		},
	}
	cmd.Flags().StringVar(&o.translationMemoryID, "tm-id", "", "Phrase translation memory UID")
	cmd.Flags().StringVar(&o.sourceLanguage, "source-language", "", "source language code to export")
	cmd.Flags().StringSliceVarP(&o.targetLanguages, "target-language", "l", nil, "target language code(s) to export")
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
	client, err := newPhraseTranslationMemoryCSVWriter(o.apiBaseURL)
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

	result, writeErr := client.WriteTranslationMemoryCSV(backgroundContext(), phrase.TranslationMemoryDownloadInput{
		TranslationMemoryID: strings.TrimSpace(o.translationMemoryID),
		APIToken:            token,
		SourceLanguage:      strings.TrimSpace(o.sourceLanguage),
		TargetLanguages:     targets,
	}, out)
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
		_, err = fmt.Fprintf(cmd.OutOrStdout(), "wrote %s rows=%d segments=%d\n", outputPath, result.Rows, result.Segments)
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
	locales := make([]string, 0, len(values))
	seen := make(map[string]struct{}, len(values))
	for _, value := range values {
		for _, part := range strings.Split(value, ",") {
			locale := strings.TrimSpace(part)
			if locale == "" {
				continue
			}
			if _, ok := seen[locale]; ok {
				continue
			}
			seen[locale] = struct{}{}
			locales = append(locales, locale)
		}
	}
	return locales
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
