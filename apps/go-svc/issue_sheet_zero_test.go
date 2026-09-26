package main

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"
)

func issueReq(method, target, body string) *http.Request {
	req := httptest.NewRequest(method, target, strings.NewReader(body))
	return req
}

func TestOwnedIssueSheetProject(t *testing.T) {
	actor := issueSheetActor{userID: "user", organizationID: "org", role: "admin"}
	api := &issueSheetAPI{pool: errorPool{err: errors.New("db")}}
	_, err := api.ownedProject(context.Background(), actor, "  ")
	require.EqualError(t, err, "project_not_found")

	_, err = api.ownedProject(context.Background(), actor, "project_1")
	require.EqualError(t, err, "db")

	pool := &scriptPool{steps: []dbStep{{op: opQueryRow, err: pgx.ErrNoRows}}}
	api.pool = pool
	_, err = api.ownedProject(context.Background(), actor, "project_1")
	require.EqualError(t, err, "project_not_found")

	pool = &scriptPool{steps: []dbStep{{op: opQueryRow, scan: []any{"project_1", "PROJ"}}}}
	api.pool = pool
	project, err := api.ownedProject(context.Background(), actor, "project_1")
	require.NoError(t, err)
	require.Equal(t, issueSheetProject{ID: "project_1", Identifier: "PROJ"}, project)
}

func TestResolveIssueID(t *testing.T) {
	api := &issueSheetAPI{}
	legacy := uuid.NewString()
	pool := &scriptPool{steps: []dbStep{{op: opQueryRow, scan: []any{legacy}}}}
	api.pool = pool
	id, err := api.resolveIssueID(context.Background(), "org", "project", legacy)
	require.NoError(t, err)
	require.Equal(t, legacy, id)

	pool = &scriptPool{steps: []dbStep{{op: opQueryRow, err: pgx.ErrNoRows}}}
	api.pool = pool
	_, err = api.resolveIssueID(context.Background(), "org", "project", "PROJ-1")
	require.EqualError(t, err, "issue_not_found")

	pool = &scriptPool{steps: []dbStep{{op: opQueryRow, err: errors.New("db")}}}
	api.pool = pool
	_, err = api.resolveIssueID(context.Background(), "org", "project", "PROJ-1")
	require.EqualError(t, err, "db")
}

func TestMapTemplateConfig(t *testing.T) {
	api := &issueSheetAPI{}
	config, err := api.mapTemplateConfig(context.Background(), "org", "project", nil)
	require.NoError(t, err)
	require.Nil(t, config["defaultTemplateKey"])
	require.Empty(t, config["assigneeByTemplate"])

	_, err = api.mapTemplateConfig(context.Background(), "org", "project", []byte("{"))
	require.Error(t, err)

	pool := &scriptPool{steps: []dbStep{
		{op: opQueryRow, scan: []any{false}},
		{op: opQueryRow, err: errors.New("db")},
	}}
	api.pool = pool
	config, err = api.mapTemplateConfig(context.Background(), "org", "project", []byte(`{
        "defaultTemplateKey": "bug",
        "assigneeByTemplate": {"bug": "user-a"}
    }`))
	require.NoError(t, err)
	require.Equal(t, "bug", config["defaultTemplateKey"])
	assignees := config["assigneeByTemplate"].([]map[string]any)
	require.Equal(t, "user-a", assignees[0]["userId"])
	require.Equal(t, false, assignees[0]["assignable"])

	_, err = api.mapTemplateConfig(context.Background(), "org", "project", []byte(`{"assigneeByTemplate":{"bug":"user-b"}}`))
	require.EqualError(t, err, "db")
}

func TestTemplateConfigHandlers(t *testing.T) {
	actor := issueSheetActor{organizationID: "org", role: "admin"}
	project := issueSheetProject{ID: "project"}
	pool := &scriptPool{steps: []dbStep{
		{op: opQueryRow, scan: []any{true}},
		{op: opExec},
		{op: opQueryRow, scan: []any{[]byte(`{"defaultTemplateKey":"bug","assigneeByTemplate":{"bug":"user-a"}}`)}},
		{op: opQueryRow, scan: []any{true}},
	}}
	api := &issueSheetAPI{pool: pool}
	body, status, err := api.putTemplateConfig(context.Background(), actor, project, issueReq(http.MethodPut, "/", `{"defaultTemplateKey":"bug","assigneeByTemplate":{"bug":"user-a"}}`))
	require.NoError(t, err)
	require.Equal(t, 200, status)
	require.NotNil(t, body)
	require.NoError(t, pool.failed)

	_, _, err = api.putTemplateConfig(context.Background(), actor, project, issueReq(http.MethodPut, "/", "{"))
	require.EqualError(t, err, "invalid_issue_sheet_payload")

	member := issueSheetActor{role: "member"}
	_, _, err = api.putTemplateConfigHandler(issueReq(http.MethodPut, "/", "{}"), member, project)
	require.EqualError(t, err, "forbidden")

	api.pool = errorPool{err: errors.New("db")}
	_, _, err = api.getTemplateConfigHandler(issueReq(http.MethodGet, "/", ""), actor, project)
	require.EqualError(t, err, "db")
}

