package main

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/require"
)

type dbOp int

const (
	opQuery dbOp = iota
	opQueryRow
	opExec
	opBegin
)

// dbStep is one scripted database call. Query uses table (and optional rowsErr).
// QueryRow uses scan, or err. Exec uses tag, or err.
type dbStep struct {
	op      dbOp
	err     error
	scan    []any
	table   [][]any
	rowsErr error
	tag     pgconn.CommandTag
}

// scriptPool is a dictionaryPool that replays dbStep values in order.
type scriptPool struct {
	steps  []dbStep
	n      int
	failed error
}

func (p *scriptPool) take(op dbOp) dbStep {
	if p.n >= len(p.steps) {
		p.failed = errors.New("unexpected database call")
		return dbStep{err: p.failed}
	}
	step := p.steps[p.n]
	p.n++
	if step.op != op {
		p.failed = fmt.Errorf("database op %d, scripted %d", op, step.op)
	}
	return step
}

func (p *scriptPool) Query(context.Context, string, ...any) (pgx.Rows, error) {
	step := p.take(opQuery)
	if step.err != nil {
		return nil, step.err
	}
	return &scriptRows{table: step.table, err: step.rowsErr}, nil
}

func (p *scriptPool) QueryRow(context.Context, string, ...any) pgx.Row {
	step := p.take(opQueryRow)
	if step.err != nil {
		return errorRow{err: step.err}
	}
	return scriptScanRow{values: step.scan}
}

func (p *scriptPool) Exec(context.Context, string, ...any) (pgconn.CommandTag, error) {
	step := p.take(opExec)
	if step.err != nil {
		return pgconn.CommandTag{}, step.err
	}
	return step.tag, nil
}

func (p *scriptPool) Begin(context.Context) (pgx.Tx, error) {
	step := p.take(opBegin)
	if step.err != nil {
		return nil, step.err
	}
	return &scriptTx{pool: p}, nil
}

type scriptTx struct {
	pool *scriptPool
}

func (tx *scriptTx) Begin(context.Context) (pgx.Tx, error) {
	return nil, errors.New("nested script tx")
}

func (tx *scriptTx) Commit(context.Context) error { return nil }

func (tx *scriptTx) Rollback(context.Context) error { return nil }

func (tx *scriptTx) CopyFrom(context.Context, pgx.Identifier, []string, pgx.CopyFromSource) (int64, error) {
	return 0, errors.New("script tx copy")
}

func (tx *scriptTx) SendBatch(context.Context, *pgx.Batch) pgx.BatchResults {
	return nil
}

func (tx *scriptTx) LargeObjects() pgx.LargeObjects {
	return pgx.LargeObjects{}
}

func (tx *scriptTx) Prepare(context.Context, string, string) (*pgconn.StatementDescription, error) {
	return nil, errors.New("script tx prepare")
}

func (tx *scriptTx) Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	return tx.pool.Exec(ctx, sql, args...)
}

func (tx *scriptTx) Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error) {
	return tx.pool.Query(ctx, sql, args...)
}

func (tx *scriptTx) QueryRow(ctx context.Context, sql string, args ...any) pgx.Row {
	return tx.pool.QueryRow(ctx, sql, args...)
}

func (tx *scriptTx) Conn() *pgx.Conn { return nil }

type scriptScanRow struct{ values []any }

func (r scriptScanRow) Scan(dest ...any) error { return assignScan(dest, r.values) }

type scriptRows struct {
	table  [][]any
	i      int
	err    error
	closed bool
}

func (r *scriptRows) Close() { r.closed = true }

func (r *scriptRows) Err() error { return r.err }

func (r *scriptRows) CommandTag() pgconn.CommandTag { return pgconn.CommandTag{} }

func (r *scriptRows) FieldDescriptions() []pgconn.FieldDescription { return nil }

func (r *scriptRows) Next() bool {
	if r.closed || r.i >= len(r.table) {
		r.closed = true
		return false
	}
	r.i++
	return true
}

func (r *scriptRows) Scan(dest ...any) error {
	if r.i == 0 || r.i > len(r.table) {
		return errors.New("scan without row")
	}
	return assignScan(dest, r.table[r.i-1])
}

func (r *scriptRows) Values() ([]any, error) {
	if r.i == 0 || r.i > len(r.table) {
		return nil, errors.New("values without row")
	}
	return r.table[r.i-1], nil
}

func (r *scriptRows) RawValues() [][]byte { return nil }

func (r *scriptRows) Conn() *pgx.Conn { return nil }

func assignScan(dest []any, values []any) error {
	if len(dest) != len(values) {
		return fmt.Errorf("scan: dest %d values %d", len(dest), len(values))
	}
	for i := range dest {
		if err := setScanDest(dest[i], values[i]); err != nil {
			return fmt.Errorf("scan dest %d: %w", i, err)
		}
	}
	return nil
}

func setScanDest(dest, value any) error {
	dv := reflect.ValueOf(dest)
	if dv.Kind() != reflect.Pointer || dv.IsNil() {
		return errors.New("scan destination must be a non-nil pointer")
	}
	target := dv.Elem()
	if value == nil {
		target.Set(reflect.Zero(target.Type()))
		return nil
	}
	sv := reflect.ValueOf(value)
	if sv.Type().AssignableTo(target.Type()) {
		target.Set(sv)
		return nil
	}
	if target.Kind() == reflect.Pointer && sv.Type().AssignableTo(target.Type().Elem()) {
		ptr := reflect.New(target.Type().Elem())
		ptr.Elem().Set(sv)
		target.Set(ptr)
		return nil
	}
	if sv.Type().ConvertibleTo(target.Type()) {
		target.Set(sv.Convert(target.Type()))
		return nil
	}
	return fmt.Errorf("cannot assign %T to %s", value, target.Type())
}

func TestScriptPoolAssignsScans(t *testing.T) {
	name := "Ada"
	pool := &scriptPool{steps: []dbStep{{
		op:   opQueryRow,
		scan: []any{"id", &name, nil, 3},
	}}}
	var id string
	var gotName, missing *string
	var n int
	err := pool.QueryRow(context.Background(), "select").Scan(&id, &gotName, &missing, &n)
	require.NoError(t, err)
	require.Equal(t, "id", id)
	require.Equal(t, "Ada", *gotName)
	require.Nil(t, missing)
	require.Equal(t, 3, n)
	require.NoError(t, pool.failed)
}
