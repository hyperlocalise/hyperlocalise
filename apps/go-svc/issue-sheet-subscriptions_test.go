package main

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"
)

func TestTrimSpaceJoin(t *testing.T) {
	ada, lovelace := "Ada", "Lovelace"
	require.Equal(t, "Ada Lovelace", stringsTrimJoin(&ada, &lovelace))
	require.Equal(t, "Ada", stringsTrimJoin(&ada, nil))
	require.Equal(t, "Lovelace", stringsTrimJoin(nil, &lovelace))
	require.Equal(t, "", stringsTrimJoin(nil, nil))
	require.Equal(t, "Ada Lovelace", trimSpaceJoin("Ada", "Lovelace"))
	require.Equal(t, "Ada", trimSpaceJoin("Ada", ""))
	require.Equal(t, "Lovelace", trimSpaceJoin("", "Lovelace"))
}

func TestIssueSheetListSubscriptions(t *testing.T) {
	ada, lovelace, email := "Ada", "Lovelace", "ada@example.com"
	avatar := "https://example.com/a.png"
	api := &issueSheetAPI{pool: newIssueSheetScriptDB(t,
		issueSheetRow("select id from issue_sheet_issues", "issue-1"),
		issueSheetDBStep{kind: "query", sql: "from issue_sheet_subscriptions", values: [][]any{
			{"user-1", &ada, &lovelace, &email, &avatar},
			{"user-2", &ada, (*string)(nil), (*string)(nil), (*string)(nil)},
			{"user-3", (*string)(nil), &lovelace, (*string)(nil), (*string)(nil)},
			{"user-4", (*string)(nil), (*string)(nil), &email, (*string)(nil)},
			{"user-5", (*string)(nil), (*string)(nil), (*string)(nil), (*string)(nil)},
		}},
	)}
	actor := issueSheetActor{userID: "user-1", organizationID: issueSheetTestOrgID, role: "admin"}
	project := issueSheetProject{ID: "proj_1"}
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.SetPathValue("issueId", "HL-1")
	value, status, err := api.listSubscriptionsHandler(req, actor, project)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, status)
	subscribers := value.(map[string]any)["subscribers"].([]map[string]any)
	require.Equal(t, "Ada Lovelace", subscribers[0]["displayName"])
	require.Equal(t, "Ada", subscribers[1]["displayName"])
	require.Equal(t, "Lovelace", subscribers[2]["displayName"])
	require.Equal(t, "ada@example.com", subscribers[3]["displayName"])
	require.Equal(t, "user-5", subscribers[4]["displayName"])
	require.Equal(t, &avatar, subscribers[0]["avatarUrl"])
}

func TestIssueSheetListSubscriptionsErrors(t *testing.T) {
	actor := issueSheetActor{organizationID: issueSheetTestOrgID, role: "admin"}
	project := issueSheetProject{ID: "proj_1"}

	t.Run("missing issue", func(t *testing.T) {
		api := &issueSheetAPI{pool: newIssueSheetScriptDB(t, issueSheetDBStep{
			kind: "row", sql: "select id from issue_sheet_issues", err: pgx.ErrNoRows,
		})}
		_, _, err := api.listSubscriptions(t.Context(), actor, project, "HL-9")
		var failure *issueSheetError
		require.ErrorAs(t, err, &failure)
		require.Equal(t, "issue_not_found", failure.code)
	})

	t.Run("query error", func(t *testing.T) {
		api := &issueSheetAPI{pool: newIssueSheetScriptDB(t,
			issueSheetRow("select id from issue_sheet_issues", "issue-1"),
			issueSheetDBStep{kind: "query", sql: "from issue_sheet_subscriptions", err: errors.New("db down")},
		)}
		_, _, err := api.listSubscriptions(t.Context(), actor, project, "HL-1")
		require.EqualError(t, err, "db down")
	})

	t.Run("rows error", func(t *testing.T) {
		api := &issueSheetAPI{pool: newIssueSheetScriptDB(t,
			issueSheetRow("select id from issue_sheet_issues", "issue-1"),
			issueSheetDBStep{kind: "query", sql: "from issue_sheet_subscriptions", rowsErr: errors.New("rows down")},
		)}
		_, _, err := api.listSubscriptions(t.Context(), actor, project, "HL-1")
		require.EqualError(t, err, "rows down")
	})
}

