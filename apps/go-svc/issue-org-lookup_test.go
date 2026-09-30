package main

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestOrgIssueSearchNarrowColumns(t *testing.T) {
	api, scope := issueSheetTestAPIRole(t, true, "admin")
	scope.MustTeam(t, "default", "Default", "admin")
	idTitleMatch, _ := mustOrgIssueFull(t, scope, scope.ProjectID, 1, "Zephyr login bug", "", "", nil)
	idDescOnlyMatch, _ := mustOrgIssueFull(t, scope, scope.ProjectID, 2, "Unrelated", "", "", nil)
	_, err := scope.Pool.Exec(t.Context(), `update issue_sheet_issues set description=$1 where id=$2`,
		"mentions zephyr in the description only", idDescOnlyMatch)
	require.NoError(t, err)

	req := issueSheetAuthedRequest(http.MethodGet, scope.OrgPath("/issue-sheet/search?q=zephyr"), "")
	rec := issueSheetServeOrg(api, scope.WorkOSUserID, req)
	require.Equal(t, http.StatusOK, rec.Code)
	require.Contains(t, rec.Body.String(), idTitleMatch)
	require.NotContains(t, rec.Body.String(), idDescOnlyMatch, "search must not match description, only title/external_ref")
}

func TestOrgIssueSearchScopedToAccessibleProjects(t *testing.T) {
	api, scope := issueSheetTestAPIRole(t, true, "member")
	projectA := scope.ProjectID
	teamA := scope.MustTeam(t, "team-a", "Team A", "member")
	teamB := scope.MustTeam(t, "team-b", "Team B", "")
	mustSetProjectTeam(t, scope, projectA, teamA)
	projectB := newOrgProject(t, scope, "Team B Project")
	mustSetProjectTeam(t, scope, projectB, teamB)

	idA, _ := mustOrgIssueFull(t, scope, projectA, 1, "Findable A", "", "", nil)
	idB, _ := mustOrgIssueFull(t, scope, projectB, 1, "Findable B", "", "", nil)

	req := issueSheetAuthedRequest(http.MethodGet, scope.OrgPath("/issue-sheet/search?q=Findable"), "")
	rec := issueSheetServeOrg(api, scope.WorkOSUserID, req)
	require.Equal(t, http.StatusOK, rec.Code)
	require.Contains(t, rec.Body.String(), idA)
	require.NotContains(t, rec.Body.String(), idB)
}

func TestOrgIssueDetailUniform404(t *testing.T) {
	api, scope := issueSheetTestAPIRole(t, true, "member")
	projectA := scope.ProjectID
	teamA := scope.MustTeam(t, "team-a", "Team A", "member")
	teamB := scope.MustTeam(t, "team-b", "Team B", "")
	mustSetProjectTeam(t, scope, projectA, teamA)
	projectB := newOrgProject(t, scope, "Team B Project")
	mustSetProjectTeam(t, scope, projectB, teamB)
	_, crossIdentifier := mustOrgIssueFull(t, scope, projectB, 1, "Not mine", "", "", nil)

	reqMissing := issueSheetAuthedRequest(http.MethodGet, scope.OrgPath("/issue-sheet/DOES-NOT-EXIST"), "")
	recMissing := issueSheetServeOrg(api, scope.WorkOSUserID, reqMissing)
	require.Equal(t, http.StatusNotFound, recMissing.Code)
	require.Contains(t, recMissing.Body.String(), "issue_not_found")

	reqCross := issueSheetAuthedRequest(http.MethodGet, scope.OrgPath("/issue-sheet/"+crossIdentifier), "")
	recCross := issueSheetServeOrg(api, scope.WorkOSUserID, reqCross)
	require.Equal(t, http.StatusNotFound, recCross.Code)
	require.Contains(t, recCross.Body.String(), "issue_not_found")

	require.JSONEq(t, recMissing.Body.String(), recCross.Body.String(),
		"missing and cross-team-inaccessible issues must return identical bodies so existence is never leaked")
}

func TestOrgIssueDetailIncludesProjectMeta(t *testing.T) {
	api, scope := issueSheetTestAPIRole(t, true, "admin")
	scope.MustTeam(t, "default", "Default", "admin")
	_, err := scope.Pool.Exec(t.Context(), `update projects set name=$1 where id=$2`, "Nova", scope.ProjectID)
	require.NoError(t, err)
	_, identifier := mustOrgIssueFull(t, scope, scope.ProjectID, 1, "Detail check", "", "", nil)

	req := issueSheetAuthedRequest(http.MethodGet, scope.OrgPath("/issue-sheet/"+identifier), "")
	rec := issueSheetServeOrg(api, scope.WorkOSUserID, req)
	require.Equal(t, http.StatusOK, rec.Code)

	var resp struct {
		Issue map[string]any `json:"issue"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Equal(t, scope.ProjectID, resp.Issue["projectId"])
	require.Equal(t, "Nova", resp.Issue["projectName"])
	require.Contains(t, resp.Issue, "isWatching")
	require.Contains(t, resp.Issue, "values")
}

func TestOrgIssueDetailAcceptsLegacyUUID(t *testing.T) {
	api, scope := issueSheetTestAPIRole(t, true, "admin")
	scope.MustTeam(t, "default", "Default", "admin")
	id, _ := mustOrgIssueFull(t, scope, scope.ProjectID, 1, "By UUID", "", "", nil)

	req := issueSheetAuthedRequest(http.MethodGet, scope.OrgPath("/issue-sheet/"+id), "")
	rec := issueSheetServeOrg(api, scope.WorkOSUserID, req)
	require.Equal(t, http.StatusOK, rec.Code)
}

func TestOrgIssueSearchInvalidQuery(t *testing.T) {
	api, scope := issueSheetTestAPIRole(t, true, "admin")
	req := issueSheetAuthedRequest(http.MethodGet, scope.OrgPath("/issue-sheet/search?limit=51"), "")
	rec := issueSheetServeOrg(api, scope.WorkOSUserID, req)
	require.Equal(t, http.StatusBadRequest, rec.Code)
	require.Contains(t, rec.Body.String(), "invalid_issue_search_query")
}
