package main

import (
	"context"
	"log"
	"log/slog"
	"os"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/hyperlocalise/hyperlocalise/internal/activitylog"
	"github.com/jackc/pgx/v5/pgxpool"
)

type activityLogHandler struct {
	logger *slog.Logger
	store  *activitylog.Store
}

type batchItemFailure struct {
	ItemIdentifier string `json:"itemIdentifier"`
}

type batchResponse struct {
	BatchItemFailures []batchItemFailure `json:"batchItemFailures"`
}

func (h *activityLogHandler) Handle(ctx context.Context, event events.SQSEvent) (batchResponse, error) {
	failed := make([]batchItemFailure, 0)
	for _, record := range event.Records {
		message, err := activitylog.DecodeMessage([]byte(record.Body))
		if err != nil {
			h.logger.ErrorContext(ctx, "activity_log_message_rejected", "message_id", record.MessageId, "failure", "invalid_message")
			failed = append(failed, batchItemFailure{ItemIdentifier: record.MessageId})
			continue
		}

		if err := h.store.Insert(ctx, message.Event); err != nil {
			h.logger.ErrorContext(ctx, "activity_log_persistence_failed", "event_id", message.Event.ID, "event_type", message.Event.EventType, "failure", "database_write")
			failed = append(failed, batchItemFailure{ItemIdentifier: record.MessageId})
		}
	}

	return batchResponse{BatchItemFailures: failed}, nil
}

func newHandler(ctx context.Context, databaseURL string, logger *slog.Logger) (*activityLogHandler, func(), error) {
	poolConfig, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, nil, err
	}
	poolConfig.MaxConns = 2
	pool, err := pgxpool.NewWithConfig(ctx, poolConfig)
	if err != nil {
		return nil, nil, err
	}

	pingCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if err := pool.Ping(pingCtx); err != nil {
		pool.Close()
		return nil, nil, err
	}

	return &activityLogHandler{logger: logger, store: activitylog.NewStore(pool)}, pool.Close, nil
}

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		log.Fatal("DATABASE_URL is required")
	}

	handler, closePool, err := newHandler(context.Background(), databaseURL, logger)
	if err != nil {
		log.Fatalf("configure activity log database: %v", err)
	}
	defer closePool()

	lambda.Start(handler.Handle)
}
