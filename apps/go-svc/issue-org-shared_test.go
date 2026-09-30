package main

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
)

func issueSheetServeOrg(api *issueSheetAPI, userID string, req *http.Request) *httptest.ResponseRecorder {
	mux := http.NewServeMux()
	api.registerOrgRoutes(mux, stubSessionVerifier{claims: AuthClaims{UserID: userID}})
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	return rec
}

func mustOrgIssueFull(t *testing.T, scope *testenv.Scope, projectID string, number int, title, status, issueType string, assigneeUserID *string) (id, identifier string) {
	t.Helper()
	id = uuid.NewString()
	var prefix string
	err := scope.Pool.QueryRow(t.Context(), `select identifier from projects where id=$1`, projectID).Scan(&prefix)
	require.NoError(t, err)
	identifier = fmt.Sprintf("%s-%d", prefix, number)
	if status == "" {
		status = "open"
	}
	if issueType == "" {
		issueType = "general_question"
	}
	_, err = scope.Pool.Exec(t.Context(), `
        insert into issue_sheet_issues (
            id, organization_id, project_id, number, identifier, title, status, issue_type, reporter_user_id, assignee_user_id
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
		id, scope.OrganizationID, projectID, number, identifier, title, status, issueType, scope.UserID, assigneeUserID)
	require.NoError(t, err)
	return id, identifier
}

func mustSecondUser(t *testing.T, scope *testenv.Scope) string {
	t.Helper()
	userID := uuid.NewString()
	_, err := scope.Pool.Exec(t.Context(), `
        insert into users (id, workos_user_id, email) values ($1, $2, $3)`,
		userID, "user_"+userID[:8], userID+"@example.com")
	require.NoError(t, err)
	return userID
}

func newOrgProject(t *testing.T, scope *testenv.Scope, name string) string {
	t.Helper()
	projectID := "project_" + strings.ReplaceAll(uuid.NewString(), "-", "")[:8]
	scope.MustProject(t, projectID, name)
	return projectID
}

func mustSetProjectTeam(t *testing.T, scope *testenv.Scope, projectID, teamID string) {
	t.Helper()
	_, err := scope.Pool.Exec(t.Context(), `update projects set team_id=$1 where id=$2`, teamID, projectID)
	require.NoError(t, err)
}

func mustAssignableOrgMember(t *testing.T, scope *testenv.Scope, teamID string) string {
	t.Helper()
	userID := mustSecondUser(t, scope)
	_, err := scope.Pool.Exec(t.Context(), `
        insert into organization_memberships (organization_id, user_id, workos_membership_id, role)
        values ($1, $2, $3, 'member')`,
		scope.OrganizationID, userID, "om_"+userID[:8])
	require.NoError(t, err)
	_, err = scope.Pool.Exec(t.Context(), `
        insert into team_memberships (team_id, user_id, role) values ($1, $2, 'member')`,
		teamID, userID)
	require.NoError(t, err)
	return userID
}