func TestIssueSheetWatchAndUnwatch(t *testing.T) {
	actor := issueSheetActor{userID: issueSheetTestUserID, organizationID: issueSheetTestOrgID, role: "admin"}
	project := issueSheetProject{ID: "proj_1"}
	created := time.Date(2026, 3, 2, 4, 5, 6, 0, time.UTC)

	t.Run("watch", func(t *testing.T) {
		api := &issueSheetAPI{pool: newIssueSheetScriptDB(t,
			issueSheetRow("select id from issue_sheet_issues", "issue-1"),
			issueSheetDBStep{kind: "exec", sql: "insert into issue_sheet_subscriptions", affected: 1},
			issueSheetRow("select created_at from issue_sheet_subscriptions", created),
		)}
		req := httptest.NewRequest(http.MethodPost, "/", nil)
		req.SetPathValue("issueId", "HL-1")
		value, status, err := api.watchIssueHandler(req, actor, project)
		require.NoError(t, err)
		require.Equal(t, http.StatusCreated, status)
		subscription := value.(map[string]any)["subscription"].(map[string]any)
		require.Equal(t, "issue-1", subscription["issueId"])
		require.Equal(t, issueSheetTestUserID, subscription["userId"])
		require.Equal(t, formatIssueSheetTime(created), subscription["createdAt"])
	})

	t.Run("watch missing after insert", func(t *testing.T) {
		api := &issueSheetAPI{pool: newIssueSheetScriptDB(t,
			issueSheetRow("select id from issue_sheet_issues", "issue-1"),
			issueSheetDBStep{kind: "exec", sql: "insert into issue_sheet_subscriptions", affected: 1},
			issueSheetDBStep{kind: "row", sql: "select created_at from issue_sheet_subscriptions", err: pgx.ErrNoRows},
		)}
		_, _, err := api.watchIssue(t.Context(), actor, project, "HL-1")
		var failure *issueSheetError
		require.ErrorAs(t, err, &failure)
		require.Equal(t, "issue_not_found", failure.code)
	})

	t.Run("watch insert error", func(t *testing.T) {
		api := &issueSheetAPI{pool: newIssueSheetScriptDB(t,
			issueSheetRow("select id from issue_sheet_issues", "issue-1"),
			issueSheetDBStep{kind: "exec", sql: "insert into issue_sheet_subscriptions", err: errors.New("db down")},
		)}
		_, _, err := api.watchIssue(t.Context(), actor, project, "HL-1")
		require.EqualError(t, err, "db down")
	})

	t.Run("watch lookup error", func(t *testing.T) {
		api := &issueSheetAPI{pool: newIssueSheetScriptDB(t,
			issueSheetRow("select id from issue_sheet_issues", "issue-1"),
			issueSheetDBStep{kind: "exec", sql: "insert into issue_sheet_subscriptions", affected: 1},
			issueSheetDBStep{kind: "row", sql: "select created_at from issue_sheet_subscriptions", err: errors.New("db down")},
		)}
		_, _, err := api.watchIssue(t.Context(), actor, project, "HL-1")
		require.EqualError(t, err, "db down")
	})

	t.Run("unwatch", func(t *testing.T) {
		api := &issueSheetAPI{pool: newIssueSheetScriptDB(t,
			issueSheetRow("select id from issue_sheet_issues", "issue-1"),
			issueSheetDBStep{kind: "exec", sql: "delete from issue_sheet_subscriptions", affected: 1},
		)}
		req := httptest.NewRequest(http.MethodDelete, "/", nil)
		req.SetPathValue("first", "HL-1")
		req.SetPathValue("second", "subscription")
		value, status, err := api.deleteTwoSegmentHandler(req, actor, project)
		require.NoError(t, err)
		require.Equal(t, http.StatusNoContent, status)
		require.Nil(t, value)
	})

	t.Run("unwatch missing issue", func(t *testing.T) {
		api := &issueSheetAPI{pool: newIssueSheetScriptDB(t, issueSheetDBStep{
			kind: "row", sql: "select id from issue_sheet_issues", err: pgx.ErrNoRows,
		})}
		_, _, err := api.unwatchIssue(t.Context(), actor, project, "HL-9")
		var failure *issueSheetError
		require.ErrorAs(t, err, &failure)
		require.Equal(t, "issue_not_found", failure.code)
	})

	t.Run("unwatch delete error", func(t *testing.T) {
		api := &issueSheetAPI{pool: newIssueSheetScriptDB(t,
			issueSheetRow("select id from issue_sheet_issues", "issue-1"),
			issueSheetDBStep{kind: "exec", sql: "delete from issue_sheet_subscriptions", err: errors.New("db down")},
		)}
		_, _, err := api.unwatchIssue(t.Context(), actor, project, "HL-1")
		require.EqualError(t, err, "db down")
	})
}
