package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"testing"

	"github.com/stretchr/testify/require"
)

func capturingPatAuditor(buf *bytes.Buffer) patAuditor {
	handler := slog.NewJSONHandler(buf, nil)
	return patAuditor{write: handler.Handle}
}

func decodePatAudit(t *testing.T, buf *bytes.Buffer) (entry, audit, target map[string]any) {
	t.Helper()
	require.NoError(t, json.Unmarshal(buf.Bytes(), &entry))
	audit, ok := entry["audit"].(map[string]any)
	require.True(t, ok)
	target, ok = audit["target"].(map[string]any)
	require.True(t, ok)
	return entry, audit, target
}

func TestEmitPatRevokedWritesHighSeverityAudit(t *testing.T) {
	var buf bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&buf, nil))
	previous := slog.Default()
	slog.SetDefault(logger)
	t.Cleanup(func() { slog.SetDefault(previous) })

	err := patAuditor{}.emitPatRevoked(t.Context(), patRevokedAuditInput{
		actorUserID:    "actor-1",
		ownerUserID:    ptr("owner-1"),
		organizationID: "org-1",
		tokenID:        "token-1",
		keyPrefix:      "hl_AbCd",
		reason:         patRevokeReasonMembershipRemoved,
	})
	require.NoError(t, err)

	entry, audit, target := decodePatAudit(t, &buf)
	require.Equal(t, patRevokedAuditAction, entry["msg"])
	require.Equal(t, patRevokedAuditAction, audit["action"])
	require.Equal(t, patAuditSeverity, audit["severity"])
	require.Equal(t, "success", audit["outcome"])
	require.Equal(t, patRevokeReasonMembershipRemoved, audit["reason"])
	require.Equal(t, float64(patAuditSchemaVersion), audit["version"])
	actor, ok := audit["actor"].(map[string]any)
	require.True(t, ok)
	require.Equal(t, "user", actor["type"])
	require.Equal(t, "actor-1", actor["id"])
	require.Equal(t, patAuditTarget, target["type"])
	require.Equal(t, "token-1", target["id"])
	require.Equal(t, "org-1", target["organizationId"])
	require.Equal(t, "owner-1", target["ownerUserId"])
	require.Equal(t, "hl_AbCd", target["keyPrefix"])
	serialized := buf.String()
	require.NotContains(t, serialized, "keyHash")
	require.NotContains(t, serialized, "key_hash")
	require.NotContains(t, serialized, "@example.com")
}

func TestEmitPatRevokedRecordsNullOwnerForLegacyToken(t *testing.T) {
	t.Parallel()

	var buf bytes.Buffer
	err := capturingPatAuditor(&buf).emitPatRevoked(t.Context(), patRevokedAuditInput{
		actorUserID:    "admin-1",
		organizationID: "org-1",
		tokenID:        "token-1",
		keyPrefix:      "hl_AbCd",
		reason:         patRevokeReasonManual,
	})
	require.NoError(t, err)

	_, audit, target := decodePatAudit(t, &buf)
	require.Equal(t, patRevokeReasonManual, audit["reason"])
	value, present := target["ownerUserId"]
	require.True(t, present)
	require.Nil(t, value)
}

func TestEmitPatCreatedWritesSafeAudit(t *testing.T) {
	t.Parallel()

	key, err := generateAPIKey()
	require.NoError(t, err)
	var buf bytes.Buffer
	err = capturingPatAuditor(&buf).emitPatCreated(t.Context(), patCreatedAuditInput{
		actorUserID:    "user-1",
		ownerUserID:    "user-1",
		organizationID: "org-1",
		tokenID:        "token-1",
		keyPrefix:      apiKeyPrefix(key),
		permissions:    []string{"jobs:read", "files:read"},
	})
	require.NoError(t, err)

	entry, audit, target := decodePatAudit(t, &buf)
	require.Equal(t, patCreatedAuditAction, entry["msg"])
	require.Equal(t, "INFO", entry["level"])
	require.Equal(t, patCreatedAuditAction, audit["action"])
	require.Equal(t, patAuditSeverity, audit["severity"])
	require.Equal(t, "success", audit["outcome"])
	require.Equal(t, float64(patAuditSchemaVersion), audit["version"])
	require.NotContains(t, audit, "reason")
	actor, ok := audit["actor"].(map[string]any)
	require.True(t, ok)
	require.Equal(t, map[string]any{"type": "user", "id": "user-1"}, actor)
	require.Equal(t, map[string]any{
		"type":           patAuditTarget,
		"id":             "token-1",
		"organizationId": "org-1",
		"ownerUserId":    "user-1",
		"keyPrefix":      apiKeyPrefix(key),
		"permissions":    []any{"jobs:read", "files:read"},
	}, target)

	serialized := buf.String()
	require.NotContains(t, serialized, key)
	require.NotContains(t, serialized, hashAPIKey(key))
}

