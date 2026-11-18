package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestDecodeUpdateProjectRequestActive(t *testing.T) {
	req := httptest.NewRequest(http.MethodPatch, "/", strings.NewReader(`{"active":false}`))
	decoded, changed, err := decodeUpdateProjectRequest(req)
	if err != nil {
		t.Fatal(err)
	}
	if decoded.active == nil || *decoded.active {
		t.Fatalf("active = %v", decoded.active)
	}
	if len(changed) != 1 || changed[0] != "active" {
		t.Fatalf("changed = %v", changed)
	}
}

func TestCallProjectWorkflowForwardsTheServiceToken(t *testing.T) {
	var gotToken, gotAction, gotPath string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotToken = r.Header.Get(serverCallTokenHeader)
		body, _ := io.ReadAll(r.Body)
		if !strings.Contains(string(body), `"qa_start"`) {
			t.Errorf("body = %s", body)
		}
		gotAction = "qa_start"
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"result":{"run":{"id":"run-1","status":"queued"}}}`))
	}))
	defer server.Close()
	t.Setenv("HYPERLOCALISE_WEB_INTERNAL_URL", server.URL)
	t.Setenv("WORKOS_COOKIE_PASSWORD", "test-cookie")
	t.Setenv("HYPERLOCALISE_PUBLIC_APP_URL", "")

	result, status, err := callProjectWorkflow(context.Background(), "qa_start", map[string]any{
		"organizationId": "org",
		"userId":         "user",
		"projectId":      "project",
	})
	if err != nil {
		t.Fatal(err)
	}
	if status != http.StatusOK || gotAction != "qa_start" || gotToken == "" || gotPath != projectWorkflowPath {
		t.Fatalf("status %d action %q token %q path %q result %#v", status, gotAction, gotToken, gotPath, result)
	}
	run, ok := result.(map[string]any)
	require.True(t, ok)
	require.Equal(t, "run-1", run["run"].(map[string]any)["id"])
}

func TestCallProjectWorkflowUnconfigured(t *testing.T) {
	t.Setenv("HYPERLOCALISE_WEB_INTERNAL_URL", "")
	t.Setenv("HYPERLOCALISE_PUBLIC_APP_URL", "")
	t.Setenv("WORKOS_COOKIE_PASSWORD", "test-cookie")

	_, _, err := callProjectWorkflow(context.Background(), "qa_start", map[string]any{})
	requireWorkflowFailure(t, err, http.StatusServiceUnavailable, "project_workflow_unconfigured")

	t.Setenv("HYPERLOCALISE_WEB_INTERNAL_URL", "http://127.0.0.1:9")
	t.Setenv("WORKOS_COOKIE_PASSWORD", "")
	_, _, err = callProjectWorkflow(context.Background(), "qa_start", map[string]any{})
	requireWorkflowFailure(t, err, http.StatusServiceUnavailable, "project_workflow_unconfigured")
}

func TestCallProjectWorkflowMapsRejectedActions(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusConflict)
		_, _ = w.Write([]byte(`{"error":"scan_in_progress","message":"A scan is already running"}`))
	}))
	defer server.Close()
	t.Setenv("HYPERLOCALISE_WEB_INTERNAL_URL", server.URL)
	t.Setenv("WORKOS_COOKIE_PASSWORD", "test-cookie")
	t.Setenv("HYPERLOCALISE_PUBLIC_APP_URL", "")

	_, _, err := callProjectWorkflow(context.Background(), "qa_start", map[string]any{
		"organizationId": "org",
		"userId":         "user",
		"projectId":      "project",
	})
	requireWorkflowFailure(t, err, http.StatusConflict, "scan_in_progress")
}

func TestCallProjectWorkflowUnavailableOnTransportError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	server.Close()
	t.Setenv("HYPERLOCALISE_WEB_INTERNAL_URL", server.URL)
	t.Setenv("WORKOS_COOKIE_PASSWORD", "test-cookie")
	t.Setenv("HYPERLOCALISE_PUBLIC_APP_URL", "")

	_, _, err := callProjectWorkflow(context.Background(), "qa_start", map[string]any{})
	requireWorkflowFailure(t, err, http.StatusBadGateway, "project_workflow_unavailable")
}

func TestWorkflowPayloadKeepsTheSignedInActor(t *testing.T) {
	payload := workflowPayload(
		projectActor{userID: "user-real", organizationID: "org-real"},
		"project-path",
		map[string]any{
			"organizationId": "org-spoofed",
			"userId":         "user-spoofed",
			"projectId":      "project-spoofed",
			"sourcePath":     "app.json",
		},
	)
	require.Equal(t, "org-real", payload["organizationId"])
	require.Equal(t, "user-real", payload["userId"])
	require.Equal(t, "project-path", payload["projectId"])
	require.Equal(t, "app.json", payload["sourcePath"])
}

func TestNativeProjectWorkflowActionsForbidMembers(t *testing.T) {
	api := &projectAPI{}
	member := projectActor{role: "member", userID: "user-1", organizationID: "org-1"}
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"sourcePath":"app.json"}`))

	for _, fn := range []func(*http.Request, projectActor) (any, int, error){
		api.uploadFileHandler,
		api.importTranslationsHandler,
		api.fileSettingsPatchHandler,
		api.useTranslationAsSourceHandler,
		api.importQueriesHandler,
		api.translateFileHandler,
		api.nativeJobCreate,
		api.nativeJobActionHandler,
	} {
		_, _, err := fn(req, member)
		requireForbidden(t, err)
	}
}