func TestListSubscriptionsDisplayNames(t *testing.T) {
	first, last, email := "Ada", "Lovelace", "ada@example.com"
	pool := &scriptPool{steps: []dbStep{
		{op: opQueryRow, scan: []any{"issue-1"}},
		{op: opQuery, table: [][]any{
			{"user-a", &first, &last, &email, nil},
			{"user-b", nil, nil, &email, nil},
			{"user-c", nil, nil, nil, nil},
		}},
	}}
	api := &issueSheetAPI{pool: pool}
	actor := issueSheetActor{organizationID: "org", userID: "user"}
	project := issueSheetProject{ID: "project"}
	body, status, err := api.listSubscriptions(context.Background(), actor, project, "PROJ-1")
	require.NoError(t, err)
	require.Equal(t, 200, status)
	subscribers := body.(map[string]any)["subscribers"].([]map[string]any)
	require.Equal(t, "Ada Lovelace", subscribers[0]["displayName"])
	require.Equal(t, email, subscribers[1]["displayName"])
	require.Equal(t, "user-c", subscribers[2]["displayName"])

	api.pool = &scriptPool{steps: []dbStep{{op: opQueryRow, err: pgx.ErrNoRows}}}
	_, _, err = api.listSubscriptions(context.Background(), actor, project, "PROJ-1")
	require.EqualError(t, err, "issue_not_found")

	api.pool = &scriptPool{steps: []dbStep{
		{op: opQueryRow, scan: []any{"issue-1"}},
		{op: opQuery, err: errors.New("db")},
	}}
	_, _, err = api.listSubscriptions(context.Background(), actor, project, "PROJ-1")
	require.EqualError(t, err, "db")

	api.pool = &scriptPool{steps: []dbStep{
		{op: opQueryRow, scan: []any{"issue-1"}},
		{op: opQuery, table: [][]any{{"user-a"}}},
	}}
	_, _, err = api.listSubscriptions(context.Background(), actor, project, "PROJ-1")
	require.Error(t, err)

	api.pool = &scriptPool{steps: []dbStep{
		{op: opQueryRow, scan: []any{"issue-1"}},
		{op: opQuery, rowsErr: errors.New("rows")},
	}}
	_, _, err = api.listSubscriptions(context.Background(), actor, project, "PROJ-1")
	require.EqualError(t, err, "rows")
}

func TestWatchAndUnwatchIssue(t *testing.T) {
	created := time.Date(2024, 5, 1, 12, 0, 0, 0, time.UTC)
	pool := &scriptPool{steps: []dbStep{
		{op: opQueryRow, scan: []any{"issue-1"}},
		{op: opExec},
		{op: opQueryRow, scan: []any{created}},
	}}
	api := &issueSheetAPI{pool: pool}
	actor := issueSheetActor{organizationID: "org", userID: "user"}
	project := issueSheetProject{ID: "project"}
	body, status, err := api.watchIssue(context.Background(), actor, project, "PROJ-1")
	require.NoError(t, err)
	require.Equal(t, 201, status)
	sub := body.(map[string]any)["subscription"].(map[string]any)
	require.Equal(t, "issue-1", sub["issueId"])
	require.Equal(t, "user", sub["userId"])

	api.pool = &scriptPool{steps: []dbStep{
		{op: opQueryRow, scan: []any{"issue-1"}},
		{op: opExec, err: errors.New("db")},
	}}
	_, _, err = api.watchIssue(context.Background(), actor, project, "PROJ-1")
	require.EqualError(t, err, "db")

	api.pool = &scriptPool{steps: []dbStep{
		{op: opQueryRow, scan: []any{"issue-1"}},
		{op: opExec},
		{op: opQueryRow, err: pgx.ErrNoRows},
	}}
	_, _, err = api.watchIssue(context.Background(), actor, project, "PROJ-1")
	require.EqualError(t, err, "issue_not_found")

	api.pool = &scriptPool{steps: []dbStep{
		{op: opQueryRow, scan: []any{"issue-1"}},
		{op: opExec},
	}}
	body, status, err = api.unwatchIssue(context.Background(), actor, project, "PROJ-1")
	require.NoError(t, err)
	require.Equal(t, 204, status)
	require.Nil(t, body)

	api.pool = &scriptPool{steps: []dbStep{
		{op: opQueryRow, scan: []any{"issue-1"}},
		{op: opExec, err: errors.New("db")},
	}}
	_, _, err = api.unwatchIssue(context.Background(), actor, project, "PROJ-1")
	require.EqualError(t, err, "db")
}

