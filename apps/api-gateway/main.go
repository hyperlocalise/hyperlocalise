package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os/signal"
	"syscall"

	httpserver "github.com/quiet-circles/hyperlocalise/apps/api-gateway/internal/http"
	"github.com/quiet-circles/hyperlocalise/pkg/client/tmsgrpc"
	platformconfig "github.com/quiet-circles/hyperlocalise/pkg/platform/config"
	"github.com/quiet-circles/hyperlocalise/pkg/platform/observability"
)

func main() {
	cfg := platformconfig.LoadServiceConfig("api-gateway", 8080)
	logger := observability.NewLogger(cfg.ServiceName)
	backend := tmsgrpc.NewStubBackend()
	server := httpserver.NewServer(cfg, backend, logger)

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	logger.Printf("starting %s on %s", cfg.ServiceName, cfg.Address())

	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
		defer cancel()

		if err := server.Shutdown(shutdownCtx); err != nil {
			logger.Printf("shutdown error: %v", err)
		}
	}()

	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}
