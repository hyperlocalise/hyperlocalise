package main

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestMemberAuthz(t *testing.T) {
	t.Parallel()

	require.Contains(t, assignableRolesForActor("admin"), "admin")
	require.True(t, canActorAssignRole("admin", "translator"))
	require.True(t, canActorManageTarget("admin", "localization_manager", ptr("reviewer")))

	require.NotContains(t, assignableRolesForActor("localization_manager"), "admin")
	require.True(t, canActorAssignRole("localization_manager", "reviewer"))
	require.False(t, canActorAssignRole("localization_manager", "admin"))
	require.False(t, canActorManageTarget("localization_manager", "admin", nil))
	require.True(t, canActorManageTarget("localization_manager", "reviewer", ptr("translator")))

	require.Empty(t, assignableRolesForActor("member"))
	canUpdate, canRemove := memberRowCapabilities("member", "translator", false)
	require.False(t, canUpdate)
	require.False(t, canRemove)

	canUpdate, canRemove = memberRowCapabilities("admin", "admin", true)
	require.False(t, canUpdate)
	require.False(t, canRemove)

	require.Equal(t, "invited", resolveMemberStatus(nil))
	replacing := replacingWorkosMembershipID
	require.Equal(t, "invited", resolveMemberStatus(&replacing))
	active := "om_live"
	require.Equal(t, "active", resolveMemberStatus(&active))
	require.True(t, shouldCleanupPlaceholderUserOnMemberRemoval(invitedWorkosUserIDPrefix+"abc"))
	require.False(t, shouldCleanupPlaceholderUserOnMemberRemoval("user_live"))
}

func ptr(value string) *string {
	return &value
}
