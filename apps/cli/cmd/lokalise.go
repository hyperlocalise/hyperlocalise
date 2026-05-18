package cmd

import (
	"context"
	"fmt"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/locales"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/storage/lokalise"
	i18nconfig "github.com/hyperlocalise/hyperlocalise/pkg/i18nconfig"
	"github.com/spf13/cobra"
)

const defaultLokaliseAPITokenEnv = "LOKALISE_API_TOKEN"

// Flow for `hyperlocalise lokalise glossary download`:
// 1. Cobra parses flags into lokaliseGlossaryDownloadOptions.
// 2. resolveLokaliseGlossaryConfig combines flags, optional i18n.yml storage config, and env auth.
// 3. The command chooses stdout or a temporary output file.
// 4. storage/lokalise downloads glossary terms and writes stable CSV.
// 5. The temp file is renamed only after success, preserving existing output on API/write errors.
type lokaliseGlossaryDownloadOptions struct {
	configPath     string
	projectID      string
	languages      []string
	outputPath     string
	tokenEnv       string
	apiBaseURL     string
	timeoutSeconds int
}

type lokaliseDownloadTranslationsOptions struct {
	configPath      string
	projectID       string
	targetLocales   []string
	format          string
	outputPath      string
	bundleStructure string
	branch          string
	tokenEnv        string
	apiBaseURL      string
	timeoutSeconds  int
	force           bool
	dryRun          bool
}

type lokaliseDownloadSourcesOptions struct {
	configPath     string
	projectID      string
	sourceLocale   string
	format         string
	output         string
	tokenEnv       string
	apiBaseURL     string
	timeoutSeconds int
	allPlatforms   bool
	force          bool
	dryRun         bool
}

type lokaliseUploadSourcesOptions struct {
	configPath          string
	projectID           string
	sourceLocale        string
	files               []string
	format              string
	branch              string
	tags                []string
	tokenEnv            string
	apiBaseURL          string
	timeoutSeconds      int
	convertPlaceholders bool
	replaceModified     bool
	distinguishByFile   bool
	applyTM             bool
	skipDetectLangISO   bool
	dryRun              bool
}

type lokaliseGlossaryCSVWriter interface {
	WriteGlossaryCSV(context.Context, lokalise.GlossaryDownloadInput, io.Writer) (lokalise.GlossaryDownloadResult, error)
}

type lokaliseTranslationDownloader interface {
	DownloadTranslationFiles(context.Context, lokalise.TranslationFileDownloadRequest) (lokalise.TranslationFileDownloadResult, error)
}

type lokaliseSourceDownloader interface {
	DownloadSourceFile(context.Context, lokalise.SourceDownloadInput) (lokalise.SourceDownloadResult, error)
}

type lokaliseSourceUploader interface {
	UploadSourceFile(context.Context, lokalise.SourceUploadInput) (lokalise.SourceUploadResult, error)
}

var newLokaliseGlossaryCSVWriter = func(cfg lokalise.Config) (lokaliseGlossaryCSVWriter, error) {
	return lokalise.NewHTTPClient(cfg)
}

var newLokaliseTranslationDownloader = func(cfg lokalise.Config) (lokaliseTranslationDownloader, error) {
	return lokalise.NewHTTPClient(cfg)
}

var newLokaliseSourceDownloader = func(cfg lokalise.Config) (lokaliseSourceDownloader, error) {
	return lokalise.NewHTTPClient(cfg)
}

var newLokaliseSourceUploader = func(cfg lokalise.Config) (lokaliseSourceUploader, error) {
	return lokalise.NewHTTPClient(cfg)
}

func newLokaliseCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "lokalise",
		Short: "Lokalise workflow commands",
	}
	cmd.AddCommand(newLokaliseDownloadCmd())
	cmd.AddCommand(newLokaliseGlossaryCmd())
	cmd.AddCommand(newLokaliseUploadCmd())
	return cmd
}

func newLokaliseDownloadCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "download",
		Short: "download files from Lokalise",
	}
	cmd.AddCommand(newLokaliseDownloadTranslationsCmd())
	cmd.AddCommand(newLokaliseDownloadSourcesCmd())
	return cmd
}

func newLokaliseDownloadTranslationsCmd() *cobra.Command {
	o := lokaliseDownloadTranslationsOptions{
		timeoutSeconds: 30,
	}
	cmd := &cobra.Command{
		Use:          "translations",
		Short:        "download translated content from Lokalise",
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return executeLokaliseDownloadTranslations(cmd, o)
		},
	}
	cmd.Flags().StringVar(&o.configPath, "config", "", "path to i18n.yml with storage.adapter=lokalise")
	cmd.Flags().StringVar(&o.projectID, "project-id", "", "Lokalise project ID; overrides storage.config.projectID")
	cmd.Flags().StringSliceVarP(&o.targetLocales, "target-locale", "l", nil, "Lokalise target locale(s) to export")
	cmd.Flags().StringVar(&o.format, "format", "", "Lokalise file format, for example json, yaml, or strings")
	cmd.Flags().StringVarP(&o.outputPath, "output", "o", "", "output file path; omit or use - for stdout when downloading one locale; use %locale% for multiple locales")
	cmd.Flags().StringVar(&o.bundleStructure, "bundle-structure", "", "Lokalise bundle structure; defaults to %LANG_ISO%.%FORMAT%")
	cmd.Flags().StringVar(&o.branch, "branch", "", "Lokalise branch name to export")
	cmd.Flags().StringVar(&o.tokenEnv, "token-env", o.tokenEnv, "environment variable containing the Lokalise API token")
	cmd.Flags().StringVar(&o.apiBaseURL, "api-base-url", "", "Lokalise API base URL")
	cmd.Flags().IntVar(&o.timeoutSeconds, "timeout-seconds", o.timeoutSeconds, "HTTP timeout in seconds")
	cmd.Flags().BoolVar(&o.force, "force", false, "overwrite an existing output file")
	cmd.Flags().BoolVar(&o.dryRun, "dry-run", false, "preview command without downloading content")
	return cmd
}

