package main

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"slices"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

const (
	publicAPIKindPAT   = "pat"
	publicAPIKindAgent = "agent"

	publicAPIProtectedResourcePath = "/.well-known/oauth-protected-resource/api/v1"
	publicAPILastUsedTimeout       = 5 * time.Second

	// Keep unknown, revoked, and ownerless tokens indistinguishable.
	publicAPIInvalidKeyMessage = "Invalid or revoked API key"
)

type publicAPIPrincipal struct {
	organizationID string
	userID         string
	role           string
	credentialID   string
	kind           string
	permissions    []string
}

type publicAPIPrincipalKey struct{}

func publicAPIPrincipalFrom(ctx context.Context) (publicAPIPrincipal, bool) {
	principal, ok := ctx.Value(publicAPIPrincipalKey{}).(publicAPIPrincipal)
	return principal, ok
}

type publicAPIAuth struct {
	pool         dictionaryPool
	membership   organizationMembershipLookup
	agent        *agentAccessTokenVerifier
	publicAppURL string
}

func newPublicAPIAuthFromEnv(pool dictionaryPool, membership organizationMembershipLookup) *publicAPIAuth {
	return &publicAPIAuth{
		pool:         pool,
		membership:   membership,
		agent:        newAgentAccessTokenVerifierFromEnv(),
		publicAppURL: os.Getenv("HYPERLOCALISE_PUBLIC_APP_URL"),
	}
}

type publicAPIError struct {
	status          int
	code, message   string
	wwwAuthenticate bool
	cause           error
}

func (e *publicAPIError) Error() string { return e.code }

func (e *publicAPIError) Unwrap() error { return e.cause }

func publicAPIFailure(status int, code, message string) error {
	return &publicAPIError{status: status, code: code, message: message}
}

func publicAPIInternalFailure(cause error) error {
	return &publicAPIError{status: http.StatusInternalServerError, code: "internal_error", message: "Internal server error", cause: cause}
}

func publicAPIAuthenticationRequired() error {
	return &publicAPIError{status: http.StatusUnauthorized, code: "unauthorized", message: "Authentication required", wwwAuthenticate: true}
}

func publicAPIWorkspaceArchived() error {
	return publicAPIFailure(http.StatusForbidden, "workspace_archived", "This workspace has been archived")
}

func (a *publicAPIAuth) writeError(w http.ResponseWriter, r *http.Request, phase string, err error) {
	var failure *publicAPIError
	if !errors.As(err, &failure) {
		failure = publicAPIInternalFailure(err).(*publicAPIError)
	}
	logRequestFailure(r, "public_api_request_failed", phase, err, "status", failure.status, "code", failure.code)
	if failure.wwwAuthenticate {
		w.Header().Set("WWW-Authenticate", a.wwwAuthenticate(r))
	}
	body := map[string]string{"error": failure.code}
	if failure.message != "" {
		body["message"] = failure.message
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(failure.status)
	if err := json.NewEncoder(w).Encode(body); err != nil {
		slog.WarnContext(r.Context(), "public_api_response_write_failed")
	}
}

func (a *publicAPIAuth) wwwAuthenticate(r *http.Request) string {
	origin := publicAppOrigin(a.publicAppURL)
	if origin == "" {
		scheme := "http"
		if requestIsHTTPS(r) {
			scheme = "https"
		}
		origin = scheme + "://" + r.Host
	}
	return `Bearer resource_metadata="` + origin + publicAPIProtectedResourcePath + `"`
}

func headerValue(r *http.Request, name string) string {
	return strings.Join(r.Header.Values(name), ", ")
}

func (a *publicAPIAuth) middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		principal, err := a.authenticate(r)
		if err != nil {
			a.writeError(w, r, "auth", err)
			return
		}
		noteRequest(r, "auth_kind", principal.kind, "credential_id", principal.credentialID,
			"organization_id", principal.organizationID, "user_id", principal.userID)
		ctx := context.WithValue(r.Context(), publicAPIPrincipalKey{}, principal)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (a *publicAPIAuth) authenticate(r *http.Request) (publicAPIPrincipal, error) {
	if apiKey := headerValue(r, "X-API-Key"); apiKey != "" {
		if a.pool == nil {
			return publicAPIPrincipal{}, publicAPIFailure(http.StatusServiceUnavailable, "public_api_unavailable", "Public API is unavailable")
		}
		return a.authenticateAPIKey(r.Context(), apiKey)
	}

	authorization := headerValue(r, "Authorization")
	token, ok := strings.CutPrefix(authorization, "Bearer ")
	if !ok || !isCompactJWT(token) {
		return publicAPIPrincipal{}, publicAPIAuthenticationRequired()
	}
	claims, err := a.agent.verify(r.Context(), token)
	if err != nil {
		return publicAPIPrincipal{}, publicAPIAuthenticationRequired()
	}
	if a.pool == nil {
		return publicAPIPrincipal{}, publicAPIFailure(http.StatusServiceUnavailable, "public_api_unavailable", "Public API is unavailable")
	}
	return a.authenticateAgent(r.Context(), claims)
}

func (a *publicAPIAuth) authenticateAPIKey(ctx context.Context, apiKey string) (publicAPIPrincipal, error) {
	var (
		keyID, organizationID, lifecycle string
		permissionsRaw                   []byte
		createdByUserID                  *string
		revoked                          bool
	)
	err := a.pool.QueryRow(ctx, `select k.id, k.organization_id, k.permissions, k.created_by_user_id, k.revoked_at is not null, o.lifecycle_status
        from organization_api_keys k join organizations o on o.id = k.organization_id
        where k.key_hash = $1
        limit 1`, hashAPIKey(apiKey)).Scan(&keyID, &organizationID, &permissionsRaw, &createdByUserID, &revoked, &lifecycle)
	if errors.Is(err, pgx.ErrNoRows) {
		return publicAPIPrincipal{}, publicAPIFailure(http.StatusUnauthorized, "unauthorized", publicAPIInvalidKeyMessage)
	}
	if err != nil {
		return publicAPIPrincipal{}, publicAPIInternalFailure(err)
	}
	if revoked || createdByUserID == nil {
		return publicAPIPrincipal{}, publicAPIFailure(http.StatusUnauthorized, "unauthorized", publicAPIInvalidKeyMessage)
	}
	if lifecycle != "active" {
		return publicAPIPrincipal{}, publicAPIWorkspaceArchived()
	}

	actor, err := resolveOrganizationActorByID(ctx, a.pool, a.membership, *createdByUserID, organizationID)
	if err != nil {
		return publicAPIPrincipal{}, mapPublicAPIMembershipError(err, "API key creator is not authorized for this workspace")
	}

	permissions, err := parseAPIKeyPermissions(permissionsRaw)
	if err != nil {
		return publicAPIPrincipal{}, publicAPIInternalFailure(err)
	}

	a.touchAPIKeyLastUsedAt(ctx, keyID)

	return publicAPIPrincipal{
		organizationID: actor.organizationID,
		userID:         actor.userID,
		role:           actor.role,
		credentialID:   keyID,
		kind:           publicAPIKindPAT,
		permissions:    permissions,
	}, nil
}

func parseAPIKeyPermissions(raw []byte) ([]string, error) {
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

func (a *publicAPIAuth) touchAPIKeyLastUsedAt(ctx context.Context, apiKeyID string) {
	go func() {
		touchCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), publicAPILastUsedTimeout)
		defer cancel()
		if _, err := a.pool.Exec(touchCtx, `update organization_api_keys set last_used_at = now(), updated_at = now() where id = $1`, apiKeyID); err != nil {
			slog.DebugContext(touchCtx, "api_key_last_used_update_failed")
		}
	}()
}

