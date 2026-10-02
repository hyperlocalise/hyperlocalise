package main

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestGrantableAPIKeyPermissionsByRole(t *testing.T) {
	t.Parallel()

	all := []string{"jobs:read", "jobs:write", "files:read", "files:write"}
	cases := map[string][]string{
		"admin":                all,
		"localization_manager": all,
		"developer":            all,
		"reviewer":             all,
		"translator":           all,
		"member":               {"jobs:read", "files:read"},
		"unknown":              {},
		"":                     {},
	}
	for role, want := range cases {
		got := grantableAPIKeyPermissions(role)
		require.NotNil(t, got, role)
		require.Equal(t, want, got, role)
	}
}

func TestRefusedAPIKeyPermissionsKeepsOrderAndDuplicates(t *testing.T) {
	t.Parallel()

	refused := refusedAPIKeyPermissions("member", []string{"files:write", "jobs:read", "jobs:write", "files:write"})
	require.Equal(t, []string{"files:write", "jobs:write", "files:write"}, refused)

	require.Equal(t, []string{}, refusedAPIKeyPermissions("admin", []string{"jobs:read", "jobs:read"}))
	require.Equal(t, []string{}, refusedAPIKeyPermissions("member", []string{}))
	require.Equal(t, []string{"jobs:read"}, refusedAPIKeyPermissions("unknown", []string{"jobs:read"}))
	require.Equal(t, []string{"queries:read"}, refusedAPIKeyPermissions("admin", []string{"queries:read"}))
}

func TestAPIKeyAdministrationCapabilities(t *testing.T) {
	t.Parallel()

	for _, role := range []string{"admin", "localization_manager"} {
		require.True(t, canAdministerOtherUsersAPIKeys(role), role)
		require.True(t, canRevokeOtherUsersAPIKeys(role), role)
	}
	for _, role := range []string{"developer", "reviewer", "translator", "member", "unknown"} {
		require.False(t, canAdministerOtherUsersAPIKeys(role), role)
		require.False(t, canRevokeOtherUsersAPIKeys(role), role)
	}
}

func TestOrganizationCapabilityMapKeepsMemberCapabilities(t *testing.T) {
	t.Parallel()

	managers := map[string]bool{"admin": true, "localization_manager": true}
	for _, role := range memberSettingsRoleOrder {
		require.True(t, hasOrganizationCapability(role, "workspace:read"), role)
		require.Equal(t, managers[role], hasOrganizationCapability(role, "members:invite"), role)
		require.Equal(t, managers[role], hasOrganizationCapability(role, "teams:write"), role)
	}
	require.False(t, hasOrganizationCapability("unknown", "workspace:read"))
}
