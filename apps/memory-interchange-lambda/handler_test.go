package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"path/filepath"
	"testing"

	"github.com/aws/aws-lambda-go/events"
	"github.com/hyperlocalise/hyperlocalise/internal/objectstore"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
)

const unreachableDatabaseURL = "postgres://hyperlocalise:hyperlocalise@127.0.0.1:1/hyperlocalise?connect_timeout=1"

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

func discardLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func unreachablePool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	pool, err := pgxpool.New(t.Context(), unreachableDatabaseURL)
	require.NoError(t, err)
	t.Cleanup(pool.Close)
	return pool
}

func TestHandleIgnoresEmptyBatchWithoutDatabase(t *testing.T) {
	handler := &memoryInterchangeHandler{logger: discardLogger()}
	response, err := handler.Handle(context.Background(), events.SQSEvent{})
	require.NoError(t, err)
	require.Empty(t, response.BatchItemFailures)
}

func TestHandleRequiresDatabaseConnection(t *testing.T) {
	handler := &memoryInterchangeHandler{logger: discardLogger()}
	response, err := handler.Handle(context.Background(), events.SQSEvent{Records: []events.SQSMessage{{MessageId: "message-1", Body: `{}`}}})
	require.ErrorContains(t, err, "database connection is not configured")
	require.Empty(t, response.BatchItemFailures)
}

func TestHandlePropagatesDatabaseConfigurationErrors(t *testing.T) {
	loadErr := errors.New("rotated secret missing")
	handler := &memoryInterchangeHandler{
		logger:   discardLogger(),
		database: &databaseConnection{provider: stubDatabaseURLProvider{err: loadErr}},
	}
	response, err := handler.Handle(context.Background(), events.SQSEvent{Records: []events.SQSMessage{{MessageId: "message-1", Body: `{}`}}})
	require.ErrorIs(t, err, loadErr)
	require.ErrorContains(t, err, "load database URL")
	require.Empty(t, response.BatchItemFailures)
}

func TestHandleRejectsInvalidMessagesAsBatchItemFailures(t *testing.T) {
	handler := &memoryInterchangeHandler{logger: discardLogger(), database: &databaseConnection{}}
	response, err := handler.Handle(context.Background(), events.SQSEvent{Records: []events.SQSMessage{
		{MessageId: "malformed", Body: `{`},
		{MessageId: "unknown-version", Body: `{"schemaVersion":2,"attemptId":"attempt-1","operation":"import"}`},
		{MessageId: "missing-attempt", Body: `{"schemaVersion":1,"operation":"import"}`},
		{MessageId: "unknown-operation", Body: `{"schemaVersion":1,"attemptId":"attempt-1","operation":"sync"}`},
	}})
	require.NoError(t, err)
	require.Equal(t, []batchItemFailure{
		{ItemIdentifier: "malformed"},
		{ItemIdentifier: "unknown-version"},
		{ItemIdentifier: "missing-attempt"},
		{ItemIdentifier: "unknown-operation"},
	}, response.BatchItemFailures)
}

func TestHandleReportsRetryableDatabaseFailuresPerRecord(t *testing.T) {
	handler := &memoryInterchangeHandler{logger: discardLogger(), database: &databaseConnection{pool: unreachablePool(t)}}
	response, err := handler.Handle(context.Background(), events.SQSEvent{Records: []events.SQSMessage{
		{MessageId: "import", Body: `{"schemaVersion":1,"attemptId":"11111111-1111-4111-8111-111111111111","operation":"import"}`},
		{MessageId: "invalid", Body: `not json`},
		{MessageId: "export", Body: `{"schemaVersion":1,"attemptId":"22222222-2222-4222-8222-222222222222","operation":"export"}`},
	}})
	require.NoError(t, err)
	require.Equal(t, []batchItemFailure{{ItemIdentifier: "import"}, {ItemIdentifier: "invalid"}, {ItemIdentifier: "export"}}, response.BatchItemFailures)
}

func TestDatabaseConnectionReturnsStaticPoolWithoutProvider(t *testing.T) {
	pool := unreachablePool(t)
	got, err := (&databaseConnection{pool: pool}).currentPool(context.Background())
	require.NoError(t, err)
	require.Same(t, pool, got)
}

