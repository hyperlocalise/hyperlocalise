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
		require.Equal(t, []string{"jobs:read", "files:read", "projects:read", "queries:read", "strings:read", "glossaries:read", "translation-memories:read", "project-templates:read"}, perms)
	})

	t.Run("developer keeps write scopes", func(t *testing.T) {
		perms := effectivePermissions([]string{"jobs:read", "files:read", "jobs:write", "files:write"}, "developer")
		require.Equal(t, []string{"jobs:read", "files:read", "jobs:write", "files:write", "projects:read", "queries:read", "strings:read", "glossaries:read", "translation-memories:read", "strings:write", "projects:write", "project-templates:read"}, perms)
		require.NotContains(t, perms, "glossaries:write")
	})

	t.Run("managers and translators can import glossaries", func(t *testing.T) {
		for _, role := range []string{"admin", "localization_manager", "translator"} {
			perms := effectivePermissions([]string{"files:read", "files:write"}, role)
			require.Contains(t, perms, "glossaries:write", role)
		}
	})

	t.Run("only approving roles get translations:approve", func(t *testing.T) {
		for role, allowed := range map[string]bool{
			"admin": true, "localization_manager": true, "reviewer": true,
			"developer": false, "translator": false, "member": false,
		} {
			perms := effectivePermissions([]string{"files:read", "files:write"}, role)
			require.Equal(t, allowed, contains(perms, "translations:approve"), role)
		}
		require.NotContains(t, effectivePermissions([]string{"files:read"}, "admin"), "translations:approve")
	})

	t.Run("everyone who edits translations gets strings:write", func(t *testing.T) {
		for role, allowed := range map[string]bool{
			"admin": true, "localization_manager": true, "developer": true, "reviewer": true, "translator": true,
			"member": false,
		} {
			perms := effectivePermissions([]string{"files:read", "files:write"}, role)
			require.Equal(t, allowed, contains(perms, "strings:write"), role)
		}
	})

	t.Run("member files write does not expand strings write", func(t *testing.T) {
		perms := effectivePermissions([]string{"files:write"}, "member")
		require.Empty(t, perms)
	})
}

func TestRoleAllowsCapability(t *testing.T) {
	for _, tt := range []struct {
		role, capability string
		allowed          bool
	}{
		{"member", "projects:read", true},
		{"member", "jobs:read", true},
		{"member", "jobs:write", false},
		{"member", "jobs:create", false},
		{"developer", "jobs:create", true},
		{"admin", "jobs:write", true},
		{"", "projects:read", false},
		{"developer", "unknown", false},
	} {
		t.Run(tt.role+" "+tt.capability, func(t *testing.T) {
			require.Equal(t, tt.allowed, roleAllowsCapability(tt.role, tt.capability))
		})
	}
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
