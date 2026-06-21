package cmd

import (
	"fmt"

	"github.com/spf13/cobra"
)

func newSyncPushCmd() *cobra.Command {
	o := defaultSyncCommonOptions()
	var forceConflicts bool

	cmd := &cobra.Command{
		Use:          "push",
		Short:        "submit source files to Hyperlocalise jobs",
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			if forceConflicts {
				return fmt.Errorf("sync push through Hyperlocalise jobs does not support --force-conflicts")
			}
			rt, err := newHyperlocaliseSyncRuntime(o.configPath, o.manifestPath, true)
			if err != nil {
				return fmt.Errorf("initialize sync runtime: %w", err)
			}

			report, err := runHyperlocalisePush(backgroundContext(), rt, o)
			if writeErr := writeHyperlocalisePushReport(cmd.OutOrStdout(), report, o.output); writeErr != nil {
				return fmt.Errorf("write sync push report: %w", writeErr)
			}
			if err != nil {
				return err
			}

			return nil
		},
	}

	addSyncCommonFlags(cmd, &o)
	cmd.Flags().BoolVar(&forceConflicts, "force-conflicts", forceConflicts, "allow overwrite when values mismatch despite conflict policies")

	return cmd
}
