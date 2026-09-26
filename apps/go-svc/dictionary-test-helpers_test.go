package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/require"
	"github.com/workos/workos-go/v10"
)

const (
	testDictionaryID     = "11111111-1111-4111-8111-111111111111"
	testDictionaryOrgID  = "22222222-2222-4222-8222-222222222222"
	testDictionaryUserID = "33333333-3333-4333-8333-333333333333"
	testDictionaryWordID = "44444444-4444-4444-8444-444444444444"
	testDictionaryBase   = "/v1/orgs/acme/dictionaries"
)

var testDictionaryTime = time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)

type dictionaryDBStep struct {
	kind, sql string
	args      []any
	values    [][]any
	affected  int64
	err       error
}

// The fake checks database boundaries and transaction outcomes. SQL execution is
// covered separately by the opt-in PostgreSQL integration suite.
type dictionaryTestDB struct {
	pgx.Tx
	t         *testing.T
	steps     []dictionaryDBStep
	committed bool
	rollbacks int
}

func newDictionaryTestDB(t *testing.T, steps ...dictionaryDBStep) *dictionaryTestDB {
	t.Helper()
	db := &dictionaryTestDB{t: t, steps: steps}
	t.Cleanup(func() { require.Empty(t, db.steps, "unconsumed database operations") })
	return db
}

func (db *dictionaryTestDB) next(kind, sql string, args []any) dictionaryDBStep {
	db.t.Helper()
	require.NotEmpty(db.t, db.steps, "unexpected %s: %s", kind, sql)
	step := db.steps[0]
	db.steps = db.steps[1:]
	require.Equal(db.t, step.kind, kind)
	require.Contains(db.t, sql, step.sql)
	if kind == "row" || kind == "query" || kind == "exec" {
		if got, want := len(args), sqlPlaceholderCount(sql); got != want {
			db.t.Fatalf("%s argument count: expected %d arguments, got %d\n%s", kind, want, got, sql)
		}
	}
	if step.args != nil {
		require.Equal(db.t, step.args, args)
	}
	return step
}

func (db *dictionaryTestDB) QueryRow(_ context.Context, sql string, args ...any) pgx.Row {
	step := db.next("row", sql, args)
	values := []any(nil)
	if len(step.values) > 0 {
		values = step.values[0]
	}
	return dictionaryTestRow{db.t, values, step.err}
}

func (db *dictionaryTestDB) Query(_ context.Context, sql string, args ...any) (pgx.Rows, error) {
	step := db.next("query", sql, args)
	return &dictionaryTestRows{t: db.t, values: step.values, index: -1}, step.err
}

func (db *dictionaryTestDB) Exec(_ context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	step := db.next("exec", sql, args)
	if step.err != nil {
		return pgconn.CommandTag{}, step.err
	}
	if step.affected == 0 {
		return pgconn.NewCommandTag("UPDATE 0"), nil
	}
	return pgconn.NewCommandTag("UPDATE 1"), nil
}

func (db *dictionaryTestDB) Begin(context.Context) (pgx.Tx, error) {
	step := db.next("begin", "", nil)
	return db, step.err
}

func (db *dictionaryTestDB) Commit(context.Context) error {
	step := db.next("commit", "", nil)
	db.committed = step.err == nil
	return step.err
}
func (db *dictionaryTestDB) Rollback(context.Context) error { db.rollbacks++; return nil }

type dictionaryTestRow struct {
	t      *testing.T
	values []any
	err    error
}

func (row dictionaryTestRow) Scan(dest ...any) error {
	if row.err != nil {
		return row.err
	}
	require.Len(row.t, row.values, len(dest))
	for i, value := range row.values {
		target := reflect.ValueOf(dest[i]).Elem()
		if value == nil {
			target.SetZero()
		} else {
			target.Set(reflect.ValueOf(value))
		}
	}
	return nil
}

type dictionaryTestRows struct {
	pgx.Rows
	t      *testing.T
	values [][]any
	index  int
}

func (rows *dictionaryTestRows) Next() bool { rows.index++; return rows.index < len(rows.values) }
func (rows *dictionaryTestRows) Scan(dest ...any) error {
	return (dictionaryTestRow{rows.t, rows.values[rows.index], nil}).Scan(dest...)
}
func (rows *dictionaryTestRows) Close()     {}
func (rows *dictionaryTestRows) Err() error { return nil }

func dictionaryRowStep(sql string, values ...any) dictionaryDBStep {
	return dictionaryDBStep{kind: "row", sql: sql, values: [][]any{values}}
}

func dictionaryOwnedStep() dictionaryDBStep {
	step := dictionaryRowStep("d.id=$1 and d.organization_id=$2", dictionaryRecordValues()...)
	step.args = []any{testDictionaryID, testDictionaryOrgID}
	return step
}

func dictionaryRecordValues() []any {
	userID := testDictionaryUserID
	return []any{testDictionaryID, testDictionaryOrgID, &userID, "Brand names", "Accepted tokens", "active", 1, testDictionaryTime, testDictionaryTime}
}

func dictionaryAuthStep() dictionaryDBStep {
	step := dictionaryRowStep("m.workos_membership_id not in ('', 'replacing')", testDictionaryUserID, testDictionaryOrgID, "om_live", "org_live")
	step.args = []any{"user_live", "acme"}
	return step
}

func dictionaryTestAPI(t *testing.T, role string, steps ...dictionaryDBStep) (*dictionaryAPI, *dictionaryTestDB) {
	t.Helper()
	db := newDictionaryTestDB(t, append([]dictionaryDBStep{dictionaryAuthStep()}, steps...)...)
	api := &dictionaryAPI{pool: db, membership: func(_ context.Context, id string) (*workos.UserOrganizationMembership, error) {
		require.Equal(t, "om_live", id)
		return &workos.UserOrganizationMembership{ID: id, UserID: "user_live", OrganizationID: "org_live", Status: "active", Role: &workos.SlimRole{Slug: role}}, nil
	}}
	return api, db
}

func dictionaryRequestForTest(api *dictionaryAPI, method, path, body string) *httptest.ResponseRecorder {
	mux := http.NewServeMux()
	api.register(mux, stubSessionVerifier{claims: AuthClaims{UserID: "user_live"}})
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "session"})
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	return rec
}

func dictionaryWordTransactionSteps() []dictionaryDBStep {
	return []dictionaryDBStep{
		{kind: "begin"},
		{kind: "exec", sql: "pg_advisory_xact_lock", args: []any{"spellcheck_word_library_words:" + testDictionaryID}},
		{kind: "row", sql: "organization_id=$2 for update", args: []any{testDictionaryID, testDictionaryOrgID}, values: [][]any{{testDictionaryID}}},
	}
}
