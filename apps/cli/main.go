package main

import (
	"context"
	"errors"
	"fmt"
	"os"

	"github.com/hyperlocalise/hyperlocalise/apps/cli/cmd"
	"github.com/hyperlocalise/hyperlocalise/apps/cli/internal/cliotel"
)

var version = ""

func main() {
	ctx := context.Background()
	shutdown, err := cliotel.Init(ctx, version)
	if err != nil {
		fmt.Fprintf(os.Stderr, "telemetry: %v\n", err)
	}
	if shutdown != nil {
		defer func() {
			if serr := shutdown(context.Background()); serr != nil {
				fmt.Fprintf(os.Stderr, "telemetry shutdown: %v\n", serr)
			}
		}()
	}

	if err := cmd.Execute(version); err != nil {
		fmt.Fprintf(os.Stderr, "%v", err)
		if errors.Is(err, cmd.ErrInterrupted) {
			os.Exit(cmd.InterruptExitCode)
		}
		os.Exit(1)
	}
}
