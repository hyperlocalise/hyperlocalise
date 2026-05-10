package cmd

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/storage/smartling"
	"github.com/spf13/cobra"
)

type smartlingGlossaryDownloadOptions struct {
	accountUID     string
	glossaryUID    string
	userIdentifier string
	userSecret     string
	userSecretEnv  string
	languages      []string
	outputPath     string
}

func newSmartlingCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "smartling",
		Short: "Smartling compatibility subcommands",
	}
	cmd.AddCommand(newSmartlingGlossaryCmd())
	return cmd
}

func newSmartlingGlossaryCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "glossary",
		Short: "Smartling glossary commands",
	}
	cmd.AddCommand(newSmartlingGlossaryDownloadCmd())
	return cmd
}

func newSmartlingGlossaryDownloadCmd() *cobra.Command {
	o := smartlingGlossaryDownloadOptions{}
	cmd := &cobra.Command{
		Use:          "download",
		Short:        "download Smartling glossary terms as CSV",
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			ctx := context.Background()
			cfg := smartling.Config{
				UserIdentifier: strings.TrimSpace(o.userIdentifier),
				UserSecret:     strings.TrimSpace(o.userSecret),
				UserSecretEnv:  strings.TrimSpace(o.userSecretEnv),
			}

			// UserSecret will be resolved from Env in ParseConfig if not explicitly set
			// but NewHTTPClient doesn't call ParseConfig.
			// Let's use a temporary way to resolve credentials if needed.
			if cfg.UserSecret == "" {
				envVar := cfg.UserSecretEnv
				if envVar == "" {
					envVar = "SMARTLING_USER_SECRET"
				}
				cfg.UserSecret = os.Getenv(envVar)
			}

			if cfg.UserIdentifier == "" {
				cfg.UserIdentifier = os.Getenv("SMARTLING_USER_IDENTIFIER")
			}

			if cfg.UserIdentifier == "" || cfg.UserSecret == "" {
				return fmt.Errorf("smartling glossary download: credentials are required (via flags or SMARTLING_USER_IDENTIFIER/SMARTLING_USER_SECRET)")
			}

			client, err := smartling.NewHTTPClient(cfg)
			if err != nil {
				return err
			}

			outputPath := strings.TrimSpace(o.outputPath)
			out := cmd.OutOrStdout()
			var closeOut func() error
			var tempPath string
			if outputPath != "" {
				file, err := os.CreateTemp(filepath.Dir(outputPath), "."+filepath.Base(outputPath)+".*.tmp")
				if err != nil {
					return fmt.Errorf("create temporary glossary csv: %w", err)
				}
				out = file
				tempPath = file.Name()
				closeOut = file.Close
			}

			result, err := client.WriteGlossaryCSV(ctx, smartling.GlossaryDownloadRequest{
				AccountUID:  o.accountUID,
				GlossaryUID: o.glossaryUID,
				Languages:   o.languages,
			}, out)

			if closeOut != nil {
				if closeErr := closeOut(); closeErr != nil && err == nil {
					err = fmt.Errorf("close glossary csv: %w", closeErr)
				}
			}

			if err != nil {
				if tempPath != "" {
					_ = os.Remove(tempPath)
				}
				return err
			}

			if outputPath != "" {
				if err := os.Rename(tempPath, outputPath); err != nil {
					_ = os.Remove(tempPath)
					return fmt.Errorf("replace glossary csv: %w", err)
				}
				_, _ = fmt.Fprintf(cmd.OutOrStdout(), "wrote %s entries=%d\n", outputPath, result.Entries)
			}

			return nil
		},
	}

	cmd.Flags().StringVar(&o.accountUID, "account-uid", "", "Smartling account UID")
	cmd.Flags().StringVar(&o.glossaryUID, "glossary-uid", "", "Smartling glossary UID")
	cmd.Flags().StringVar(&o.userIdentifier, "user-id", "", "Smartling user identifier")
	cmd.Flags().StringVar(&o.userSecret, "user-secret", "", "Smartling user secret")
	cmd.Flags().StringVar(&o.userSecretEnv, "user-secret-env", "", "Environment variable for Smartling user secret")
	cmd.Flags().StringSliceVarP(&o.languages, "language", "l", nil, "term language(s) to include")
	cmd.Flags().StringVarP(&o.outputPath, "output", "o", "", "write CSV to file instead of stdout")

	_ = cmd.MarkFlagRequired("account-uid")
	_ = cmd.MarkFlagRequired("glossary-uid")

	return cmd
}
