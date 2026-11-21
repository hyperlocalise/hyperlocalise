package main

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestCallAutomationWorkflowForwardsTheServiceToken(t *testing.T) {
	var gotToken, gotAction, gotPath string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotToken = r.Header.Get(serverCallTokenHeader)
		body, _ := io.ReadAll(r.Body)
		var decoded map[string]any
		require.NoError(t, json.Unmarshal(body, &decoded))
		gotAction, _ = decoded["action"].(string)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusAccepted)
		_, _ = w.Write([]byte(`{"result":{"automationRun":{"id":"run-1","status":"queued"},"dispatch":{"runId":"run-1","outcome":"enqueued"}}}`))
	}))
	defer server.Close()
	t.Setenv("HYPERLOCALISE_WEB_INTERNAL_URL", server.URL)
	t.Setenv("WORKOS_COOKIE_PASSWORD", "test-cookie")
	t.Setenv("HYPERLOCALISE_PUBLIC_APP_URL", "")

	result, status, err := callAutomationWorkflow(context.Background(), "run_workspace_automation", map[string]any{
		"organizationId": "org",
		"userId":         "user",
		"automationId":   "auto-1",
	})
	require.NoError(t, err)
	require.Equal(t, http.StatusAccepted, status)
	require.Equal(t, "run_workspace_automation", gotAction)
	require.NotEmpty(t, gotToken)
	require.Equal(t, automationWorkflowPath, gotPath)
	payload, ok := result.(map[string]any)
	require.True(t, ok)
	require.Equal(t, "run-1", payload["automationRun"].(map[string]any)["id"])
}

func TestCallAutomationWorkflowUnconfigured(t *testing.T) {
	t.Setenv("HYPERLOCALISE_WEB_INTERNAL_URL", "")
	t.Setenv("HYPERLOCALISE_PUBLIC_APP_URL", "")
	t.Setenv("WORKOS_COOKIE_PASSWORD", "test-cookie")

	_, _, err := callAutomationWorkflow(context.Background(), "run_workspace_automation", map[string]any{})
	requireAutomationWorkflowFailure(t, err, http.StatusServiceUnavailable, "automations_workflow_unconfigured")

	t.Setenv("HYPERLOCALISE_WEB_INTERNAL_URL", "http://127.0.0.1:9")
	t.Setenv("WORKOS_COOKIE_PASSWORD", "")
	_, _, err = callAutomationWorkflow(context.Background(), "run_workspace_automation", map[string]any{})
	requireAutomationWorkflowFailure(t, err, http.StatusServiceUnavailable, "automations_workflow_unconfigured")
}

func TestCallAutomationWorkflowMapsRejectedActions(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"error":"manual_run_not_supported","message":"Manual runs require at least one enabled workflow or notification tool."}`))
	}))
	defer server.Close()
	t.Setenv("HYPERLOCALISE_WEB_INTERNAL_URL", server.URL)
	t.Setenv("WORKOS_COOKIE_PASSWORD", "test-cookie")
	t.Setenv("HYPERLOCALISE_PUBLIC_APP_URL", "")

	_, _, err := callAutomationWorkflow(context.Background(), "run_workspace_automation", map[string]any{
		"organizationId": "org",
		"userId":         "user",
	})
	requireAutomationWorkflowFailure(t, err, http.StatusBadRequest, "manual_run_not_supported")
}

func TestCallAutomationWorkflowUnavailableOnTransportError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	server.Close()
	t.Setenv("HYPERLOCALISE_WEB_INTERNAL_URL", server.URL)
	t.Setenv("WORKOS_COOKIE_PASSWORD", "test-cookie")
	t.Setenv("HYPERLOCALISE_PUBLIC_APP_URL", "")

	_, _, err := callAutomationWorkflow(context.Background(), "publish_visual_workflow", map[string]any{})
	requireAutomationWorkflowFailure(t, err, http.StatusBadGateway, "automations_workflow_unavailable")
}

func TestAutomationWorkflowPayloadKeepsTheSignedInActor(t *testing.T) {
	payload := automationWorkflowPayload(
		automationActor{userID: "user-real", organizationID: "org-real", workosUserID: "workos-real"},
		map[string]any{
			"organizationId": "org-spoofed",
			"userId":         "user-spoofed",
			"workosUserId":   "workos-spoofed",
			"automationId":   "auto-1",
			"inputSnapshot":  nil,
		},
	)
	require.Equal(t, "org-real", payload["organizationId"])
	require.Equal(t, "user-real", payload["userId"])
	require.Equal(t, "workos-real", payload["workosUserId"])
	require.Equal(t, "auto-1", payload["automationId"])
	_, hasNil := payload["inputSnapshot"]
	require.False(t, hasNil)
}

func TestCallAutomationWorkflowPassesGraphDetails(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"error":"invalid_graph","message":"Workflow graph is invalid.","details":{"issues":[{"code":"disconnected"}]}}`))
	}))
	defer server.Close()
	t.Setenv("HYPERLOCALISE_WEB_INTERNAL_URL", server.URL)
	t.Setenv("WORKOS_COOKIE_PASSWORD", "test-cookie")
	t.Setenv("HYPERLOCALISE_PUBLIC_APP_URL", "")

	_, _, err := callAutomationWorkflow(context.Background(), "publish_visual_workflow", map[string]any{})
	requireAutomationWorkflowFailure(t, err, http.StatusBadRequest, "invalid_graph")
	var failure *automationError
	require.ErrorAs(t, err, &failure)
	require.Equal(t, []any{map[string]any{"code": "disconnected"}}, failure.details["issues"])
}

func requireAutomationWorkflowFailure(t *testing.T, err error, status int, code string) {
	t.Helper()
	require.Error(t, err)
	var failure *automationError
	require.ErrorAs(t, err, &failure)
	require.Equal(t, status, failure.status)
	require.Equal(t, code, failure.code)
}
