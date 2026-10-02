package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
	"github.com/workos/workos-go/v10"
)

const publicAPITestPath = "/v1/public-api-auth-test"

type publicAPITestPrincipal struct {
	OrganizationID string   `json:"organizationId"`
	UserID         string   `json:"userId"`
	Role           string   `json:"role"`
	CredentialID   string   `json:"credentialId"`
	Kind           string   `json:"kind"`
	Permissions    []string `json:"permissions"`
}

func publicAPITestHandler(auth *publicAPIAuth) http.Handler {
	mux := http.NewServeMux()
	mux.Handle("GET "+publicAPITestPath, auth.middleware(auth.requirePermission("files:read", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		principal, _ := publicAPIPrincipalFrom(r.Context())
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(publicAPITestPrincipal{
			OrganizationID: principal.organizationID,
			UserID:         principal.userID,
			Role:           principal.role,
			CredentialID:   principal.credentialID,
			Kind:           principal.kind,
			Permissions:    principal.permissions,
		})
	}))))
	return mux
}

func publicAPITestRequest(handler http.Handler, headers map[string]string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, "https://api.example.test"+publicAPITestPath, nil)
	for key, value := range headers {
		req.Header.Set(key, value)
	}
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	return rec
}

func requirePublicAPIError(t *testing.T, rec *httptest.ResponseRecorder, status int, code, message string) {
	t.Helper()
	require.Equal(t, status, rec.Code, rec.Body.String())
	want := map[string]string{"error": code}
	if message != "" {
		want["message"] = message
	}
	var got map[string]string
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &got))
	require.Equal(t, want, got)
}

func TestPublicAPIAuthRequiresCredentials(t *testing.T) {
	handler := publicAPITestHandler(&publicAPIAuth{publicAppURL: "https://app.example.test/dashboard"})
	wantChallenge := `Bearer resource_metadata="https://app.example.test/.well-known/oauth-protected-resource/api/v1"`

	for name, headers := range map[string]map[string]string{
		"no headers":            nil,
		"empty api key":         {"X-API-Key": ""},
		"lowercase bearer":      {"Authorization": "bearer a.b.c"},
		"bearer without token":  {"Authorization": "Bearer "},
		"bearer not compact":    {"Authorization": "Bearer opaque-token"},
		"bearer double space":   {"Authorization": "Bearer  a.b.c"},
		"unverifiable jwt":      {"Authorization": "Bearer a.b.c"},
		"empty key falls back":  {"X-API-Key": "", "Authorization": "Bearer a.b.c"},
		"basic authorization":   {"Authorization": "Basic dXNlcjpwYXNz"},
		"session cookie is not": {"Cookie": workOSSessionCookieName + "=session"},
	} {
		t.Run(name, func(t *testing.T) {
			rec := publicAPITestRequest(handler, headers)
			requirePublicAPIError(t, rec, http.StatusUnauthorized, "unauthorized", "Authentication required")
			require.Equal(t, wantChallenge, rec.Header().Get("WWW-Authenticate"))
		})
	}
}

func TestPublicAPIAuthChallengeFallsBackToRequestOrigin(t *testing.T) {
	rec := publicAPITestRequest(publicAPITestHandler(&publicAPIAuth{}), nil)
	require.Equal(t, `Bearer resource_metadata="https://api.example.test/.well-known/oauth-protected-resource/api/v1"`, rec.Header().Get("WWW-Authenticate"))
}

func TestPublicAPIAuthAPIKeyWithoutDatabase(t *testing.T) {
	rec := publicAPITestRequest(publicAPITestHandler(&publicAPIAuth{}), map[string]string{"X-API-Key": "hl_secret"})
	requirePublicAPIError(t, rec, http.StatusServiceUnavailable, "public_api_unavailable", "Public API is unavailable")
	require.Empty(t, rec.Header().Get("WWW-Authenticate"))
}

func TestPublicAPIRequirePermissionWithoutPrincipal(t *testing.T) {
	auth := &publicAPIAuth{}
	rec := httptest.NewRecorder()
	auth.requirePermission("files:read", http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		t.Fatal("must not call next")
	})).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, publicAPITestPath, nil))
	requirePublicAPIError(t, rec, http.StatusUnauthorized, "unauthorized", "Authentication required")
}

