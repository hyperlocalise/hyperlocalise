package cmd

import (
	"context"

	"github.com/spf13/cobra"
)

type syncCommonOptions struct {
	configPath   string
	locales      []string
	dryRun       bool
	output       string
	manifestPath string
}

func defaultSyncCommonOptions() syncCommonOptions {
	return syncCommonOptions{
		output: "text",
	}
}

func newSyncCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "sync",
		Short: "submit and retrieve translations from Hyperlocalise",
	}

	cmd.AddCommand(newSyncPullCmd())
	cmd.AddCommand(newSyncPushCmd())

	return cmd
}

func addSyncCommonFlags(cmd *cobra.Command, o *syncCommonOptions) {
	cmd.Flags().StringVar(&o.configPath, "config", "", "path to i18n config")
	cmd.Flags().StringSliceVar(&o.locales, "locale", nil, "target locale(s) to sync")
	cmd.Flags().BoolVar(&o.dryRun, "dry-run", o.dryRun, "preview changes without applying")
	cmd.Flags().StringVar(&o.output, "output", o.output, "output format: text, json, or markdown")
	cmd.Flags().StringVar(&o.manifestPath, "manifest", o.manifestPath, "path to Hyperlocalise jobs manifest")
}

func backgroundContext() context.Context {
	return context.Background()
}
