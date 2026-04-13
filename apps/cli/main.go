package main

import (
	"context"
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
		os.Exit(1)
	}
}
