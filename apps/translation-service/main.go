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
	"github.com/quiet-circles/hyperlocalise/internal/translation/objectstore"
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
	objectStoreConfig := objectStoreConfigForService(cfg)
	storeDriver, err := objectstore.New(context.Background(), objectStoreConfig)
	if err != nil {
		log.Fatalf("create object store: %v", err)
	}
	bucket, err := objectstore.BucketForDriver(objectStoreConfig)
	if err != nil {
		log.Fatalf("resolve object store bucket: %v", err)
	}
	app := translationapp.NewService(repository, cfg.QueueDriver, cfg.ObjectStoreDriver, storeDriver, bucket)

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

func objectStoreConfigForService(cfg translationconfig.ServiceConfig) objectstore.Config {
	switch cfg.ObjectStoreDriver {
	case objectstore.DriverGCP:
		return objectstore.Config{
			Driver:               cfg.ObjectStoreDriver,
			GCPBucket:            cfg.GCPBucket,
			GCPSigningAccount:    cfg.GCPSigningAccount,
			GCPSigningPrivateKey: cfg.GCPSigningPrivateKey,
		}
	case objectstore.DriverAWS:
		return objectstore.Config{
			Driver:             cfg.ObjectStoreDriver,
			AWSBucket:          cfg.AWSBucket,
			AWSRegion:          cfg.AWSRegion,
			AWSAccessKeyID:     cfg.AWSAccessKeyID,
			AWSSecretAccessKey: cfg.AWSSecretAccessKey,
			AWSSessionToken:    cfg.AWSSessionToken,
			AWSEndpoint:        cfg.AWSEndpoint,
		}
	default:
		return objectstore.Config{Driver: cfg.ObjectStoreDriver}
	}
}
