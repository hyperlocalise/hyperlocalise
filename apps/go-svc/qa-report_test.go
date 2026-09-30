package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestQaReportSessionAndOrigin(t *testing.T) {
	for _, tc := range []struct {
		name, method, path, cookie, origin, site string
		status                                   int
	}{
		{name: "missing cookie", method: http.MethodGet, path: "/v1/orgs/acme/qa-reports", status: 401},
		{name: "cross origin post", method: http.MethodPost, path: "/v1/orgs/acme/qa-reports/findings/promote", cookie: "session", origin: "https://evil.example", status: 403},
		{name: "unconfigured database", method: http.MethodGet, path: "/v1/orgs/acme/qa-reports", cookie: "session", status: 503},
	} {
		t.Run(tc.name, func(t *testing.T) {
			api := &qaReportAPI{}
			mux := http.NewServeMux()
			api.register(mux, stubSessionVerifier{claims: AuthClaims{UserID: "user_live"}})
			req := httptest.NewRequest(tc.method, tc.path, strings.NewReader(`{"findingIds":[]}`))
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

func TestQaReportPromoteForbiddenForMember(t *testing.T) {
	api, scope := qaReportTestAPI(t, "member")
	rec := qaReportRequest(api, scope, http.MethodPost, scope.OrgPath("/qa-reports/findings/promote"), `{"findingIds":["00000000-0000-4000-8000-000000000001"]}`)
	require.Equal(t, http.StatusForbidden, rec.Code)
}

func TestQaReportInvalidFindingsQuery(t *testing.T) {
	api, scope := qaReportTestAPI(t, "admin")
	rec := qaReportRequest(api, scope, http.MethodGet, scope.OrgPath("/qa-reports/findings?limit=0"), "")
	require.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestQaReportWorkspaceFindingsAppliesTeamACL(t *testing.T) {
	api, scope := qaReportTestAPI(t, "translator")
	rec := qaReportRequest(api, scope, http.MethodGet, scope.OrgPath("/qa-reports/findings"), "")
	require.Equal(t, http.StatusOK, rec.Code)
}

func TestQaReportWorkspacePromoteDeniesInaccessibleProject(t *testing.T) {
	api, scope := qaReportTestAPI(t, "translator")
	teamID := scope.MustTeam(t, "secret", "Secret", "")
	_, err := scope.Pool.Exec(t.Context(), `update projects set team_id=$1 where id=$2`, teamID, scope.ProjectID)
	require.NoError(t, err)
	runID := mustQaRun(t, scope, scope.ProjectID, "succeeded", 1, 1, 0)
	findingID := mustQaFinding(t, scope, runID, scope.ProjectID, "key")
	rec := qaReportRequest(api, scope, http.MethodPost, scope.OrgPath("/qa-reports/findings/promote"),
		`{"findingIds":["`+findingID+`"]}`)
	require.Equal(t, http.StatusBadRequest, rec.Code)
	require.Contains(t, rec.Body.String(), "qa_finding_not_found")
}

func TestQaReportLocalMembershipAbsent(t *testing.T) {
	api, scope := qaReportTestAPI(t, "admin")
	rec := qaReportRequest(api, scope, http.MethodGet, "/v1/orgs/missing-slug/qa-reports", "")
	require.Equal(t, http.StatusForbidden, rec.Code)
}
