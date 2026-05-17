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

type lokaliseSourceUploader interface {
	UploadSourceFile(context.Context, lokalise.SourceUploadInput) (lokalise.SourceUploadResult, error)
}

var newLokaliseGlossaryCSVWriter = func(cfg lokalise.Config) (lokaliseGlossaryCSVWriter, error) {
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
	cmd.AddCommand(newLokaliseGlossaryCmd())
	cmd.AddCommand(newLokaliseUploadCmd())
	return cmd
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
		decoded, err := decodeLokaliseStorageConfig(loaded.Storage.Config)
		if err != nil {
			return lokalise.Config{}, "", err
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

func decodeLokaliseStorageConfig(raw json.RawMessage) (lokalise.Config, error) {
	if len(raw) == 0 {
		return lokalise.Config{}, nil
	}
	var rawMap map[string]json.RawMessage
	if err := json.Unmarshal(raw, &rawMap); err != nil {
		return lokalise.Config{}, fmt.Errorf("lokalise config: decode: %w", err)
	}
	for key := range rawMap {
		if strings.EqualFold(key, "apiToken") {
			return lokalise.Config{}, fmt.Errorf("lokalise config: apiToken is not supported; use %s", defaultLokaliseAPITokenEnv)
		}
	}

	var cfg lokalise.Config
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return lokalise.Config{}, fmt.Errorf("lokalise config: decode: %w", err)
	}
	return cfg, nil
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

func lokaliseFlagChanged(cmd *cobra.Command, name string) bool {
	flag := cmd.Flags().Lookup(name)
	return flag != nil && flag.Changed
}
