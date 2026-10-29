package main

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/require"
	"golang.org/x/sync/semaphore"
)

type countingWorkspaceFlags struct {
	enabled bool
	err     error
	calls   int
}

func (f *countingWorkspaceFlags) Enabled(context.Context, string, string, string) (bool, error) {
	f.calls++
	return f.enabled, f.err
}

func TestCachedWorkspaceFlagsRemembersAnswersForAMinute(t *testing.T) {
	live := &countingWorkspaceFlags{enabled: true}
	cache := newCachedWorkspaceFlags(live)
	now := time.Date(2026, 6, 15, 12, 0, 0, 0, time.UTC)
	cache.now = func() time.Time { return now }
	ctx := t.Context()

	for range 3 {
		enabled, err := cache.Enabled(ctx, "org_1", "user_1", workspaceReportsFlag)
		require.NoError(t, err)
		require.True(t, enabled)
	}
	require.Equal(t, 1, live.calls, "one lookup serves a minute of requests")

	// Another person, workspace or flag is its own entry.
	_, err := cache.Enabled(ctx, "org_1", "user_2", workspaceReportsFlag)
	require.NoError(t, err)
	_, err = cache.Enabled(ctx, "org_2", "user_1", workspaceReportsFlag)
	require.NoError(t, err)
	require.Equal(t, 3, live.calls)

	now = now.Add(reportingFlagCacheTTL + time.Second)
	live.enabled = false
	enabled, err := cache.Enabled(ctx, "org_1", "user_1", workspaceReportsFlag)
	require.NoError(t, err)
	require.False(t, enabled, "a change reaches the cache once the entry expires")
	require.Equal(t, 4, live.calls)
}

func TestCachedWorkspaceFlagsNeverKeepsAFailedLookup(t *testing.T) {
	live := &countingWorkspaceFlags{err: errors.New("workos unavailable")}
	cache := newCachedWorkspaceFlags(live)
	ctx := t.Context()
	for range 2 {
		enabled, err := cache.Enabled(ctx, "org_1", "user_1", workspaceReportsFlag)
		require.Error(t, err)
		require.False(t, enabled)
	}
	require.Equal(t, 2, live.calls, "each request asks again after a failure")

	none := newCachedWorkspaceFlags(nil)
	enabled, err := none.Enabled(ctx, "org_1", "user_1", workspaceReportsFlag)
	require.NoError(t, err)
	require.False(t, enabled, "no WorkOS client means no flag")
}

func TestReportingReadIsReadOnlyWithAStatementTimeLimit(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "admin"})
	api := reportingTestAPI(scope, "admin", stubWorkspaceFlags{enabled: true})
	ctx := t.Context()

	err := api.read(ctx, func(db dictionaryDB) error {
		var timeout string
		if err := db.QueryRow(ctx, `show statement_timeout`).Scan(&timeout); err != nil {
			return err
		}
		require.Equal(t, "10s", timeout)
		_, err := db.Exec(ctx, `insert into reporting_workspaces (organization_id) values ($1)`, scope.OrganizationID)
		return err
	})
	var pgErr *pgconn.PgError
	require.ErrorAs(t, err, &pgErr)
	require.Equal(t, "25006", pgErr.Code, "a write inside a Reports read is refused")

	var timeout string
	require.NoError(t, scope.Pool.QueryRow(ctx, `show statement_timeout`).Scan(&timeout))
	require.Equal(t, "0", timeout, "the limit does not outlive the read")
}

func TestWriteReportingErrorMapsAStatementTimeoutToABusyAnswer(t *testing.T) {
	rec := httptest.NewRecorder()
	writeReportingError(rec, httptest.NewRequest(http.MethodGet, "/", nil), "handle", &pgconn.PgError{Code: "57014", Message: "canceling statement due to statement timeout"})
	require.Equal(t, http.StatusServiceUnavailable, rec.Code)
	require.Contains(t, rec.Body.String(), "report_timed_out")

	rec = httptest.NewRecorder()
	writeReportingError(rec, httptest.NewRequest(http.MethodGet, "/", nil), "handle", errors.New("boom"))
	require.Equal(t, http.StatusInternalServerError, rec.Code)
	require.JSONEq(t, `{"error":"internal_error","message":"Internal server error"}`, rec.Body.String())
}

func TestReportingAdmitsTwoQueriesAtOnce(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "admin"})
	api := reportingTestAPI(scope, "admin", stubWorkspaceFlags{enabled: true})
	require.True(t, api.queries.TryAcquire(reportingQueriesAtOnce))
	require.False(t, api.queries.TryAcquire(1))
	api.queries.Release(reportingQueriesAtOnce)

	// A reader that finds every slot held waits only as long as its request may, then is told so.
	api.queries = semaphore.NewWeighted(0)
	ctx, cancel := context.WithTimeout(t.Context(), 100*time.Millisecond)
	defer cancel()
	mux := http.NewServeMux()
	api.register(mux, stubSessionVerifier{claims: AuthClaims{UserID: scope.WorkOSUserID}})
	req := httptest.NewRequest(http.MethodGet, scope.OrgPath("/reports/settings"), nil).WithContext(ctx)
	req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "session"})
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	require.Equal(t, http.StatusServiceUnavailable, rec.Code)
	require.Contains(t, rec.Body.String(), "reports_busy")
}

func TestCachedWorkspaceFlagsAsksOnceForRequestsThatMissTogether(t *testing.T) {
	live := &blockingWorkspaceFlags{release: make(chan struct{})}
	cache := newCachedWorkspaceFlags(live)
	ctx := t.Context()
	var wg sync.WaitGroup
	for range 12 {
		wg.Go(func() {
			enabled, err := cache.Enabled(ctx, "org_1", "user_1", workspaceReportsFlag)
			require.NoError(t, err)
			require.True(t, enabled)
		})
	}
	require.Eventually(t, func() bool { return live.started.Load() == 1 }, time.Second, time.Millisecond)
	close(live.release)
	wg.Wait()
	require.Equal(t, int32(1), live.started.Load(), "a page load's requests share one lookup")
}

type blockingWorkspaceFlags struct {
	release chan struct{}
	started atomic.Int32
}

func (f *blockingWorkspaceFlags) Enabled(context.Context, string, string, string) (bool, error) {
	f.started.Add(1)
	<-f.release
	return true, nil
}
