package cmd

import (
	"fmt"
	"net/http"
	"os"
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

func newPhraseCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "phrase",
		Short: "Phrase file workflow commands",
	}
	cmd.AddCommand(newPhraseUploadCmd())
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

	tokenEnv := strings.TrimSpace(o.tokenEnv)
	if tokenEnv == "" {
		tokenEnv = "PHRASE_API_TOKEN"
	}
	token := strings.TrimSpace(os.Getenv(tokenEnv))
	if token == "" && tokenEnv != "PHRASE_API_TOKEN" {
		token = strings.TrimSpace(os.Getenv("PHRASE_API_TOKEN"))
	}
	if token == "" {
		if tokenEnv != "PHRASE_API_TOKEN" {
			return fmt.Errorf("phrase upload sources: API token is required (%s or PHRASE_API_TOKEN)", tokenEnv)
		}
		return fmt.Errorf("phrase upload sources: API token is required (%s)", tokenEnv)
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