func TestPublicAPIRoleAllowsScope(t *testing.T) {
	for _, role := range []string{"admin", "localization_manager", "developer", "reviewer", "translator", "member"} {
		require.True(t, publicAPIRoleAllowsScope(role, "files:read"), role)
		require.True(t, publicAPIRoleAllowsScope(role, "jobs:read"), role)
		require.Equal(t, role != "member", publicAPIRoleAllowsScope(role, "files:write"), role)
		require.Equal(t, role != "member", publicAPIRoleAllowsScope(role, "jobs:write"), role)
		require.False(t, publicAPIRoleAllowsScope(role, "mcp"), role)
		require.False(t, publicAPIRoleAllowsScope(role, "api_keys:write"), role)
	}
	require.False(t, publicAPIRoleAllowsScope("owner", "files:read"))
	require.False(t, publicAPIRoleAllowsScope("", "files:read"))
}

func TestParseAPIKeyPermissions(t *testing.T) {
	permissions, err := parseAPIKeyPermissions([]byte(`["files:read", 7, null, "jobs:read"]`))
	require.NoError(t, err)
	require.Equal(t, []string{"files:read", "jobs:read"}, permissions)

	_, err = parseAPIKeyPermissions([]byte(`{"files:read": true}`))
	require.Error(t, err)
}

func TestNewPublicAPIAuthFromEnv(t *testing.T) {
	t.Setenv("WORKOS_AUTHKIT_DOMAIN", testAuthkitDomain)
	t.Setenv("WORKOS_CLIENT_ID", testWorkOSClientID)
	t.Setenv("HYPERLOCALISE_PUBLIC_APP_URL", testPublicAppURL)

	auth := newPublicAPIAuthFromEnv(nil, nil)
	require.Equal(t, testPublicAppURL, auth.publicAppURL)
	require.Equal(t, testAuthkitIssuer, auth.agent.issuer)
}

// --- PostgreSQL integration ---

type publicAPIKeyOptions struct {
	permissions []string
	revoked     bool
	ownerless   bool
}

func mustPublicAPIKey(t *testing.T, scope *testenv.Scope, opts publicAPIKeyOptions) (plaintext, id string) {
	t.Helper()
	plaintext = "hl_test_" + uuid.NewString()
	permissions := opts.permissions
	if permissions == nil {
		permissions = []string{"jobs:read", "jobs:write", "files:read", "files:write"}
	}
	encoded, err := json.Marshal(permissions)
	require.NoError(t, err)
	var owner any = scope.UserID
	if opts.ownerless {
		owner = nil
	}
	var revokedAt any
	if opts.revoked {
		revokedAt = time.Now()
	}
	err = scope.Pool.QueryRow(t.Context(), `
        insert into organization_api_keys (organization_id, name, key_hash, key_prefix, permissions, created_by_user_id, revoked_at)
        values ($1, 'Test key', $2, $3, $4::jsonb, $5, $6)
        returning id`,
		scope.OrganizationID, hashAPIKey(plaintext), apiKeyPrefix(plaintext), string(encoded), owner, revokedAt).Scan(&id)
	require.NoError(t, err)
	return plaintext, id
}

func apiKeyLastUsedAt(t *testing.T, scope *testenv.Scope, id string) *time.Time {
	t.Helper()
	var lastUsedAt *time.Time
	require.NoError(t, scope.Pool.QueryRow(context.Background(), `select last_used_at from organization_api_keys where id=$1`, id).Scan(&lastUsedAt))
	return lastUsedAt
}

func requireLastUsedAtSet(t *testing.T, scope *testenv.Scope, id string) {
	t.Helper()
	require.Eventually(t, func() bool { return apiKeyLastUsedAt(t, scope, id) != nil }, 2*time.Second, 20*time.Millisecond)
}

func requireLastUsedAtUnset(t *testing.T, scope *testenv.Scope, id string) {
	t.Helper()
	require.Never(t, func() bool { return apiKeyLastUsedAt(t, scope, id) != nil }, 300*time.Millisecond, 20*time.Millisecond)
}

func publicAPIIntegrationAuth(scope *testenv.Scope, lookup organizationMembershipLookup) *publicAPIAuth {
	return &publicAPIAuth{pool: scope.Pool, membership: lookup, publicAppURL: "https://app.example.test"}
}

