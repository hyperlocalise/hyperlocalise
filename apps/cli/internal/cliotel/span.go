package cliotel

import (
	"strings"

	"github.com/spf13/cobra"
)

// CommandSpanName returns a stable span name from the cobra command path (e.g. "hyperlocalise.run").
func CommandSpanName(cmd *cobra.Command) string {
	return strings.ReplaceAll(strings.TrimSpace(cmd.CommandPath()), " ", ".")
}