func TestNativeProjectWorkflowActionsAllowTranslatorsToCreateJobs(t *testing.T) {
	translator := projectActor{role: "translator", userID: "user-1", organizationID: "org-1"}
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"sourcePath":"app.json"}`))

	_, _, err := (&projectAPI{}).uploadFileHandler(req, translator)
	requireForbidden(t, err)

	_, _, err = (&projectAPI{}).translateFileHandler(req, translator)
	var failure *projectError
	require.True(t, errors.As(err, &failure))
	require.NotEqual(t, http.StatusForbidden, failure.status)
}

func TestProjectQaScanForbidsMembers(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/", nil)
	_, _, err := (&qaReportAPI{}).startProjectQaScanHandler(req, qaReportActor{role: "member"})
	var failure *qaReportError
	require.True(t, errors.As(err, &failure))
	require.Equal(t, http.StatusForbidden, failure.status)
	require.Equal(t, "forbidden", failure.code)
}

func TestStartProjectQaScanForwardsWorkflowFailure(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusConflict)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"error":   "scan_in_progress",
			"message": "A scan is already running",
		})
	}))
	defer server.Close()
	t.Setenv("HYPERLOCALISE_WEB_INTERNAL_URL", server.URL)
	t.Setenv("WORKOS_COOKIE_PASSWORD", "test-cookie")
	t.Setenv("HYPERLOCALISE_PUBLIC_APP_URL", "")

	req := httptest.NewRequest(http.MethodPost, "/v1/orgs/acme/projects/proj-1/qa-reports", nil)
	req.SetPathValue("projectId", "proj-1")
	_, _, err := (&qaReportAPI{}).startProjectQaScanHandler(req, qaReportActor{
		role:           "admin",
		userID:         "user-1",
		organizationID: "org-1",
	})
	var failure *qaReportError
	require.True(t, errors.As(err, &failure))
	require.Equal(t, http.StatusConflict, failure.status)
	require.Equal(t, "scan_in_progress", failure.code)
}

func requireWorkflowFailure(t *testing.T, err error, status int, code string) {
	t.Helper()
	require.Error(t, err)
	var failure *projectError
	require.True(t, errors.As(err, &failure), "%v", err)
	require.Equal(t, status, failure.status)
	require.Equal(t, code, failure.code)
}

func requireForbidden(t *testing.T, err error) {
	t.Helper()
	requireWorkflowFailure(t, err, http.StatusForbidden, "forbidden")
}
