package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
)

func issueSheetPost(t *testing.T, api *issueSheetAPI, scope *testenv.Scope, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := issueSheetAuthedRequest(http.MethodPost, "http://localhost"+issueSheetPath(scope, path), body)
	return issueSheetServe(api, scope.WorkOSUserID, req)
}

func issueSheetPatch(t *testing.T, api *issueSheetAPI, scope *testenv.Scope, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := issueSheetAuthedRequest(http.MethodPatch, "http://localhost"+issueSheetPath(scope, path), body)
	return issueSheetServe(api, scope.WorkOSUserID, req)
}

func issueSheetPut(t *testing.T, api *issueSheetAPI, scope *testenv.Scope, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := issueSheetAuthedRequest(http.MethodPut, "http://localhost"+issueSheetPath(scope, path), body)
	return issueSheetServe(api, scope.WorkOSUserID, req)
}

func issueSheetDelete(t *testing.T, api *issueSheetAPI, scope *testenv.Scope, path string) *httptest.ResponseRecorder {
	t.Helper()
	req := issueSheetAuthedRequest(http.MethodDelete, "http://localhost"+issueSheetPath(scope, path), "")
	return issueSheetServe(api, scope.WorkOSUserID, req)
}

func issueSheetGet(t *testing.T, api *issueSheetAPI, scope *testenv.Scope, path string) *httptest.ResponseRecorder {
	t.Helper()
	req := issueSheetAuthedRequest(http.MethodGet, issueSheetPath(scope, path), "")
	return issueSheetServe(api, scope.WorkOSUserID, req)
}

func issueSheetColumnByKey(t *testing.T, rec *httptest.ResponseRecorder, key string) map[string]any {
	t.Helper()
	var body map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	columns, ok := body["columns"].([]any)
	require.True(t, ok)
	for _, raw := range columns {
		col := raw.(map[string]any)
		if col["key"] == key {
			return col
		}
	}
	t.Fatalf("column %q not found in %s", key, rec.Body.String())
	return nil
}

func TestIssueSheetColumnsLifecycle(t *testing.T) {
	api, scope := issueSheetTestAPI(t, true)

	rec := issueSheetGet(t, api, scope, "columns")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	priority := issueSheetColumnByKey(t, rec, "priority")

	rec = issueSheetPost(t, api, scope, "columns", `{"key":"priority","label":"Nope","type":"text"}`)
	require.Equal(t, http.StatusBadRequest, rec.Code)
	require.Contains(t, rec.Body.String(), "column_key_reserved")

	rec = issueSheetPost(t, api, scope, "columns", `{"key":"severity","label":"Severity","type":"select","config":{"options":[{"value":"low","label":"Low"}]},"sortOrder":50}`)
	require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
	var created map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &created))
	severityID := created["column"].(map[string]any)["id"].(string)

	rec = issueSheetPatch(t, api, scope, "columns/"+severityID, `{"label":"Impact"}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

	rec = issueSheetPatch(t, api, scope, "columns/"+severityID, `{"config":{"options":[{"value":"high","label":"High"}]}}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

	rec = issueSheetPatch(t, api, scope, "columns/"+priority["id"].(string), `{"icon":"star"}`)
	require.Equal(t, http.StatusBadRequest, rec.Code)
	require.Contains(t, rec.Body.String(), "issue_sheet_column_icon_not_editable")

	rec = issueSheetPut(t, api, scope, "columns/order", fmt.Sprintf(`{"columnIds":["%s","%s"]}`, severityID, priority["id"].(string)))
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

	rec = issueSheetDelete(t, api, scope, "columns/"+priority["id"].(string))
	require.Equal(t, http.StatusBadRequest, rec.Code)
	require.Contains(t, rec.Body.String(), "column_protected")

	rec = issueSheetDelete(t, api, scope, "columns/"+severityID)
	require.Equal(t, http.StatusNoContent, rec.Code)

	rec = issueSheetDelete(t, api, scope, "columns/"+uuid.NewString())
	require.Equal(t, http.StatusNotFound, rec.Code)
}

func TestIssueSheetRelationshipsLifecycle(t *testing.T) {
	api, scope := issueSheetTestAPI(t, true)
	_, idA := mustIssueSheetIssue(t, scope, 10, "Issue A")
	_, idB := mustIssueSheetIssue(t, scope, 11, "Issue B")
	_, idC := mustIssueSheetIssue(t, scope, 12, "Issue C")

	rec := issueSheetPost(t, api, scope, idA+"/relationships", fmt.Sprintf(`{"relatedIssueId":"%s","kind":"related"}`, idB))
	require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
	var relBody map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &relBody))
	relID := relBody["relationship"].(map[string]any)["id"].(string)

	rec = issueSheetPost(t, api, scope, idA+"/relationships", fmt.Sprintf(`{"relatedIssueId":"%s","kind":"related"}`, idB))
	require.Equal(t, http.StatusConflict, rec.Code)
	require.Contains(t, rec.Body.String(), "relationship_already_exists")

	rec = issueSheetPost(t, api, scope, idA+"/relationships", fmt.Sprintf(`{"relatedIssueId":"%s","kind":"blocks"}`, idB))
	require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())

	rec = issueSheetPost(t, api, scope, idB+"/relationships", fmt.Sprintf(`{"relatedIssueId":"%s","kind":"blocks"}`, idA))
	require.Equal(t, http.StatusBadRequest, rec.Code)
	require.Contains(t, rec.Body.String(), "blocking_relationship_cycle")

	rec = issueSheetPost(t, api, scope, idB+"/relationships", fmt.Sprintf(`{"relatedIssueId":"%s","kind":"blocked_by"}`, idC))
	require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())

	rec = issueSheetPost(t, api, scope, idA+"/relationships", fmt.Sprintf(`{"relatedIssueId":"%s","kind":"duplicate_of"}`, idC))
	require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())

	rec = issueSheetGet(t, api, scope, idB+"/relationships")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"presentedKind":"blocked_by"`)

	rec = issueSheetGet(t, api, scope, idC+"/relationships")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"presentedKind":"duplicate"`)

	rec = issueSheetDelete(t, api, scope, idA+"/relationships/"+relID)
	require.Equal(t, http.StatusNoContent, rec.Code)

	rec = issueSheetDelete(t, api, scope, idA+"/relationships/"+uuid.NewString())
	require.Equal(t, http.StatusNotFound, rec.Code)
}
