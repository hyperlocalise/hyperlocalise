package cmd

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
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

type lokaliseDownloadSourcesOptions struct {
	configPath     string
	projectID      string
	sourceLocale   string
	format         string
	output         string
	tokenEnv       string
	apiBaseURL     string
	timeoutSeconds int
	force          bool
	dryRun         bool
}

type lokaliseGlossaryCSVWriter interface {
	WriteGlossaryCSV(context.Context, lokalise.GlossaryDownloadInput, io.Writer) (lokalise.GlossaryDownloadResult, error)
}

type lokaliseSourceDownloader interface {
	DownloadSourceFile(context.Context, lokalise.SourceDownloadInput) (lokalise.SourceDownloadResult, error)
}

var newLokaliseGlossaryCSVWriter = func(cfg lokalise.Config) (lokaliseGlossaryCSVWriter, error) {
	return lokalise.NewHTTPClient(cfg)
}

var newLokaliseSourceDownloader = func(cfg lokalise.Config) (lokaliseSourceDownloader, error) {
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
	cmd.AddCommand(newLokaliseDownloadSourcesCmd())
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
	cmd.Flags().BoolVar(&o.force, "force", false, "overwrite an existing output file")
	cmd.Flags().BoolVar(&o.dryRun, "dry-run", false, "preview command without downloading content")
	return cmd
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
		if !flagChanged(cmd, "project-id") && cfg.ProjectID == "" {
			cfg.ProjectID = loaded.ProjectID
		}
		if !flagChanged(cmd, "token-env") && cfg.APITokenEnv == "" {
			cfg.APITokenEnv = loaded.APITokenEnv
		}
		if !flagChanged(cmd, "api-base-url") && cfg.APIBaseURL == "" {
			cfg.APIBaseURL = loaded.APIBaseURL
		}
		if !flagChanged(cmd, "timeout-seconds") && cfg.TimeoutSeconds <= 0 {
			cfg.TimeoutSeconds = loaded.TimeoutSeconds
		}
		if !flagChanged(cmd, "source-locale") && cfg.SourceLanguage == "" {
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
	parsed, err := decodeLokaliseStorageConfig(cfg.Storage.Config)
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
	cfg, err := i18nconfig.Load(configPath)
	if err != nil {
		return lokalise.Config{}, fmt.Errorf("lokalise glossary download: load config: %w", err)
	}
	if cfg.Storage == nil {
		return lokalise.Config{}, fmt.Errorf("lokalise glossary download: storage config is required")
	}
	if !strings.EqualFold(strings.TrimSpace(cfg.Storage.Adapter), lokalise.AdapterName) {
		return lokalise.Config{}, fmt.Errorf("lokalise glossary download: storage.adapter must be %q", lokalise.AdapterName)
	}
	parsed, err := lokalise.ParseConfig(cfg.Storage.Config)
	if err != nil {
		return lokalise.Config{}, fmt.Errorf("lokalise glossary download: %w", err)
	}
	return parsed, nil
}

func decodeLokaliseStorageConfig(raw json.RawMessage) (lokalise.Config, error) {
	if len(raw) == 0 {
		return lokalise.Config{}, nil
	}
	var rawMap map[string]json.RawMessage
	if err := json.Unmarshal(raw, &rawMap); err != nil {
		return lokalise.Config{}, fmt.Errorf("lokalise config: decode: %w", err)
	}
	if _, exists := rawMap["apiToken"]; exists {
		return lokalise.Config{}, fmt.Errorf("lokalise config: apiToken is not supported; use %s", lokalise.DefaultTokenEnvName)
	}

	var cfg lokalise.Config
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return lokalise.Config{}, fmt.Errorf("lokalise config: decode: %w", err)
	}
	return cfg, nil
}

func flagChanged(cmd *cobra.Command, name string) bool {
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
	} else if err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("lokalise download sources: stat output file %q: %w", path, err)
	}
	return nil
}