func newLokaliseDownloadSourcesCmd() *cobra.Command {
	o := lokaliseDownloadSourcesOptions{}
	cmd := &cobra.Command{
		Use:          "sources",
		Short:        "download source files from Lokalise",
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return executeLokaliseDownloadSources(cmd, o)
		},
	}
	cmd.Flags().StringVar(&o.configPath, "config", "", "path to i18n.yml with storage.adapter=lokalise")
	cmd.Flags().StringVar(&o.projectID, "project-id", "", "Lokalise project ID; overrides storage.config.projectID")
	cmd.Flags().StringVar(&o.sourceLocale, "source-locale", "", "Lokalise source language ISO to export")
	cmd.Flags().StringVar(&o.format, "format", "", "Lokalise file format to export")
	cmd.Flags().StringVarP(&o.output, "output", "o", "", "output bundle path; omit or use - for stdout")
	cmd.Flags().StringVar(&o.tokenEnv, "token-env", "", "environment variable containing the Lokalise API token")
	cmd.Flags().StringVar(&o.apiBaseURL, "api-base-url", "", "Lokalise API base URL")
	cmd.Flags().IntVar(&o.timeoutSeconds, "timeout-seconds", 0, "HTTP timeout in seconds")
	cmd.Flags().BoolVar(&o.allPlatforms, "all-platforms", false, "include all Lokalise platforms in the export")
	cmd.Flags().BoolVar(&o.force, "force", false, "overwrite an existing output file")
	cmd.Flags().BoolVar(&o.dryRun, "dry-run", false, "preview command without downloading content")
	return cmd
}

func executeLokaliseDownloadTranslations(cmd *cobra.Command, o lokaliseDownloadTranslationsOptions) error {
	cfg, req, targets, err := resolveLokaliseDownloadTranslationsConfig(o, !o.dryRun)
	if err != nil {
		return err
	}

	outputPath := strings.TrimSpace(o.outputPath)
	outputs, err := lokaliseTranslationOutputPaths(outputPath, targets)
	if err != nil {
		return err
	}
	if o.dryRun {
		destination := outputPath
		if destination == "" {
			destination = "-"
		}
		_, err := fmt.Fprintf(cmd.OutOrStdout(), "dry-run action=lokalise-download-translations project_id=%s target_locales=%s format=%s output=%s\n", req.ProjectID, strings.Join(targets, ","), req.Format, destination)
		return err
	}
	for _, output := range outputs {
		if err := validateLokaliseDownloadOutputPath(output, o.force); err != nil {
			return err
		}
	}

	client, err := newLokaliseTranslationDownloader(cfg)
	if err != nil {
		return err
	}
	result, err := client.DownloadTranslationFiles(backgroundContext(), req)
	if err != nil {
		return fmt.Errorf("lokalise download translations: %w", err)
	}
	if len(result.Files) != len(outputs) {
		return fmt.Errorf("lokalise download translations: downloaded %d file(s), expected %d", len(result.Files), len(outputs))
	}

	writtenOutputs := make([]string, 0, len(outputs))
	for idx, file := range result.Files {
		output := outputs[idx]
		if output == "" || output == "-" {
			if _, err := cmd.OutOrStdout().Write(file.Content); err != nil {
				return err
			}
			if result.Warning != "" {
				_, _ = fmt.Fprintf(cmd.ErrOrStderr(), "warning: %s\n", result.Warning)
			}
			return nil
		}
		if err := writeLokaliseDownloadedTranslation(output, file.Content, o.force); err != nil {
			removeLokaliseDownloadedOutputs(writtenOutputs)
			return err
		}
		writtenOutputs = append(writtenOutputs, output)
		if _, err := fmt.Fprintf(cmd.OutOrStdout(), "downloaded file=%s bytes=%d locale=%s format=%s\n", output, len(file.Content), file.Locale, req.Format); err != nil {
			removeLokaliseDownloadedOutputs(writtenOutputs)
			return err
		}
	}
	if result.Warning != "" {
		_, _ = fmt.Fprintf(cmd.ErrOrStderr(), "warning: %s\n", result.Warning)
	}
	return nil
}

