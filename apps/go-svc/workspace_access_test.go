package main

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/workos/workos-go/v10"
)

func TestWorkosWorkspaceFlagsEnabled(t *testing.T) {
	flags := workosWorkspaceFlags{}
	enabled, err := flags.Enabled(t.Context(), "org_1", "user_1", workspaceDomainsFlag)
	require.NoError(t, err)
	require.False(t, enabled)

	flags.client = workos.NewClient("sk_test", workos.WithBaseURL("https://api.workos.test"))
	enabled, err = flags.Enabled(t.Context(), "org_1", "user_1", " ")
	require.NoError(t, err)
	require.False(t, enabled)
}

func TestFlagSlugEnabledFromOrganizationAndUserLists(t *testing.T) {
	var orgCalls, userCalls int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case strings.Contains(r.URL.Path, "/organizations/"):
			orgCalls++
			if strings.Contains(r.URL.Path, "org_on") {
				_, _ = w.Write([]byte(workosFlagListJSON(workspaceDomainsFlag, true)))
				return
			}
			_, _ = w.Write([]byte(`{"data":[],"list_metadata":{"before":null,"after":null}}`))
		case strings.Contains(r.URL.Path, "/user_management/users/"):
			userCalls++
			if strings.Contains(r.URL.Path, "user_on") {
				_, _ = w.Write([]byte(workosFlagListJSON(workspaceDomainsFlag, true)))
				return
			}
			_, _ = w.Write([]byte(`{"data":[{"object":"feature_flag","id":"flag_off","slug":"` + workspaceDomainsFlag + `","name":"Domains","enabled":false,"created_at":"2026-01-15T12:00:00.000Z","updated_at":"2026-01-15T12:00:00.000Z"}],"list_metadata":{"before":null,"after":null}}`))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	t.Cleanup(server.Close)
	flags := workosWorkspaceFlags{client: workos.NewClient("sk_test", workos.WithBaseURL(server.URL))}

	enabled, err := flags.Enabled(t.Context(), "org_on", "user_off", workspaceDomainsFlag)
	require.NoError(t, err)
	require.True(t, enabled)
	require.Equal(t, 1, orgCalls)
	require.Zero(t, userCalls)

	enabled, err = flags.Enabled(t.Context(), "org_off", "user_on", workspaceDomainsFlag)
	require.NoError(t, err)
	require.True(t, enabled)
	require.Equal(t, 1, userCalls)

	enabled, err = flags.Enabled(t.Context(), "org_off", "user_off", workspaceDomainsFlag)
	require.NoError(t, err)
	require.False(t, enabled)
}

func TestWorkosPipeTokensAccessToken(t *testing.T) {
	tokens := workosPipeTokens{}
	_, err := tokens.AccessToken(t.Context(), gscPipesSlug, "user_1", "org_1")
	assertWorkspaceFailure(t, err, http.StatusServiceUnavailable, "gsc_pipes_unavailable")

	var lastBody map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodPost, r.Method)
		require.Equal(t, "/data-integrations/"+gscPipesSlug+"/token", r.URL.Path)
		raw, _ := io.ReadAll(r.Body)
		require.NoError(t, json.Unmarshal(raw, &lastBody))
		w.Header().Set("Content-Type", "application/json")
		switch lastBody["user_id"] {
		case "user_missing":
			w.WriteHeader(http.StatusNotFound)
			_, _ = w.Write([]byte(`{"code":"not_found","message":"missing"}`))
		case "user_down":
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte(`{"code":"unavailable","message":"down"}`))
		case "user_reauth":
			_, _ = w.Write([]byte(`{"active":false,"error":"needs_reauthorization"}`))
		case "user_empty":
			_, _ = w.Write([]byte(`{"active":true,"access_token":{"access_token":"  "}}`))
		default:
			_, _ = w.Write([]byte(`{"active":true,"access_token":{"object":"access_token","access_token":"ya29.token"}}`))
		}
	}))
	t.Cleanup(server.Close)
	tokens.client = workos.NewClient("sk_test", workos.WithBaseURL(server.URL))

	token, err := tokens.AccessToken(t.Context(), gscPipesSlug, "user_ok", "org_1")
	require.NoError(t, err)
	require.Equal(t, "ya29.token", token)
	require.Equal(t, "org_1", lastBody["organization_id"])

	_, err = tokens.AccessToken(t.Context(), gscPipesSlug, "user_missing", "org_1")
	assertWorkspaceFailure(t, err, http.StatusNotFound, "gsc_not_connected")

	_, err = tokens.AccessToken(t.Context(), gscPipesSlug, "user_down", "org_1")
	assertWorkspaceFailure(t, err, http.StatusServiceUnavailable, "gsc_pipes_unavailable")

	_, err = tokens.AccessToken(t.Context(), gscPipesSlug, "user_reauth", "org_1")
	assertWorkspaceFailure(t, err, http.StatusUnauthorized, "gsc_pipes_needs_reauthorization")

	_, err = tokens.AccessToken(t.Context(), gscPipesSlug, "user_empty", "org_1")
	assertWorkspaceFailure(t, err, http.StatusNotFound, "gsc_not_connected")
}

func workosFlagListJSON(slug string, enabled bool) string {
	flag := map[string]any{
		"object":     "feature_flag",
		"id":         "flag_1",
		"slug":       slug,
		"name":       "Flag",
		"enabled":    enabled,
		"created_at": "2026-01-15T12:00:00.000Z",
		"updated_at": "2026-01-15T12:00:00.000Z",
	}
	payload, _ := json.Marshal(map[string]any{
		"data":          []any{flag},
		"list_metadata": map[string]any{"before": nil, "after": nil},
	})
	return string(payload)
}

func assertWorkspaceFailure(t *testing.T, err error, status int, code string) {
	t.Helper()
	var failure *workspaceError
	require.ErrorAs(t, err, &failure)
	require.Equal(t, status, failure.status)
	require.Equal(t, code, failure.code)
}
