package main

import (
	"context"
	"reflect"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/require"
)

const (
	issueSheetTestOrgID  = "org-1"
	issueSheetTestUserID = "user-1"
)

type issueSheetDBStep struct {
	kind, sql string
	args      []any
	values    [][]any
	err       error
	rowsErr   error
	affected  int64
}

type issueSheetScriptDB struct {
	pgx.Tx
	t     *testing.T
	steps []issueSheetDBStep
}

func newIssueSheetScriptDB(t *testing.T, steps ...issueSheetDBStep) *issueSheetScriptDB {
	t.Helper()
	db := &issueSheetScriptDB{t: t, steps: steps}
	t.Cleanup(func() { require.Empty(t, db.steps, "unconsumed database operations") })
	return db
}

func (db *issueSheetScriptDB) next(kind, sql string, args []any) issueSheetDBStep {
	db.t.Helper()
	require.NotEmpty(db.t, db.steps, "unexpected %s: %s", kind, sql)
	step := db.steps[0]
	db.steps = db.steps[1:]
	require.Equal(db.t, step.kind, kind)
	if step.sql != "" {
		require.Contains(db.t, sql, step.sql)
	}
	if step.args != nil {
		require.Equal(db.t, step.args, args)
	}
	return step
}

func (db *issueSheetScriptDB) QueryRow(_ context.Context, sql string, args ...any) pgx.Row {
	step := db.next("row", sql, args)
	values := []any(nil)
	if len(step.values) > 0 {
		values = step.values[0]
	}
	return issueSheetScriptRow{db.t, values, step.err}
}

func (db *issueSheetScriptDB) Query(_ context.Context, sql string, args ...any) (pgx.Rows, error) {
	step := db.next("query", sql, args)
	return &issueSheetScriptRows{t: db.t, values: step.values, index: -1, err: step.rowsErr}, step.err
}

func (db *issueSheetScriptDB) Exec(_ context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	step := db.next("exec", sql, args)
	if step.err != nil {
		return pgconn.CommandTag{}, step.err
	}
	if step.affected == 0 {
		return pgconn.NewCommandTag("UPDATE 0"), nil
	}
	return pgconn.NewCommandTag("UPDATE 1"), nil
}

func (db *issueSheetScriptDB) Begin(context.Context) (pgx.Tx, error) {
	step := db.next("begin", "", nil)
	return db, step.err
}

type issueSheetScriptRow struct {
	t      *testing.T
	values []any
	err    error
}

func (row issueSheetScriptRow) Scan(dest ...any) error {
	if row.err != nil {
		return row.err
	}
	require.Len(row.t, row.values, len(dest))
	for i, value := range row.values {
		target := reflect.ValueOf(dest[i]).Elem()
		if value == nil {
			target.SetZero()
			continue
		}
		target.Set(reflect.ValueOf(value))
	}
	return nil
}

type issueSheetScriptRows struct {
	pgx.Rows
	t      *testing.T
	values [][]any
	index  int
	err    error
}

func (rows *issueSheetScriptRows) Next() bool {
	rows.index++
	return rows.index < len(rows.values)
}

func (rows *issueSheetScriptRows) Scan(dest ...any) error {
	return (issueSheetScriptRow{rows.t, rows.values[rows.index], nil}).Scan(dest...)
}

func (rows *issueSheetScriptRows) Close() {}

func (rows *issueSheetScriptRows) Err() error {
	if rows.index >= len(rows.values) {
		return rows.err
	}
	return nil
}

func issueSheetRow(sql string, values ...any) issueSheetDBStep {
	return issueSheetDBStep{kind: "row", sql: sql, values: [][]any{values}}
}
