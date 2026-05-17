package cmd

import (
	"context"
	"fmt"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/storage/lokalise"
	i18nconfig "github.com/hyperlocalise/hyperlocalise/pkg/i18nconfig"
	"github.com/spf13/cobra"
)

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

type lokaliseGlossaryCSVWriter interface {
	WriteGlossaryCSV(context.Context, lokalise.GlossaryDownloadInput, io.Writer) (lokalise.GlossaryDownloadResult, error)
}

type lokaliseTranslationDownloader interface {
	DownloadTranslationFiles(context.Context, lokalise.TranslationFileDownloadRequest) (lokalise.TranslationFileDownloadResult, error)
}

var newLokaliseGlossaryCSVWriter = func(cfg lokalise.Config) (lokaliseGlossaryCSVWriter, error) {
	return lokalise.NewHTTPClient(cfg)
}

var newLokaliseTranslationDownloader = func(cfg lokalise.Config) (lokaliseTranslationDownloader, error) {
	return lokalise.NewHTTPClient(cfg)
}

func newLokaliseCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "lokalise",
		Short: "Lokalise workflow commands",
	}
	cmd.AddCommand(newLokaliseDownloadCmd())
	cmd.AddCommand(newLokaliseGlossaryCmd())
	return cmd
}

func newLokaliseDownloadCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "download",
		Short: "download files from Lokalise",
	}
	cmd.AddCommand(newLokaliseDownloadTranslationsCmd())
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
			_, err := cmd.OutOrStdout().Write(file.Content)
			return err
		}
		outputExisted := false
		if _, err := os.Stat(output); err == nil {
			outputExisted = true
		}
		if err := writeLokaliseDownloadedTranslation(output, file.Content, o.force); err != nil {
			removeLokaliseDownloadedOutputs(writtenOutputs)
			return err
		}
		if !outputExisted {
			writtenOutputs = append(writtenOutputs, output)
		}
		if _, err := fmt.Fprintf(cmd.OutOrStdout(), "downloaded file=%s bytes=%d locale=%s format=%s\n", output, len(file.Content), file.Locale, req.Format); err != nil {
			removeLokaliseDownloadedOutputs(writtenOutputs)
			return err
		}
	}
	return nil
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
		loaded, err := loadLokaliseStorageConfigForAction(o.configPath, "lokalise download translations")
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
		cfg.APITokenEnv = "LOKALISE_API_TOKEN"
	}
	if strings.TrimSpace(cfg.APIToken) == "" {
		if !requireAuth {
			cfg.APIToken = "dry-run"
		} else {
			token := strings.TrimSpace(os.Getenv(cfg.APITokenEnv))
			if token == "" && cfg.APITokenEnv != "LOKALISE_API_TOKEN" {
				token = strings.TrimSpace(os.Getenv("LOKALISE_API_TOKEN"))
			}
			if token == "" {
				if cfg.APITokenEnv != "LOKALISE_API_TOKEN" {
					return lokalise.Config{}, lokalise.TranslationFileDownloadRequest{}, nil, fmt.Errorf("lokalise download translations: API token is required (%s or LOKALISE_API_TOKEN)", cfg.APITokenEnv)
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
	return projectID + ":" + url.PathEscape(branch), nil
}

func lokaliseTranslationOutputPaths(output string, locales []string) ([]string, error) {
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
		return nil, fmt.Errorf("lokalise download translations: --output with %%locale%% is required when downloading multiple target locales")
	}
	if !strings.Contains(output, "%locale%") {
		return nil, fmt.Errorf("lokalise download translations: --output must include %%locale%% when downloading multiple target locales")
	}
	paths := make([]string, 0, len(locales))
	for _, locale := range locales {
		paths = append(paths, strings.ReplaceAll(output, "%locale%", locale))
	}
	return paths, nil
}

func writeLokaliseDownloadedTranslation(path string, content []byte, force bool) error {
	if err := validateLokaliseDownloadOutputPath(path, force); err != nil {
		return err
	}
	if path == "" || path == "-" {
		return fmt.Errorf("lokalise download translations: output file path is required")
	}
	if dir := filepath.Dir(path); dir != "." {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return fmt.Errorf("lokalise download translations: mkdir output directory: %w", err)
		}
	}
	if force {
		return writeLokaliseDownloadedFileAtomic(path, content, 0o644)
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

func writeLokaliseDownloadedFileAtomic(path string, content []byte, perm os.FileMode) error {
	dir := filepath.Dir(path)
	file, err := os.CreateTemp(dir, "."+filepath.Base(path)+".tmp-*")
	if err != nil {
		return fmt.Errorf("lokalise download translations: create temp output file %q: %w", path, err)
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
		return fmt.Errorf("lokalise download translations: write temp output file %q: %w", path, err)
	}
	if err := file.Sync(); err != nil {
		_ = file.Close()
		return fmt.Errorf("lokalise download translations: sync temp output file %q: %w", path, err)
	}
	if err := file.Close(); err != nil {
		return fmt.Errorf("lokalise download translations: close temp output file %q: %w", path, err)
	}
	if err := os.Rename(tempPath, path); err != nil {
		return fmt.Errorf("lokalise download translations: replace output file %q: %w", path, err)
	}
	renamed = true
	_ = os.Chmod(path, perm)
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
	out := make([]string, 0, len(values))
	seen := make(map[string]struct{}, len(values))
	for _, value := range values {
		for _, part := range strings.Split(value, ",") {
			trimmed := strings.TrimSpace(part)
			if trimmed == "" {
				continue
			}
			key := strings.ToLower(trimmed)
			if _, ok := seen[key]; ok {
				continue
			}
			seen[key] = struct{}{}
			out = append(out, trimmed)
		}
	}
	return out
}

func newLokaliseGlossaryCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "glossary",
		Short: "Lokalise glossary commands",
	}
	cmd.AddCommand(newLokaliseGlossaryDownloadCmd())
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
		cfg.APITokenEnv = "LOKALISE_API_TOKEN"
	}
	if strings.TrimSpace(cfg.APIToken) == "" {
		token := strings.TrimSpace(os.Getenv(cfg.APITokenEnv))
		if token == "" && cfg.APITokenEnv != "LOKALISE_API_TOKEN" {
			token = strings.TrimSpace(os.Getenv("LOKALISE_API_TOKEN"))
		}
		if token == "" {
			if cfg.APITokenEnv != "LOKALISE_API_TOKEN" {
				return lokalise.Config{}, fmt.Errorf("lokalise glossary download: API token is required (%s or LOKALISE_API_TOKEN)", cfg.APITokenEnv)
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
