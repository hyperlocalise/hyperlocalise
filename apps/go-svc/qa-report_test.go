package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"
	"github.com/workos/workos-go/v10"
)

func TestQaReportSessionAndOrigin(t *testing.T) {
	for _, tc := range []struct {
		name, method, cookie, origin, site string
		status                               int
	}{
		{name: "missing cookie", method: http.MethodGet, status: 401},
		{name: "cross origin post", method: http.MethodPost, cookie: "session", origin: "https://evil.example", status: 403},
		{name: "unconfigured database", method: http.MethodGet, cookie: "session", status: 503},
	} {
		t.Run(tc.name, func(t *testing.T) {
			api := &qaReportAPI{}
			mux := http.NewServeMux()
			api.register(mux, stubSessionVerifier{claims: AuthClaims{UserID: "user_live"}})
			req := httptest.NewRequest(tc.method, "/v1/orgs/acme/qa-reports/findings/promote", strings.NewReader(`{"findingIds":[]}`))
			if tc.method == http.MethodPost {
				req.Header.Set("Content-Type", "application/json")
			}
			if tc.cookie != "" {
				req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: tc.cookie})
			}
			req.Header.Set("Origin", tc.origin)
			req.Header.Set("Sec-Fetch-Site", tc.site)
			rec := httptest.NewRecorder()
			mux.ServeHTTP(rec, req)
			require.Equal(t, tc.status, rec.Code)
		})
	}
}

func qaReportAuthStep() dictionaryDBStep {
	step := dictionaryRowStep(
		"m.workos_membership_id not in ('', 'replacing')",
		testDictionaryUserID,
		testDictionaryOrgID,
		"acme",
		"om_live",
		"org_live",
	)
	step.args = []any{"user_live", "acme"}
	return step
}

func TestQaReportPromoteForbiddenForMember(t *testing.T) {
	step := qaReportAuthStep()
	api := &qaReportAPI{
		pool: newDictionaryTestDB(t, step),
		membership: func(context.Context, string) (*workos.UserOrganizationMembership, error) {
			return &workos.UserOrganizationMembership{
				ID: "om_live", UserID: "user_live", OrganizationID: "org_live", Status: "active",
				Role: &workos.SlimRole{Slug: "member"},
			}, nil
		},
	}
	mux := http.NewServeMux()
	api.register(mux, stubSessionVerifier{claims: AuthClaims{UserID: "user_live"}})
	req := httptest.NewRequest(http.MethodPost, "/v1/orgs/acme/qa-reports/findings/promote", strings.NewReader(`{"findingIds":["00000000-0000-4000-8000-000000000001"]}`))
	req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "session"})
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	require.Equal(t, http.StatusForbidden, rec.Code)
}

func TestQaReportInvalidFindingsQuery(t *testing.T) {
	step := qaReportAuthStep()
	api := &qaReportAPI{
		pool: newDictionaryTestDB(t, step),
		membership: func(context.Context, string) (*workos.UserOrganizationMembership, error) {
			return &workos.UserOrganizationMembership{
				ID: "om_live", UserID: "user_live", OrganizationID: "org_live", Status: "active",
				Role: &workos.SlimRole{Slug: "admin"},
			}, nil
		},
	}
	mux := http.NewServeMux()
	api.register(mux, stubSessionVerifier{claims: AuthClaims{UserID: "user_live"}})
	req := httptest.NewRequest(http.MethodGet, "/v1/orgs/acme/qa-reports/findings?limit=0", nil)
	req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "session"})
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	require.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestQaReportLocalMembershipAbsent(t *testing.T) {
	step := qaReportAuthStep()
	step.err = pgx.ErrNoRows
	api := &qaReportAPI{pool: newDictionaryTestDB(t, step)}
	mux := http.NewServeMux()
	api.register(mux, stubSessionVerifier{claims: AuthClaims{UserID: "user_live"}})
	req := httptest.NewRequest(http.MethodGet, "/v1/orgs/acme/qa-reports", nil)
	req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "session"})
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	require.Equal(t, http.StatusForbidden, rec.Code)
}
