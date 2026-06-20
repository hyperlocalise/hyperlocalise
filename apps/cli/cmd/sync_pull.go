package cmd

import (
	"fmt"
	"time"

	"github.com/spf13/cobra"
)

func newSyncPullCmd() *cobra.Command {
	o := defaultSyncCommonOptions()
	var timeout time.Duration

	cmd := &cobra.Command{
		Use:          "pull",
		Short:        "download completed Hyperlocalise translation files",
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			rt, err := newHyperlocaliseSyncRuntime(o.configPath, o.manifestPath, false)
			if err != nil {
				return fmt.Errorf("initialize sync runtime: %w", err)
			}

			report, err := runHyperlocalisePull(backgroundContext(), rt, o, timeout)
			if writeErr := writeHyperlocalisePullReport(cmd.OutOrStdout(), report, o.output); writeErr != nil {
				return fmt.Errorf("write sync pull report: %w", writeErr)
			}
			if err != nil {
				return err
			}

			return nil
		},
	}

	addSyncCommonFlags(cmd, &o)
	cmd.Flags().DurationVar(&timeout, "timeout", 0, "maximum time to wait for jobs, for example 20m")
	return cmd
}