func executeLokaliseDownloadSources(cmd *cobra.Command, o lokaliseDownloadSourcesOptions) error {
	cfg, input, err := resolveLokaliseDownloadSourcesConfig(cmd, o, !o.dryRun)
	if err != nil {
		return err
	}

	outputPath := strings.TrimSpace(o.output)
	if o.dryRun {
		destination := outputPath
		if destination == "" {
			destination = "-"
		}
		_, err := fmt.Fprintf(cmd.OutOrStdout(), "dry-run action=lokalise-download-sources project_id=%s source_locale=%s format=%s output=%s\n", input.ProjectID, input.SourceLocale, input.FileFormat, destination)
		return err
	}
	if err := validateLokaliseDownloadSourcesOutputPath(outputPath, o.force); err != nil {
		return err
	}

	client, err := newLokaliseSourceDownloader(cfg)
	if err != nil {
		return err
	}
	result, err := client.DownloadSourceFile(backgroundContext(), input)
	if err != nil {
		return fmt.Errorf("lokalise download sources: %w", err)
	}

	if outputPath == "" || outputPath == "-" {
		_, err := cmd.OutOrStdout().Write(result.Content)
		return err
	}
	if err := writeLokaliseDownloadedSource(outputPath, result.Content, o.force); err != nil {
		return err
	}
	_, err = fmt.Fprintf(cmd.OutOrStdout(), "downloaded file=%s bytes=%d locale=%s format=%s\n", outputPath, len(result.Content), result.SourceLocale, result.Format)
	return err
}

func resolveLokaliseDownloadTranslationsConfig(o lokaliseDownloadTranslationsOptions, requireAuth bool) (lokalise.Config, lokalise.TranslationFileDownloadRequest, []string, error) {
	cfg := lokalise.Config{
		ProjectID:      strings.TrimSpace(o.projectID),
		APITokenEnv:    strings.TrimSpace(o.tokenEnv),
		APIBaseURL:     strings.TrimSpace(o.apiBaseURL),
		TimeoutSeconds: o.timeoutSeconds,
	}
	targets := normalizeLokaliseDownloadLocales(o.targetLocales)

	if strings.TrimSpace(o.configPath) == "" && cfg.ProjectID == "" && !defaultI18NConfigExists() {
		return lokalise.Config{}, lokalise.TranslationFileDownloadRequest{}, nil, fmt.Errorf("lokalise download translations: --project-id is required unless --config points to a Lokalise storage config")
	}

	configPath := strings.TrimSpace(o.configPath)
	shouldLoadConfig := configPath != "" || cfg.ProjectID == "" || (len(targets) == 0 && defaultI18NConfigExists())
	if shouldLoadConfig {
		loaded, err := loadLokaliseStorageConfigForAction(configPath, "lokalise download translations")
		if err != nil {
			if configPath != "" || cfg.ProjectID == "" {
				return lokalise.Config{}, lokalise.TranslationFileDownloadRequest{}, nil, err
			}
		} else {
			if cfg.ProjectID == "" {
				cfg.ProjectID = loaded.ProjectID
			}
			if cfg.APITokenEnv == "" {
				cfg.APITokenEnv = loaded.APITokenEnv
			}
			if cfg.APIBaseURL == "" {
				cfg.APIBaseURL = loaded.APIBaseURL
			}
			if cfg.TimeoutSeconds <= 0 {
				cfg.TimeoutSeconds = loaded.TimeoutSeconds
			}
			if strings.TrimSpace(cfg.APIToken) == "" {
				cfg.APIToken = loaded.APIToken
			}
			if len(targets) == 0 {
				targets = normalizeLokaliseDownloadLocales(loaded.TargetLanguages)
			}
		}
	}
	if strings.TrimSpace(cfg.ProjectID) == "" {
		return lokalise.Config{}, lokalise.TranslationFileDownloadRequest{}, nil, fmt.Errorf("lokalise download translations: --project-id is required unless --config points to a Lokalise storage config")
	}
	if len(targets) == 0 {
		return lokalise.Config{}, lokalise.TranslationFileDownloadRequest{}, nil, fmt.Errorf("lokalise download translations: at least one --target-locale is required (or targetLanguages in --config)")
	}
	format := normalizeLokaliseDownloadFormat(o.format)
	if format == "" {
		return lokalise.Config{}, lokalise.TranslationFileDownloadRequest{}, nil, fmt.Errorf("lokalise download translations: --format is required")
	}
	if cfg.APITokenEnv == "" {
		cfg.APITokenEnv = defaultLokaliseAPITokenEnv
	}
	if strings.TrimSpace(cfg.APIToken) == "" {
		if !requireAuth {
			cfg.APIToken = "dry-run"
		} else {
			token := strings.TrimSpace(os.Getenv(cfg.APITokenEnv))
			if token == "" && cfg.APITokenEnv != defaultLokaliseAPITokenEnv {
				token = strings.TrimSpace(os.Getenv(defaultLokaliseAPITokenEnv))
			}
			if token == "" {
				if cfg.APITokenEnv != defaultLokaliseAPITokenEnv {
					return lokalise.Config{}, lokalise.TranslationFileDownloadRequest{}, nil, fmt.Errorf("lokalise download translations: API token is required (%s or %s)", cfg.APITokenEnv, defaultLokaliseAPITokenEnv)
				}
				return lokalise.Config{}, lokalise.TranslationFileDownloadRequest{}, nil, fmt.Errorf("lokalise download translations: API token is required (%s)", cfg.APITokenEnv)
			}
			cfg.APIToken = token
		}
	}
	if cfg.TimeoutSeconds <= 0 {
		cfg.TimeoutSeconds = 30
	}
	projectID, err := lokaliseProjectIDWithBranch(strings.TrimSpace(cfg.ProjectID), o.branch)
	if err != nil {
		return lokalise.Config{}, lokalise.TranslationFileDownloadRequest{}, nil, err
	}
	req := lokalise.TranslationFileDownloadRequest{
		ProjectID:       projectID,
		TargetLanguages: targets,
		Format:          format,
		BundleStructure: strings.TrimSpace(o.bundleStructure),
	}
	return cfg, req, targets, nil
}

