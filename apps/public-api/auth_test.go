package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/internal/publicauth"
	"github.com/stretchr/testify/require"
	"github.com/workos/workos-go/v10"
)

func requireAuthFailure(t *testing.T, err error, status int, code string) {
	t.Helper()
	var failure *publicauth.Error
	require.ErrorAs(t, err, &failure)
	require.Equal(t, status, failure.Status)
	require.Equal(t, code, failure.Code)
}

func TestPostgresAuthenticatorRequiresPool(t *testing.T) {
	auth := newPostgresAuthenticator(nil, nil, nil)
	_, err := auth.authenticate(t.Context(), "hl_test")
	requireAuthFailure(t, err, http.StatusServiceUnavailable, "public_api_unavailable")
}

// liveMembership answers WorkOS membership lookups for the fixture's user with role.
func (f dbFixture) liveMembership(t *testing.T, role *string) publicauth.MembershipLookup {
	t.Helper()
	var workosUserID, workosOrganizationID, membershipID string
	require.NoError(t, f.pool.QueryRow(t.Context(), `SELECT u.workos_user_id, o.workos_organization_id, m.workos_membership_id
		FROM organization_memberships m
		JOIN users u ON u.id = m.user_id
		JOIN organizations o ON o.id = m.organization_id
		WHERE m.organization_id = $1 AND m.user_id = $2`, f.actor.OrganizationID, f.actor.UserID,
	).Scan(&workosUserID, &workosOrganizationID, &membershipID))
	return func(_ context.Context, id string) (*workos.UserOrganizationMembership, error) {
		return &workos.UserOrganizationMembership{
			ID: membershipID, UserID: workosUserID, OrganizationID: workosOrganizationID,
			Status: "active", Role: &workos.SlimRole{Slug: *role},
		}, nil
	}
}

func TestPostgresAuthenticatorDatabase(t *testing.T) {
	f := newDBFixture(t)
	ctx := t.Context()
	role := "admin"
	auth := newPostgresAuthenticator(f.pool, f.liveMembership(t, &role), nil)
	token := "hl_test_" + uuid.NewString()
	permissions, err := json.Marshal([]string{"files:read", "files:write", "jobs:read"})
	require.NoError(t, err)
	var keyID string
	require.NoError(t, f.pool.QueryRow(ctx, `INSERT INTO organization_api_keys
		(organization_id, name, key_hash, key_prefix, permissions, created_by_user_id)
		VALUES ($1, 'Public API test', $2, $3, $4::jsonb, $5) RETURNING id`,
		f.actor.OrganizationID, publicauth.HashAPIKey(token), token[:8], string(permissions), f.actor.UserID,
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

	t.Run("the role comes from WorkOS, not the database", func(t *testing.T) {
		role = "member"
		t.Cleanup(func() { role = "admin" })
		principal, err := auth.authenticate(ctx, token)
		require.NoError(t, err)
		require.Equal(t, "member", principal.Role)
		require.NotContains(t, principal.Permissions, "strings:write")
	})

	t.Run("unknown and revoked tokens", func(t *testing.T) {
		_, err := auth.authenticate(ctx, "hl_missing")
		requireAuthFailure(t, err, http.StatusUnauthorized, "unauthorized")

		f.exec(t, `UPDATE organization_api_keys SET revoked_at = now() WHERE id = $1`, keyID)
		t.Cleanup(func() { f.exec(t, `UPDATE organization_api_keys SET revoked_at = NULL WHERE id = $1`, keyID) })
		_, err = auth.authenticate(ctx, token)
		requireAuthFailure(t, err, http.StatusUnauthorized, "unauthorized")
	})

	t.Run("archived workspace", func(t *testing.T) {
		f.exec(t, `UPDATE organizations SET lifecycle_status = 'archived' WHERE id = $1`, f.actor.OrganizationID)
		t.Cleanup(func() {
			f.exec(t, `UPDATE organizations SET lifecycle_status = 'active' WHERE id = $1`, f.actor.OrganizationID)
		})
		_, err := auth.authenticate(ctx, token)
		requireAuthFailure(t, err, http.StatusForbidden, "workspace_archived")
	})

	t.Run("WorkOS membership removed or unavailable", func(t *testing.T) {
		removed := newPostgresAuthenticator(f.pool, func(context.Context, string) (*workos.UserOrganizationMembership, error) {
			return nil, &workos.APIError{StatusCode: http.StatusNotFound}
		}, nil)
		_, err := removed.authenticate(ctx, token)
		requireAuthFailure(t, err, http.StatusForbidden, "forbidden")

		down := newPostgresAuthenticator(f.pool, func(context.Context, string) (*workos.UserOrganizationMembership, error) {
			return nil, errors.New("unavailable")
		}, nil)
		_, err = down.authenticate(ctx, token)
		requireAuthFailure(t, err, http.StatusServiceUnavailable, "workos_membership_lookup_failed")

		unconfigured := newPostgresAuthenticator(f.pool, nil, nil)
		_, err = unconfigured.authenticate(ctx, token)
		requireAuthFailure(t, err, http.StatusServiceUnavailable, "workos_membership_lookup_failed")
	})

	t.Run("creator no longer a member", func(t *testing.T) {
		f.exec(t, `DELETE FROM organization_memberships WHERE organization_id = $1 AND user_id = $2`,
			f.actor.OrganizationID, f.actor.UserID)
		_, err := auth.authenticate(ctx, token)
		requireAuthFailure(t, err, http.StatusForbidden, "forbidden")
	})
}
