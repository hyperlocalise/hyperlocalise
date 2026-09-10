package cmd

import (
	"context"
	"fmt"
	"os"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/storage/lokalise"
	"github.com/spf13/cobra"
)

type lokaliseLocalesListOptions struct {
	configPath     string
	projectID      string
	branch         string
	output         string
	tokenEnv       string
	apiBaseURL     string
	timeoutSeconds int
}

type lokaliseFilesListOptions struct {
	configPath     string
	projectID      string
	filterFilename string
	branch         string
	output         string
	tokenEnv       string
	apiBaseURL     string
	timeoutSeconds int
}

type lokaliseDiscoveryClient interface {
	ListProjectLanguages(context.Context, lokalise.LocaleListInput) ([]lokalise.LocaleListItem, error)
	ListFiles(context.Context, lokalise.FileListInput) ([]lokalise.FileListItem, error)
}

var newLokaliseDiscoveryClient = func(cfg lokalise.Config) (lokaliseDiscoveryClient, error) {
	return lokalise.NewHTTPClient(cfg)
}

func newLokaliseLocalesCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "locales",
		Short: "list locales in a Lokalise project",
	}
	cmd.AddCommand(newLokaliseLocalesListCmd())
	return cmd
}

func newLokaliseLocalesListCmd() *cobra.Command {
	o := lokaliseLocalesListOptions{output: "text"}
	cmd := &cobra.Command{
		Use:          "list",
		Short:        "list locales in a Lokalise project",
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return executeLokaliseLocalesList(cmd, o)
		},
	}
	cmd.Flags().StringVar(&o.configPath, "config", "", "path to i18n.yml with storage.adapter=lokalise")
	cmd.Flags().StringVar(&o.projectID, "project-id", "", "Lokalise project ID; overrides storage.config.projectID")
	cmd.Flags().StringVar(&o.branch, "branch", "", "Lokalise branch name")
	cmd.Flags().StringVar(&o.output, "output", o.output, "output format: text or json")
	cmd.Flags().StringVar(&o.tokenEnv, "token-env", "", "environment variable containing the Lokalise API token")
	cmd.Flags().StringVar(&o.apiBaseURL, "api-base-url", "", "Lokalise API base URL")
	cmd.Flags().IntVar(&o.timeoutSeconds, "timeout-seconds", 0, "HTTP timeout in seconds")
	return cmd
}

func newLokaliseFilesCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "files",
		Short: "list files in a Lokalise project",
	}
	cmd.AddCommand(newLokaliseFilesListCmd())
	return cmd
}

func newLokaliseFilesListCmd() *cobra.Command {
	o := lokaliseFilesListOptions{output: "text"}
	cmd := &cobra.Command{
		Use:          "list",
		Short:        "list files in a Lokalise project",
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return executeLokaliseFilesList(cmd, o)
		},
	}
	cmd.Flags().StringVar(&o.configPath, "config", "", "path to i18n.yml with storage.adapter=lokalise")
	cmd.Flags().StringVar(&o.projectID, "project-id", "", "Lokalise project ID; overrides storage.config.projectID")
	cmd.Flags().StringVar(&o.filterFilename, "filter-filename", "", "substring filter on filename (not a glob)")
	cmd.Flags().StringVar(&o.branch, "branch", "", "Lokalise branch name")
	cmd.Flags().StringVar(&o.output, "output", o.output, "output format: text or json")
	cmd.Flags().StringVar(&o.tokenEnv, "token-env", "", "environment variable containing the Lokalise API token")
	cmd.Flags().StringVar(&o.apiBaseURL, "api-base-url", "", "Lokalise API base URL")
	cmd.Flags().IntVar(&o.timeoutSeconds, "timeout-seconds", 0, "HTTP timeout in seconds")
	return cmd
}

func executeLokaliseLocalesList(cmd *cobra.Command, o lokaliseLocalesListOptions) error {
	cfg, err := resolveLokaliseListConfig(o.configPath, o.projectID, o.tokenEnv, o.apiBaseURL, o.timeoutSeconds, "lokalise locales list")
	if err != nil {
		return err
	}
	client, err := newLokaliseDiscoveryClient(cfg)
	if err != nil {
		return err
	}
	locales, err := client.ListProjectLanguages(lokaliseCommandContext(cmd), lokalise.LocaleListInput{
		ProjectID: cfg.ProjectID,
		Branch:    strings.TrimSpace(o.branch),
	})
	if err != nil {
		return err
	}
	if locales == nil {
		locales = []lokalise.LocaleListItem{}
	}
	return writeEncodedOutput(cmd.OutOrStdout(), o.output, func() error {
		for _, locale := range locales {
			if _, err := fmt.Fprintf(cmd.OutOrStdout(), "id=%d iso=%s name=%s\n", locale.LanguageID, locale.LanguageISO, locale.LanguageName); err != nil {
				return err
			}
		}
		return nil
	}, locales)
}

func executeLokaliseFilesList(cmd *cobra.Command, o lokaliseFilesListOptions) error {
	cfg, err := resolveLokaliseListConfig(o.configPath, o.projectID, o.tokenEnv, o.apiBaseURL, o.timeoutSeconds, "lokalise files list")
	if err != nil {
		return err
	}
	client, err := newLokaliseDiscoveryClient(cfg)
	if err != nil {
		return err
	}
	files, err := client.ListFiles(lokaliseCommandContext(cmd), lokalise.FileListInput{
		ProjectID:      cfg.ProjectID,
		Branch:         strings.TrimSpace(o.branch),
		FilterFilename: strings.TrimSpace(o.filterFilename),
	})
	if err != nil {
		return err
	}
	if files == nil {
		files = []lokalise.FileListItem{}
	}
	return writeEncodedOutput(cmd.OutOrStdout(), o.output, func() error {
		for _, file := range files {
			if _, err := fmt.Fprintf(cmd.OutOrStdout(), "id=%d filename=%s keys=%d\n", file.FileID, file.Filename, file.KeyCount); err != nil {
				return err
			}
		}
		return nil
	}, files)
}

func resolveLokaliseListConfig(configPath, projectID, tokenEnv, apiBaseURL string, timeoutSeconds int, action string) (lokalise.Config, error) {
	cfg := lokalise.Config{
		ProjectID:      strings.TrimSpace(projectID),
		APITokenEnv:    strings.TrimSpace(tokenEnv),
		APIBaseURL:     strings.TrimSpace(apiBaseURL),
		TimeoutSeconds: timeoutSeconds,
	}

	if strings.TrimSpace(configPath) == "" && cfg.ProjectID == "" && !defaultI18NConfigExists() {
		return lokalise.Config{}, fmt.Errorf("%s: --project-id is required unless --config points to a Lokalise storage config", action)
	}

	if strings.TrimSpace(configPath) != "" || cfg.ProjectID == "" {
		loaded, err := loadLokaliseStorageConfigForAction(configPath, action)
		if err != nil {
			if cfg.ProjectID == "" || strings.TrimSpace(configPath) != "" {
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
		return lokalise.Config{}, fmt.Errorf("%s: --project-id is required unless --config points to a Lokalise storage config", action)
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
				return lokalise.Config{}, fmt.Errorf("%s: API token is required (%s or %s)", action, cfg.APITokenEnv, lokalise.DefaultTokenEnvName)
			}
			return lokalise.Config{}, fmt.Errorf("%s: API token is required (%s)", action, cfg.APITokenEnv)
		}
		cfg.APIToken = token
	}
	if cfg.TimeoutSeconds <= 0 {
		cfg.TimeoutSeconds = 30
	}
	return cfg, nil
}
