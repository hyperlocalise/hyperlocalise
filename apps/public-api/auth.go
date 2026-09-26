package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	errUnauthorized    = errors.New("invalid or revoked API key")
	errForbidden       = errors.New("workspace access denied")
	errAuthUnavailable = errors.New("authentication service unavailable")
)

type entitlements struct {
	Queries bool `json:"queries"`
}

type principal struct {
	TokenID        string       `json:"tokenId"`
	UserID         string       `json:"userId"`
	OrganizationID string       `json:"organizationId"`
	Permissions    []string     `json:"permissions"`
	Entitlements   entitlements `json:"entitlements"`
}

type authenticator interface {
	authenticate(context.Context, string) (principal, error)
}

type postgresAuthenticator struct {
	pool   *pgxpool.Pool
	autumn *autumnClient
}

func newPostgresAuthenticator(pool *pgxpool.Pool, autumn *autumnClient) *postgresAuthenticator {
	return &postgresAuthenticator{pool: pool, autumn: autumn}
}

func (a *postgresAuthenticator) authenticate(ctx context.Context, token string) (principal, error) {
	if a.pool == nil {
		return principal{}, errAuthUnavailable
	}
	hash := sha256.Sum256([]byte(token))
	keyHash := hex.EncodeToString(hash[:])

	const query = `
		SELECT
			k.id,
			k.organization_id,
			k.permissions,
			k.created_by_user_id,
			k.revoked_at,
			o.lifecycle_status,
			om.role
		FROM organization_api_keys k
		INNER JOIN organizations o ON o.id = k.organization_id
		LEFT JOIN organization_memberships om
			ON om.organization_id = k.organization_id AND om.user_id = k.created_by_user_id
		WHERE k.key_hash = $1
		LIMIT 1`

	var (
		tokenID        string
		organizationID string
		permissionsRaw []byte
		createdBy      *string
		revokedAt      any
		lifecycle      string
		role           *string
	)
	err := a.pool.QueryRow(ctx, query, keyHash).Scan(
		&tokenID, &organizationID, &permissionsRaw, &createdBy, &revokedAt, &lifecycle, &role,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return principal{}, errUnauthorized
	}
	if err != nil {
		return principal{}, errAuthUnavailable
	}
	if revokedAt != nil || createdBy == nil || *createdBy == "" {
		return principal{}, errUnauthorized
	}
	if lifecycle != "active" {
		return principal{}, errForbidden
	}
	if role == nil || *role == "" {
		return principal{}, errForbidden
	}

	var storedPermissions []string
	if err := json.Unmarshal(permissionsRaw, &storedPermissions); err != nil {
		return principal{}, errAuthUnavailable
	}

	permissions := effectivePermissions(storedPermissions, *role)
	ent := entitlements{}
	if a.autumn != nil {
		ent = a.autumn.queriesEnabledForPermissions(ctx, organizationID, permissions)
	}

	go func(apiKeyID string) {
		_, _ = a.pool.Exec(context.Background(), `
			UPDATE organization_api_keys
			SET last_used_at = NOW()
			WHERE id = $1`, apiKeyID)
	}(tokenID)

	return principal{
		TokenID:        tokenID,
		UserID:         *createdBy,
		OrganizationID: organizationID,
		Permissions:    permissions,
		Entitlements:   ent,
	}, nil
}
