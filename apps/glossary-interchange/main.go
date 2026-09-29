package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"log/slog"
	"net/url"
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

type interchangeMessage struct {
	SchemaVersion int    `json:"schemaVersion"`
	RunID         string `json:"runId"`
	Operation     string `json:"operation"`
}

type glossaryInterchangeHandler struct {
	logger   *slog.Logger
	database *databaseConnection
	objects  *objectstore.Registry
}

type databaseConnection struct {
	mu       sync.Mutex
	provider interface {
		Load(context.Context) (string, error)
	}
	logger      *slog.Logger
	pool        *pgxpool.Pool
	databaseURL string
}

type batchItemFailure struct {
	ItemIdentifier string `json:"itemIdentifier"`
}
type batchResponse struct {
	BatchItemFailures []batchItemFailure `json:"batchItemFailures"`
}

const (
	databaseConnectionTimeout     = 5 * time.Second
	databaseInitializationTimeout = 10 * time.Second
	interchangeTimeout            = 14 * time.Minute
)

func (h *glossaryInterchangeHandler) Handle(ctx context.Context, event events.SQSEvent) (batchResponse, error) {
	pool, err := h.currentPool(ctx)
	if err != nil {
		return batchResponse{}, err
	}
	failed := make([]batchItemFailure, 0)
	for _, record := range event.Records {
		var message interchangeMessage
		if err := json.Unmarshal([]byte(record.Body), &message); err != nil || message.RunID == "" || (message.Operation != "import" && message.Operation != "export") {
			h.logger.ErrorContext(ctx, "glossary_interchange_message_rejected", "message_id", record.MessageId, "error", err)
			failed = append(failed, batchItemFailure{ItemIdentifier: record.MessageId})
			continue
		}
		runCtx, cancel := context.WithTimeout(ctx, interchangeTimeout)
		err = processRun(runCtx, pool, h.objects, message)
		cancel()
		if err != nil {
			h.logger.ErrorContext(ctx, "glossary_interchange_run_failed", "run_id", message.RunID, "operation", message.Operation, "error", err)
			failed = append(failed, batchItemFailure{ItemIdentifier: record.MessageId})
		}
	}
	return batchResponse{BatchItemFailures: failed}, nil
}

func (h *glossaryInterchangeHandler) currentPool(ctx context.Context) (*pgxpool.Pool, error) {
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
	if d.pool != nil && databaseURL == d.databaseURL {
		return d.pool, nil
	}
	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("invalid database URL: %w", err)
	}
	config.MaxConns = 2
	config.ConnConfig.ConnectTimeout = databaseConnectionTimeout
	pool, err := pgxpool.NewWithConfig(ctx, config)
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
	d.pool, d.databaseURL = pool, databaseURL
	return pool, nil
}

func summarizeDatabaseURL(raw string) string {
	p, err := url.Parse(raw)
	if err != nil || p.Hostname() == "" {
		return "invalid"
	}
	port := p.Port()
	if port == "" {
		port = "5432"
	}
	return fmt.Sprintf("%s://%s:%s/%s", p.Scheme, p.Hostname(), port, strings.TrimPrefix(p.EscapedPath(), "/"))
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
	return objectstore.NewRegistry("s3-files", map[string]objectstore.Store{"s3-files": store})
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
	database := &databaseConnection{provider: loader, logger: logger}
	if _, err := database.currentPool(ctx); err != nil {
		log.Fatalf("configure glossary interchange database: %v", err)
	}
	objects, err := newRegistry(ctx)
	if err != nil {
		log.Fatalf("configure glossary interchange object storage: %v", err)
	}
	defer database.pool.Close()
	lambda.Start((&glossaryInterchangeHandler{logger: logger, database: database, objects: objects}).Handle)
}