func lokaliseProjectIDWithBranch(projectID, branch string) (string, error) {
	branch = strings.TrimSpace(branch)
	if branch == "" {
		return projectID, nil
	}
	if strings.Contains(projectID, ":") {
		return "", fmt.Errorf("lokalise download translations: --branch cannot be used when projectID already includes a branch")
	}
	// go-lokalise-api interpolates projectID into the request path directly.
	// Escape the branch once here; storage tests assert Resty preserves it.
	return projectID + ":" + url.PathEscape(branch), nil
}

func lokaliseTranslationOutputPaths(output string, targetLocales []string) ([]string, error) {
	if len(targetLocales) == 0 {
		return nil, nil
	}
	if len(targetLocales) == 1 {
		if strings.Contains(output, "%locale%") {
			return []string{strings.ReplaceAll(output, "%locale%", targetLocales[0])}, nil
		}
		return []string{output}, nil
	}
	if output == "" || output == "-" {
		return nil, fmt.Errorf("lokalise download translations: --output with %%locale%% is required when downloading multiple target locales")
	}
	if !strings.Contains(output, "%locale%") {
		return nil, fmt.Errorf("lokalise download translations: --output must include %%locale%% when downloading multiple target locales")
	}
	paths := make([]string, 0, len(targetLocales))
	for _, locale := range targetLocales {
		paths = append(paths, strings.ReplaceAll(output, "%locale%", locale))
	}
	return paths, nil
}

func writeLokaliseDownloadedTranslation(path string, content []byte, force bool) error {
	if path == "" || path == "-" {
		return fmt.Errorf("lokalise download translations: output file path is required")
	}
	if err := validateLokaliseDownloadOutputPath(path, force); err != nil {
		return err
	}
	if dir := filepath.Dir(path); dir != "." {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return fmt.Errorf("lokalise download translations: mkdir output directory: %w", err)
		}
	}
	if force {
		return writeLokaliseDownloadedFileAtomic("lokalise download translations", path, content, 0o644)
	}
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		if os.IsExist(err) {
			return fmt.Errorf("lokalise download translations: output file %q already exists; use --force to overwrite", path)
		}
		return fmt.Errorf("lokalise download translations: open output file %q: %w", path, err)
	}
	if _, err := file.Write(content); err != nil {
		_ = file.Close()
		_ = os.Remove(path)
		return fmt.Errorf("lokalise download translations: write output file %q: %w", path, err)
	}
	if err := file.Close(); err != nil {
		_ = os.Remove(path)
		return fmt.Errorf("lokalise download translations: close output file %q: %w", path, err)
	}
	return nil
}

func validateLokaliseDownloadOutputPath(path string, force bool) error {
	if path == "" || path == "-" {
		return nil
	}
	if info, err := os.Stat(path); err == nil {
		if info.IsDir() {
			return fmt.Errorf("lokalise download translations: output file %q is a directory", path)
		}
		if !force {
			return fmt.Errorf("lokalise download translations: output file %q already exists; use --force to overwrite", path)
		}
	} else if err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("lokalise download translations: stat output file %q: %w", path, err)
	}
	return nil
}

func removeLokaliseDownloadedOutputs(paths []string) {
	for i := len(paths) - 1; i >= 0; i-- {
		_ = os.Remove(paths[i])
	}
}

func normalizeLokaliseDownloadFormat(format string) string {
	trimmed := strings.TrimPrefix(strings.TrimSpace(format), ".")
	if strings.EqualFold(trimmed, "yml") {
		return "yaml"
	}
	return trimmed
}

func normalizeLokaliseDownloadLocales(values []string) []string {
	return locales.NormalizeList(values)
}

