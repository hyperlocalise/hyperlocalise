package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	translationconfig "github.com/quiet-circles/hyperlocalise/internal/translation/config"
	"github.com/quiet-circles/hyperlocalise/internal/translation/store"
	"github.com/quiet-circles/hyperlocalise/internal/translation/worker"
)

func main() {
	cfg := translationconfig.LoadWorkerConfig()
	if cfg.DatabaseURL == "" {
		log.Fatal("DATABASE_URL is required")
	}

	db, err := store.OpenPostgres(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("open postgres: %v", err)
	}
	defer func() {
		if closeErr := store.Close(db); closeErr != nil {
			log.Printf("close postgres: %v", closeErr)
		}
	}()

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	processor := worker.NewProcessor(store.NewRepository(db))
	log.Printf(
		"translation worker started queue_driver=%s poll_interval=%s batch_size=%d",
		cfg.QueueDriver,
		cfg.PollInterval,
		cfg.BatchSize,
	)

	// TODO: Replace the Postgres polling fallback with a real queue consumer once
	// the first broker adapter is implemented. This keeps the worker runnable while
	// Pub/Sub or SQS integration is still being built.
	if err := processor.Run(ctx, cfg.PollInterval, cfg.BatchSize); err != nil {
		log.Fatalf("run worker: %v", err)
	}
}
