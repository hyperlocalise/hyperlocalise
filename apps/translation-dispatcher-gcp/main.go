package main

import (
	"context"
	"errors"
	"log"
	"os/signal"
	"syscall"
	"time"

	translationconfig "github.com/hyperlocalise/hyperlocalise/internal/translation/config"
	translationdispatcher "github.com/hyperlocalise/hyperlocalise/internal/translation/dispatcher"
	queueprovider "github.com/hyperlocalise/hyperlocalise/internal/translation/queue/provider"
	"github.com/hyperlocalise/hyperlocalise/internal/translation/store"
)

const startupTimeout = 5 * time.Second

func main() {
	cfg := translationconfig.LoadDispatcherConfig()
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

	startupCtx, cancel := context.WithTimeout(context.Background(), startupTimeout)
	defer cancel()
	publisher, err := queueprovider.NewPublisher(startupCtx, queueprovider.Config{
		Driver:             cfg.QueueDriver,
		GCPPubSubProjectID: cfg.GCPPubSubProjectID,
		GCPPubSubTopicID:   cfg.GCPPubSubTopicID,
	})
	if err != nil {
		if startupCtx.Err() == context.DeadlineExceeded {
			log.Fatalf("create publisher timed out after %s: %v", startupTimeout, err)
		}
		log.Fatalf("create publisher: %v", err)
	}
	defer func() {
		if closeErr := publisher.Close(); closeErr != nil {
			log.Printf("close publisher: %v", closeErr)
		}
	}()

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	dispatcher := translationdispatcher.New(store.NewRepository(db), publisher, translationdispatcher.Config{
		PollInterval:   cfg.PollInterval,
		BatchSize:      cfg.BatchSize,
		LeaseDuration:  cfg.LeaseDuration,
		MaxAttempts:    cfg.MaxAttempts,
		InitialBackoff: cfg.InitialBackoff,
		MaxBackoff:     cfg.MaxBackoff,
	})

	log.Printf("translation dispatcher started queue_driver=%s poll_interval=%s", cfg.QueueDriver, cfg.PollInterval)
	if err := dispatcher.Run(ctx); err != nil && !errors.Is(err, context.Canceled) {
		log.Fatalf("run dispatcher: %v", err)
	}
	log.Println("translation dispatcher stopped")
}