func resolveLokaliseDownloadSourcesConfig(cmd *cobra.Command, o lokaliseDownloadSourcesOptions, requireAuth bool) (lokalise.Config, lokalise.SourceDownloadInput, error) {
	cfg := lokalise.Config{
		ProjectID:      strings.TrimSpace(o.projectID),
		APITokenEnv:    strings.TrimSpace(o.tokenEnv),
		APIBaseURL:     strings.TrimSpace(o.apiBaseURL),
		SourceLanguage: strings.TrimSpace(o.sourceLocale),
		TimeoutSeconds: o.timeoutSeconds,
	}

	if strings.TrimSpace(o.configPath) != "" {
		loaded, err := loadLokaliseDownloadSourcesStorageConfig(o.configPath)
		if err != nil {
			return lokalise.Config{}, lokalise.SourceDownloadInput{}, err
		}
		if !lokaliseFlagChanged(cmd, "project-id") && cfg.ProjectID == "" {
			cfg.ProjectID = loaded.ProjectID
		}
		if !lokaliseFlagChanged(cmd, "token-env") && cfg.APITokenEnv == "" {
			cfg.APITokenEnv = loaded.APITokenEnv
		}
		if !lokaliseFlagChanged(cmd, "api-base-url") && cfg.APIBaseURL == "" {
			cfg.APIBaseURL = loaded.APIBaseURL
		}
		if !lokaliseFlagChanged(cmd, "timeout-seconds") && cfg.TimeoutSeconds <= 0 {
			cfg.TimeoutSeconds = loaded.TimeoutSeconds
		}
		if !lokaliseFlagChanged(cmd, "source-locale") && cfg.SourceLanguage == "" {
			cfg.SourceLanguage = loaded.SourceLanguage
		}
		// Config.APIToken is json:"-"; ResolveConfig fills it from the environment when auth is required.
	}

	format := strings.TrimSpace(o.format)
	if strings.TrimSpace(cfg.ProjectID) == "" {
		return lokalise.Config{}, lokalise.SourceDownloadInput{}, fmt.Errorf("lokalise download sources: --project-id is required (or projectID in --config)")
	}
	if strings.TrimSpace(cfg.SourceLanguage) == "" {
		return lokalise.Config{}, lokalise.SourceDownloadInput{}, fmt.Errorf("lokalise download sources: --source-locale is required (or sourceLanguage in --config)")
	}
	if format == "" {
		return lokalise.Config{}, lokalise.SourceDownloadInput{}, fmt.Errorf("lokalise download sources: --format is required")
	}

	if requireAuth {
		resolved, err := lokalise.ResolveConfig(cfg)
		if err != nil {
			return lokalise.Config{}, lokalise.SourceDownloadInput{}, fmt.Errorf("lokalise download sources: %w", err)
		}
		cfg = resolved
	}

	input := lokalise.SourceDownloadInput{
		ProjectID:    strings.TrimSpace(cfg.ProjectID),
		SourceLocale: strings.TrimSpace(cfg.SourceLanguage),
		FileFormat:   format,
		AllPlatforms: o.allPlatforms,
	}
	return cfg, input, nil
}

func loadLokaliseDownloadSourcesStorageConfig(configPath string) (lokalise.Config, error) {
	cfg, err := i18nconfig.Load(configPath)
	if err != nil {
		return lokalise.Config{}, fmt.Errorf("lokalise download sources: load config: %w", err)
	}
	if cfg.Storage == nil {
		return lokalise.Config{}, fmt.Errorf("lokalise download sources: storage config is required")
	}
	if !strings.EqualFold(strings.TrimSpace(cfg.Storage.Adapter), lokalise.AdapterName) {
		return lokalise.Config{}, fmt.Errorf("lokalise download sources: storage.adapter must be %q", lokalise.AdapterName)
	}
	parsed, err := lokalise.DecodeConfig(cfg.Storage.Config)
	if err != nil {
		return lokalise.Config{}, fmt.Errorf("lokalise download sources: %w", err)
	}
	return parsed, nil
}

func newLokaliseGlossaryCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "glossary",
		Short: "Lokalise glossary commands",
	}
	cmd.AddCommand(newLokaliseGlossaryDownloadCmd())
	return cmd
}

func newLokaliseUploadCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "upload",
		Short: "upload files to Lokalise",
	}
	cmd.AddCommand(newLokaliseUploadSourcesCmd())
	return cmd
}

func newLokaliseUploadSourcesCmd() *cobra.Command {
	o := lokaliseUploadSourcesOptions{
		tokenEnv:       defaultLokaliseAPITokenEnv,
		timeoutSeconds: 30,
	}
	cmd := &cobra.Command{
		Use:          "sources",
		Short:        "upload source files to Lokalise",
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return executeLokaliseUploadSources(cmd, o)
		},
	}
	cmd.Flags().StringVar(&o.configPath, "config", "", "path to i18n config with storage.adapter=lokalise")
	cmd.Flags().StringVar(&o.projectID, "project-id", "", "Lokalise project identifier")
	cmd.Flags().StringVar(&o.sourceLocale, "source-locale", "", "source locale ISO in the uploaded file")
	cmd.Flags().StringArrayVarP(&o.files, "file", "f", nil, "source file path(s) to upload")
	cmd.Flags().StringVar(&o.format, "format", "", "Lokalise file format; defaults to each file extension")
	cmd.Flags().StringVar(&o.branch, "branch", "", "Lokalise branch name")
	cmd.Flags().StringSliceVar(&o.tags, "tag", nil, "tag(s) to assign to uploaded keys")
	cmd.Flags().StringVar(&o.tokenEnv, "token-env", o.tokenEnv, "environment variable containing the Lokalise API token")
	cmd.Flags().StringVar(&o.apiBaseURL, "api-base-url", "", "Lokalise API base URL")
	cmd.Flags().IntVar(&o.timeoutSeconds, "timeout-seconds", o.timeoutSeconds, "Lokalise API timeout in seconds")
	cmd.Flags().BoolVar(&o.convertPlaceholders, "convert-placeholders", false, "convert placeholders to Lokalise universal placeholders")
	cmd.Flags().BoolVar(&o.replaceModified, "replace-modified", false, "replace translations modified in the uploaded file")
	cmd.Flags().BoolVar(&o.distinguishByFile, "distinguish-by-file", false, "allow same key names in different filenames")
	cmd.Flags().BoolVar(&o.applyTM, "apply-tm", false, "apply 100% translation memory matches during import")
	cmd.Flags().BoolVar(&o.skipDetectLangISO, "skip-detect-lang-iso", false, "skip automatic language detection by filename")
	cmd.Flags().BoolVar(&o.dryRun, "dry-run", false, "preview command without uploading files")
	return cmd
}

