package main

import (
	"context"
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
	logger      *slog.Logger
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

const (
	databaseConnectionTimeout     = 5 * time.Second
	databaseInitializationTimeout = 10 * time.Second
)

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

	d.log(ctx, "activity_log_database_url_fetch_started")
	databaseURL, err := d.provider.Load(ctx)
	if err != nil {
		d.log(ctx, "activity_log_database_url_fetch_failed", "error", err)
		return nil, fmt.Errorf("load database URL: %w", err)
	}
	d.log(ctx, "activity_log_database_url_fetched", "database_url_target", summarizeDatabaseURL(databaseURL))
	if d.store != nil && databaseURL == d.databaseURL {
		d.log(ctx, "activity_log_database_pool_reused")
		return d.store, nil
	}

	d.log(ctx, "activity_log_database_url_parse_started")
	poolConfig, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		d.log(ctx, "activity_log_database_url_parse_failed", "error", err)
		return nil, fmt.Errorf("invalid database URL: %w", err)
	}
	poolConfig.MaxConns = 2
	poolConfig.ConnConfig.ConnectTimeout = databaseConnectionTimeout
	d.log(ctx, "activity_log_database_pool_creation_started", "host", poolConfig.ConnConfig.Host, "port", poolConfig.ConnConfig.Port, "database", poolConfig.ConnConfig.Database)
	pool, err := pgxpool.NewWithConfig(ctx, poolConfig)
	if err != nil {
		d.log(ctx, "activity_log_database_pool_creation_failed", "error", err)
		return nil, fmt.Errorf("create database connection pool: %w", err)
	}

	d.log(ctx, "activity_log_database_ping_started")
	pingCtx, cancel := context.WithTimeout(ctx, databaseConnectionTimeout)
	defer cancel()
	if err := pool.Ping(pingCtx); err != nil {
		pool.Close()
		d.log(ctx, "activity_log_database_ping_failed", "host", poolConfig.ConnConfig.Host, "port", poolConfig.ConnConfig.Port, "error", err)
		return nil, fmt.Errorf(
			"database connection failed (host=%s port=%d): %w",
			poolConfig.ConnConfig.Host,
			poolConfig.ConnConfig.Port,
			err,
		)
	}

	oldPool := d.pool
	d.pool = pool
	d.store = activitylog.NewStore(pool)
	d.databaseURL = databaseURL
	if oldPool != nil {
		oldPool.Close()
	}
	d.log(ctx, "activity_log_database_connected", "host", poolConfig.ConnConfig.Host, "port", poolConfig.ConnConfig.Port, "database", poolConfig.ConnConfig.Database)
	return d.store, nil
}

func (d *databaseConnection) log(ctx context.Context, message string, args ...any) {
	if d.logger != nil {
		d.logger.InfoContext(ctx, message, args...)
	}
}

func summarizeDatabaseURL(raw string) string {
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Hostname() == "" {
		return "invalid"
	}
	port := parsed.Port()
	if port == "" {
		port = "5432"
	}
	database := strings.TrimPrefix(parsed.EscapedPath(), "/")
	return fmt.Sprintf("%s://%s:%s/%s", parsed.Scheme, parsed.Hostname(), port, database)
}

func newSecretBackedHandler(ctx context.Context, provider interface {
	Load(context.Context) (string, error)
}, logger *slog.Logger,
) (*activityLogHandler, func(), error) {
	database := &databaseConnection{provider: provider, logger: logger}
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
	logger.Info("activity_log_initialization_started")
	logger.Info("activity_log_secret_configuration_load_started")
	secretConfig, err := secretstore.ConfigFromEnv()
	if err != nil {
		logger.Error("activity_log_secret_configuration_load_failed", "error", err)
		log.Fatal(err)
	}
	logger.Info("activity_log_secret_configuration_loaded", "secret_arn", secretConfig.ARN, "secret_key", secretConfig.Key)
	logger.Info("activity_log_aws_configuration_load_started")
	awsConfig, err := config.LoadDefaultConfig(context.Background())
	if err != nil {
		log.Fatalf("load AWS configuration: %v", err)
	}
	logger.Info("activity_log_aws_configuration_loaded")
	secretLoader, err := secretstore.NewLoader(awssecretsmanager.NewFromConfig(awsConfig), secretConfig)
	if err != nil {
		log.Fatalf("configure database secret loader: %v", err)
	}
	logger.Info("activity_log_secret_loader_configured")

	initCtx, cancel := context.WithTimeout(context.Background(), databaseInitializationTimeout)
	defer cancel()
	logger.Info("activity_log_database_initialization_started")
	handler, closePool, err := newSecretBackedHandler(initCtx, secretLoader, logger)
	if err != nil {
		log.Fatalf("configure activity log database: %v", err)
	}
	defer closePool()

	lambda.Start(handler.Handle)
}
