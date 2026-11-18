package main

import (
	"testing"

	"github.com/stretchr/testify/require"
)

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