func newLokaliseGlossaryDownloadCmd() *cobra.Command {
	o := lokaliseGlossaryDownloadOptions{}
	cmd := &cobra.Command{
		Use:          "download",
		Short:        "download Lokalise glossary terms as CSV",
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			cfg, err := resolveLokaliseGlossaryConfig(o)
			if err != nil {
				return err
			}
			client, err := newLokaliseGlossaryCSVWriter(cfg)
			if err != nil {
				return err
			}

			outputPath := strings.TrimSpace(o.outputPath)
			out := cmd.OutOrStdout()
			var closeOut func() error
			var tempPath string
			// File output goes through a temp file so a failed download cannot leave a partial CSV.
			if outputPath != "" && outputPath != "-" {
				file, err := os.CreateTemp(filepath.Dir(outputPath), "."+filepath.Base(outputPath)+".*.tmp")
				if err != nil {
					return fmt.Errorf("create temporary glossary csv: %w", err)
				}
				out = file
				tempPath = file.Name()
				closeOut = file.Close
			}

			result, err := client.WriteGlossaryCSV(backgroundContext(), lokalise.GlossaryDownloadInput{
				ProjectID: cfg.ProjectID,
				Locales:   o.languages,
			}, out)
			if closeOut != nil {
				if closeErr := closeOut(); closeErr != nil && err == nil {
					err = fmt.Errorf("close glossary csv: %w", closeErr)
				}
			}
			if err != nil {
				if tempPath != "" {
					if removeErr := os.Remove(tempPath); removeErr != nil && !os.IsNotExist(removeErr) {
						return fmt.Errorf("%w; also failed to remove temporary output: %v", err, removeErr)
					}
				}
				return err
			}
			if outputPath != "" && outputPath != "-" {
				if err := os.Rename(tempPath, outputPath); err != nil {
					if removeErr := os.Remove(tempPath); removeErr != nil && !os.IsNotExist(removeErr) {
						return fmt.Errorf("replace glossary csv: %w; also failed to remove temporary output: %v", err, removeErr)
					}
					return fmt.Errorf("replace glossary csv: %w", err)
				}
				_, err = fmt.Fprintf(cmd.OutOrStdout(), "wrote %s terms=%d rows=%d\n", outputPath, result.Terms, result.Rows)
				return err
			}
			return nil
		},
	}
	cmd.Flags().StringVar(&o.configPath, "config", "", "path to i18n.yml with storage.adapter=lokalise")
	cmd.Flags().StringVar(&o.projectID, "project-id", "", "Lokalise project ID; overrides storage.config.projectID")
	cmd.Flags().StringSliceVarP(&o.languages, "language", "l", nil, "translation locale(s) to include")
	cmd.Flags().StringVarP(&o.outputPath, "output", "o", "", "write CSV to file instead of stdout; use - for stdout")
	cmd.Flags().StringVar(&o.tokenEnv, "token-env", "", "environment variable containing the Lokalise API token")
	cmd.Flags().StringVar(&o.apiBaseURL, "api-base-url", "", "Lokalise API base URL")
	cmd.Flags().IntVar(&o.timeoutSeconds, "timeout-seconds", 0, "HTTP timeout in seconds")
	return cmd
}

func executeLokaliseUploadSources(cmd *cobra.Command, o lokaliseUploadSourcesOptions) error {
	files, err := validateLokaliseSourceFiles(o.files, o.format)
	if err != nil {
		return err
	}
	cfg, sourceLocale, err := resolveLokaliseUploadSourcesConfig(cmd, o, !o.dryRun)
	if err != nil {
		return err
	}
	if o.dryRun {
		format := strings.TrimSpace(o.format)
		if format == "" {
			format = "auto"
		}
		_, err := fmt.Fprintf(cmd.OutOrStdout(), "dry-run action=lokalise-upload-sources project_id=%s source_locale=%s format=%s files=%d\n", cfg.ProjectID, sourceLocale, format, len(files))
		return err
	}

	client, err := newLokaliseSourceUploader(cfg)
	if err != nil {
		return err
	}
	processed := 0
	for _, file := range files {
		result, err := client.UploadSourceFile(backgroundContext(), lokalise.SourceUploadInput{
			ProjectID:           cfg.ProjectID,
			SourceLocale:        sourceLocale,
			FilePath:            file,
			FileFormat:          strings.TrimSpace(o.format),
			Branch:              strings.TrimSpace(o.branch),
			Tags:                o.tags,
			ConvertPlaceholders: o.convertPlaceholders,
			ReplaceModified:     o.replaceModified,
			DistinguishByFile:   o.distinguishByFile,
			ApplyTM:             o.applyTM,
			SkipDetectLangISO:   o.skipDetectLangISO,
		})
		if err != nil {
			return fmt.Errorf("lokalise upload sources: %w", err)
		}
		processed++
		if _, err := fmt.Fprintf(cmd.OutOrStdout(), "uploaded file=%s process_id=%s status=%s type=%s\n", file, result.ProcessID, result.Status, result.Type); err != nil {
			return err
		}
	}
	_, err = fmt.Fprintf(cmd.OutOrStdout(), "action=lokalise-upload-sources processed=%d\n", processed)
	return err
}

