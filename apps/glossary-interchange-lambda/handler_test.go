package main

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"testing"

	"github.com/aws/aws-lambda-go/events"
	"github.com/stretchr/testify/require"
)

func TestHandlerPropagatesDatabaseConfigurationErrors(t *testing.T) {
	handler := &glossaryInterchangeHandler{
		logger:   slog.New(slog.NewTextHandler(io.Discard, nil)),
		database: &databaseConnection{provider: stubDatabaseURLProvider{err: errors.New("rotated secret missing")}},
	}
	response, err := handler.Handle(context.Background(), events.SQSEvent{Records: []events.SQSMessage{{MessageId: "message-1", Body: `{}`}}})
	require.ErrorContains(t, err, "load database URL")
	require.Empty(t, response.BatchItemFailures)
}

func TestDecodeDocumentRejectsMalformedImport(t *testing.T) {
	concepts, diagnostics, err := decodeDocument("csv", []byte("conceptId,locale,term\n"))
	require.NoError(t, err)
	require.Empty(t, diagnostics)
	require.Empty(t, concepts)
}
