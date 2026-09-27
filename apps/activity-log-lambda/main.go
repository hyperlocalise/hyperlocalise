package main

import (
	"context"
	"errors"
	"log"
	"log/slog"
	"os"
	"sync"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/config"
	awssecretsmanager "github.com/aws/aws-sdk-go-v2/service/secretsmanager"
	"github.com/hyperlocalise/hyperlocalise/internal/activitylog"
	secretstore "github.com/hyperlocalise/hyperlocalise/internal/secretsmanager"
	"github.com/jackc/pgx/v5/pgxpool"
)

type activityLogHandler struct {
	logger   *slog.Logger
	store    *activitylog.Store
	database *databaseConnection
}

type databaseConnection struct {
	mu       sync.Mutex
	provider interface {
		Load(context.Context) (string, error)
	}
	store       *activitylog.Store
	pool        *pgxpool.Pool
	databaseURL string
}

type batchItemFailure struct {
	ItemIdentifier string `json:"itemIdentifier"`
}

type batchResponse struct {
	BatchItemFailures []batchItemFailure `json:"batchItemFailures"`
}

func (h *activityLogHandler) Handle(ctx context.Context, event events.SQSEvent) (batchResponse, error) {
	store, err := h.currentStore(ctx)
	if err != nil {
		h.logger.ErrorContext(ctx, "activity_log_database_configuration_failed")
		return batchResponse{}, err
	}

	failed := make([]batchItemFailure, 0)
	for _, record := range event.Records {
		message, err := activitylog.DecodeMessage([]byte(record.Body))
		if err != nil {
			h.logger.ErrorContext(ctx, "activity_log_message_rejected", "message_id", record.MessageId, "failure", "invalid_message")
			failed = append(failed, batchItemFailure{ItemIdentifier: record.MessageId})
			continue
		}

		if err := store.Insert(ctx, message.Event); err != nil {
			h.logger.ErrorContext(ctx, "activity_log_persistence_failed", "event_id", message.Event.ID, "event_type", message.Event.EventType, "failure", "database_write")
			failed = append(failed, batchItemFailure{ItemIdentifier: record.MessageId})
		}
	}

	return batchResponse{BatchItemFailures: failed}, nil
}

func (h *activityLogHandler) currentStore(ctx context.Context) (*activitylog.Store, error) {
	if h.database == nil {
		return h.store, nil
	}
	return h.database.currentStore(ctx)
}

func (d *databaseConnection) currentStore(ctx context.Context) (*activitylog.Store, error) {
	d.mu.Lock()
	defer d.mu.Unlock()

	databaseURL, err := d.provider.Load(ctx)
	if err != nil {
		return nil, err
	}
	if d.store != nil && databaseURL == d.databaseURL {
		return d.store, nil
	}

	poolConfig, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, errors.New("invalid database URL")
	}
	poolConfig.MaxConns = 2
	pool, err := pgxpool.NewWithConfig(ctx, poolConfig)
	if err != nil {
		return nil, errors.New("create database connection pool")
	}

	pingCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if err := pool.Ping(pingCtx); err != nil {
		pool.Close()
		return nil, errors.New("database connection failed")
	}

	oldPool := d.pool
	d.pool = pool
	d.store = activitylog.NewStore(pool)
	d.databaseURL = databaseURL
	if oldPool != nil {
		oldPool.Close()
	}
	return d.store, nil
}

func newSecretBackedHandler(ctx context.Context, provider interface {
	Load(context.Context) (string, error)
}, logger *slog.Logger,
) (*activityLogHandler, func(), error) {
	database := &databaseConnection{provider: provider}
	if _, err := database.currentStore(ctx); err != nil {
		return nil, nil, err
	}
	return &activityLogHandler{logger: logger, database: database}, func() {
		database.mu.Lock()
		defer database.mu.Unlock()
		if database.pool != nil {
			database.pool.Close()
		}
	}, nil
}

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	secretConfig, err := secretstore.ConfigFromEnv()
	if err != nil {
		log.Fatal(err)
	}
	awsConfig, err := config.LoadDefaultConfig(context.Background())
	if err != nil {
		log.Fatalf("load AWS configuration: %v", err)
	}
	secretLoader, err := secretstore.NewLoader(awssecretsmanager.NewFromConfig(awsConfig), secretConfig)
	if err != nil {
		log.Fatalf("configure database secret loader: %v", err)
	}

	handler, closePool, err := newSecretBackedHandler(context.Background(), secretLoader, logger)
	if err != nil {
		log.Fatal("configure activity log database")
	}
	defer closePool()

	lambda.Start(handler.Handle)
}