func resolveLokaliseUploadSourcesConfig(cmd *cobra.Command, o lokaliseUploadSourcesOptions, requireAuth bool) (lokalise.Config, string, error) {
	cfg := lokalise.Config{}
	if strings.TrimSpace(o.configPath) != "" {
		loaded, err := i18nconfig.Load(o.configPath)
		if err != nil {
			return lokalise.Config{}, "", err
		}
		if loaded.Storage == nil {
			return lokalise.Config{}, "", fmt.Errorf("lokalise upload sources: --config must include storage.adapter=lokalise")
		}
		if !strings.EqualFold(strings.TrimSpace(loaded.Storage.Adapter), lokalise.AdapterName) {
			return lokalise.Config{}, "", fmt.Errorf("lokalise upload sources: --config storage.adapter must be %q", lokalise.AdapterName)
		}
		decoded, err := lokalise.DecodeConfig(loaded.Storage.Config)
		if err != nil {
			return lokalise.Config{}, "", fmt.Errorf("lokalise upload sources: %w", err)
		}
		cfg = decoded
	}

	if lokaliseFlagChanged(cmd, "project-id") || strings.TrimSpace(cfg.ProjectID) == "" {
		cfg.ProjectID = strings.TrimSpace(o.projectID)
	}
	if lokaliseFlagChanged(cmd, "token-env") || strings.TrimSpace(cfg.APITokenEnv) == "" {
		cfg.APITokenEnv = strings.TrimSpace(o.tokenEnv)
	}
	if lokaliseFlagChanged(cmd, "api-base-url") || strings.TrimSpace(cfg.APIBaseURL) == "" {
		cfg.APIBaseURL = strings.TrimSpace(o.apiBaseURL)
	}
	if lokaliseFlagChanged(cmd, "timeout-seconds") || cfg.TimeoutSeconds <= 0 {
		cfg.TimeoutSeconds = o.timeoutSeconds
	}
	if lokaliseFlagChanged(cmd, "source-locale") || strings.TrimSpace(cfg.SourceLanguage) == "" {
		cfg.SourceLanguage = strings.TrimSpace(o.sourceLocale)
	}

	if strings.TrimSpace(cfg.ProjectID) == "" {
		return lokalise.Config{}, "", fmt.Errorf("lokalise upload sources: --project-id is required (or projectID in --config)")
	}
	if strings.TrimSpace(cfg.SourceLanguage) == "" {
		return lokalise.Config{}, "", fmt.Errorf("lokalise upload sources: --source-locale is required (or sourceLanguage in --config)")
	}
	if requireAuth {
		resolved, err := lokalise.ResolveConfig(cfg)
		if err != nil {
			return lokalise.Config{}, "", fmt.Errorf("lokalise upload sources: %w", err)
		}
		return resolved, strings.TrimSpace(resolved.SourceLanguage), nil
	}
	if strings.TrimSpace(cfg.APITokenEnv) == "" {
		cfg.APITokenEnv = defaultLokaliseAPITokenEnv
	}
	return cfg, strings.TrimSpace(cfg.SourceLanguage), nil
}

func validateLokaliseSourceFiles(paths []string, format string) ([]string, error) {
	files := make([]string, 0, len(paths))
	for _, path := range paths {
		trimmed := strings.TrimSpace(path)
		if trimmed == "" {
			continue
		}
		info, err := os.Stat(trimmed)
		if err != nil {
			return nil, fmt.Errorf("lokalise upload sources: stat source file %q: %w", trimmed, err)
		}
		if info.IsDir() {
			return nil, fmt.Errorf("lokalise upload sources: source file %q is a directory", trimmed)
		}
		if strings.TrimSpace(format) == "" && strings.TrimPrefix(filepath.Ext(trimmed), ".") == "" {
			return nil, fmt.Errorf("lokalise upload sources: could not determine file format for %q; use --format", trimmed)
		}
		files = append(files, trimmed)
	}
	if len(files) == 0 {
		return nil, fmt.Errorf("lokalise upload sources: at least one --file is required")
	}
	return files, nil
}

