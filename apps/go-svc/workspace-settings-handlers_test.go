package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/require"
)

const (
	workspaceUnitOrganizationID = "22222222-2222-4222-8222-222222222222"
	workspaceUnitUserID         = "11111111-1111-4111-8111-111111111111"
)

func workspaceUnitActor(role string) organizationActor {
	return organizationActor{userID: workspaceUnitUserID, organizationID: workspaceUnitOrganizationID, role: role}
}

func workspaceUnitRow(slug any, lifecycle string, archivedAt any) []any {
	return []any{workspaceUnitOrganizationID, "org_workos", "Acme", slug, lifecycle, archivedAt}
}

func workspaceUnitPatch(body string) *http.Request {
	r := httptest.NewRequest(http.MethodPatch, "/", strings.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	r.SetPathValue("organizationSlug", "acme")
	return r
}

func requireWorkspaceFailure(t *testing.T, err error, status int, code string) any {
	t.Helper()
	var failure *workspaceSettingsError
	require.ErrorAs(t, err, &failure)
	require.Equal(t, status, failure.status)
	require.Equal(t, code, failure.code)
	return failure.details
}

func TestScanWorkspaceSettingsRecord(t *testing.T) {
	archived := time.Date(2026, 2, 3, 4, 5, 6, 789000000, time.FixedZone("x", 3600))
	record, err := scanWorkspaceSettingsRecord(scriptScanRow{values: workspaceUnitRow("acme", "archived", archived)})
	require.NoError(t, err)
	require.Equal(t, "acme", *record.Slug)
	require.Equal(t, "2026-02-03T03:05:06.789Z", *record.ArchivedAt)
	require.Equal(t, "workos", record.IdentityProvider)

	record, err = scanWorkspaceSettingsRecord(scriptScanRow{values: workspaceUnitRow(nil, "active", nil)})
	require.NoError(t, err)
	require.Nil(t, record.Slug)
	require.Nil(t, record.ArchivedAt)

	_, err = scanWorkspaceSettingsRecord(errorRow{err: pgx.ErrNoRows})
	requireWorkspaceFailure(t, err, http.StatusNotFound, "workspace_not_found")

	boom := errors.New("boom")
	_, err = scanWorkspaceSettingsRecord(errorRow{err: boom})
	require.ErrorIs(t, err, boom)
}

func TestWriteWorkspaceSettingsError(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/", nil)

	rec := httptest.NewRecorder()
	writeWorkspaceSettingsError(rec, r, "handle", errors.New("secret detail"))
	require.Equal(t, http.StatusInternalServerError, rec.Code)
	require.JSONEq(t, `{"error":"internal_error","message":"An unexpected error occurred"}`, rec.Body.String())
	require.Equal(t, "application/json", rec.Header().Get("Content-Type"))

	rec = httptest.NewRecorder()
	writeWorkspaceSettingsError(rec, r, "handle", &workspaceSettingsError{status: http.StatusBadRequest, code: "invalid", message: "Bad <input>", details: map[string]any{"issues": []string{"a"}}})
	require.Equal(t, http.StatusBadRequest, rec.Code)
	require.JSONEq(t, `{"error":"invalid","message":"Bad <input>","details":{"issues":["a"]}}`, rec.Body.String())
	require.Contains(t, rec.Body.String(), "<input>")
}

func TestWorkspaceSettingsHandleRejectsEarly(t *testing.T) {
	called := false
	fn := func(*http.Request, organizationActor) (any, int, error) {
		called = true
		return nil, http.StatusOK, nil
	}
	serve := func(api *workspaceSettingsAPI, r *http.Request) *httptest.ResponseRecorder {
		rec := httptest.NewRecorder()
		api.handle(fn).ServeHTTP(rec, r)
		require.Equal(t, "no-store", rec.Header().Get("Cache-Control"))
		return rec
	}
	withClaims := func(r *http.Request, userID string) *http.Request {
		return r.WithContext(context.WithValue(r.Context(), authContextKey{}, AuthClaims{UserID: userID}))
	}

	crossOrigin := httptest.NewRequest(http.MethodDelete, "/", nil)
	crossOrigin.Header.Set("Origin", "https://evil.example")
	requireWorkspaceError(t, serve(&workspaceSettingsAPI{}, crossOrigin), http.StatusForbidden, "forbidden", "Cross-origin request rejected")

	crossSite := httptest.NewRequest(http.MethodPatch, "/", nil)
	crossSite.Header.Set("Sec-Fetch-Site", "cross-site")
	requireWorkspaceError(t, serve(&workspaceSettingsAPI{pool: &scriptPool{}}, crossSite), http.StatusForbidden, "forbidden", "")

	requireWorkspaceError(t, serve(&workspaceSettingsAPI{}, httptest.NewRequest(http.MethodGet, "/", nil)), http.StatusServiceUnavailable, "workspace_unavailable", "")
	requireWorkspaceError(t, serve(&workspaceSettingsAPI{pool: &scriptPool{}}, httptest.NewRequest(http.MethodGet, "/", nil)), http.StatusUnauthorized, "unauthorized", "Authentication required")

	invited := withClaims(httptest.NewRequest(http.MethodGet, "/", nil), "invited_user_1")
	requireWorkspaceError(t, serve(&workspaceSettingsAPI{pool: &scriptPool{}}, invited), http.StatusForbidden, "organization_access_denied", "")

	unknown := withClaims(httptest.NewRequest(http.MethodGet, "/", nil), "user_1")
	requireWorkspaceError(t, serve(&workspaceSettingsAPI{pool: &scriptPool{steps: []dbStep{{op: opQueryRow, err: pgx.ErrNoRows}}}}, unknown), http.StatusForbidden, "organization_access_denied", "")

	failing := withClaims(httptest.NewRequest(http.MethodGet, "/", nil), "user_1")
	requireWorkspaceError(t, serve(&workspaceSettingsAPI{pool: &scriptPool{steps: []dbStep{{op: opQueryRow, err: errors.New("boom")}}}}, failing), http.StatusInternalServerError, "internal_error", "")

	require.False(t, called)
}

func TestGetWorkspaceScripted(t *testing.T) {
	pool := &scriptPool{steps: []dbStep{{op: opQueryRow, scan: workspaceUnitRow("acme", "active", nil)}}}
	value, status, err := (&workspaceSettingsAPI{pool: pool}).getWorkspace(httptest.NewRequest(http.MethodGet, "/", nil), workspaceUnitActor("member"))
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, status)
	record := value.(map[string]any)["workspace"].(workspaceSettingsRecord)
	require.Equal(t, "Acme", record.Name)
	requireScriptDone(t, pool)

	_, _, err = (&workspaceSettingsAPI{pool: &scriptPool{steps: []dbStep{{op: opQueryRow, err: pgx.ErrNoRows}}}}).getWorkspace(httptest.NewRequest(http.MethodGet, "/", nil), workspaceUnitActor("member"))
	requireWorkspaceFailure(t, err, http.StatusNotFound, "workspace_not_found")
}

