package activitylog

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/require"
)

type recordingExecutor struct {
	args []any
	sql  string
}

func (e *recordingExecutor) Exec(_ context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	e.sql = sql
	e.args = args
	return pgconn.CommandTag{}, nil
}

func TestStoreInsertUsesIdempotentActivityEventWrite(t *testing.T) {
	executor := &recordingExecutor{}
	store := NewStore(executor)
	event := validMessage().Event
	createdAt, err := event.CreatedTime()
	require.NoError(t, err)

	require.NoError(t, store.Insert(context.Background(), event))
	require.Contains(t, executor.sql, "on conflict (id) do nothing")
	require.Equal(t, createdAt, executor.args[3])
	require.Equal(t, event.ID, executor.args[5])
	require.Equal(t, event.OrganizationID, executor.args[6])
	require.Equal(t, event.Payload, executor.args[7])
	require.Len(t, executor.args, 10)
}

func TestStoreInsertPersistsProducerTimestamp(t *testing.T) {
	executor := &recordingExecutor{}
	store := NewStore(executor)
	event := validMessage().Event
	event.CreatedAt = "2099-01-01T00:00:00.000Z"
	createdAt, err := event.CreatedTime()
	require.NoError(t, err)

	require.NoError(t, store.Insert(context.Background(), event))
	require.Equal(t, createdAt, executor.args[3])
}