func decodePublicAPIPrincipal(t *testing.T, rec *httptest.ResponseRecorder) publicAPITestPrincipal {
	t.Helper()
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var principal publicAPITestPrincipal
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &principal))
	return principal
}

func TestPublicAPIAuthAPIKey(t *testing.T) {
	t.Run("valid key uses the creator's live role", func(t *testing.T) {
		scope := testenv.Seed(t, testenv.Options{Role: "admin"})
		key, id := mustPublicAPIKey(t, scope, publicAPIKeyOptions{permissions: []string{"files:read"}})
		handler := publicAPITestHandler(publicAPIIntegrationAuth(scope, scope.Membership("translator")))

		principal := decodePublicAPIPrincipal(t, publicAPITestRequest(handler, map[string]string{"X-API-Key": key}))
		require.Equal(t, publicAPITestPrincipal{
			OrganizationID: scope.OrganizationID,
			UserID:         scope.UserID,
			Role:           "translator",
			CredentialID:   id,
			Kind:           publicAPIKindPAT,
			Permissions:    []string{"files:read"},
		}, principal)
		requireLastUsedAtSet(t, scope, id)
	})

	t.Run("unknown revoked and ownerless keys are indistinguishable", func(t *testing.T) {
		scope := testenv.Seed(t, testenv.Options{Role: "admin"})
		revoked, revokedID := mustPublicAPIKey(t, scope, publicAPIKeyOptions{revoked: true})
		ownerless, ownerlessID := mustPublicAPIKey(t, scope, publicAPIKeyOptions{ownerless: true})
		handler := publicAPITestHandler(publicAPIIntegrationAuth(scope, scope.Membership("admin")))

		var bodies []string
		for _, key := range []string{"hl_unknown_" + uuid.NewString(), revoked, ownerless} {
			rec := publicAPITestRequest(handler, map[string]string{"X-API-Key": key})
			requirePublicAPIError(t, rec, http.StatusUnauthorized, "unauthorized", publicAPIInvalidKeyMessage)
			require.Empty(t, rec.Header().Get("WWW-Authenticate"))
			bodies = append(bodies, rec.Body.String())
		}
		require.Equal(t, bodies[0], bodies[1])
		require.Equal(t, bodies[0], bodies[2])
		requireLastUsedAtUnset(t, scope, revokedID)
		requireLastUsedAtUnset(t, scope, ownerlessID)
	})

	t.Run("api key takes precedence over bearer", func(t *testing.T) {
		scope := testenv.Seed(t, testenv.Options{Role: "admin"})
		fixture := newAccessTokenFixture(t)
		auth := publicAPIIntegrationAuth(scope, scope.Membership("admin"))
		auth.agent = testAgentVerifier(t, fixture)
		bearer := fixture.sign(t, agentClaims(map[string]any{
			"org_id": scope.WorkOSOrganizationID,
			"act":    map[string]any{"sub": scope.WorkOSUserID},
		}))

		rec := publicAPITestRequest(publicAPITestHandler(auth), map[string]string{
			"X-API-Key":     "hl_unknown_" + uuid.NewString(),
			"Authorization": "Bearer " + bearer,
		})
		requirePublicAPIError(t, rec, http.StatusUnauthorized, "unauthorized", publicAPIInvalidKeyMessage)
	})

	t.Run("archived workspace", func(t *testing.T) {
		scope := testenv.Seed(t, testenv.Options{Role: "admin"})
		key, id := mustPublicAPIKey(t, scope, publicAPIKeyOptions{})
		revoked, _ := mustPublicAPIKey(t, scope, publicAPIKeyOptions{revoked: true})
		_, err := scope.Pool.Exec(t.Context(), `update organizations set lifecycle_status='archived' where id=$1`, scope.OrganizationID)
		require.NoError(t, err)
		handler := publicAPITestHandler(publicAPIIntegrationAuth(scope, scope.Membership("admin")))

		requirePublicAPIError(t, publicAPITestRequest(handler, map[string]string{"X-API-Key": key}),
			http.StatusForbidden, "workspace_archived", "This workspace has been archived")
		requireLastUsedAtUnset(t, scope, id)

		requirePublicAPIError(t, publicAPITestRequest(handler, map[string]string{"X-API-Key": revoked}),
			http.StatusUnauthorized, "unauthorized", publicAPIInvalidKeyMessage)
	})

	t.Run("creator no longer a member", func(t *testing.T) {
		scope := testenv.Seed(t, testenv.Options{Role: "admin"})
		key, id := mustPublicAPIKey(t, scope, publicAPIKeyOptions{})
		_, err := scope.Pool.Exec(t.Context(), `delete from organization_memberships where organization_id=$1 and user_id=$2`, scope.OrganizationID, scope.UserID)
		require.NoError(t, err)
		handler := publicAPITestHandler(publicAPIIntegrationAuth(scope, scope.Membership("admin")))

		requirePublicAPIError(t, publicAPITestRequest(handler, map[string]string{"X-API-Key": key}),
			http.StatusForbidden, "forbidden", "API key creator is not authorized for this workspace")
		requireLastUsedAtUnset(t, scope, id)
	})

	for name, lookupErr := range map[string]struct {
		err    error
		status int
		code   string
		msg    string
	}{
		"WorkOS membership removed":     {err: &workos.APIError{StatusCode: 404}, status: http.StatusForbidden, code: "forbidden", msg: "API key creator is not authorized for this workspace"},
		"WorkOS membership unavailable": {err: errors.New("unavailable"), status: http.StatusServiceUnavailable, code: "workos_membership_lookup_failed", msg: "Organization membership could not be verified"},
	} {
		t.Run(name, func(t *testing.T) {
			scope := testenv.Seed(t, testenv.Options{Role: "admin"})
			key, id := mustPublicAPIKey(t, scope, publicAPIKeyOptions{})
			handler := publicAPITestHandler(publicAPIIntegrationAuth(scope, func(context.Context, string) (*workos.UserOrganizationMembership, error) {
				return nil, lookupErr.err
			}))
			requirePublicAPIError(t, publicAPITestRequest(handler, map[string]string{"X-API-Key": key}), lookupErr.status, lookupErr.code, lookupErr.msg)
			requireLastUsedAtUnset(t, scope, id)
		})
	}

	t.Run("missing files:read scope after authentication", func(t *testing.T) {
		scope := testenv.Seed(t, testenv.Options{Role: "admin"})
		key, id := mustPublicAPIKey(t, scope, publicAPIKeyOptions{permissions: []string{"jobs:read", "jobs:write", "files:write"}})
		handler := publicAPITestHandler(publicAPIIntegrationAuth(scope, scope.Membership("admin")))

		requirePublicAPIError(t, publicAPITestRequest(handler, map[string]string{"X-API-Key": key}),
			http.StatusForbidden, "forbidden", "Missing required permission: files:read")
		requireLastUsedAtSet(t, scope, id)
	})

	t.Run("member role can read files", func(t *testing.T) {
		scope := testenv.Seed(t, testenv.Options{Role: "member"})
		key, _ := mustPublicAPIKey(t, scope, publicAPIKeyOptions{permissions: []string{"files:read"}})
		handler := publicAPITestHandler(publicAPIIntegrationAuth(scope, scope.Membership("member")))

		require.Equal(t, "member", decodePublicAPIPrincipal(t, publicAPITestRequest(handler, map[string]string{"X-API-Key": key})).Role)
	})

	t.Run("unknown live role", func(t *testing.T) {
		scope := testenv.Seed(t, testenv.Options{Role: "admin"})
		key, _ := mustPublicAPIKey(t, scope, publicAPIKeyOptions{})
		handler := publicAPITestHandler(publicAPIIntegrationAuth(scope, scope.Membership("owner")))

		requirePublicAPIError(t, publicAPITestRequest(handler, map[string]string{"X-API-Key": key}),
			http.StatusForbidden, "forbidden", "API key creator is not authorized for this workspace")
	})
}

