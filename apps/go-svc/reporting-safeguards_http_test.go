package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/hyperlocalise/hyperlocalise/internal/reporting"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/require"
	"golang.org/x/sync/semaphore"
)

func TestReportingReadIsReadOnlyWithAStatementTimeLimit(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "admin"})
	api := reportingTestAPI(scope, "admin", stubWorkspaceFlags{enabled: true})
	ctx := t.Context()

	err := api.read(ctx, func(db reporting.DB) error {
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
	writeReportingError(rec, httptest.NewRequest(http.MethodGet, "/", nil), "handle", fmt.Errorf("read: %w", context.DeadlineExceeded))
	require.Equal(t, http.StatusServiceUnavailable, rec.Code)
	require.Contains(t, rec.Body.String(), "report_timed_out")

	rec = httptest.NewRecorder()
	writeReportingError(rec, httptest.NewRequest(http.MethodGet, "/", nil), "handle", errors.New("boom"))
	require.Equal(t, http.StatusInternalServerError, rec.Code)
	require.JSONEq(t, `{"error":"internal_error","message":"Internal server error"}`, rec.Body.String())
}

func TestReportingAdmitsAFewQueriesAtOnce(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "admin"})
	api := reportingTestAPI(scope, "admin", stubWorkspaceFlags{enabled: true})
	require.True(t, api.Queries.TryAcquire(reportingQueriesAtOnce))
	require.False(t, api.Queries.TryAcquire(1))
	api.Queries.Release(reportingQueriesAtOnce)

	api.Queries = semaphore.NewWeighted(0)
	ctx, cancel := context.WithTimeout(t.Context(), time.Second)
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
