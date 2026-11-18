// Package publicauth authenticates callers of the Hyperlocalise public APIs, in go-svc and the
// standalone public API, so both accept the same credentials with the same rules: a personal
// access token in X-API-Key, or a WorkOS agent registration token as a Bearer JWT. Either way the
// caller acts as a user whose workspace membership and role are confirmed live in WorkOS.
package publicauth

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

const (
	KindPAT   = "pat"
	KindAgent = "agent"

	// InvalidKeyMessage keeps unknown, revoked, and ownerless tokens indistinguishable.
	InvalidKeyMessage = "Invalid or revoked API key"

	lastUsedTimeout = 5 * time.Second
)

// DB is the subset of a pgx pool authentication uses.
type DB interface {
	QueryRow(context.Context, string, ...any) pgx.Row
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
}

// Principal is an authenticated caller.
type Principal struct {
	OrganizationID string
	UserID         string
	// Role is the user's live WorkOS role.
	Role string
	// CredentialID is the API key id or the agent registration id.
	CredentialID string
	Kind         string
	// Permissions are the credential's scopes as granted. Check them with authz.RoleAllowsScope
	// or expand them with authz.EffectivePermissions; a demoted owner keeps the stored scopes.
	Permissions []string
}

// Error is an authentication failure with the response it maps to.
type Error struct {
	Status        int
	Code, Message string
	// Challenge marks a missing or unverifiable credential, answered with WWW-Authenticate.
	Challenge bool
	Cause     error
}

func (e *Error) Error() string { return e.Code }

func (e *Error) Unwrap() error { return e.Cause }

func failure(status int, code, message string) error {
	return &Error{Status: status, Code: code, Message: message}
}

func internalFailure(cause error) error {
	return &Error{Status: http.StatusInternalServerError, Code: "internal_error", Message: "Internal server error", Cause: cause}
}

func authenticationRequired() error {
	return &Error{Status: http.StatusUnauthorized, Code: "unauthorized", Message: "Authentication required", Challenge: true}
}

func unavailable() error {
	return failure(http.StatusServiceUnavailable, "public_api_unavailable", "Public API is unavailable")
}

func workspaceArchived() error {
	return failure(http.StatusForbidden, "workspace_archived", "This workspace has been archived")
}

// Authenticator checks credentials against PostgreSQL and WorkOS.
type Authenticator struct {
	DB         DB
	Membership MembershipLookup
	// Agent verifies Bearer tokens; nil rejects them.
	Agent *AgentVerifier
}

// HashAPIKey is the stored form of a personal access token.
func HashAPIKey(key string) string {
	sum := sha256.Sum256([]byte(key))
	return hex.EncodeToString(sum[:])
}

// Authenticate accepts an API key, which takes precedence, or an Authorization header carrying
// a Bearer agent token.
func (a Authenticator) Authenticate(ctx context.Context, apiKey, authorization string) (Principal, error) {
	if apiKey != "" {
		return a.AuthenticateAPIKey(ctx, apiKey)
	}

	token, ok := strings.CutPrefix(authorization, "Bearer ")
	if !ok || !IsCompactJWT(token) {
		return Principal{}, authenticationRequired()
	}
	claims, err := a.Agent.Verify(ctx, token)
	if err != nil {
		return Principal{}, authenticationRequired()
	}
	return a.AuthenticateAgent(ctx, claims)
}

