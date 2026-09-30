package main

import (
	"context"
	"log/slog"
	"os"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
)

const dummyFailureReason = "glossary interchange worker is not implemented"

type batchItemFailure struct {
	ItemIdentifier string `json:"itemIdentifier"`
}

type batchResponse struct {
	BatchItemFailures []batchItemFailure `json:"batchItemFailures"`
}

type glossaryInterchangeHandler struct {
	logger *slog.Logger
}

func (h *glossaryInterchangeHandler) Handle(ctx context.Context, event events.SQSEvent) (batchResponse, error) {
	startedAt := time.Now()
	if err := ctx.Err(); err != nil {
		return batchResponse{}, err
	}

	h.logger.InfoContext(ctx, "glossary_interchange_dummy_batch_started",
		"record_count", len(event.Records),
	)

	failed := make([]batchItemFailure, 0, len(event.Records))
	for _, record := range event.Records {
		if err := ctx.Err(); err != nil {
			return batchResponse{}, err
		}

		h.logger.WarnContext(ctx, "glossary_interchange_dummy_record_rejected",
			"message_id", record.MessageId,
			"body_bytes", len(record.Body),
			"reason", dummyFailureReason,
		)
		failed = append(failed, batchItemFailure{ItemIdentifier: record.MessageId})
	}

	h.logger.InfoContext(ctx, "glossary_interchange_dummy_batch_completed",
		"record_count", len(event.Records),
		"failure_count", len(failed),
		"elapsed_ms", time.Since(startedAt).Milliseconds(),
	)
	return batchResponse{BatchItemFailures: failed}, nil
}

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	logger.Info("glossary_interchange_dummy_initialization_completed")
	lambda.Start((&glossaryInterchangeHandler{logger: logger}).Handle)
}
