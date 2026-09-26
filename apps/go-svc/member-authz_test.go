package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"log/slog"
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

	require.True(t, isWorkosNotFoundError(&workosHTTPError{status: 404}))
	require.False(t, isWorkosNotFoundError(&workosHTTPError{status: 500}))
	require.False(t, isWorkosNotFoundError(errors.New("workos: HTTP 404")))
}

func TestEmitPatRevokedWritesHighSeverityAudit(t *testing.T) {
	var buf bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&buf, nil))
	previous := slog.Default()
	slog.SetDefault(logger)
	t.Cleanup(func() { slog.SetDefault(previous) })

	emitPatRevoked(t.Context(), patRevokedAuditInput{
		actorUserID:    "actor-1",
		ownerUserID:    "owner-1",
		organizationID: "org-1",
		tokenID:        "token-1",
		keyPrefix:      "hl_AbCd",
		reason:         patRevokeReasonMembershipRemoved,
	})

	var entry map[string]any
	require.NoError(t, json.Unmarshal(buf.Bytes(), &entry))
	require.Equal(t, patRevokedAuditAction, entry["msg"])
	audit, ok := entry["audit"].(map[string]any)
	require.True(t, ok)
	require.Equal(t, patRevokedAuditAction, audit["action"])
	require.Equal(t, patRevokedAuditSeverity, audit["severity"])
	require.Equal(t, "success", audit["outcome"])
	require.Equal(t, patRevokeReasonMembershipRemoved, audit["reason"])
	require.Equal(t, float64(patRevokedAuditSchemaVersion), audit["version"])
	actor, ok := audit["actor"].(map[string]any)
	require.True(t, ok)
	require.Equal(t, "user", actor["type"])
	require.Equal(t, "actor-1", actor["id"])
	target, ok := audit["target"].(map[string]any)
	require.True(t, ok)
	require.Equal(t, patRevokedAuditTarget, target["type"])
	require.Equal(t, "token-1", target["id"])
	require.Equal(t, "org-1", target["organizationId"])
	require.Equal(t, "owner-1", target["ownerUserId"])
	require.Equal(t, "hl_AbCd", target["keyPrefix"])
	serialized := buf.String()
	require.NotContains(t, serialized, "keyHash")
	require.NotContains(t, serialized, "key_hash")
	require.NotContains(t, serialized, "@example.com")
}

func ptr(value string) *string {
	return &value
}
