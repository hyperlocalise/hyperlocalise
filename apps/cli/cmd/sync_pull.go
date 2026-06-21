package cmd

import (
	"fmt"

	"github.com/spf13/cobra"
)

func newSyncPullCmd() *cobra.Command {
	o := defaultSyncCommonOptions()

	cmd := &cobra.Command{
		Use:          "pull",
		Short:        "download translated files reconstructed by the Hyperlocalise API",
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			rt, err := newHyperlocaliseSyncRuntime(o.configPath)
			if err != nil {
				return fmt.Errorf("initialize sync runtime: %w", err)
			}

			report, err := runHyperlocalisePull(backgroundContext(), rt, o)
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
	return cmd
}
