package cmd

import (
	"fmt"

	"github.com/hyperlocalise/hyperlocalise/apps/cli/internal/i18n/syncsvc"
	config "github.com/hyperlocalise/hyperlocalise/pkg/i18nconfig"
	"github.com/spf13/cobra"
)

func newSyncPullCmd() *cobra.Command {
	o := defaultSyncCommonOptions()
	var failOnConflict bool
	var applyCuratedOverDraft bool

	cmd := &cobra.Command{
		Use:          "pull",
		Short:        "download translated files from Hyperlocalise or pull entries from a TMS adapter",
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
				rt, err := newHyperlocaliseSyncRuntime(o.configPath)
				if err != nil {
					return fmt.Errorf("initialize sync runtime: %w", err)
				}

				report, err := runHyperlocalisePull(backgroundContext(), rt, o)
				if writeErr := writeHyperlocalisePullReport(cmd.OutOrStdout(), report, o.output); writeErr != nil {
					return fmt.Errorf("write sync pull report: %w", writeErr)
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
				report, err := runTMSPull(backgroundContext(), adapter, local, syncsvc.LocalReadRequest{Locales: locales}, syncsvc.PullOptions{
					DryRun:                o.dryRun,
					FailOnConflict:        failOnConflict,
					ApplyCuratedOverDraft: applyCuratedOverDraft,
				})
				if writeErr := writeTMSReport(cmd.OutOrStdout(), report, o.output, o.dryRun); writeErr != nil {
					return fmt.Errorf("write sync pull report: %w", writeErr)
				}
				return err
			default:
				return fmt.Errorf("sync requires top-level \"hyperlocalise\" or \"storage.adapter\"")
			}
		},
	}

	addSyncCommonFlags(cmd, &o)
	cmd.Flags().BoolVar(&failOnConflict, "fail-on-conflict", failOnConflict, "exit non-zero when the TMS sync report contains conflicts")
	cmd.Flags().BoolVar(&applyCuratedOverDraft, "apply-curated-over-draft", applyCuratedOverDraft, "allow remote curated values to replace local LLM drafts (TMS adapters only)")
	return cmd
}
