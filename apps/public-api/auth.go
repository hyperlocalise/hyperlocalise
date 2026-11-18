package main

import (
	"context"

	"github.com/hyperlocalise/hyperlocalise/internal/authz"
	"github.com/hyperlocalise/hyperlocalise/internal/publicauth"
	"github.com/jackc/pgx/v5/pgxpool"
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
	// Role is the token owner's workspace role, for per-resource rules such as glossary edits.
	Role string `json:"-"`
}

// authenticator returns a *publicauth.Error for a credential it refuses.
type authenticator interface {
	authenticate(context.Context, string) (principal, error)
}

// postgresAuthenticator checks personal access tokens as go-svc does, through publicauth: the
// owner's membership and role are confirmed live in WorkOS on each request (cached briefly).
type postgresAuthenticator struct {
	auth   publicauth.Authenticator
	autumn *autumnClient
}

func newPostgresAuthenticator(pool *pgxpool.Pool, membership publicauth.MembershipLookup, autumn *autumnClient) *postgresAuthenticator {
	a := &postgresAuthenticator{auth: publicauth.Authenticator{Membership: membership}, autumn: autumn}
	if pool != nil {
		a.auth.DB = pool
	}
	return a
}

func (a *postgresAuthenticator) authenticate(ctx context.Context, token string) (principal, error) {
	p, err := a.auth.AuthenticateAPIKey(ctx, token)
	if err != nil {
		return principal{}, err
	}
	permissions := authz.EffectivePermissions(p.Permissions, p.Role)
	ent := entitlements{}
	if a.autumn != nil {
		ent = a.autumn.queriesEnabledForPermissions(ctx, p.OrganizationID, permissions)
	}
	return principal{
		TokenID:        p.CredentialID,
		UserID:         p.UserID,
		OrganizationID: p.OrganizationID,
		Permissions:    permissions,
		Entitlements:   ent,
		Role:           p.Role,
	}, nil
}
