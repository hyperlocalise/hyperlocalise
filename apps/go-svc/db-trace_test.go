package main

import (
	"context"
	"errors"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/require"
)

// errorPool is a dictionaryPool whose QueryRow scan fails with a fixed error.
type errorPool struct{ err error }

func (p errorPool) Query(context.Context, string, ...any) (pgx.Rows, error) {
	return nil, p.err
}

func (p errorPool) QueryRow(context.Context, string, ...any) pgx.Row {
	return errorRow(p)
}

func (p errorPool) Exec(context.Context, string, ...any) (pgconn.CommandTag, error) {
	return pgconn.CommandTag{}, p.err
}

func (p errorPool) Begin(context.Context) (pgx.Tx, error) {
	return nil, p.err
}

type errorRow struct{ err error }

func (r errorRow) Scan(...any) error { return r.err }

func TestTracedPoolAnnotatesQueryError(t *testing.T) {
	inner := errors.New("expected 3 arguments, got 4")
	var n int
	err := (tracedPool{inner: errorPool{err: inner}}).QueryRow(context.Background(), "select $1", 1).Scan(&n)
	var traced *dbError
	require.ErrorAs(t, err, &traced)
	require.ErrorIs(t, err, inner)
	require.Contains(t, traced.caller, "TestTracedPoolAnnotatesQueryError")
	require.Equal(t, "select $1", traced.sql)
	require.Equal(t, 1, traced.argCount)
	require.Equal(t, 1, traced.placeholders)
	require.Contains(t, err.Error(), "expected 3 arguments, got 4")
}

func TestTracedPoolLeavesNoRowsAlone(t *testing.T) {
	var n int
	err := (tracedPool{inner: errorPool{err: pgx.ErrNoRows}}).QueryRow(context.Background(), "select $1", 1).Scan(&n)
	require.ErrorIs(t, err, pgx.ErrNoRows)
	var traced *dbError
	require.NotErrorAs(t, err, &traced)
}

func TestSQLPlaceholderCount(t *testing.T) {
	require.Equal(t, 0, sqlPlaceholderCount("select 1"))
	require.Equal(t, 3, sqlPlaceholderCount("where a=$1 and b=$2 and c=$3"))
	require.Equal(t, 4, sqlPlaceholderCount("where a=$1 and b=$1 and c=$4"))
	require.Equal(t, 0, sqlPlaceholderCount("select $$ not a placeholder $$"))
}
