package main

import (
	"context"
	"io"
	"log/slog"
	"testing"

	"github.com/aws/aws-lambda-go/events"
	"github.com/stretchr/testify/require"
)

func newTestHandler() *glossaryInterchangeHandler {
	return &glossaryInterchangeHandler{
		logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
	}
}

func TestGlossaryInterchangeHandlerFailsClosedPerRecord(t *testing.T) {
	t.Parallel()

	handler := newTestHandler()
	response, err := handler.Handle(context.Background(), events.SQSEvent{
		Records: []events.SQSMessage{
			{MessageId: "message-1", Body: `{"jobId":"job-1"}`},
			{MessageId: "message-2", Body: `{"jobId":"job-2"}`},
		},
	})

	require.NoError(t, err)
	require.Equal(t, batchResponse{
		BatchItemFailures: []batchItemFailure{
			{ItemIdentifier: "message-1"},
			{ItemIdentifier: "message-2"},
		},
	}, response)
}

func TestGlossaryInterchangeHandlerLeavesEmptyBatchSuccessful(t *testing.T) {
	t.Parallel()

	response, err := newTestHandler().Handle(context.Background(), events.SQSEvent{})

	require.NoError(t, err)
	require.Empty(t, response.BatchItemFailures)
}

func TestGlossaryInterchangeHandlerPropagatesCanceledContext(t *testing.T) {
	t.Parallel()

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	response, err := newTestHandler().Handle(ctx, events.SQSEvent{
		Records: []events.SQSMessage{{MessageId: "message-1"}},
	})

	require.ErrorIs(t, err, context.Canceled)
	require.Empty(t, response.BatchItemFailures)
}
