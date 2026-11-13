package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestPostgresAuthenticatorRequiresPool(t *testing.T) {
	auth := newPostgresAuthenticator(nil, nil)
	_, err := auth.authenticate(t.Context(), "hl_test")
	require.ErrorIs(t, err, errAuthUnavailable)
}

func TestPostgresAuthenticatorDatabase(t *testing.T) {
	f := newDBFixture(t)
	ctx := t.Context()
	auth := newPostgresAuthenticator(f.pool, nil)
	token := "hl_test_" + uuid.NewString()
	hash := sha256.Sum256([]byte(token))
	permissions, err := json.Marshal([]string{"files:read", "files:write", "jobs:read"})
	require.NoError(t, err)
	var keyID string
	require.NoError(t, f.pool.QueryRow(ctx, `INSERT INTO organization_api_keys
		(organization_id, name, key_hash, key_prefix, permissions, created_by_user_id)
		VALUES ($1, 'Public API test', $2, $3, $4::jsonb, $5) RETURNING id`,
		f.actor.OrganizationID, hex.EncodeToString(hash[:]), token[:8], string(permissions), f.actor.UserID,
	).Scan(&keyID))

	principal, err := auth.authenticate(ctx, token)
	require.NoError(t, err)
	require.Equal(t, keyID, principal.TokenID)
	require.Equal(t, f.actor.UserID, principal.UserID)
	require.Equal(t, f.actor.OrganizationID, principal.OrganizationID)
	require.Equal(t, "admin", principal.Role)
	require.Contains(t, principal.Permissions, "projects:read")
	require.Contains(t, principal.Permissions, "strings:write")
	require.Eventually(t, func() bool {
		var lastUsed *time.Time
		require.NoError(t, f.pool.QueryRow(ctx, `SELECT last_used_at FROM organization_api_keys WHERE id = $1`, keyID).Scan(&lastUsed))
		return lastUsed != nil
	}, 2*time.Second, 20*time.Millisecond)

	_, err = auth.authenticate(ctx, "hl_missing")
	require.ErrorIs(t, err, errUnauthorized)

	f.exec(t, `UPDATE organization_api_keys SET revoked_at = now() WHERE id = $1`, keyID)
	_, err = auth.authenticate(ctx, token)
	require.ErrorIs(t, err, errUnauthorized)
	f.exec(t, `UPDATE organization_api_keys SET revoked_at = NULL WHERE id = $1`, keyID)

	f.exec(t, `UPDATE organizations SET lifecycle_status = 'archived' WHERE id = $1`, f.actor.OrganizationID)
	_, err = auth.authenticate(ctx, token)
	require.ErrorIs(t, err, errForbidden)
	f.exec(t, `UPDATE organizations SET lifecycle_status = 'active' WHERE id = $1`, f.actor.OrganizationID)

	f.exec(t, `DELETE FROM organization_memberships WHERE organization_id = $1 AND user_id = $2`,
		f.actor.OrganizationID, f.actor.UserID)
	_, err = auth.authenticate(ctx, token)
	require.ErrorIs(t, err, errForbidden)
}
