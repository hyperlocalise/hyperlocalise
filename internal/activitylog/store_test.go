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

	require.NoError(t, store.Insert(context.Background(), event))
	require.Contains(t, executor.sql, "clock_timestamp()")
	require.Contains(t, executor.sql, "on conflict (id) do nothing")
	require.Equal(t, event.ID, executor.args[4])
	require.Equal(t, event.OrganizationID, executor.args[5])
	require.Equal(t, event.Payload, executor.args[6])
	require.Len(t, executor.args, 9)
}

func TestStoreInsertDoesNotUseProducerTimestampForPersistence(t *testing.T) {
	executor := &recordingExecutor{}
	store := NewStore(executor)
	event := validMessage().Event
	event.CreatedAt = "2099-01-01T00:00:00.000Z"

	require.NoError(t, store.Insert(context.Background(), event))
	require.NotContains(t, executor.args, event.CreatedAt)
}
