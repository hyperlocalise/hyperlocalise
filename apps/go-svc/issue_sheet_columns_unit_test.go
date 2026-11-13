package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/require"
)

func issueSheetColumnReq(method, body string) *http.Request {
	req := httptest.NewRequest(method, "/", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	return req
}

func TestIssueSheetLoadColumns(t *testing.T) {
	now := time.Now().UTC()
	config := []byte(`{"options":[]}`)
	pool := &scriptPool{steps: []dbStep{{
		op: opQuery,
		table: [][]any{
			{"col1", "custom_note", "Note", "custom", "text", config, 1, false, nil, now, now},
		},
	}}}
	api := &issueSheetAPI{pool: pool}
	columns, err := api.loadColumns(context.Background(), "org", "proj")
	require.NoError(t, err)
	require.Len(t, columns, 1)
	require.Equal(t, "custom_note", columns[0]["key"])
}

func TestIssueSheetCreateUpdateDeleteColumn(t *testing.T) {
	actor := issueSheetActor{userID: "user", organizationID: "org", role: "admin"}
	project := issueSheetProject{ID: "proj"}
	columnID := uuid.NewString()
	now := time.Now().UTC()

	createPool := &scriptPool{steps: []dbStep{{
		op:   opQueryRow,
		scan: []any{columnID, now, now},
	}}}
	api := &issueSheetAPI{pool: createPool}
	body, status, err := api.createColumn(context.Background(), actor, project, issueSheetColumnReq(http.MethodPost, `{"key":"severity","label":"Severity","type":"text","hidden":true,"sortOrder":12}`))
	require.NoError(t, err)
	require.Equal(t, 201, status)
	require.Equal(t, columnID, body.(map[string]any)["column"].(map[string]any)["id"])

	_, _, err = api.createColumn(context.Background(), actor, project, issueSheetColumnReq(http.MethodPost, `{"key":"","label":"x","type":"text"}`))
	require.EqualError(t, err, "invalid_issue_sheet_column_payload")

	config := []byte(`{}`)
	updatePool := &scriptPool{steps: []dbStep{
		{op: opQueryRow, scan: []any{"severity", "Severity", "custom", "text", config, 12, true, nil}},
		{op: opQueryRow, scan: []any{now}},
	}}
	api.pool = updatePool
	_, status, err = api.updateColumn(context.Background(), actor, project, columnID, issueSheetColumnReq(http.MethodPatch, `{"label":"Impact","icon":"star"}`))
	require.NoError(t, err)
	require.Equal(t, 200, status)

	_, _, err = api.updateColumn(context.Background(), actor, project, "not-a-uuid", issueSheetColumnReq(http.MethodPatch, `{"label":"x"}`))
	require.EqualError(t, err, "issue_sheet_column_not_found")

	updatePool = &scriptPool{steps: []dbStep{{op: opQueryRow, err: pgx.ErrNoRows}}}
	api.pool = updatePool
	_, _, err = api.updateColumn(context.Background(), actor, project, uuid.NewString(), issueSheetColumnReq(http.MethodPatch, `{"label":"x"}`))
	require.EqualError(t, err, "issue_sheet_column_not_found")

	updatePool = &scriptPool{steps: []dbStep{
		{op: opQueryRow, scan: []any{"priority", "Priority", "system", "select", config, 0, false, nil}},
	}}
	api.pool = updatePool
	_, _, err = api.updateColumn(context.Background(), actor, project, columnID, issueSheetColumnReq(http.MethodPatch, `{"config":{"options":[]}}`))
	require.EqualError(t, err, "issue_sheet_column_config_not_editable")

	reorderPool := &scriptPool{steps: []dbStep{
		{op: opBegin},
		{op: opExec, tag: pgconn.NewCommandTag("UPDATE 1")},
		{op: opQuery, table: [][]any{{columnID, "severity", "Impact", "custom", "text", config, 0, true, nil, now, now}}},
	}}
	api.pool = reorderPool
	_, status, err = api.reorderColumns(context.Background(), actor, project, issueSheetColumnReq(http.MethodPut, `{"columnIds":["`+columnID+`"]}`))
	require.NoError(t, err)
	require.Equal(t, 200, status)

	_, _, err = api.reorderColumns(context.Background(), actor, project, issueSheetColumnReq(http.MethodPut, `{}`))
	require.EqualError(t, err, "invalid_issue_sheet_column_order_payload")

	deletePool := &scriptPool{steps: []dbStep{
		{op: opQueryRow, scan: []any{"custom_note", "custom"}},
		{op: opExec, tag: pgconn.NewCommandTag("DELETE 1")},
	}}
	api.pool = deletePool
	_, status, err = api.deleteColumn(context.Background(), actor, project, columnID)
	require.NoError(t, err)
	require.Equal(t, 204, status)

	deletePool = &scriptPool{steps: []dbStep{{op: opQueryRow, scan: []any{"priority", "system"}}}}
	api.pool = deletePool
	_, _, err = api.deleteColumn(context.Background(), actor, project, columnID)
	require.EqualError(t, err, "column_protected")
}
