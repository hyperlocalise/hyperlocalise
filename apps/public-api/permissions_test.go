package main

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestEffectivePermissions(t *testing.T) {
	t.Run("member read scopes", func(t *testing.T) {
		perms := effectivePermissions([]string{"jobs:read", "files:read", "jobs:write", "files:write"}, "member")
		require.Equal(t, []string{"jobs:read", "files:read", "projects:read", "queries:read"}, perms)
	})

	t.Run("developer keeps write scopes", func(t *testing.T) {
		perms := effectivePermissions([]string{"jobs:read", "files:read", "jobs:write", "files:write"}, "developer")
		require.Equal(t, []string{"jobs:read", "files:read", "jobs:write", "files:write", "projects:read", "queries:read"}, perms)
	})
}

func TestAutumnQueriesEntitlement(t *testing.T) {
	t.Run("denies without key", func(t *testing.T) {
		client := newAutumnClient("")
		require.False(t, client.queriesEnabled(t.Context(), "org-1"))
	})

	t.Run("checks remote feature", func(t *testing.T) {
		upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			require.Equal(t, "/v1/balances.check", r.URL.Path)
			require.Equal(t, "Bearer test-key", r.Header.Get("Authorization"))
			_, _ = w.Write([]byte(`{"allowed":true}`))
		}))
		t.Cleanup(upstream.Close)

		client := &autumnClient{
			secretKey:  "test-key",
			baseURL:    upstream.URL,
			apiVersion: autumnDefaultAPIVersion,
			http:       upstream.Client(),
		}
		require.True(t, client.queriesEnabled(t.Context(), "org-1"))
		ent := client.queriesEnabledForPermissions(t.Context(), "org-1", []string{"queries:read"})
		require.True(t, ent.Queries)
	})
}
