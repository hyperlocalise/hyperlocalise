package main

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestMentionSuggestionsUsersOrderedByName(t *testing.T) {
	api, scope := notificationsTestAPI(t, "admin")
	_, err := scope.Pool.Exec(t.Context(), `update users set first_name='Zed', last_name='Owner' where id=$1`, scope.UserID)
	require.NoError(t, err)
	other := mustSecondUser(t, scope)
	_, err = scope.Pool.Exec(t.Context(), `update users set first_name='Ada', last_name='Lovelace' where id=$1`, other)
	require.NoError(t, err)
	_, err = scope.Pool.Exec(t.Context(), `
        insert into organization_memberships (organization_id, user_id, workos_membership_id, role)
        values ($1, $2, $3, 'member')`, scope.OrganizationID, other, "om_"+other[:8])
	require.NoError(t, err)

	req := issueSheetAuthedRequest(http.MethodGet, scope.OrgPath("/mentions"), "")
	rec := notificationsServe(api, scope.WorkOSUserID, req)
	require.Equal(t, http.StatusOK, rec.Code)

	var resp struct {
		MentionSuggestions struct {
			Users []map[string]any `json:"users"`
		} `json:"mentionSuggestions"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Len(t, resp.MentionSuggestions.Users, 2)
	require.Equal(t, "Ada Lovelace", resp.MentionSuggestions.Users[0]["displayName"])
	require.Equal(t, "Zed Owner", resp.MentionSuggestions.Users[1]["displayName"])
}

func TestMentionSuggestionsUsersFilteredByQuery(t *testing.T) {
	api, scope := notificationsTestAPI(t, "admin")
	other := mustSecondUser(t, scope)
	_, err := scope.Pool.Exec(t.Context(), `update users set first_name='Ada', last_name='Lovelace' where id=$1`, other)
	require.NoError(t, err)
	_, err = scope.Pool.Exec(t.Context(), `
        insert into organization_memberships (organization_id, user_id, workos_membership_id, role)
        values ($1, $2, $3, 'member')`, scope.OrganizationID, other, "om_"+other[:8])
	require.NoError(t, err)

	req := issueSheetAuthedRequest(http.MethodGet, scope.OrgPath("/mentions?q=lovelace"), "")
	rec := notificationsServe(api, scope.WorkOSUserID, req)
	require.Equal(t, http.StatusOK, rec.Code)

	var resp struct {
		MentionSuggestions struct {
			Users []map[string]any `json:"users"`
		} `json:"mentionSuggestions"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Len(t, resp.MentionSuggestions.Users, 1)
	require.Equal(t, other, resp.MentionSuggestions.Users[0]["userId"])
}

func TestMentionSuggestionsIssuesOrderedAscending(t *testing.T) {
	api, scope := notificationsTestAPI(t, "admin")
	older, _ := mustOrgIssueFull(t, scope, scope.ProjectID, 1, "Alpha match", "", "", nil)
	newer, _ := mustOrgIssueFull(t, scope, scope.ProjectID, 2, "Beta match", "", "", nil)
	_, err := scope.Pool.Exec(t.Context(), `update issue_sheet_issues set updated_at = now() - interval '1 hour' where id=$1`, older)
	require.NoError(t, err)
	_, err = scope.Pool.Exec(t.Context(), `update issue_sheet_issues set updated_at = now() where id=$1`, newer)
	require.NoError(t, err)

	req := issueSheetAuthedRequest(http.MethodGet, scope.OrgPath("/mentions?q=match"), "")
	rec := notificationsServe(api, scope.WorkOSUserID, req)
	require.Equal(t, http.StatusOK, rec.Code)

	var resp struct {
		MentionSuggestions struct {
			Issues []map[string]any `json:"issues"`
		} `json:"mentionSuggestions"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Len(t, resp.MentionSuggestions.Issues, 2)
	require.Equal(t, older, resp.MentionSuggestions.Issues[0]["issueId"], "the older (less-recently-updated) issue must come first")
	require.Equal(t, newer, resp.MentionSuggestions.Issues[1]["issueId"])
}

func TestMentionSuggestionsIssuesScopedAndFiltered(t *testing.T) {
	api, scope := notificationsTestAPI(t, "member")
	projectA := scope.ProjectID
	teamA := scope.MustTeam(t, "team-a", "Team A", "member")
	teamB := scope.MustTeam(t, "team-b", "Team B", "")
	mustSetProjectTeam(t, scope, projectA, teamA)
	projectB := newOrgProject(t, scope, "Team B Project")
	mustSetProjectTeam(t, scope, projectB, teamB)

	visible, _ := mustOrgIssueFull(t, scope, projectA, 1, "Findable in A", "", "", nil)
	excludedByTeam, _ := mustOrgIssueFull(t, scope, projectB, 1, "Findable in B", "", "", nil)

	req := issueSheetAuthedRequest(http.MethodGet, scope.OrgPath("/mentions?q=Findable"), "")
	rec := notificationsServe(api, scope.WorkOSUserID, req)
	require.Equal(t, http.StatusOK, rec.Code)

	var resp struct {
		MentionSuggestions struct {
			Issues []map[string]any `json:"issues"`
		} `json:"mentionSuggestions"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	got := make([]string, 0, len(resp.MentionSuggestions.Issues))
	for _, issue := range resp.MentionSuggestions.Issues {
		got = append(got, issue["issueId"].(string))
	}
	require.Contains(t, got, visible)
	require.NotContains(t, got, excludedByTeam, "issues in an inaccessible team's project must never appear in suggestions")

	req2 := issueSheetAuthedRequest(http.MethodGet, scope.OrgPath("/mentions?q=Findable&issueId="+visible), "")
	rec2 := notificationsServe(api, scope.WorkOSUserID, req2)
	var resp2 struct {
		MentionSuggestions struct {
			Issues []map[string]any `json:"issues"`
		} `json:"mentionSuggestions"`
	}
	require.NoError(t, json.Unmarshal(rec2.Body.Bytes(), &resp2))
	for _, issue := range resp2.MentionSuggestions.Issues {
		require.NotEqual(t, visible, issue["issueId"], "issueId param must exclude that issue from its own suggestions")
	}
}

func TestMentionSuggestionsDisplayKey(t *testing.T) {
	api, scope := notificationsTestAPI(t, "admin")
	withRef, _ := mustOrgIssueFull(t, scope, scope.ProjectID, 1, "Has external ref", "", "", nil)
	_, err := scope.Pool.Exec(t.Context(), `update issue_sheet_issues set external_ref='JIRA-42' where id=$1`, withRef)
	require.NoError(t, err)
	withoutRef, _ := mustOrgIssueFull(t, scope, scope.ProjectID, 2, "No external ref", "", "", nil)

	req := issueSheetAuthedRequest(http.MethodGet, scope.OrgPath("/mentions?q=external+ref"), "")
	rec := notificationsServe(api, scope.WorkOSUserID, req)
	require.Equal(t, http.StatusOK, rec.Code)

	var resp struct {
		MentionSuggestions struct {
			Issues []map[string]any `json:"issues"`
		} `json:"mentionSuggestions"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	byID := map[string]map[string]any{}
	for _, issue := range resp.MentionSuggestions.Issues {
		byID[issue["issueId"].(string)] = issue
	}
	require.Equal(t, "JIRA-42", byID[withRef]["displayKey"])
	require.Len(t, byID[withoutRef]["displayKey"], 8, "fallback display key is the first 8 chars of the id, uppercased")
	require.Equal(t, withoutRef[:8], toLower(byID[withoutRef]["displayKey"].(string)))
}

func toLower(s string) string {
	b := []byte(s)
	for i, c := range b {
		if c >= 'A' && c <= 'Z' {
			b[i] = c + ('a' - 'A')
		}
	}
	return string(b)
}

func TestMentionSuggestionsInvalidQuery(t *testing.T) {
	api, scope := notificationsTestAPI(t, "admin")
	req := issueSheetAuthedRequest(http.MethodGet, scope.OrgPath("/mentions?limit=21"), "")
	rec := notificationsServe(api, scope.WorkOSUserID, req)
	require.Equal(t, http.StatusBadRequest, rec.Code)
	require.Contains(t, rec.Body.String(), "invalid_mention_suggestions_query")
}