func TestEmitPatCreatedRecordsEmptyPermissionsAsArray(t *testing.T) {
	t.Parallel()

	var buf bytes.Buffer
	err := capturingPatAuditor(&buf).emitPatCreated(t.Context(), patCreatedAuditInput{
		actorUserID: "user-1", ownerUserID: "user-1", organizationID: "org-1", tokenID: "token-1", keyPrefix: "hl_AbCde",
	})
	require.NoError(t, err)

	_, _, target := decodePatAudit(t, &buf)
	require.Equal(t, []any{}, target["permissions"])
}

func TestEmitPatCreatedReportsWriteFailure(t *testing.T) {
	t.Parallel()

	writeErr := errors.New("audit sink unavailable")
	auditor := patAuditor{write: func(context.Context, slog.Record) error { return writeErr }}
	err := auditor.emitPatCreated(t.Context(), patCreatedAuditInput{
		actorUserID: "user-1", ownerUserID: "user-1", organizationID: "org-1", tokenID: "token-1", keyPrefix: "hl_AbCde",
	})
	require.ErrorIs(t, err, writeErr)

	err = auditor.emitPatRevoked(t.Context(), patRevokedAuditInput{
		actorUserID: "user-1", organizationID: "org-1", tokenID: "token-1", keyPrefix: "hl_AbCde", reason: patRevokeReasonManual,
	})
	require.ErrorIs(t, err, writeErr)
}

func TestEmitPatCreatedRefusesPlaintextAsPrefix(t *testing.T) {
	t.Parallel()

	key, err := generateAPIKey()
	require.NoError(t, err)
	written := false
	auditor := patAuditor{write: func(context.Context, slog.Record) error {
		written = true
		return nil
	}}
	err = auditor.emitPatCreated(t.Context(), patCreatedAuditInput{
		actorUserID: "user-1", ownerUserID: "user-1", organizationID: "org-1", tokenID: "token-1", keyPrefix: key,
	})
	require.ErrorIs(t, err, errPatAuditUnsafe)
	require.False(t, written)
}

func TestDefaultPatAuditFailsClosedWhenInfoIsDisabled(t *testing.T) {
	var buf bytes.Buffer
	previous := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&buf, &slog.HandlerOptions{Level: slog.LevelWarn})))
	t.Cleanup(func() { slog.SetDefault(previous) })

	err := patAuditor{}.emitPatCreated(t.Context(), patCreatedAuditInput{
		actorUserID: "user-1", ownerUserID: "user-1", organizationID: "org-1", tokenID: "token-1", keyPrefix: "hl_AbCde",
	})
	require.ErrorIs(t, err, errPatAuditDisabled)
	require.Empty(t, buf.String())
}

func TestAssertSafePatAuditRejectsForbiddenFields(t *testing.T) {
	t.Parallel()

	cases := map[string]slog.Attr{
		"unknown target key": slog.Group("audit", slog.Group("target", slog.String("name", "CI token"))),
		"hash key":           slog.Group("audit", slog.String("keyHash", "abc")),
		"snake hash key":     slog.Group("audit", slog.Group("actor", slog.String("key_hash", "abc"))),
		"plaintext key":      slog.Group("audit", slog.String("key", "hl_secret")),
		"email":              slog.Group("audit", slog.Group("actor", slog.String("email", "a@example.com"))),
		"authorization key":  slog.Group("audit", slog.String("Authorization", "Bearer x")),
		"api key header":     slog.Group("audit", slog.String("x-api-key", "hl_secret")),
		"body":               slog.Group("audit", slog.String("body", "{}")),
		"request body":       slog.Group("audit", slog.String("requestBody", "{}")),
		"authorization text": slog.Group("audit", slog.String("reason", "authorization: Bearer x")),
		"hash in list":       slog.Group("audit", slog.Group("target", slog.Any("permissions", []string{"key_hash"}))),
	}
	for name, attr := range cases {
		require.ErrorIs(t, assertSafePatAudit(attr), errPatAuditUnsafe, name)
	}

	safe := slog.Group("audit",
		slog.String("action", patCreatedAuditAction),
		slog.Group("target",
			slog.String("type", patAuditTarget),
			slog.String("id", "token-1"),
			slog.String("organizationId", "org-1"),
			slog.Any("ownerUserId", nil),
			slog.String("keyPrefix", "hl_AbCde"),
			slog.Any("permissions", []string{"jobs:read"}),
		),
	)
	require.NoError(t, assertSafePatAudit(safe))
}
