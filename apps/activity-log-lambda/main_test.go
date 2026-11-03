package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/internal/activitylog"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/require"
)

type recordingActivityLogExecutor struct {
	mu   sync.Mutex
	args [][]any
}

func (e *recordingActivityLogExecutor) Exec(_ context.Context, _ string, args ...any) (pgconn.CommandTag, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.args = append(e.args, args)
	return pgconn.NewCommandTag("INSERT 0 1"), nil
}

func encodedMessage(t *testing.T, mutate func(*activitylog.Message)) string {
	t.Helper()
	message := validMessage(t)
	if mutate != nil {
		mutate(&message)
	}
	body, err := json.Marshal(message)
	require.NoError(t, err)
	return string(body)
}

func TestActivityLogHandlerRejectsInvalidMessagesAndPersistsValidOnes(t *testing.T) {
	executor := &recordingActivityLogExecutor{}
	handler := &activityLogHandler{
		logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
		store:  activitylog.NewStore(executor),
	}
	valid := encodedMessage(t, nil)

	response, err := handler.Handle(context.Background(), events.SQSEvent{Records: []events.SQSMessage{
		{MessageId: "malformed", Body: `{`},
		{MessageId: "valid", Body: valid},
		{MessageId: "unknown-version", Body: encodedMessage(t, func(m *activitylog.Message) { m.SchemaVersion = 99 })},
		{MessageId: "unknown-field", Body: strings.Replace(valid, `{`, `{"extra":true,`, 1)},
		{MessageId: "trailing", Body: valid + `{}`},
		{MessageId: "missing-target", Body: encodedMessage(t, func(m *activitylog.Message) { m.Event.TargetID = "" })},
		{MessageId: "unknown-event", Body: encodedMessage(t, func(m *activitylog.Message) { m.Event.EventType = "project_teleported" })},
	}})
	require.NoError(t, err)
	require.Equal(t, []batchItemFailure{
		{ItemIdentifier: "malformed"},
		{ItemIdentifier: "unknown-version"},
		{ItemIdentifier: "unknown-field"},
		{ItemIdentifier: "trailing"},
		{ItemIdentifier: "missing-target"},
		{ItemIdentifier: "unknown-event"},
	}, response.BatchItemFailures)
	require.Len(t, executor.args, 1)
	require.Equal(t, "55555555-5555-4555-8555-555555555555", executor.args[0][5])
	require.Equal(t, "project_created", executor.args[0][4])
}

func TestActivityLogHandlerAcceptsEmptyBatch(t *testing.T) {
	handler := &activityLogHandler{logger: slog.New(slog.NewTextHandler(io.Discard, nil)), store: activitylog.NewStore(&recordingActivityLogExecutor{})}
	response, err := handler.Handle(context.Background(), events.SQSEvent{})
	require.NoError(t, err)
	require.Empty(t, response.BatchItemFailures)
}

func TestContextRemainingMillis(t *testing.T) {
	require.EqualValues(t, -1, contextRemainingMillis(context.Background()))

	expired, cancel := context.WithDeadline(context.Background(), time.Now().Add(-time.Second))
	defer cancel()
	require.Zero(t, contextRemainingMillis(expired))

	future, cancelFuture := context.WithTimeout(context.Background(), time.Minute)
	defer cancelFuture()
	remaining := contextRemainingMillis(future)
	require.Greater(t, remaining, int64(50_000))
	require.LessOrEqual(t, remaining, int64(60_000))
}

func TestDatabaseConnectionLogsPingFailureWithoutCredentials(t *testing.T) {
	var logs bytes.Buffer
	conn := &databaseConnection{
		provider: stubDatabaseURLProvider{url: "postgres://db-user:db-password@127.0.0.1:1/hyperlocalise?connect_timeout=1"},
		logger:   slog.New(slog.NewTextHandler(&logs, nil)),
	}
	_, err := conn.currentStore(context.Background())
	require.ErrorContains(t, err, "database connection failed (host=127.0.0.1 port=1)")
	require.Nil(t, conn.pool)
	require.Contains(t, logs.String(), "activity_log_database_ping_failed")
	require.Contains(t, logs.String(), "postgres://127.0.0.1:1/hyperlocalise")
	require.NotContains(t, logs.String(), "db-password")
}

