package main

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestLiveSessionOnboardingWorkosCalls(t *testing.T) {
	var captured struct {
		method string
		path   string
		query  string
		body   map[string]string
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		captured.method = r.Method
		captured.path = r.URL.Path
		captured.query = r.URL.RawQuery
		captured.body = nil
		if r.Body != nil {
			raw, _ := io.ReadAll(r.Body)
			if len(raw) > 0 {
				body := map[string]string{}
				require.NoError(t, json.Unmarshal(raw, &body))
				captured.body = body
			}
		}
		switch r.URL.Path {
		case "/user_management/users/user_1":
			_, _ = w.Write([]byte(`{"id":"user_1","email":"ada@example.com","email_verified":true,"first_name":"Ada","last_name":"Lovelace"}`))
		case "/organizations":
			_, _ = w.Write([]byte(`{"id":"org_1"}`))
		case "/user_management/organization_memberships":
			if r.Method == http.MethodPost {
				_, _ = w.Write([]byte(`{"id":"om_1"}`))
				return
			}
			_, _ = w.Write([]byte(`{"data":[{"id":"om_active"}]}`))
		case "/user_management/invitations":
			_, _ = w.Write([]byte(`{"data":[{"id":"inv_1","email":"ada@example.com","state":"pending","created_at":"2026-01-01T00:00:00.000Z"}]}`))
		default:
			w.WriteHeader(http.StatusNoContent)
		}
	}))
	t.Cleanup(server.Close)
	client := newLiveMemberWorkos("sk_test", server.URL)

	user, err := client.GetUser(t.Context(), "user_1")
	require.NoError(t, err)
	require.Equal(t, http.MethodGet, captured.method)
	require.Equal(t, "/user_management/users/user_1", captured.path)
	require.Equal(t, "ada@example.com", user.Email)
	require.True(t, user.EmailVerified)
	require.Equal(t, "Ada", *user.FirstName)

	user, err = client.UpdateUserName(t.Context(), "user_1", "Grace", "Hopper")
	require.NoError(t, err)
	require.Equal(t, http.MethodPut, captured.method)
	require.Equal(t, map[string]string{"first_name": "Grace", "last_name": "Hopper"}, captured.body)
	require.Equal(t, "user_1", user.ID)

	orgID, err := client.CreateOrganization(t.Context(), "Acme", "ext_1")
	require.NoError(t, err)
	require.Equal(t, http.MethodPost, captured.method)
	require.Equal(t, "/organizations", captured.path)
	require.Equal(t, map[string]string{"name": "Acme", "external_id": "ext_1"}, captured.body)
	require.Equal(t, "org_1", orgID)

	require.NoError(t, client.DeleteOrganization(t.Context(), "org_1"))
	require.Equal(t, http.MethodDelete, captured.method)
	require.Equal(t, "/organizations/org_1", captured.path)

	membershipID, err := client.CreateOrganizationMembership(t.Context(), "org_1", "user_1", "admin")
	require.NoError(t, err)
	require.Equal(t, http.MethodPost, captured.method)
	require.Equal(t, "/user_management/organization_memberships", captured.path)
	require.Equal(t, map[string]string{
		"organization_id": "org_1",
		"user_id":         "user_1",
		"role_slug":       "admin",
	}, captured.body)
	require.Equal(t, "om_1", membershipID)

	invitations, err := client.ListInvitations(t.Context(), "org_1", "ada@example.com")
	require.NoError(t, err)
	require.Equal(t, http.MethodGet, captured.method)
	require.Contains(t, captured.query, "organization_id=org_1")
	require.Contains(t, captured.query, "email=ada%40example.com")
	require.Equal(t, "inv_1", invitations[0].ID)

	require.NoError(t, client.AcceptInvitation(t.Context(), "inv_1"))
	require.Equal(t, http.MethodPost, captured.method)
	require.Equal(t, "/user_management/invitations/inv_1/accept", captured.path)

	id, found, err := client.FindActiveOrganizationMembership(t.Context(), "org_1", "user_1")
	require.NoError(t, err)
	require.True(t, found)
	require.Equal(t, "om_active", id)
	require.Contains(t, captured.query, "statuses=active")
}

func TestLiveSessionOnboardingWorkosMembershipMissingAndErrors(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/user_management/organization_memberships" {
			_, _ = w.Write([]byte(`{"data":[]}`))
			return
		}
		w.WriteHeader(http.StatusBadGateway)
	}))
	t.Cleanup(server.Close)
	client := newLiveMemberWorkos("sk_test", server.URL)

	id, found, err := client.FindActiveOrganizationMembership(t.Context(), "org_1", "user_1")
	require.NoError(t, err)
	require.False(t, found)
	require.Empty(t, id)

	_, err = client.GetUser(t.Context(), "user_missing")
	require.Error(t, err)
}