// AuthenticateAPIKey resolves a personal access token to the user who created it.
func (a Authenticator) AuthenticateAPIKey(ctx context.Context, apiKey string) (Principal, error) {
	if a.DB == nil {
		return Principal{}, unavailable()
	}
	var (
		keyID, organizationID, lifecycle string
		permissionsRaw                   []byte
		createdByUserID                  *string
		revoked                          bool
	)
	err := a.DB.QueryRow(ctx, `select k.id, k.organization_id, k.permissions, k.created_by_user_id, k.revoked_at is not null, o.lifecycle_status
        from organization_api_keys k join organizations o on o.id = k.organization_id
        where k.key_hash = $1
        limit 1`, HashAPIKey(apiKey)).Scan(&keyID, &organizationID, &permissionsRaw, &createdByUserID, &revoked, &lifecycle)
	if errors.Is(err, pgx.ErrNoRows) {
		return Principal{}, failure(http.StatusUnauthorized, "unauthorized", InvalidKeyMessage)
	}
	if err != nil {
		return Principal{}, internalFailure(err)
	}
	if revoked || createdByUserID == nil {
		return Principal{}, failure(http.StatusUnauthorized, "unauthorized", InvalidKeyMessage)
	}
	if lifecycle != "active" {
		return Principal{}, workspaceArchived()
	}

	actor, err := ResolveActorByID(ctx, a.DB, a.Membership, *createdByUserID, organizationID)
	if err != nil {
		return Principal{}, mapMembershipError(err, "API key creator is not authorized for this workspace")
	}

	permissions, err := parsePermissions(permissionsRaw)
	if err != nil {
		return Principal{}, internalFailure(err)
	}

	a.touchLastUsedAt(ctx, keyID)

	return Principal{
		OrganizationID: actor.OrganizationID,
		UserID:         actor.UserID,
		Role:           actor.Role,
		CredentialID:   keyID,
		Kind:           KindPAT,
		Permissions:    permissions,
	}, nil
}

func parsePermissions(raw []byte) ([]string, error) {
	var values []any
	if err := json.Unmarshal(raw, &values); err != nil {
		return nil, err
	}
	permissions := make([]string, 0, len(values))
	for _, value := range values {
		if permission, ok := value.(string); ok {
			permissions = append(permissions, permission)
		}
	}
	return permissions, nil
}

func (a Authenticator) touchLastUsedAt(ctx context.Context, apiKeyID string) {
	go func() {
		touchCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), lastUsedTimeout)
		defer cancel()
		if _, err := a.DB.Exec(touchCtx, `update organization_api_keys set last_used_at = now(), updated_at = now() where id = $1`, apiKeyID); err != nil {
			slog.DebugContext(touchCtx, "api_key_last_used_update_failed")
		}
	}()
}

// AuthenticateAgent resolves verified agent claims to the user the agent acts for.
func (a Authenticator) AuthenticateAgent(ctx context.Context, claims AgentClaims) (Principal, error) {
	const notAuthorized = "Agent is not authorized for this workspace"

	if a.DB == nil {
		return Principal{}, unavailable()
	}
	var userID string
	err := a.DB.QueryRow(ctx, `select id from users where workos_user_id = $1 limit 1`, claims.WorkOSUserID).Scan(&userID)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return Principal{}, internalFailure(err)
	}
	var organizationID, lifecycle string
	orgErr := a.DB.QueryRow(ctx, `select id, lifecycle_status from organizations where workos_organization_id = $1 limit 1`, claims.WorkOSOrganizationID).Scan(&organizationID, &lifecycle)
	if orgErr != nil && !errors.Is(orgErr, pgx.ErrNoRows) {
		return Principal{}, internalFailure(orgErr)
	}
	if userID == "" || organizationID == "" {
		return Principal{}, failure(http.StatusForbidden, "forbidden", notAuthorized)
	}
	if lifecycle != "active" {
		return Principal{}, workspaceArchived()
	}

	actor, err := ResolveActorByID(ctx, a.DB, a.Membership, userID, organizationID)
	if err != nil {
		return Principal{}, mapMembershipError(err, notAuthorized)
	}

	return Principal{
		OrganizationID: actor.OrganizationID,
		UserID:         actor.UserID,
		Role:           actor.Role,
		CredentialID:   claims.RegistrationID,
		Kind:           KindAgent,
		Permissions:    claims.Scopes,
	}, nil
}

// mapMembershipError keeps WorkOS outages visible and folds every denial into one message.
func mapMembershipError(err error, deniedMessage string) error {
	var access *AccessError
	if !errors.As(err, &access) {
		return internalFailure(err)
	}
	if access.Status == http.StatusServiceUnavailable {
		return failure(access.Status, access.Code, access.Message)
	}
	return failure(http.StatusForbidden, "forbidden", deniedMessage)
}
