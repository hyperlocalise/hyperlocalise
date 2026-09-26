package main

import (
	"context"
	"errors"
	"fmt"
	"path"
	"runtime"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// dbError attaches the query call site to a database failure. Argument values
// stay out of the error so logs do not include customer text.
type dbError struct {
	caller       string
	sql          string
	argCount     int
	placeholders int
	err          error
}

func (e *dbError) Error() string {
	if e == nil || e.err == nil {
		return "database query failed"
	}
	if e.caller == "" {
		return e.err.Error()
	}
	return e.caller + ": " + e.err.Error()
}

func (e *dbError) Unwrap() error { return e.err }

type dbQueryMeta struct {
	caller       string
	sql          string
	argCount     int
	placeholders int
}

func annotateDB(meta dbQueryMeta, err error) error {
	if err == nil || errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	var already *dbError
	if errors.As(err, &already) {
		return err
	}
	return &dbError{
		caller:       meta.caller,
		sql:          meta.sql,
		argCount:     meta.argCount,
		placeholders: meta.placeholders,
		err:          err,
	}
}

func dbCaller(skip int) string {
	pc, file, line, ok := runtime.Caller(skip)
	if !ok {
		return "unknown"
	}
	name := "unknown"
	if fn := runtime.FuncForPC(pc); fn != nil {
		name = fn.Name()
		if i := strings.LastIndex(name, "."); i >= 0 {
			name = name[i+1:]
		}
	}
	if i := strings.LastIndex(file, "/apps/go-svc/"); i >= 0 {
		file = file[i+len("/apps/go-svc/"):]
	} else {
		file = path.Base(file)
	}
	return fmt.Sprintf("%s:%d %s", file, line, name)
}

func sqlPlaceholderCount(sql string) int {
	maxN := 0
	for i := 0; i < len(sql); i++ {
		if sql[i] != '$' || i+1 >= len(sql) || sql[i+1] < '0' || sql[i+1] > '9' {
			continue
		}
		n := 0
		for i++; i < len(sql) && sql[i] >= '0' && sql[i] <= '9'; i++ {
			n = n*10 + int(sql[i]-'0')
		}
		if n > maxN {
			maxN = n
		}
		i--
	}
	return maxN
}

func compactSQL(sql string) string {
	compact := strings.Join(strings.Fields(sql), " ")
	const maxSQLLog = 1500
	if len(compact) <= maxSQLLog {
		return compact
	}
	return compact[:maxSQLLog] + "…"
}

// tracedPool records which query failed. pgx's own "expected N arguments, got M"
// error does not include the SQL or the call site.
type tracedPool struct {
	inner dictionaryPool
}

func (p tracedPool) Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error) {
	meta := newDBQueryMeta(2, sql, len(args))
	rows, err := p.inner.Query(ctx, sql, args...)
	if err != nil {
		return nil, annotateDB(meta, err)
	}
	return tracedRows{Rows: rows, meta: meta}, nil
}

func (p tracedPool) QueryRow(ctx context.Context, sql string, args ...any) pgx.Row {
	return tracedRow{Row: p.inner.QueryRow(ctx, sql, args...), meta: newDBQueryMeta(2, sql, len(args))}
}

func (p tracedPool) Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	meta := newDBQueryMeta(2, sql, len(args))
	tag, err := p.inner.Exec(ctx, sql, args...)
	return tag, annotateDB(meta, err)
}

func (p tracedPool) Begin(ctx context.Context) (pgx.Tx, error) {
	tx, err := p.inner.Begin(ctx)
	if err != nil {
		return nil, annotateDB(dbQueryMeta{caller: dbCaller(2), sql: "begin"}, err)
	}
	return tracedTx{Tx: tx}, nil
}

type tracedTx struct {
	pgx.Tx
}

func (t tracedTx) Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error) {
	meta := newDBQueryMeta(2, sql, len(args))
	rows, err := t.Tx.Query(ctx, sql, args...)
	if err != nil {
		return nil, annotateDB(meta, err)
	}
	return tracedRows{Rows: rows, meta: meta}, nil
}

func (t tracedTx) QueryRow(ctx context.Context, sql string, args ...any) pgx.Row {
	return tracedRow{Row: t.Tx.QueryRow(ctx, sql, args...), meta: newDBQueryMeta(2, sql, len(args))}
}

func (t tracedTx) Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	meta := newDBQueryMeta(2, sql, len(args))
	tag, err := t.Tx.Exec(ctx, sql, args...)
	return tag, annotateDB(meta, err)
}

func (t tracedTx) Begin(ctx context.Context) (pgx.Tx, error) {
	tx, err := t.Tx.Begin(ctx)
	if err != nil {
		return nil, annotateDB(dbQueryMeta{caller: dbCaller(2), sql: "begin"}, err)
	}
	return tracedTx{Tx: tx}, nil
}

type tracedRow struct {
	pgx.Row
	meta dbQueryMeta
}

func (r tracedRow) Scan(dest ...any) error {
	return annotateDB(r.meta, r.Row.Scan(dest...))
}

type tracedRows struct {
	pgx.Rows
	meta dbQueryMeta
}

func (r tracedRows) Scan(dest ...any) error {
	return annotateDB(r.meta, r.Rows.Scan(dest...))
}

func (r tracedRows) Err() error {
	return annotateDB(r.meta, r.Rows.Err())
}

func newDBQueryMeta(skip int, sql string, argCount int) dbQueryMeta {
	return dbQueryMeta{
		caller:       dbCaller(skip + 1),
		sql:          sql,
		argCount:     argCount,
		placeholders: sqlPlaceholderCount(sql),
	}
}
