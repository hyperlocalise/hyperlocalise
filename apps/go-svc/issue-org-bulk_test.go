package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"testing"

	"github.com/stretchr/testify/require"
)

func bulkActionBody(t *testing.T, payload map[string]any) string {
	t.Helper()
	raw, err := json.Marshal(payload)
	require.NoError(t, err)
	return string(raw)
}

func TestOrgBulkActionsAutumnDeny(t *testing.T) {
	api, scope := issueSheetTestAPIRole(t, false, "admin")
	req := issueSheetAuthedRequest(http.MethodPost, scope.OrgPath("/issues/bulk-actions"), `{}`)
	rec := issueSheetServeOrg(api, scope.WorkOSUserID, req)
	require.Equal(t, http.StatusForbidden, rec.Code)
	require.Contains(t, rec.Body.String(), "feature_unavailable")
}

func TestOrgBulkActionsMemberForbidden(t *testing.T) {
	api, scope := issueSheetTestAPIRole(t, true, "member")
	id, _ := mustOrgIssueFull(t, scope, scope.ProjectID, 1, "x", "", "", nil)
	body := bulkActionBody(t, map[string]any{
		"action": "unassign",
		"issues": []map[string]any{{"issueId": id, "projectId": scope.ProjectID}},
	})
	req := issueSheetAuthedRequest(http.MethodPost, scope.OrgPath("/issues/bulk-actions"), body)
	rec := issueSheetServeOrg(api, scope.WorkOSUserID, req)
	require.Equal(t, http.StatusForbidden, rec.Code)
	require.Contains(t, rec.Body.String(), "forbidden")
}

func TestOrgBulkActionsInvalidBody(t *testing.T) {
	api, scope := issueSheetTestAPIRole(t, true, "admin")

	cases := []string{
		`{"action":"not_a_real_action","issues":[{"issueId":"11111111-1111-4111-8111-111111111111","projectId":"p"}]}`,
		`{"action":"unassign","issues":[]}`,
		`{"action":"set_status","issues":[{"issueId":"11111111-1111-4111-8111-111111111111","projectId":"p"}]}`,
		`{"action":"assign","issues":[{"issueId":"not-a-uuid","projectId":"p"}],"assigneeUserId":"11111111-1111-4111-8111-111111111111"}`,
	}
	for _, body := range cases {
		req := issueSheetAuthedRequest(http.MethodPost, scope.OrgPath("/issues/bulk-actions"), body)
		rec := issueSheetServeOrg(api, scope.WorkOSUserID, req)
		require.Equal(t, http.StatusBadRequest, rec.Code, body)
		require.Contains(t, rec.Body.String(), "invalid_issue_bulk_action", body)
	}
}

func TestOrgBulkActionsTooManyItems(t *testing.T) {
	api, scope := issueSheetTestAPIRole(t, true, "admin")
	issues := make([]map[string]any, 101)
	for i := range issues {
		issues[i] = map[string]any{"issueId": "11111111-1111-4111-8111-111111111111", "projectId": scope.ProjectID}
	}
	body := bulkActionBody(t, map[string]any{"action": "unassign", "issues": issues})
	req := issueSheetAuthedRequest(http.MethodPost, scope.OrgPath("/issues/bulk-actions"), body)
	rec := issueSheetServeOrg(api, scope.WorkOSUserID, req)
	require.Equal(t, http.StatusBadRequest, rec.Code)
	require.Contains(t, rec.Body.String(), "invalid_issue_bulk_action")
}

