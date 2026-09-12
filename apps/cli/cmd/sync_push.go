package cmd

import (
	"fmt"

	"github.com/hyperlocalise/hyperlocalise/apps/cli/internal/i18n/syncsvc"
	config "github.com/hyperlocalise/hyperlocalise/pkg/i18nconfig"
	"github.com/spf13/cobra"
)

func newSyncPushCmd() *cobra.Command {
	o := defaultSyncCommonOptions()
	var forceConflicts bool
	var failOnConflict bool

	cmd := &cobra.Command{
		Use:          "push",
		Short:        "upload source files to Hyperlocalise or push entries to a TMS adapter",
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			cfg, err := config.LoadForCLI(o.configPath)
			if err != nil {
				return err
			}
			mode, err := resolveSyncMode(cfg)
			if err != nil {
				return err
			}

			switch mode {
			case syncModeNative:
				if forceConflicts {
					return fmt.Errorf("sync push does not support --force-conflicts")
				}
				rt, err := newHyperlocaliseSyncRuntime(o.configPath)
				if err != nil {
					return fmt.Errorf("initialize sync runtime: %w", err)
				}

				report, err := runHyperlocalisePush(backgroundContext(), rt, o)
				if writeErr := writeHyperlocalisePushReport(cmd.OutOrStdout(), report, o.output); writeErr != nil {
					return fmt.Errorf("write sync push report: %w", writeErr)
				}
				return err
			case syncModeTMS:
				adapter, err := newTMSAdapter(cfg)
				if err != nil {
					return fmt.Errorf("initialize storage adapter: %w", err)
				}
				local, err := newTMSLocalStore(cfg, o.configPath)
				if err != nil {
					return fmt.Errorf("initialize local store: %w", err)
				}
				locales, err := resolveTMSLocales(cfg, o.locales)
				if err != nil {
					return err
				}
				report, err := runTMSPush(backgroundContext(), adapter, local, syncsvc.LocalReadRequest{Locales: locales}, syncsvc.PushOptions{
					DryRun:         o.dryRun,
					FailOnConflict: failOnConflict,
					ForceConflicts: forceConflicts,
				})
				if writeErr := writeTMSReport(cmd.OutOrStdout(), report, o.output, o.dryRun); writeErr != nil {
					return fmt.Errorf("write sync push report: %w", writeErr)
				}
				return err
			default:
				return fmt.Errorf("sync requires top-level \"hyperlocalise\" or \"storage.adapter\"")
			}
		},
	}

	addSyncCommonFlags(cmd, &o)
	cmd.Flags().BoolVar(&forceConflicts, "force-conflicts", forceConflicts, "allow overwrite when values mismatch despite conflict policies (TMS adapters only)")
	cmd.Flags().BoolVar(&failOnConflict, "fail-on-conflict", failOnConflict, "exit non-zero when the TMS sync report contains conflicts")

	return cmd
}