func TestSummarizeDatabaseURLHandlesInvalidAndDefaultPort(t *testing.T) {
	require.Equal(t, "invalid", summarizeDatabaseURL("not a url"))
	require.Equal(t, "invalid", summarizeDatabaseURL("%zz"))
	require.Equal(t, "postgres://db.example:5432/app", summarizeDatabaseURL("postgres://user:pw@db.example/app"))
}

func TestNewSecretBackedHandlerPropagatesConnectionErrors(t *testing.T) {
	loadErr := errors.New("secret unavailable")
	handler, closePool, err := newSecretBackedHandler(context.Background(), stubDatabaseURLProvider{err: loadErr}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	require.ErrorIs(t, err, loadErr)
	require.Nil(t, handler)
	require.Nil(t, closePool)
}

type rotatingDatabaseURLProvider struct {
	mu   sync.Mutex
	urls []string
}

func (p *rotatingDatabaseURLProvider) Load(context.Context) (string, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	url := p.urls[0]
	if len(p.urls) > 1 {
		p.urls = p.urls[1:]
	}
	return url, nil
}

func TestSecretBackedHandlerPersistsAndDeduplicatesEvents(t *testing.T) {
	databaseURL := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if databaseURL == "" {
		t.Skip("set DATABASE_URL to run activity log database tests")
	}
	ctx := t.Context()
	separator := "?"
	if strings.Contains(databaseURL, "?") {
		separator = "&"
	}
	rotatedURL := databaseURL + separator + "application_name=activity-log-test"
	provider := &rotatingDatabaseURLProvider{urls: []string{databaseURL, databaseURL, rotatedURL}}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))

	handler, closePool, err := newSecretBackedHandler(ctx, provider, logger)
	require.NoError(t, err)
	t.Cleanup(closePool)
	firstPool := handler.database.pool

	suffix := uuid.NewString()
	organizationID := uuid.NewString()
	_, err = firstPool.Exec(ctx, `insert into organizations (id, workos_organization_id, name, slug, lifecycle_status) values ($1, $2, $3, $4, 'active')`,
		organizationID, "org_"+suffix, "Acme "+suffix, "org-"+strings.ReplaceAll(suffix[:12], "-", ""))
	require.NoError(t, err)
	t.Cleanup(func() {
		_, _ = handler.database.pool.Exec(context.Background(), `delete from organizations where id=$1`, organizationID)
	})

	eventID := uuid.NewString()
	body := encodedMessage(t, func(m *activitylog.Message) {
		m.Event.ID = eventID
		m.Event.OrganizationID = organizationID
	})
	response, err := handler.Handle(ctx, events.SQSEvent{Records: []events.SQSMessage{
		{MessageId: "first", Body: body},
		{MessageId: "duplicate", Body: body},
	}})
	require.NoError(t, err)
	require.Empty(t, response.BatchItemFailures)
	require.Same(t, firstPool, handler.database.pool)

	var count int
	require.NoError(t, handler.database.pool.QueryRow(ctx, `select count(*) from organization_activity_events where id=$1`, eventID).Scan(&count))
	require.Equal(t, 1, count)

	response, err = handler.Handle(ctx, events.SQSEvent{Records: []events.SQSMessage{
		{MessageId: "foreign-key", Body: encodedMessage(t, func(m *activitylog.Message) {
			m.Event.ID = uuid.NewString()
			m.Event.OrganizationID = uuid.NewString()
		})},
	}})
	require.NoError(t, err)
	require.Equal(t, []batchItemFailure{{ItemIdentifier: "foreign-key"}}, response.BatchItemFailures)
	require.NotSame(t, firstPool, handler.database.pool)
	require.Equal(t, rotatedURL, handler.database.databaseURL)
}