func TestOrgBulkActionsPartialFailureAlwaysReturns200(t *testing.T) {
	api, scope := issueSheetTestAPIRole(t, true, "admin")
	idOK, _ := mustOrgIssueFull(t, scope, scope.ProjectID, 1, "Real", "open", "", nil)
	missingID := "22222222-2222-4222-8222-222222222222"

	body := bulkActionBody(t, map[string]any{
		"action": "set_status",
		"status": "resolved",
		"issues": []map[string]any{
			{"issueId": idOK, "projectId": scope.ProjectID},
			{"issueId": missingID, "projectId": scope.ProjectID},
		},
	})
	req := issueSheetAuthedRequest(http.MethodPost, scope.OrgPath("/issues/bulk-actions"), body)
	rec := issueSheetServeOrg(api, scope.WorkOSUserID, req)
	require.Equal(t, http.StatusOK, rec.Code, "bulk-actions must always return 200, even with partial failures")

	var resp struct {
		BulkAction struct {
			Requested int              `json:"requested"`
			Succeeded int              `json:"succeeded"`
			Failed    int              `json:"failed"`
			Unchanged int              `json:"unchanged"`
			Results   []map[string]any `json:"results"`
		} `json:"bulkAction"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Equal(t, 2, resp.BulkAction.Requested)
	require.Equal(t, 1, resp.BulkAction.Succeeded)
	require.Equal(t, 1, resp.BulkAction.Failed)
	require.Len(t, resp.BulkAction.Results, 2)

	byID := map[string]map[string]any{}
	for _, r := range resp.BulkAction.Results {
		byID[r["issueId"].(string)] = r
	}
	require.Equal(t, "updated", byID[idOK]["outcome"])
	require.Equal(t, "failed", byID[missingID]["outcome"])
	errObj := byID[missingID]["error"].(map[string]any)
	require.Equal(t, "issue_not_found", errObj["code"], "missing issue must never leak as a different error code")
}

func TestOrgBulkActionsDedupeCollapsesDuplicateTargets(t *testing.T) {
	api, scope := issueSheetTestAPIRole(t, true, "admin")
	id, _ := mustOrgIssueFull(t, scope, scope.ProjectID, 1, "Dup target", "open", "", nil)

	body := bulkActionBody(t, map[string]any{
		"action": "set_status",
		"status": "resolved",
		"issues": []map[string]any{
			{"issueId": id, "projectId": scope.ProjectID},
			{"issueId": id, "projectId": scope.ProjectID},
		},
	})
	req := issueSheetAuthedRequest(http.MethodPost, scope.OrgPath("/issues/bulk-actions"), body)
	rec := issueSheetServeOrg(api, scope.WorkOSUserID, req)
	require.Equal(t, http.StatusOK, rec.Code)

	var resp struct {
		BulkAction struct {
			Requested int `json:"requested"`
		} `json:"bulkAction"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Equal(t, 1, resp.BulkAction.Requested, "duplicate {projectId,issueId} pairs must collapse to one")

	var activityCount int
	require.NoError(t, scope.Pool.QueryRow(t.Context(),
		`select count(*) from issue_sheet_activities where issue_id=$1 and type='status_changed'`, id,
	).Scan(&activityCount))
	require.Equal(t, 1, activityCount, "a deduped target must only be applied once")
}

func TestOrgBulkActionsSetStatusUnchangedOutcome(t *testing.T) {
	api, scope := issueSheetTestAPIRole(t, true, "admin")
	id, _ := mustOrgIssueFull(t, scope, scope.ProjectID, 1, "Already open", "open", "", nil)

	body := bulkActionBody(t, map[string]any{
		"action": "set_status",
		"status": "open",
		"issues": []map[string]any{{"issueId": id, "projectId": scope.ProjectID}},
	})
	req := issueSheetAuthedRequest(http.MethodPost, scope.OrgPath("/issues/bulk-actions"), body)
	rec := issueSheetServeOrg(api, scope.WorkOSUserID, req)
	require.Equal(t, http.StatusOK, rec.Code)

	var resp struct {
		BulkAction struct {
			Unchanged int              `json:"unchanged"`
			Results   []map[string]any `json:"results"`
		} `json:"bulkAction"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Equal(t, 1, resp.BulkAction.Unchanged)
	require.Equal(t, "unchanged", resp.BulkAction.Results[0]["outcome"])
	require.Contains(t, resp.BulkAction.Results[0], "issue", "issue payload must be present even when unchanged")
}

func TestOrgBulkActionsAssignNotifiesNewAssigneeAndSubscribes(t *testing.T) {
	api, scope := issueSheetTestAPIRole(t, true, "admin")
	team := scope.MustTeam(t, "default", "Default", "")
	mustSetProjectTeam(t, scope, scope.ProjectID, team)
	assignee := mustAssignableOrgMember(t, scope, team)
	id, _ := mustOrgIssueFull(t, scope, scope.ProjectID, 1, "Needs assignee", "open", "", nil)

	body := bulkActionBody(t, map[string]any{
		"action":         "assign",
		"assigneeUserId": assignee,
		"issues":         []map[string]any{{"issueId": id, "projectId": scope.ProjectID}},
	})
	req := issueSheetAuthedRequest(http.MethodPost, scope.OrgPath("/issues/bulk-actions"), body)
	rec := issueSheetServeOrg(api, scope.WorkOSUserID, req)
	require.Equal(t, http.StatusOK, rec.Code)
	require.Contains(t, rec.Body.String(), `"outcome":"updated"`)

	var subscribed bool
	require.NoError(t, scope.Pool.QueryRow(t.Context(),
		`select exists(select 1 from issue_sheet_subscriptions where issue_id=$1 and user_id=$2)`, id, assignee,
	).Scan(&subscribed))
	require.True(t, subscribed, "assigning must auto-subscribe the new assignee")

	var notified bool
	require.NoError(t, scope.Pool.QueryRow(t.Context(),
		`select exists(select 1 from issue_notifications where issue_id=$1 and recipient_user_id=$2 and type='assigned')`, id, assignee,
	).Scan(&notified))
	require.True(t, notified, "the new assignee must get an 'assigned' notification row")
}

func TestOrgBulkActionsAssignRejectsIneligibleAssignee(t *testing.T) {
	api, scope := issueSheetTestAPIRole(t, true, "admin")
	ineligible := mustSecondUser(t, scope) // no org membership, no team access
	id, _ := mustOrgIssueFull(t, scope, scope.ProjectID, 1, "x", "open", "", nil)

	body := bulkActionBody(t, map[string]any{
		"action":         "assign",
		"assigneeUserId": ineligible,
		"issues":         []map[string]any{{"issueId": id, "projectId": scope.ProjectID}},
	})
	req := issueSheetAuthedRequest(http.MethodPost, scope.OrgPath("/issues/bulk-actions"), body)
	rec := issueSheetServeOrg(api, scope.WorkOSUserID, req)
	require.Equal(t, http.StatusOK, rec.Code)

	var resp struct {
		BulkAction struct {
			Results []map[string]any `json:"results"`
		} `json:"bulkAction"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Equal(t, "failed", resp.BulkAction.Results[0]["outcome"])
	errObj := resp.BulkAction.Results[0]["error"].(map[string]any)
	require.Equal(t, "assignee_not_assignable", errObj["code"])

	var assigneeAfter *string
	require.NoError(t, scope.Pool.QueryRow(t.Context(),
		`select assignee_user_id from issue_sheet_issues where id=$1`, id,
	).Scan(&assigneeAfter))
	require.Nil(t, assigneeAfter, "a rejected assign must not mutate the row")
}

func TestOrgBulkActionsSetPriorityUpsertsAndRecordsActivity(t *testing.T) {
	api, scope := issueSheetTestAPIRole(t, true, "admin")
	require.NoError(t, ensureIssueStarterColumns(t.Context(), scope.Pool, scope.OrganizationID, scope.ProjectID, scope.UserID))
	id, _ := mustOrgIssueFull(t, scope, scope.ProjectID, 1, "Needs priority", "open", "", nil)

	body := bulkActionBody(t, map[string]any{
		"action":   "set_priority",
		"priority": "P0",
		"issues":   []map[string]any{{"issueId": id, "projectId": scope.ProjectID}},
	})
	req := issueSheetAuthedRequest(http.MethodPost, scope.OrgPath("/issues/bulk-actions"), body)
	rec := issueSheetServeOrg(api, scope.WorkOSUserID, req)
	require.Equal(t, http.StatusOK, rec.Code)
	require.Contains(t, rec.Body.String(), `"outcome":"updated"`)

	var priority string
	require.NoError(t, scope.Pool.QueryRow(t.Context(), `
        select v.value #>> '{}' from issue_sheet_row_values v
        join issue_sheet_columns c on c.id = v.column_id
        where v.issue_id = $1 and c.key = 'priority'`, id,
	).Scan(&priority))
	require.Equal(t, "P0", priority)

	req2 := issueSheetAuthedRequest(http.MethodPost, scope.OrgPath("/issues/bulk-actions"), body)
	rec2 := issueSheetServeOrg(api, scope.WorkOSUserID, req2)
	require.Contains(t, rec2.Body.String(), `"outcome":"unchanged"`)

	var activityCount int
	require.NoError(t, scope.Pool.QueryRow(t.Context(),
		`select count(*) from issue_sheet_activities where issue_id=$1 and type='priority_changed'`, id,
	).Scan(&activityCount))
	require.Equal(t, 1, activityCount, "the unchanged repeat must not add a second activity row")
}

func TestOrgBulkActionsAssignSameIssueConcurrentSerializes(t *testing.T) {
	api, scope := issueSheetTestAPIRole(t, true, "admin")
	team := scope.MustTeam(t, "default", "Default", "")
	mustSetProjectTeam(t, scope, scope.ProjectID, team)
	id, _ := mustOrgIssueFull(t, scope, scope.ProjectID, 1, "Concurrent target", "open", "", nil)

	const concurrency = 3
	assignees := make([]string, concurrency)
	for i := range assignees {
		assignees[i] = mustAssignableOrgMember(t, scope, team)
	}

	var wg sync.WaitGroup
	codes := make([]int, concurrency)
	outcomes := make([]string, concurrency)
	for i := 0; i < concurrency; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			body := bulkActionBody(t, map[string]any{
				"action":         "assign",
				"assigneeUserId": assignees[i],
				"issues":         []map[string]any{{"issueId": id, "projectId": scope.ProjectID}},
			})
			req := issueSheetAuthedRequest(http.MethodPost, scope.OrgPath("/issues/bulk-actions"), body)
			rec := issueSheetServeOrg(api, scope.WorkOSUserID, req)
			codes[i] = rec.Code
			var resp struct {
				BulkAction struct {
					Results []map[string]any `json:"results"`
				} `json:"bulkAction"`
			}
			if err := json.Unmarshal(rec.Body.Bytes(), &resp); err == nil && len(resp.BulkAction.Results) == 1 {
				outcomes[i], _ = resp.BulkAction.Results[0]["outcome"].(string)
			}
		}(i)
	}
	wg.Wait()

	for i, code := range codes {
		require.Equal(t, http.StatusOK, code, "request %d", i)
		require.Equal(t, "updated", outcomes[i], fmt.Sprintf(
			"request %d: a distinct-target assign must always observe a change under serialized row locking (got outcome %q)",
			i, outcomes[i]))
	}

	var activityCount int
	require.NoError(t, scope.Pool.QueryRow(t.Context(),
		`select count(*) from issue_sheet_activities where issue_id=$1 and type='assignee_changed'`, id,
	).Scan(&activityCount))
	require.Equal(t, concurrency, activityCount,
		"exactly one assignee_changed activity per request: no lost updates and no phantom duplicates under real concurrent load")

	var finalAssignee string
	require.NoError(t, scope.Pool.QueryRow(t.Context(),
		`select assignee_user_id from issue_sheet_issues where id=$1`, id,
	).Scan(&finalAssignee))
	require.Contains(t, assignees, finalAssignee, "final assignee must be exactly one of the concurrent requests' targets, never corrupted")
}
