package main

import (
	"context"
	"errors"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"
)

func TestTracedPoolAnnotatesQueryError(t *testing.T) {
	inner := errors.New("expected 3 arguments, got 4")
	db := newDictionaryTestDB(t, dictionaryDBStep{kind: "row", sql: "select $1", err: inner})
	var n int
	err := (tracedPool{inner: db}).QueryRow(context.Background(), "select $1", 1).Scan(&n)
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
	db := newDictionaryTestDB(t, dictionaryDBStep{kind: "row", sql: "select $1", err: pgx.ErrNoRows})
	var n int
	err := (tracedPool{inner: db}).QueryRow(context.Background(), "select $1", 1).Scan(&n)
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