func (a *publicAPIAuth) authenticateAgent(ctx context.Context, claims agentAccessTokenClaims) (publicAPIPrincipal, error) {
	const notAuthorized = "Agent is not authorized for this workspace"

	var userID string
	err := a.pool.QueryRow(ctx, `select id from users where workos_user_id = $1 limit 1`, claims.workosUserID).Scan(&userID)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return publicAPIPrincipal{}, publicAPIInternalFailure(err)
	}
	var organizationID, lifecycle string
	orgErr := a.pool.QueryRow(ctx, `select id, lifecycle_status from organizations where workos_organization_id = $1 limit 1`, claims.workosOrganizationID).Scan(&organizationID, &lifecycle)
	if orgErr != nil && !errors.Is(orgErr, pgx.ErrNoRows) {
		return publicAPIPrincipal{}, publicAPIInternalFailure(orgErr)
	}
	if userID == "" || organizationID == "" {
		return publicAPIPrincipal{}, publicAPIFailure(http.StatusForbidden, "forbidden", notAuthorized)
	}
	if lifecycle != "active" {
		return publicAPIPrincipal{}, publicAPIWorkspaceArchived()
	}

	actor, err := resolveOrganizationActorByID(ctx, a.pool, a.membership, userID, organizationID)
	if err != nil {
		return publicAPIPrincipal{}, mapPublicAPIMembershipError(err, notAuthorized)
	}

	return publicAPIPrincipal{
		organizationID: actor.organizationID,
		userID:         actor.userID,
		role:           actor.role,
		credentialID:   claims.registrationID,
		kind:           publicAPIKindAgent,
		permissions:    claims.scopes,
	}, nil
}

func mapPublicAPIMembershipError(err error, deniedMessage string) error {
	var access *organizationAccessError
	if !errors.As(err, &access) {
		return publicAPIInternalFailure(err)
	}
	if access.status == http.StatusServiceUnavailable {
		return publicAPIFailure(access.status, access.code, access.message)
	}
	return publicAPIFailure(http.StatusForbidden, "forbidden", deniedMessage)
}

func publicAPIRoleAllowsScope(role, scope string) bool {
	return isAPIKeyScope(scope) && hasOrganizationCapability(role, apiKeyScopeCapability[scope])
}

func (a *publicAPIAuth) requirePermission(scope string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		principal, ok := publicAPIPrincipalFrom(r.Context())
		if !ok {
			a.writeError(w, r, "permission", publicAPIFailure(http.StatusUnauthorized, "unauthorized", "Authentication required"))
			return
		}
		if !slices.Contains(principal.permissions, scope) || !publicAPIRoleAllowsScope(principal.role, scope) {
			a.writeError(w, r, "permission", publicAPIFailure(http.StatusForbidden, "forbidden", "Missing required permission: "+scope))
			return
		}
		next.ServeHTTP(w, r)
	})
}
