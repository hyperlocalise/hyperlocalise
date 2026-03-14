package main

import (
	"fmt"

	platformconfig "github.com/quiet-circles/hyperlocalise/pkg/platform/config"
	"github.com/quiet-circles/hyperlocalise/pkg/platform/observability"
)

func main() {
	cfg := platformconfig.LoadServiceConfig("memorysvc", 9093)
	logger := observability.NewLogger(cfg.ServiceName)
	logger.Printf("memory service scaffold listening target %s", cfg.Address())
	fmt.Println(cfg.Address())
}