// resolveLokaliseGlossaryConfig keeps the command non-interactive:
// explicit flags win, otherwise the command may reuse an existing Lokalise storage block in i18n.yml,
// and the token is resolved from --token-env or LOKALISE_API_TOKEN.
func resolveLokaliseGlossaryConfig(o lokaliseGlossaryDownloadOptions) (lokalise.Config, error) {
	cfg := lokalise.Config{
		ProjectID:      strings.TrimSpace(o.projectID),
		APITokenEnv:    strings.TrimSpace(o.tokenEnv),
		APIBaseURL:     strings.TrimSpace(o.apiBaseURL),
		TimeoutSeconds: o.timeoutSeconds,
	}

	if strings.TrimSpace(o.configPath) == "" && cfg.ProjectID == "" && !defaultI18NConfigExists() {
		return lokalise.Config{}, fmt.Errorf("lokalise glossary download: --project-id is required unless --config points to a Lokalise storage config")
	}

	if strings.TrimSpace(o.configPath) != "" || cfg.ProjectID == "" {
		loaded, err := loadLokaliseStorageConfig(o.configPath)
		if err != nil {
			if cfg.ProjectID == "" || strings.TrimSpace(o.configPath) != "" {
				return lokalise.Config{}, err
			}
		} else {
			if cfg.ProjectID == "" {
				cfg.ProjectID = loaded.ProjectID
			}
			if cfg.APITokenEnv == "" {
				cfg.APITokenEnv = loaded.APITokenEnv
			}
			if cfg.APIBaseURL == "" {
				cfg.APIBaseURL = loaded.APIBaseURL
			}
			if cfg.TimeoutSeconds <= 0 {
				cfg.TimeoutSeconds = loaded.TimeoutSeconds
			}
			cfg.APIToken = loaded.APIToken
		}
	}
	if strings.TrimSpace(cfg.ProjectID) == "" {
		return lokalise.Config{}, fmt.Errorf("lokalise glossary download: --project-id is required unless --config points to a Lokalise storage config")
	}
	if cfg.APITokenEnv == "" {
		cfg.APITokenEnv = lokalise.DefaultTokenEnvName
	}
	if strings.TrimSpace(cfg.APIToken) == "" {
		token := strings.TrimSpace(os.Getenv(cfg.APITokenEnv))
		if token == "" && cfg.APITokenEnv != lokalise.DefaultTokenEnvName {
			token = strings.TrimSpace(os.Getenv(lokalise.DefaultTokenEnvName))
		}
		if token == "" {
			if cfg.APITokenEnv != lokalise.DefaultTokenEnvName {
				return lokalise.Config{}, fmt.Errorf("lokalise glossary download: API token is required (%s or %s)", cfg.APITokenEnv, lokalise.DefaultTokenEnvName)
			}
			return lokalise.Config{}, fmt.Errorf("lokalise glossary download: API token is required (%s)", cfg.APITokenEnv)
		}
		cfg.APIToken = token
	}
	if cfg.TimeoutSeconds <= 0 {
		cfg.TimeoutSeconds = 30
	}
	return cfg, nil
}

func defaultI18NConfigExists() bool {
	for _, path := range []string{"i18n.yml", "i18n.jsonc"} {
		if _, err := os.Stat(path); err == nil {
			return true
		}
	}
	return false
}

func loadLokaliseStorageConfig(configPath string) (lokalise.Config, error) {
	return loadLokaliseStorageConfigForAction(configPath, "lokalise glossary download")
}

func loadLokaliseStorageConfigForAction(configPath string, action string) (lokalise.Config, error) {
	cfg, err := i18nconfig.Load(configPath)
	if err != nil {
		return lokalise.Config{}, fmt.Errorf("%s: load config: %w", action, err)
	}
	if cfg.Storage == nil {
		return lokalise.Config{}, fmt.Errorf("%s: storage config is required", action)
	}
	if !strings.EqualFold(strings.TrimSpace(cfg.Storage.Adapter), lokalise.AdapterName) {
		return lokalise.Config{}, fmt.Errorf("%s: storage.adapter must be %q", action, lokalise.AdapterName)
	}
	parsed, err := lokalise.ParseConfig(cfg.Storage.Config)
	if err != nil {
		return lokalise.Config{}, fmt.Errorf("%s: %w", action, err)
	}
	return parsed, nil
}

func lokaliseFlagChanged(cmd *cobra.Command, name string) bool {
	flag := cmd.Flags().Lookup(name)
	return flag != nil && flag.Changed
}

func writeLokaliseDownloadedSource(path string, content []byte, force bool) error {
	if dir := filepath.Dir(path); dir != "." {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return fmt.Errorf("lokalise download sources: mkdir output directory: %w", err)
		}
	}
	if force {
		return writeLokaliseDownloadedFileAtomic("lokalise download sources", path, content, 0o644)
	}
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		if os.IsExist(err) {
			return fmt.Errorf("lokalise download sources: output file %q already exists; use --force to overwrite", path)
		}
		return fmt.Errorf("lokalise download sources: open output file %q: %w", path, err)
	}
	if _, err := file.Write(content); err != nil {
		_ = file.Close()
		_ = os.Remove(path)
		return fmt.Errorf("lokalise download sources: write output file %q: %w", path, err)
	}
	if err := file.Close(); err != nil {
		_ = os.Remove(path)
		return fmt.Errorf("lokalise download sources: close output file %q: %w", path, err)
	}
	return nil
}

func writeLokaliseDownloadedFileAtomic(action, path string, content []byte, perm os.FileMode) error {
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
	_ = os.Chmod(path, perm)
	return nil
}

func validateLokaliseDownloadSourcesOutputPath(path string, force bool) error {
	if path == "" || path == "-" {
		return nil
	}
	if info, err := os.Stat(path); err == nil {
		if info.IsDir() {
			return fmt.Errorf("lokalise download sources: output file %q is a directory", path)
		}
		if !force {
			return fmt.Errorf("lokalise download sources: output file %q already exists; use --force to overwrite", path)
		}
	} else if !os.IsNotExist(err) {
		return fmt.Errorf("lokalise download sources: stat output file %q: %w", path, err)
	}
	return nil
}
