package main

import (
	"context"
	"log"
	"net"
	"os"
	"os/signal"
	"syscall"

	translationservice "github.com/quiet-circles/hyperlocalise/api/services/translation"
	translationapp "github.com/quiet-circles/hyperlocalise/internal/translation/app"
	translationconfig "github.com/quiet-circles/hyperlocalise/internal/translation/config"
	queueprovider "github.com/quiet-circles/hyperlocalise/internal/translation/queue/provider"
	"github.com/quiet-circles/hyperlocalise/internal/translation/store"
	translationv1 "github.com/quiet-circles/hyperlocalise/pkg/api/proto/hyperlocalise/translation/v1"
	"google.golang.org/grpc"
)

func main() {
	cfg := translationconfig.LoadServiceConfig()
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

	repository := store.NewRepository(db)
	publisher, err := queueprovider.NewPublisher(context.Background(), queueprovider.Config{
		Driver:             cfg.QueueDriver,
		GCPPubSubProjectID: cfg.GCPPubSubProjectID,
		GCPPubSubTopicID:   cfg.GCPPubSubTopicID,
	})
	if err != nil {
		log.Fatalf("create publisher: %v", err)
	}
	defer func() {
		if closeErr := publisher.Close(); closeErr != nil {
			log.Printf("close publisher: %v", closeErr)
		}
	}()

	app := translationapp.NewService(repository, publisher, cfg.QueueDriver)

	listener, err := net.Listen("tcp", cfg.ListenAddr)
	if err != nil {
		log.Fatalf("listen %q: %v", cfg.ListenAddr, err)
	}

	grpcServer := grpc.NewServer()
	translationv1.RegisterTranslationServiceServer(grpcServer, translationservice.NewService(app))

	log.Printf("translation service listening on %s", cfg.ListenAddr)

	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		<-sigCh
		log.Println("shutting down gracefully")
		grpcServer.GracefulStop()
	}()

	if err := grpcServer.Serve(listener); err != nil {
		log.Fatalf("serve grpc: %v", err)
	}
}