func TestUpdateWorkspaceRejectsBeforeWriting(t *testing.T) {
	api := &workspaceSettingsAPI{pool: &scriptPool{}}

	_, _, err := api.updateWorkspace(workspaceUnitPatch(`[]`), workspaceUnitActor("admin"))
	details := requireWorkspaceFailure(t, err, http.StatusBadRequest, "invalid_workspace_payload")
	require.Equal(t, map[string]any{"issues": []workspaceValidationIssue{{Path: []any{}, Message: "Invalid input: expected object, received array"}}}, details)

	_, _, err = api.updateWorkspace(workspaceUnitPatch(`{`), workspaceUnitActor("admin"))
	requireWorkspaceFailure(t, err, http.StatusInternalServerError, "internal_error")

	_, _, err = api.updateWorkspace(workspaceUnitPatch(`{"name":"New Co"}`), workspaceUnitActor("member"))
	requireWorkspaceFailure(t, err, http.StatusForbidden, "forbidden")
}

func TestUpdateWorkspaceScripted(t *testing.T) {
	boom := errors.New("boom")
	locked := dbStep{op: opQueryRow, scan: []any{"Old Co", "active"}}
	updated := dbStep{op: opQueryRow, scan: workspaceUnitRow("acme", "active", nil)}

	t.Run("renames and publishes", func(t *testing.T) {
		pool := &scriptPool{steps: []dbStep{{op: opBegin}, locked, updated}}
		workos := &stubWorkspaceIdentityWorkos{}
		activity := &recordingActivityLogPublisher{}
		api := &workspaceSettingsAPI{pool: pool, workos: workos, activityLog: activity}
		value, status, err := api.updateWorkspace(workspaceUnitPatch(`{"name":"Acme","slug":"acme"}`), workspaceUnitActor("admin"))
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, status)
		requireScriptDone(t, pool)
		require.Equal(t, "/org/acme/settings/account", value.(map[string]any)["redirectTo"])
		require.Equal(t, []workspaceNameSyncCall{{"org_workos", "Acme"}}, workos.recorded())
		events := activity.recorded()
		require.Len(t, events, 1)
		require.Equal(t, "workspace_updated", events[0].EventType)
		require.Equal(t, map[string]any{"changedFields": []string{"name", "slug"}, "nextName": "Acme", "previousName": "Old Co"}, events[0].Payload)
	})

	t.Run("new slug checks for conflicts", func(t *testing.T) {
		pool := &scriptPool{steps: []dbStep{{op: opQueryRow, scan: []any{false}}, {op: opBegin}, locked, updated}}
		activity := &recordingActivityLogPublisher{}
		api := &workspaceSettingsAPI{pool: pool, activityLog: activity}
		_, _, err := api.updateWorkspace(workspaceUnitPatch(`{"slug":"acme-two"}`), workspaceUnitActor("admin"))
		require.NoError(t, err)
		requireScriptDone(t, pool)
		require.Equal(t, map[string]any{"changedFields": []string{"slug"}}, activity.recorded()[0].Payload)
	})

	t.Run("non json content is an empty update", func(t *testing.T) {
		r := workspaceUnitPatch(`{"name":"Ignored"}`)
		r.Header.Set("Content-Type", "text/plain")
		_, _, err := (&workspaceSettingsAPI{pool: &scriptPool{}}).updateWorkspace(r, workspaceUnitActor("admin"))
		details := requireWorkspaceFailure(t, err, http.StatusBadRequest, "invalid_workspace_payload")
		require.Equal(t, map[string]any{"issues": []workspaceValidationIssue{{Path: []any{}, Message: "Provide a name or slug"}}}, details)
	})

	for name, tc := range map[string]struct {
		body   string
		steps  []dbStep
		workos *stubWorkspaceIdentityWorkos
		status int
		code   string
	}{
		"slug taken":           {`{"slug":"taken"}`, []dbStep{{op: opQueryRow, scan: []any{true}}}, nil, http.StatusConflict, "workspace_slug_conflict"},
		"conflict check fails": {`{"slug":"taken"}`, []dbStep{{op: opQueryRow, err: boom}}, nil, 0, ""},
		"begin fails":          {`{"slug":"acme"}`, []dbStep{{op: opBegin, err: boom}}, nil, 0, ""},
		"missing workspace":    {`{"slug":"acme"}`, []dbStep{{op: opBegin}, {op: opQueryRow, err: pgx.ErrNoRows}}, nil, http.StatusNotFound, "workspace_not_found"},
		"archived workspace":   {`{"slug":"acme"}`, []dbStep{{op: opBegin}, {op: opQueryRow, scan: []any{"Old Co", "archived"}}}, nil, http.StatusNotFound, "workspace_not_found"},
		"lock fails":           {`{"slug":"acme"}`, []dbStep{{op: opBegin}, {op: opQueryRow, err: boom}}, nil, 0, ""},
		"slug race": {`{"slug":"acme"}`, []dbStep{
			{op: opBegin},
			locked,
			{op: opQueryRow, err: &pgconn.PgError{Code: "23505", ConstraintName: organizationsSlugConstraint}},
		}, nil, http.StatusConflict, "workspace_slug_conflict"},
		"other unique violation": {`{"slug":"acme"}`, []dbStep{
			{op: opBegin},
			locked,
			{op: opQueryRow, err: &pgconn.PgError{Code: "23505", ConstraintName: "organizations_other_key"}},
		}, nil, 0, ""},
		"updated row gone":    {`{"slug":"acme"}`, []dbStep{{op: opBegin}, locked, {op: opQueryRow, err: pgx.ErrNoRows}}, nil, http.StatusNotFound, "workspace_not_found"},
		"workos missing":      {`{"name":"New Co"}`, []dbStep{{op: opBegin}, locked, updated}, nil, http.StatusInternalServerError, "workspace_identity_unavailable"},
		"workos fails":        {`{"name":"New Co"}`, []dbStep{{op: opBegin}, locked, updated}, &stubWorkspaceIdentityWorkos{err: boom}, http.StatusInternalServerError, "workspace_identity_unavailable"},
		"missing slug result": {`{"slug":"acme"}`, []dbStep{{op: opBegin}, locked, {op: opQueryRow, scan: workspaceUnitRow(nil, "active", nil)}}, nil, http.StatusBadRequest, "workspace_missing_slug"},
	} {
		t.Run(name, func(t *testing.T) {
			pool := &scriptPool{steps: tc.steps}
			api := &workspaceSettingsAPI{pool: pool}
			if tc.workos != nil {
				api.workos = tc.workos
			}
			_, _, err := api.updateWorkspace(workspaceUnitPatch(tc.body), workspaceUnitActor("admin"))
			if tc.code == "" {
				require.Error(t, err)
				var failure *workspaceSettingsError
				require.False(t, errors.As(err, &failure), err)
			} else {
				requireWorkspaceFailure(t, err, tc.status, tc.code)
			}
			requireScriptDone(t, pool)
		})
	}
}

