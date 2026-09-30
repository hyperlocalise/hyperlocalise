package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sort"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestOrgIssuesAutumnDeny(t *testing.T) {
	api, scope := issueSheetTestAPIRole(t, false, "admin")
	req := issueSheetAuthedRequest(http.MethodGet, scope.OrgPath("/issues"), "")
	rec := issueSheetServeOrg(api, scope.WorkOSUserID, req)
	require.Equal(t, http.StatusForbidden, rec.Code)
	require.Contains(t, rec.Body.String(), "feature_unavailable")
}

func TestOrgIssuesUnauthorized(t *testing.T) {
	api, scope := issueSheetTestAPIRole(t, true, "admin")
	req := httptest.NewRequest(http.MethodGet, scope.OrgPath("/issues"), nil)
	rec := issueSheetServeOrg(api, scope.WorkOSUserID, req)
	require.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestOrgIssuesViewMyWorkDefaults(t *testing.T) {
	api, scope := issueSheetTestAPIRole(t, true, "admin")
	otherUser := mustSecondUser(t, scope)

	idResolvedMine, _ := mustOrgIssueFull(t, scope, scope.ProjectID, 1, "Resolved mine", "resolved", "", &scope.UserID)
	idOpenMine, _ := mustOrgIssueFull(t, scope, scope.ProjectID, 2, "Open mine", "open", "", &scope.UserID)
	idOpenOther, _ := mustOrgIssueFull(t, scope, scope.ProjectID, 3, "Open other", "open", "", &otherUser)

	req := issueSheetAuthedRequest(http.MethodGet, scope.OrgPath("/issues?view=my_work"), "")
	rec := issueSheetServeOrg(api, scope.WorkOSUserID, req)
	require.Equal(t, http.StatusOK, rec.Code)
	ids := decodeOrgIssueIDs(t, rec.Body.Bytes())
	require.Contains(t, ids, idOpenMine)
	require.NotContains(t, ids, idResolvedMine, "my_work's implicit status filter should exclude resolved issues")
	require.NotContains(t, ids, idOpenOther, "my_work's implicit assignee filter should exclude other users' issues")

	req2 := issueSheetAuthedRequest(http.MethodGet, scope.OrgPath("/issues?view=my_work&status=resolved"), "")
	rec2 := issueSheetServeOrg(api, scope.WorkOSUserID, req2)
	require.Equal(t, http.StatusOK, rec2.Code)
	ids2 := decodeOrgIssueIDs(t, rec2.Body.Bytes())
	require.Contains(t, ids2, idResolvedMine)
	require.NotContains(t, ids2, idOpenMine)
	require.NotContains(t, ids2, idOpenOther, "the assignee default still applies even when status is overridden")
}

func TestOrgIssuesSummaryUnaffectedByFilters(t *testing.T) {
	api, scope := issueSheetTestAPIRole(t, true, "admin")
	mustOrgIssueFull(t, scope, scope.ProjectID, 1, "Open one", "open", "", nil)
	mustOrgIssueFull(t, scope, scope.ProjectID, 2, "Resolved one", "resolved", "", nil)

	req := issueSheetAuthedRequest(http.MethodGet, scope.OrgPath("/issues?status=open"), "")
	rec := issueSheetServeOrg(api, scope.WorkOSUserID, req)
	require.Equal(t, http.StatusOK, rec.Code)

	var resp struct {
		Issues  []map[string]any `json:"issues"`
		Summary map[string]int   `json:"summary"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Len(t, resp.Issues, 1, "the filtered list should only contain the open issue")
	require.Equal(t, 2, resp.Summary["total"], "summary must total all issues regardless of the status filter")
	require.Equal(t, 1, resp.Summary["open"])
	require.Equal(t, 1, resp.Summary["resolved"])
}

func TestOrgIssuesIDTiebreak(t *testing.T) {
	api, scope := issueSheetTestAPIRole(t, true, "admin")
	fixed := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	ids := make([]string, 0, 4)
	for i := 1; i <= 4; i++ {
		id, _ := mustOrgIssueFull(t, scope, scope.ProjectID, i, "Tie", "", "", nil)
		_, err := scope.Pool.Exec(t.Context(), `update issue_sheet_issues set updated_at=$1 where id=$2`, fixed, id)
		require.NoError(t, err)
		ids = append(ids, id)
	}
	sort.Strings(ids)

	req := issueSheetAuthedRequest(http.MethodGet, scope.OrgPath("/issues?limit=2&offset=0"), "")
	rec := issueSheetServeOrg(api, scope.WorkOSUserID, req)
	require.Equal(t, http.StatusOK, rec.Code)
	page1 := decodeOrgIssueIDs(t, rec.Body.Bytes())
	require.Equal(t, ids[:2], page1, "tied updated_at must fall back to id ASC")

	req2 := issueSheetAuthedRequest(http.MethodGet, scope.OrgPath("/issues?limit=2&offset=2"), "")
	rec2 := issueSheetServeOrg(api, scope.WorkOSUserID, req2)
	require.Equal(t, http.StatusOK, rec2.Code)
	page2 := decodeOrgIssueIDs(t, rec2.Body.Bytes())
	require.Equal(t, ids[2:], page2, "second page must continue the same id ASC tiebreak with no overlap")
}

func TestOrgIssuesTeamScoping(t *testing.T) {
	api, scope := issueSheetTestAPIRole(t, true, "member")
	projectA := scope.ProjectID
	teamA := scope.MustTeam(t, "team-a", "Team A", "member")
	teamB := scope.MustTeam(t, "team-b", "Team B", "")
	mustSetProjectTeam(t, scope, projectA, teamA)
	projectB := newOrgProject(t, scope, "Team B Project")
	mustSetProjectTeam(t, scope, projectB, teamB)

	idA, _ := mustOrgIssueFull(t, scope, projectA, 1, "In team A", "", "", nil)
	idB, _ := mustOrgIssueFull(t, scope, projectB, 1, "In team B", "", "", nil)

	req := issueSheetAuthedRequest(http.MethodGet, scope.OrgPath("/issues"), "")
	rec := issueSheetServeOrg(api, scope.WorkOSUserID, req)
	require.Equal(t, http.StatusOK, rec.Code)
	ids := decodeOrgIssueIDs(t, rec.Body.Bytes())
	require.Contains(t, ids, idA)
	require.NotContains(t, ids, idB, "a member without team B access must not see team B's issues")
}

func TestOrgIssuesOrgWideRoleSeesAllTeams(t *testing.T) {
	api, scope := issueSheetTestAPIRole(t, true, "admin")
	projectA := scope.ProjectID
	teamA := scope.MustTeam(t, "team-a", "Team A", "")
	teamB := scope.MustTeam(t, "team-b", "Team B", "")
	mustSetProjectTeam(t, scope, projectA, teamA)
	projectB := newOrgProject(t, scope, "Team B Project")
	mustSetProjectTeam(t, scope, projectB, teamB)

	idA, _ := mustOrgIssueFull(t, scope, projectA, 1, "In team A", "", "", nil)
	idB, _ := mustOrgIssueFull(t, scope, projectB, 1, "In team B", "", "", nil)

	req := issueSheetAuthedRequest(http.MethodGet, scope.OrgPath("/issues"), "")
	rec := issueSheetServeOrg(api, scope.WorkOSUserID, req)
	require.Equal(t, http.StatusOK, rec.Code)
	ids := decodeOrgIssueIDs(t, rec.Body.Bytes())
	require.Contains(t, ids, idA)
	require.Contains(t, ids, idB, "admin (org-wide) must see issues in every team's projects")
}

func TestOrgIssuesSearchIncludesProjectName(t *testing.T) {
	api, scope := issueSheetTestAPIRole(t, true, "admin")
	_, err := scope.Pool.Exec(t.Context(), `update projects set name=$1 where id=$2`, "Zephyr Marketing", scope.ProjectID)
	require.NoError(t, err)
	id, _ := mustOrgIssueFull(t, scope, scope.ProjectID, 1, "Unrelated title", "", "", nil)

	req := issueSheetAuthedRequest(http.MethodGet, scope.OrgPath("/issues?search=Zephyr"), "")
	rec := issueSheetServeOrg(api, scope.WorkOSUserID, req)
	require.Equal(t, http.StatusOK, rec.Code)
	require.Contains(t, decodeOrgIssueIDs(t, rec.Body.Bytes()), id)
}

func TestOrgIssuesInvalidQuery(t *testing.T) {
	api, scope := issueSheetTestAPIRole(t, true, "admin")
	req := issueSheetAuthedRequest(http.MethodGet, scope.OrgPath("/issues?limit=101"), "")
	rec := issueSheetServeOrg(api, scope.WorkOSUserID, req)
	require.Equal(t, http.StatusBadRequest, rec.Code)
	require.Contains(t, rec.Body.String(), "invalid_organization_issues_query")
}

func decodeOrgIssueIDs(t *testing.T, body []byte) []string {
	t.Helper()
	var resp struct {
		Issues []map[string]any `json:"issues"`
	}
	require.NoError(t, json.Unmarshal(body, &resp))
	ids := make([]string, 0, len(resp.Issues))
	for _, issue := range resp.Issues {
		ids = append(ids, issue["id"].(string))
	}
	return ids
}
