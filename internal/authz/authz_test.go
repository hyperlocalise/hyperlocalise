package authz

import (
	"slices"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestCapabilitiesByRole(t *testing.T) {
	t.Parallel()

	managers := map[string]bool{RoleAdmin: true, RoleLocalizationManager: true}
	jobWriters := map[string]bool{
		RoleAdmin: true, RoleLocalizationManager: true,
		RoleDeveloper: true, RoleReviewer: true, RoleTranslator: true,
	}
	approvers := map[string]bool{RoleAdmin: true, RoleLocalizationManager: true, RoleReviewer: true}
	for _, role := range Roles {
		require.True(t, IsKnownRole(role), role)
		require.True(t, HasCapability(role, "workspace:read"), role)
		require.True(t, HasCapability(role, "projects:read"), role)
		require.True(t, HasCapability(role, "jobs:read"), role)
		require.True(t, HasCapability(role, "memories:read"), role)
		require.Equal(t, managers[role], HasCapability(role, "memories:write"), role)
		require.Equal(t, managers[role], HasCapability(role, "workspace:update"), role)
		require.Equal(t, managers[role], HasCapability(role, "members:invite"), role)
		require.Equal(t, managers[role], HasCapability(role, "teams:write"), role)
		require.Equal(t, managers[role], HasCapability(role, "api_keys:read"), role)
		require.Equal(t, managers[role], HasCapability(role, "api_keys:write"), role)
		require.Equal(t, managers[role], HasCapability(role, "billing:read"), role)
		require.Equal(t, role == RoleAdmin, HasCapability(role, "billing:write"), role)
		require.Equal(t, managers[role] || role == RoleDeveloper, HasCapability(role, "integrations:read"), role)
		require.Equal(t, managers[role] || role == RoleDeveloper, HasCapability(role, "projects:write"), role)
		require.Equal(t, managers[role], HasCapability(role, "integrations:write"), role)
		require.Equal(t, jobWriters[role], HasCapability(role, "jobs:create"), role)
		require.Equal(t, jobWriters[role], HasCapability(role, "jobs:write"), role)
		require.Equal(t, jobWriters[role], HasCapability(role, "ai_actions:run"), role)
		require.Equal(t, approvers[role], HasCapability(role, "write_back:approve"), role)
	}
	require.False(t, IsKnownRole("unknown"))
	require.False(t, IsKnownRole(""))
	require.False(t, HasCapability("unknown", "workspace:read"))
	require.False(t, HasCapability("", "projects:read"))
	require.False(t, HasCapability(RoleAdmin, "not-a-capability"))
}

// A vendor reaches only their own open tasks in the app, so the role is unknown here: no
// capability, no token scope, and nothing from a token made before its owner became one.
func TestVendorRoleHoldsNothing(t *testing.T) {
	t.Parallel()

	require.False(t, IsKnownRole(RoleVendor))
	require.NotContains(t, Roles, RoleVendor)
	for capability := range capabilitiesByRole[RoleAdmin] {
		require.False(t, HasCapability(RoleVendor, capability), capability)
	}
	require.Empty(t, GrantableAPIKeyScopes(RoleVendor))
	require.Empty(t, EffectivePermissions(APIKeyScopes, RoleVendor))
	require.NotEmpty(t, EffectivePermissions(APIKeyScopes, RoleMember))
}

func TestGrantableAPIKeyScopesByRole(t *testing.T) {
	t.Parallel()

	contributors := []string{"jobs:read", "jobs:write", "files:read", "files:write", "memories:read"}
	cases := map[string][]string{
		RoleAdmin:               APIKeyScopes,
		RoleLocalizationManager: APIKeyScopes,
		RoleDeveloper:           contributors,
		RoleReviewer:            contributors,
		RoleTranslator:          contributors,
		RoleMember:              {"jobs:read", "files:read", "memories:read"},
		"unknown":               {},
		"":                      {},
	}
	for role, want := range cases {
		got := GrantableAPIKeyScopes(role)
		require.NotNil(t, got, role)
		require.Equal(t, want, got, role)
	}
}

func TestRefusedAPIKeyScopesKeepsOrderAndDuplicates(t *testing.T) {
	t.Parallel()

	refused := RefusedAPIKeyScopes(RoleMember, []string{"files:write", "jobs:read", "jobs:write", "files:write"})
	require.Equal(t, []string{"files:write", "jobs:write", "files:write"}, refused)

	require.Equal(t, []string{}, RefusedAPIKeyScopes(RoleAdmin, []string{"jobs:read", "jobs:read"}))
	require.Equal(t, []string{}, RefusedAPIKeyScopes(RoleMember, []string{}))
	require.Equal(t, []string{"jobs:read"}, RefusedAPIKeyScopes("unknown", []string{"jobs:read"}))
	require.Equal(t, []string{"queries:read"}, RefusedAPIKeyScopes(RoleAdmin, []string{"queries:read"}))
}

func TestRoleAllowsScope(t *testing.T) {
	t.Parallel()

	for _, tt := range []struct {
		role, scope string
		allowed     bool
	}{
		{RoleMember, "files:read", true},
		{RoleMember, "jobs:read", true},
		{RoleMember, "jobs:write", false},
		{RoleMember, "files:write", false},
		{RoleDeveloper, "files:write", true},
		{RoleAdmin, "jobs:write", true},
		{RoleDeveloper, "reports:read", false},
		{"", "files:read", false},
		{"unknown", "files:read", false},
		{RoleAdmin, "projects:read", false},
		{RoleAdmin, "mcp", false},
	} {
		require.Equal(t, tt.allowed, RoleAllowsScope(tt.role, tt.scope), tt.role+" "+tt.scope)
	}
}

func TestEffectivePermissions(t *testing.T) {
	t.Parallel()

	t.Run("member read scopes", func(t *testing.T) {
		perms := EffectivePermissions([]string{"jobs:read", "files:read", "jobs:write", "files:write"}, RoleMember)
		require.Equal(t, []string{"jobs:read", "files:read", "projects:read", "queries:read", "strings:read", "glossaries:read", "translation-memories:read", "project-templates:read", "custom-fields:read"}, perms)
	})

	t.Run("developer keeps write scopes", func(t *testing.T) {
		perms := EffectivePermissions([]string{"jobs:read", "files:read", "jobs:write", "files:write"}, RoleDeveloper)
		require.Equal(t, []string{"jobs:read", "files:read", "jobs:write", "files:write", "projects:read", "queries:read", "strings:read", "glossaries:read", "translation-memories:read", "strings:write", "projects:write", "project-templates:read", "custom-fields:read"}, perms)
		require.NotContains(t, perms, "glossaries:write")
	})

	t.Run("managers and translators can import glossaries", func(t *testing.T) {
		for _, role := range []string{RoleAdmin, RoleLocalizationManager, RoleTranslator} {
			require.Contains(t, EffectivePermissions([]string{"files:read", "files:write"}, role), "glossaries:write", role)
		}
	})

	t.Run("only approving roles get translations:approve", func(t *testing.T) {
		for role, allowed := range map[string]bool{
			RoleAdmin: true, RoleLocalizationManager: true, RoleReviewer: true,
			RoleDeveloper: false, RoleTranslator: false, RoleMember: false,
		} {
			perms := EffectivePermissions([]string{"files:read", "files:write"}, role)
			require.Equal(t, allowed, slices.Contains(perms, "translations:approve"), role)
		}
		require.NotContains(t, EffectivePermissions([]string{"files:read"}, RoleAdmin), "translations:approve")
	})

	t.Run("everyone who edits translations gets strings:write", func(t *testing.T) {
		for role, allowed := range map[string]bool{
			RoleAdmin: true, RoleLocalizationManager: true, RoleDeveloper: true, RoleReviewer: true, RoleTranslator: true,
			RoleMember: false,
		} {
			perms := EffectivePermissions([]string{"files:read", "files:write"}, role)
			require.Equal(t, allowed, slices.Contains(perms, "strings:write"), role)
		}
	})

	t.Run("only roles that see what work costs keep reports:read", func(t *testing.T) {
		for role, allowed := range map[string]bool{
			RoleAdmin: true, RoleLocalizationManager: true,
			RoleDeveloper: false, RoleReviewer: false, RoleTranslator: false, RoleMember: false,
		} {
			perms := EffectivePermissions([]string{"reports:read"}, role)
			require.Equal(t, allowed, slices.Contains(perms, "reports:read"), role)
		}
	})

	t.Run("member files write does not expand strings write", func(t *testing.T) {
		require.Empty(t, EffectivePermissions([]string{"files:write"}, RoleMember))
	})

	t.Run("unknown roles get nothing", func(t *testing.T) {
		require.Empty(t, EffectivePermissions([]string{"jobs:read", "files:read"}, "unknown"))
		require.Empty(t, EffectivePermissions([]string{"jobs:read", "files:read"}, ""))
	})

	t.Run("stored scopes outside the token scopes are dropped", func(t *testing.T) {
		require.Empty(t, EffectivePermissions([]string{"projects:read", "queries:read", "mcp"}, RoleAdmin))
	})

	t.Run("managers with job scopes can manage webhooks", func(t *testing.T) {
		for _, role := range []string{RoleAdmin, RoleLocalizationManager} {
			perms := EffectivePermissions([]string{"jobs:read", "jobs:write"}, role)
			require.Contains(t, perms, "webhooks:read", role)
			require.Contains(t, perms, "webhooks:write", role)
		}
		require.NotContains(t, EffectivePermissions([]string{"jobs:read", "jobs:write"}, RoleDeveloper), "webhooks:write")
		require.NotContains(t, EffectivePermissions([]string{"jobs:read"}, RoleAdmin), "webhooks:write")
		require.Contains(t, EffectivePermissions([]string{"jobs:read"}, RoleAdmin), "webhooks:read")
	})
}
