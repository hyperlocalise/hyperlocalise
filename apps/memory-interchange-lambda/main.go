package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"log/slog"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/config"
	awssecretsmanager "github.com/aws/aws-sdk-go-v2/service/secretsmanager"
	"github.com/hyperlocalise/hyperlocalise/internal/objectstore"
	"github.com/hyperlocalise/hyperlocalise/internal/objectstore/s3compat"
	secretstore "github.com/hyperlocalise/hyperlocalise/internal/secretsmanager"
	"github.com/jackc/pgx/v5/pgxpool"
)

type databaseConnection struct {
	mu       sync.Mutex
	provider interface {
		Load(context.Context) (string, error)
	}
	pool *pgxpool.Pool
	url  string
}

type batchItemFailure struct {
	ItemIdentifier string `json:"itemIdentifier"`
}

type batchResponse struct {
	BatchItemFailures []batchItemFailure `json:"batchItemFailures"`
}

type memoryInterchangeHandler struct {
	logger   *slog.Logger
	database *databaseConnection
	objects  *objectstore.Registry
}

const (
	databaseConnectionTimeout     = 5 * time.Second
	databaseInitializationTimeout = 10 * time.Second
	interchangeTimeout            = 14 * time.Minute
)

func (h *memoryInterchangeHandler) Handle(ctx context.Context, event events.SQSEvent) (batchResponse, error) {
	if len(event.Records) == 0 {
		return batchResponse{}, nil
	}
	pool, err := h.currentPool(ctx)
	if err != nil {
		return batchResponse{}, err
	}
	failed := make([]batchItemFailure, 0)
	for _, record := range event.Records {
		var message memoryInterchangeMessage
		if err := decodeMemoryInterchangeMessage(record.Body, &message); err != nil {
			h.logger.ErrorContext(ctx, "memory_interchange_message_rejected", "message_id", record.MessageId, "error", err)
			failed = append(failed, batchItemFailure{ItemIdentifier: record.MessageId})
			continue
		}
		runCtx, cancel := context.WithTimeout(ctx, interchangeTimeout)
		err = processMemoryInterchangeRun(runCtx, pool, h.objects, message)
		cancel()
		if err != nil {
			h.logger.ErrorContext(ctx, "memory_interchange_run_failed", "attempt_id", message.AttemptID, "operation", message.Operation, "error", err)
			failed = append(failed, batchItemFailure{ItemIdentifier: record.MessageId})
		}
	}
	return batchResponse{BatchItemFailures: failed}, nil
}

func decodeMemoryInterchangeMessage(body string, message *memoryInterchangeMessage) error {
	if err := jsonUnmarshal([]byte(body), message); err != nil {
		return errors.New("invalid memory interchange message")
	}
	if message.SchemaVersion != 1 || message.AttemptID == "" || (message.Operation != "import" && message.Operation != "export") {
		return errors.New("unsupported memory interchange message")
	}
	return nil
}

func (h *memoryInterchangeHandler) currentPool(ctx context.Context) (*pgxpool.Pool, error) {
	if h.database == nil {
		return nil, errors.New("database connection is not configured")
	}
	return h.database.currentPool(ctx)
}

func (d *databaseConnection) currentPool(ctx context.Context) (*pgxpool.Pool, error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	if d.provider == nil {
		return d.pool, nil
	}
	databaseURL, err := d.provider.Load(ctx)
	if err != nil {
		return nil, fmt.Errorf("load database URL: %w", err)
	}
	if d.pool != nil && databaseURL == d.url {
		return d.pool, nil
	}
	poolConfig, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("invalid database URL: %w", err)
	}
	poolConfig.MaxConns = 2
	poolConfig.ConnConfig.ConnectTimeout = databaseConnectionTimeout
	pool, err := pgxpool.NewWithConfig(ctx, poolConfig)
	if err != nil {
		return nil, fmt.Errorf("create database connection pool: %w", err)
	}
	pingCtx, cancel := context.WithTimeout(ctx, databaseConnectionTimeout)
	defer cancel()
	if err := pool.Ping(pingCtx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("database connection failed: %w", err)
	}
	if d.pool != nil {
		d.pool.Close()
	}
	d.pool, d.url = pool, databaseURL
	return pool, nil
}

func newRegistry(ctx context.Context) (*objectstore.Registry, error) {
	bucket := strings.TrimSpace(os.Getenv("OBJECT_STORAGE_S3_FILES_BUCKET"))
	if bucket == "" {
		return nil, errors.New("OBJECT_STORAGE_S3_FILES_BUCKET is required")
	}
	region := strings.TrimSpace(os.Getenv("OBJECT_STORAGE_S3_FILES_REGION"))
	if region == "" {
		region = "us-east-1"
	}
	store, err := s3compat.New(ctx, s3compat.Config{Provider: "s3", Bucket: bucket, Region: region, Endpoint: os.Getenv("OBJECT_STORAGE_S3_FILES_ENDPOINT")})
	if err != nil {
		return nil, err
	}
	location := strings.TrimSpace(os.Getenv("OBJECT_STORAGE_DEFAULT_LOCATION"))
	if location == "" {
		location = "s3-files"
	}
	return objectstore.NewRegistry(location, map[string]objectstore.Store{location: store})
}

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	secretConfig, err := secretstore.ConfigFromEnv()
	if err != nil {
		log.Fatal(err)
	}
	awsConfig, err := config.LoadDefaultConfig(context.Background())
	if err != nil {
		log.Fatal(err)
	}
	loader, err := secretstore.NewLoader(awssecretsmanager.NewFromConfig(awsConfig), secretConfig)
	if err != nil {
		log.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), databaseInitializationTimeout)
	defer cancel()
	database := &databaseConnection{provider: loader}
	if _, err := database.currentPool(ctx); err != nil {
		log.Fatalf("configure memory interchange database: %v", err)
	}
	objects, err := newRegistry(ctx)
	if err != nil {
		log.Fatalf("configure memory interchange object storage: %v", err)
	}
	defer database.pool.Close()
	lambda.Start((&memoryInterchangeHandler{logger: logger, database: database, objects: objects}).Handle)
}
