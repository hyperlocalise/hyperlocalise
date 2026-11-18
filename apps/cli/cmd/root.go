package cmd

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"sync"
	"syscall"
	"time"

	"github.com/hyperlocalise/hyperlocalise/apps/cli/internal/envloader"
	config "github.com/hyperlocalise/hyperlocalise/pkg/i18nconfig"
	"github.com/spf13/cobra"
)

const defaultCommandName = "hyperlocalise"

// interruptGracePeriod is how long a command may keep running after the first interrupt before
// the CLI exits anyway. Tests shorten it.
var interruptGracePeriod = 10 * time.Second

// InterruptExitCode is the conventional exit status for a process stopped by SIGINT (128 + 2).
const InterruptExitCode = 130

// ErrInterrupted reports that the command was stopped by SIGINT or SIGTERM.
var ErrInterrupted = errors.New("interrupted")

// exitProcess is replaced in tests.
var exitProcess = os.Exit

func commandName() string {
	if filepath.Base(os.Args[0]) == "hl" {
		return "hl"
	}

	return defaultCommandName
}

func newRootCmd(version string) *cobra.Command {
	cmd := &cobra.Command{
		Use:   commandName(),
		Short: "High-performance localization CLI written in Go",
		PersistentPreRunE: func(cmd *cobra.Command, args []string) error {
			if err := envloader.LoadProjectFiles(); err != nil {
				return fmt.Errorf("load env files: %w", err)
			}

			return nil
		},
		PersistentPostRun: func(cmd *cobra.Command, args []string) {
			notifyIfUpdateAvailable(cmd, version)
		},
		RunE: func(cmd *cobra.Command, args []string) error {
			return cmd.Help()
		},
	}

	cmd.AddCommand(newVersionCmd(version)) // version subcommand
	cmd.AddCommand(newInitCmd())           // init subcommand
	cmd.AddCommand(newCrowdinCmd())        // crowdin compatibility subcommands
	cmd.AddCommand(newLokaliseCmd())       // Lokalise workflow subcommands
	cmd.AddCommand(newPhraseCmd())         // Phrase file workflow subcommands
	cmd.AddCommand(newSmartlingCmd())      // Smartling compatibility subcommands
	cmd.AddCommand(newSyncPushCmd())       // push shorthand
	cmd.AddCommand(newSyncPullCmd())       // pull shorthand
	cmd.AddCommand(newSyncCmd())           // sync subcommands
	cmd.AddCommand(newRunCmd())            // run subcommand
	cmd.AddCommand(newExtractCmd())        // extract subcommand
	cmd.AddCommand(newPackCmd())           // pack subcommand
	cmd.AddCommand(newEntriesCmd())        // entries subcommand
	cmd.AddCommand(newCheckCmd())          // check subcommand
	cmd.AddCommand(newValidateCmd())       // validate source and target segments
	cmd.AddCommand(newFixCmd())            // fix subcommand
	cmd.AddCommand(newEvalCmd())           // eval subcommands
	cmd.AddCommand(newStatusCmd())         // status subcommand
	cmd.AddCommand(newUpdateCmd())         // self-update subcommand
	cmd.AddCommand(NewManCmd().Cmd)        // hidden manpage subcommand

	return cmd
}

// Execute invokes the command.
func Execute(version string) error {
	config.SetCLIVersion(version)

	ctx, stop := interruptContext(context.Background())
	defer stop()
	err := newRootCmd(version).ExecuteContext(ctx)
	if ctx.Err() != nil {
		return ErrInterrupted
	}
	if err != nil {
		return fmt.Errorf("error executing root command: %w", err)
	}

	return nil
}

// interruptContext returns a context cancelled by the first SIGINT or SIGTERM. That signal also
// restores default signal handling, so a second Ctrl+C terminates the process immediately even if
// a command ignores cancellation, and the process exits after interruptGracePeriod regardless.
func interruptContext(parent context.Context) (context.Context, context.CancelFunc) {
	ctx, cancel := context.WithCancel(parent)
	signals := make(chan os.Signal, 1)
	signal.Notify(signals, os.Interrupt, syscall.SIGTERM)
	done := make(chan struct{})
	grace, exit := interruptGracePeriod, exitProcess

	go func() {
		select {
		case <-signals:
		case <-done:
			return
		}
		signal.Stop(signals)
		cancel()
		_, _ = fmt.Fprintln(os.Stderr, "\nInterrupted, stopping… press Ctrl+C again to force quit.")
		timer := time.NewTimer(grace)
		defer timer.Stop()
		select {
		case <-timer.C:
			_, _ = fmt.Fprintln(os.Stderr, "Command did not stop in time, exiting.")
			exit(InterruptExitCode)
		case <-done:
		}
	}()

	var once sync.Once
	return ctx, func() {
		once.Do(func() {
			signal.Stop(signals)
			close(done)
			cancel()
		})
	}
}