func TestDatabaseConnectionReusesPoolForUnchangedURL(t *testing.T) {
	pool := unreachablePool(t)
	database := &databaseConnection{provider: stubDatabaseURLProvider{url: unreachableDatabaseURL}, pool: pool, url: unreachableDatabaseURL}
	got, err := database.currentPool(context.Background())
	require.NoError(t, err)
	require.Same(t, pool, got)
}

func TestDatabaseConnectionErrors(t *testing.T) {
	tests := []struct {
		name    string
		url     string
		wantErr string
	}{
		{name: "invalid url", url: "not-a-postgres-url", wantErr: "invalid database URL"},
		{name: "unreachable", url: unreachableDatabaseURL, wantErr: "database connection failed"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			database := &databaseConnection{provider: stubDatabaseURLProvider{url: tt.url}}
			_, err := database.currentPool(context.Background())
			require.ErrorContains(t, err, tt.wantErr)
			require.Nil(t, database.pool)
		})
	}
}

func isolateAWSConfig(t *testing.T) {
	t.Helper()
	dir := t.TempDir()
	t.Setenv("AWS_CONFIG_FILE", filepath.Join(dir, "config"))
	t.Setenv("AWS_SHARED_CREDENTIALS_FILE", filepath.Join(dir, "credentials"))
	t.Setenv("AWS_PROFILE", "")
	t.Setenv("AWS_REGION", "")
}

func TestNewRegistryFromEnv(t *testing.T) {
	tests := []struct {
		name         string
		env          map[string]string
		wantLocation string
		wantErr      string
	}{
		{name: "missing bucket", env: map[string]string{"OBJECT_STORAGE_S3_FILES_BUCKET": "  "}, wantErr: "OBJECT_STORAGE_S3_FILES_BUCKET is required"},
		{name: "default location", env: map[string]string{"OBJECT_STORAGE_S3_FILES_BUCKET": "files"}, wantLocation: "s3-files"},
		{name: "custom location", env: map[string]string{"OBJECT_STORAGE_S3_FILES_BUCKET": "files", "OBJECT_STORAGE_S3_FILES_REGION": "eu-west-1", "OBJECT_STORAGE_DEFAULT_LOCATION": " archive "}, wantLocation: "archive"},
		{name: "insecure endpoint", env: map[string]string{"OBJECT_STORAGE_S3_FILES_BUCKET": "files", "OBJECT_STORAGE_S3_FILES_ENDPOINT": "http://minio.local"}, wantErr: objectstore.ErrInvalidInput.Error()},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			isolateAWSConfig(t)
			for _, key := range []string{"OBJECT_STORAGE_S3_FILES_BUCKET", "OBJECT_STORAGE_S3_FILES_REGION", "OBJECT_STORAGE_S3_FILES_ENDPOINT", "OBJECT_STORAGE_DEFAULT_LOCATION"} {
				t.Setenv(key, tt.env[key])
			}
			registry, err := newRegistry(context.Background())
			if tt.wantErr != "" {
				require.ErrorContains(t, err, tt.wantErr)
				return
			}
			require.NoError(t, err)
			require.Equal(t, tt.wantLocation, registry.DefaultLocationID())
			_, err = registry.Resolve(tt.wantLocation)
			require.NoError(t, err)
		})
	}
}

func TestPermanentMemoryInterchangeFailureUnwraps(t *testing.T) {
	cause := errors.New("invalid format")
	err := fmt.Errorf("run: %w", permanentMemoryInterchangeFailure(cause))
	require.ErrorIs(t, err, cause)
	require.True(t, isPermanentMemoryInterchangeFailure(err))
	require.Equal(t, "run: invalid format", err.Error())
}

func TestPostgresErrorClassification(t *testing.T) {
	unique := fmt.Errorf("update: %w", &pgconn.PgError{Code: "23505"})
	undefined := &pgconn.PgError{Code: "42P01"}
	require.True(t, isUniqueViolation(unique))
	require.False(t, isUndefinedRelation(unique))
	require.True(t, isUndefinedRelation(undefined))
	require.False(t, isUniqueViolation(undefined))
	require.False(t, isUniqueViolation(errors.New("23505")))
}

func TestProcessMemoryInterchangeRunReturnsClaimErrors(t *testing.T) {
	err := processMemoryInterchangeRun(context.Background(), unreachablePool(t), nil, memoryInterchangeMessage{SchemaVersion: 1, AttemptID: "11111111-1111-4111-8111-111111111111", Operation: "import"})
	require.Error(t, err)
	require.False(t, isPermanentMemoryInterchangeFailure(err))
}