func TestPublicAPIAuthAgent(t *testing.T) {
	setup := func(t *testing.T, lookup func(*testenv.Scope) organizationMembershipLookup) (*testenv.Scope, accessTokenFixture, http.Handler) {
		t.Helper()
		scope := testenv.Seed(t, testenv.Options{Role: "admin"})
		fixture := newAccessTokenFixture(t)
		membership := scope.Membership("reviewer")
		if lookup != nil {
			membership = lookup(scope)
		}
		auth := publicAPIIntegrationAuth(scope, membership)
		auth.agent = testAgentVerifier(t, fixture)
		return scope, fixture, publicAPITestHandler(auth)
	}
	token := func(t *testing.T, scope *testenv.Scope, fixture accessTokenFixture, overrides map[string]any) map[string]string {
		claims := map[string]any{
			"org_id": scope.WorkOSOrganizationID,
			"act":    map[string]any{"sub": scope.WorkOSUserID},
		}
		for key, value := range overrides {
			claims[key] = value
		}
		return map[string]string{"Authorization": "Bearer " + fixture.sign(t, agentClaims(claims))}
	}
	const notAuthorized = "Agent is not authorized for this workspace"

	t.Run("valid registration token", func(t *testing.T) {
		scope, fixture, handler := setup(t, nil)
		principal := decodePublicAPIPrincipal(t, publicAPITestRequest(handler, token(t, scope, fixture, nil)))
		require.Equal(t, publicAPITestPrincipal{
			OrganizationID: scope.OrganizationID,
			UserID:         scope.UserID,
			Role:           "reviewer",
			CredentialID:   "agent_registration_1",
			Kind:           publicAPIKindAgent,
			Permissions:    []string{"files:read", "jobs:read"},
		}, principal)
	})

	t.Run("missing files:read scope", func(t *testing.T) {
		scope, fixture, handler := setup(t, nil)
		requirePublicAPIError(t, publicAPITestRequest(handler, token(t, scope, fixture, map[string]any{"scope": "jobs:read mcp"})),
			http.StatusForbidden, "forbidden", "Missing required permission: files:read")
	})

	t.Run("unknown user", func(t *testing.T) {
		scope, fixture, handler := setup(t, nil)
		requirePublicAPIError(t, publicAPITestRequest(handler, token(t, scope, fixture, map[string]any{"act": map[string]any{"sub": "user_unknown_" + uuid.NewString()}})),
			http.StatusForbidden, "forbidden", notAuthorized)
	})

	t.Run("unknown organization", func(t *testing.T) {
		scope, fixture, handler := setup(t, nil)
		requirePublicAPIError(t, publicAPITestRequest(handler, token(t, scope, fixture, map[string]any{"org_id": "org_unknown_" + uuid.NewString()})),
			http.StatusForbidden, "forbidden", notAuthorized)
	})

	t.Run("user from another organization", func(t *testing.T) {
		scope, fixture, handler := setup(t, nil)
		other := testenv.Seed(t, testenv.Options{Role: "admin"})
		requirePublicAPIError(t, publicAPITestRequest(handler, token(t, scope, fixture, map[string]any{"act": map[string]any{"sub": other.WorkOSUserID}})),
			http.StatusForbidden, "forbidden", notAuthorized)
	})

	t.Run("archived workspace", func(t *testing.T) {
		scope, fixture, handler := setup(t, nil)
		_, err := scope.Pool.Exec(t.Context(), `update organizations set lifecycle_status='archived' where id=$1`, scope.OrganizationID)
		require.NoError(t, err)
		requirePublicAPIError(t, publicAPITestRequest(handler, token(t, scope, fixture, nil)),
			http.StatusForbidden, "workspace_archived", "This workspace has been archived")
	})

	t.Run("WorkOS membership inactive", func(t *testing.T) {
		scope, fixture, handler := setup(t, func(scope *testenv.Scope) organizationMembershipLookup {
			return func(ctx context.Context, id string) (*workos.UserOrganizationMembership, error) {
				member, err := scope.Membership("admin")(ctx, id)
				member.Status = "inactive"
				return member, err
			}
		})
		requirePublicAPIError(t, publicAPITestRequest(handler, token(t, scope, fixture, nil)),
			http.StatusForbidden, "forbidden", notAuthorized)
	})

	t.Run("WorkOS membership unavailable", func(t *testing.T) {
		scope, fixture, handler := setup(t, func(*testenv.Scope) organizationMembershipLookup {
			return func(context.Context, string) (*workos.UserOrganizationMembership, error) {
				return nil, errors.New("unavailable")
			}
		})
		requirePublicAPIError(t, publicAPITestRequest(handler, token(t, scope, fixture, nil)),
			http.StatusServiceUnavailable, "workos_membership_lookup_failed", "Organization membership could not be verified")
	})
}