func TestArchiveWorkspaceScripted(t *testing.T) {
	r := httptest.NewRequest(http.MethodDelete, "/", nil)

	_, _, err := (&workspaceSettingsAPI{pool: &scriptPool{}}).archiveWorkspace(r, workspaceUnitActor("member"))
	requireWorkspaceFailure(t, err, http.StatusForbidden, "forbidden")

	_, _, err = (&workspaceSettingsAPI{pool: &scriptPool{steps: []dbStep{{op: opQueryRow, err: pgx.ErrNoRows}}}}).archiveWorkspace(r, workspaceUnitActor("admin"))
	requireWorkspaceFailure(t, err, http.StatusNotFound, "workspace_not_found")

	boom := errors.New("boom")
	_, _, err = (&workspaceSettingsAPI{pool: &scriptPool{steps: []dbStep{{op: opQueryRow, err: boom}}}}).archiveWorkspace(r, workspaceUnitActor("admin"))
	require.ErrorIs(t, err, boom)

	activity := &recordingActivityLogPublisher{}
	pool := &scriptPool{steps: []dbStep{{op: opQueryRow, scan: []any{workspaceUnitOrganizationID}}}}
	value, status, err := (&workspaceSettingsAPI{pool: pool, activityLog: activity}).archiveWorkspace(r, workspaceUnitActor("admin"))
	require.NoError(t, err)
	require.Nil(t, value)
	require.Equal(t, http.StatusNoContent, status)
	require.Equal(t, []activityLogEventInput{{
		ActorKind: "user", ActorUserID: workspaceUnitUserID, EventType: "workspace_archived", OrganizationID: workspaceUnitOrganizationID,
		Payload: map[string]any{"lifecycleStatus": "archived"}, TargetID: workspaceUnitOrganizationID, TargetKind: "organization",
	}}, activity.recorded())
}

func TestWriteWorkspaceSettingsJSONKeepsHTML(t *testing.T) {
	rec := httptest.NewRecorder()
	writeWorkspaceSettingsJSON(context.Background(), rec, http.StatusOK, map[string]any{"a": "<b>"})
	var body map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Equal(t, "<b>", body["a"])
	require.Contains(t, rec.Body.String(), "<b>")
}
