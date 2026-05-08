package cmd

import (
	"fmt"
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

func newPhraseCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "phrase",
		Short: "Phrase file workflow commands",
	}
	cmd.AddCommand(newPhraseUploadCmd())
	cmd.AddCommand(newPhraseDownloadCmd())
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
			return fmt.Errorf("phrase download translations: %w", err)
		}

		output := outputs[idx]
		if output == "" || output == "-" {
			_, err := cmd.OutOrStdout().Write(result.Content)
			return err
		}
		if err := writePhraseDownloadedTranslation(output, result.Content, o.force); err != nil {
			return err
		}
		if _, err := fmt.Fprintf(cmd.OutOrStdout(), "downloaded file=%s bytes=%d locale=%s format=%s\n", output, len(result.Content), result.LocaleID, result.Format); err != nil {
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
		return fmt.Errorf("phrase download translations: write output file %q: %w", path, err)
	}
	if err := file.Close(); err != nil {
		return fmt.Errorf("phrase download translations: close output file %q: %w", path, err)
	}
	return nil
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
