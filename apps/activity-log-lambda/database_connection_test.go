package main

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"strings"
	"testing"

	"github.com/aws/aws-lambda-go/events"
	"github.com/stretchr/testify/require"
)

type stubDatabaseURLProvider struct {
	url string
	err error
}

func (s stubDatabaseURLProvider) Load(context.Context) (string, error) {
	if s.err != nil {
		return "", s.err
	}
	return s.url, nil
}

func TestDatabaseConnectionCurrentStoreWrapsLoadAndParseErrors(t *testing.T) {
	t.Parallel()

	loadErr := errors.New("secrets manager unavailable")
	conn := &databaseConnection{provider: stubDatabaseURLProvider{err: loadErr}}
	_, err := conn.currentStore(context.Background())
	require.Error(t, err)
	require.ErrorIs(t, err, loadErr)
	require.True(t, strings.HasPrefix(err.Error(), "load database URL: "))

	conn = &databaseConnection{provider: stubDatabaseURLProvider{url: "not-a-postgres-url"}}
	_, err = conn.currentStore(context.Background())
	require.Error(t, err)
	require.Contains(t, err.Error(), "invalid database URL:")
	require.NotEqual(t, "invalid database URL", err.Error())
}

func TestActivityLogHandlerPropagatesDatabaseConfigurationErrors(t *testing.T) {
	t.Parallel()

	loadErr := errors.New("rotated secret missing DATABASE_URL")
	handler := &activityLogHandler{
		logger:   slog.New(slog.NewTextHandler(io.Discard, nil)),
		database: &databaseConnection{provider: stubDatabaseURLProvider{err: loadErr}},
	}

	response, err := handler.Handle(context.Background(), events.SQSEvent{
		Records: []events.SQSMessage{{MessageId: "message-1", Body: "{}"}},
	})
	require.Error(t, err)
	require.ErrorIs(t, err, loadErr)
	require.Contains(t, err.Error(), "load database URL:")
	require.Empty(t, response.BatchItemFailures)
}
