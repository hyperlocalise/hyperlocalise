package cmd

import (
	"context"
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

type lokaliseGlossaryCSVWriter interface {
	WriteGlossaryCSV(context.Context, lokalise.GlossaryDownloadInput, io.Writer) (lokalise.GlossaryDownloadResult, error)
}

var newLokaliseGlossaryCSVWriter = func(cfg lokalise.Config) (lokaliseGlossaryCSVWriter, error) {
	return lokalise.NewHTTPClient(cfg)
}

func newLokaliseCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "lokalise",
		Short: "Lokalise workflow commands",
	}
	cmd.AddCommand(newLokaliseGlossaryCmd())
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
				APIToken:  cfg.APIToken,
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