func TestIssueSheetHandlerGuards(t *testing.T) {
	member := issueSheetActor{role: "member", organizationID: "org", userID: "user"}
	admin := issueSheetActor{role: "admin", organizationID: "org", userID: "user"}
	project := issueSheetProject{ID: "project"}
	api := &issueSheetAPI{pool: errorPool{err: errors.New("db")}}
	req := issueReq(http.MethodPost, "/", "{}")

	_, _, err := api.createIssueHandler(req, member, project)
	require.EqualError(t, err, "forbidden")
	_, _, err = api.createColumnHandler(req, member, project)
	require.EqualError(t, err, "forbidden")
	_, _, err = api.reorderColumnsHandler(req, member, project)
	require.EqualError(t, err, "forbidden")
	_, _, err = api.putTemplateConfigHandler(req, member, project)
	require.EqualError(t, err, "forbidden")
	_, _, err = api.updateIssueHandler(req, member, project)
	require.EqualError(t, err, "forbidden")
	_, _, err = api.deleteIssueHandler(req, member, project)
	require.EqualError(t, err, "forbidden")
	_, _, err = api.createRelationshipHandler(req, member, project)
	require.EqualError(t, err, "forbidden")
	_, _, err = api.deleteRelationshipHandler(req, member, project)
	require.EqualError(t, err, "forbidden")

	columns := issueReq(http.MethodPatch, "/", "{}")
	columns.SetPathValue("first", "columns")
	columns.SetPathValue("second", "col")
	_, _, err = api.patchTwoSegmentHandler(columns, member, project)
	require.EqualError(t, err, "forbidden")
	_, _, err = api.deleteTwoSegmentHandler(columns, member, project)
	require.EqualError(t, err, "forbidden")

	values := issueReq(http.MethodPatch, "/", "{}")
	values.SetPathValue("first", "PROJ-1")
	values.SetPathValue("second", "values")
	_, _, err = api.patchTwoSegmentHandler(values, member, project)
	require.EqualError(t, err, "forbidden")

	other := issueReq(http.MethodPatch, "/", "{}")
	other.SetPathValue("first", "PROJ-1")
	other.SetPathValue("second", "nope")
	_, _, err = api.patchTwoSegmentHandler(other, admin, project)
	require.ErrorIs(t, err, errIssueSheetUnmatched)
	_, _, err = api.deleteTwoSegmentHandler(other, admin, project)
	require.ErrorIs(t, err, errIssueSheetUnmatched)

	sub := issueReq(http.MethodDelete, "/", "")
	sub.SetPathValue("first", "PROJ-1")
	sub.SetPathValue("second", "subscription")
	_, _, err = api.deleteTwoSegmentHandler(sub, member, project)
	require.EqualError(t, err, "db")

	_, _, err = api.listIssuesHandler(issueReq(http.MethodGet, "/", ""), admin, project)
	require.Error(t, err)
	_, _, err = api.listAssignableMembersHandler(issueReq(http.MethodGet, "/", ""), admin, project)
	require.Error(t, err)
	_, _, err = api.listColumnsHandler(issueReq(http.MethodGet, "/", ""), admin, project)
	require.EqualError(t, err, "db")
	_, _, err = api.getIssueHandler(issueReq(http.MethodGet, "/", ""), admin, project)
	require.Error(t, err)
	feed := issueReq(http.MethodGet, "/", "")
	feed.SetPathValue("issueId", "PROJ-1")
	_, _, err = api.listFeedHandler(feed, admin, project)
	require.Error(t, err)
	_, _, err = api.listSubscriptionsHandler(feed, admin, project)
	require.Error(t, err)
	_, _, err = api.watchIssueHandler(feed, admin, project)
	require.Error(t, err)
	_, _, err = api.createCommentHandler(issueReq(http.MethodPost, "/", "{}"), admin, project)
	require.Error(t, err)
	comment := issueReq(http.MethodPatch, "/", "{}")
	comment.SetPathValue("issueId", "PROJ-1")
	comment.SetPathValue("commentId", "c1")
	_, _, err = api.updateCommentHandler(comment, admin, project)
	require.Error(t, err)
	_, _, err = api.deleteCommentHandler(comment, admin, project)
	require.Error(t, err)
	_, _, err = api.listRelationshipsHandler(feed, admin, project)
	require.Error(t, err)

	adminReq := issueReq(http.MethodPost, "/", "{")
	adminReq.SetPathValue("issueId", "PROJ-1")
	_, _, err = api.createIssueHandler(adminReq, admin, project)
	require.Error(t, err)
	_, _, err = api.createColumnHandler(adminReq, admin, project)
	require.Error(t, err)
	_, _, err = api.createRelationshipHandler(adminReq, admin, project)
	require.Error(t, err)
	_, _, err = api.deleteRelationshipHandler(adminReq, admin, project)
	require.Error(t, err)
}
