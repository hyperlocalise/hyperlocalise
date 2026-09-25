package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"testing"

	"github.com/aws/aws-lambda-go/events"
	"github.com/hyperlocalise/hyperlocalise/internal/activitylog"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/require"
)

type fakeActivityLogExecutor struct {
	err error
}

func (f fakeActivityLogExecutor) Exec(context.Context, string, ...any) (pgconn.CommandTag, error) {
	return pgconn.CommandTag{}, f.err
}

func validMessage(t *testing.T) activitylog.Message {
	t.Helper()
	return activitylog.Message{
		Event: activitylog.Event{
			ActorKind:      "system",
			CreatedAt:      "2026-09-25T00:00:00.000Z",
			EventType:      "project_created",
			ID:             "55555555-5555-4555-8555-555555555555",
			OrganizationID: "66666666-6666-4666-8666-666666666666",
			Payload:        []byte(`{"name":"Project","resourceId":"project-1"}`),
			TargetID:       "project-1",
			TargetKind:     "project",
		},
		MessageType:   activitylog.MessageType,
		SchemaVersion: activitylog.SchemaVersion,
	}
}

func TestActivityLogHandlerReturnsPartialFailures(t *testing.T) {
	message := validMessage(t)
	body, err := json.Marshal(message)
	require.NoError(t, err)

	handler := &activityLogHandler{
		logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
		store:  activitylog.NewStore(fakeActivityLogExecutor{err: errors.New("database unavailable")}),
	}

	response, err := handler.Handle(context.Background(), events.SQSEvent{Records: []events.SQSMessage{{MessageId: "message-1", Body: string(body)}}})
	require.NoError(t, err)
	require.Equal(t, []batchItemFailure{{ItemIdentifier: "message-1"}}, response.BatchItemFailures)
}
