package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
)

func teamTestAPI(t *testing.T, role string) (*teamAPI, *testenv.Scope) {
	t.Helper()
	scope := testenv.Seed(t, testenv.Options{Role: role})
	return &teamAPI{
		pool:       scope.Pool,
		membership: scope.Membership(role),
	}, scope
}

func teamRequest(api *teamAPI, scope *testenv.Scope, method, path, body string) *httptest.ResponseRecorder {
	mux := http.NewServeMux()
	api.register(mux, stubSessionVerifier{claims: AuthClaims{UserID: scope.WorkOSUserID}})
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "session"})
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	return rec
}

func teamRequestForTest(api *teamAPI, method, path, body string) *httptest.ResponseRecorder {
	mux := http.NewServeMux()
	api.register(mux, stubSessionVerifier{claims: AuthClaims{UserID: "user_live"}})
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "session"})
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	return rec
}

func mustOrgTeammate(t *testing.T, scope *testenv.Scope, workosUserID, email, role string) string {
	t.Helper()
	userID := uuid.NewString()
	_, err := scope.Pool.Exec(t.Context(), `
        insert into users (id, workos_user_id, email)
        values ($1, $2, $3)`,
		userID, workosUserID, email)
	require.NoError(t, err)
	_, err = scope.Pool.Exec(t.Context(), `
        insert into organization_memberships (organization_id, user_id, workos_membership_id, role)
        values ($1, $2, $3, $4)`,
		scope.OrganizationID, userID, "om_"+uuid.NewString(), role)
	require.NoError(t, err)
	t.Cleanup(func() {
		_, _ = scope.Pool.Exec(t.Context(), `delete from users where id=$1`, userID)
	})
	return userID
}
