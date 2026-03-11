package cmd

import (
	"fmt"

	"github.com/quiet-circles/hyperlocalise/internal/i18n/syncsvc"
	"github.com/spf13/cobra"
)

func newSyncPushCmd() *cobra.Command {
	o := defaultSyncCommonOptions()
	var forceConflicts bool

	cmd := &cobra.Command{
		Use:          "push",
		Short:        "push local translation changes to remote storage",
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			if o.interactive {
				result, err := runSyncInteractiveWizard("push", o, syncInteractiveExtra{forceConflicts: forceConflicts}, cmd.OutOrStdout())
				if err != nil {
					return err
				}
				if !result.execute {
					return nil
				}
				o = result.options
				forceConflicts = result.extra.forceConflicts
			}

			rt, err := newSyncRuntime(o.configPath)
			if err != nil {
				return fmt.Errorf("initialize sync runtime: %w", err)
			}
			readReq := syncsvc.LocalReadRequest{
				Locales:     o.locales,
				SourcePaths: o.sourcePaths,
			}
			scope, err := rt.resolveScope(readReq)
			if err != nil {
				return fmt.Errorf("resolve sync scope: %w", err)
			}

			report, err := rt.svc.Push(backgroundContext(), syncsvc.PushInput{
				Adapter: rt.remote,
				Local:   rt.local,
				Read:    readReq,
				Options: syncsvc.PushOptions{
					DryRun:         o.dryRun,
					FailOnConflict: o.failOnConflict,
					ForceConflicts: forceConflicts,
				},
				Scope: scope,
			})
			if writeErr := writeSyncReport(cmd, report, o.output); writeErr != nil {
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
