package publicauth

import (
	"context"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/require"
	"github.com/workos/workos-go/v10"
)

func testAgentVerifier(t *testing.T, fixture jwtFixture) *AgentVerifier {
	t.Helper()
	verifier := NewAgentVerifier(testAuthkitDomain, testWorkOSClientID, testPublicAppURL)
	verifier.Keys.Fetch = func(_ context.Context, jwksURL string) (*workos.JWKSResponse, error) {
		require.Equal(t, testAuthkitIssuer+"/.well-known/jwks.json", jwksURL)
		return fixture.jwks, nil
	}
	return verifier
}

func agentClaims(overrides map[string]any) map[string]any {
	claims := map[string]any{
		"iss":    testAuthkitIssuer,
		"aud":    "https://app.example.test/api/v1",
		"sub":    "agent_registration_1",
		"org_id": "org_agent",
		"act":    map[string]any{"sub": "user_agent"},
		"scope":  "files:read jobs:read",
		"exp":    time.Now().Add(time.Hour).Unix(),
	}
	for key, value := range overrides {
		if value == nil {
			delete(claims, key)
			continue
		}
		claims[key] = value
	}
	return claims
}

func TestAgentVerifierAcceptsRegistrationToken(t *testing.T) {
	fixture := newJWTFixture(t)
	verifier := testAgentVerifier(t, fixture)

	claims, err := verifier.Verify(t.Context(), fixture.sign(t, agentClaims(nil)))
	require.NoError(t, err)
	require.Equal(t, AgentClaims{
		RegistrationID:       "agent_registration_1",
		WorkOSUserID:         "user_agent",
		WorkOSOrganizationID: "org_agent",
		Scopes:               []string{"files:read", "jobs:read"},
	}, claims)
}

func TestAgentVerifierAudiences(t *testing.T) {
	fixture := newJWTFixture(t)
	verifier := testAgentVerifier(t, fixture)

	for _, aud := range []any{
		testWorkOSClientID,
		"https://app.example.test/api/v1",
		"https://app.example.test/mcp",
		[]any{"https://other.example.test", "https://app.example.test/mcp"},
	} {
		_, err := verifier.Verify(t.Context(), fixture.sign(t, agentClaims(map[string]any{"aud": aud})))
		require.NoError(t, err, "aud %v", aud)
	}

	for _, aud := range []any{
		"https://app.example.test/some/path/api/v1",
		"https://app.example.test/api/v1/",
		[]any{"https://other.example.test"},
		nil,
	} {
		_, err := verifier.Verify(t.Context(), fixture.sign(t, agentClaims(map[string]any{"aud": aud})))
		require.ErrorIs(t, err, ErrInvalidAgentToken, "aud %v", aud)
	}
}

func TestAgentVerifierRejectsInvalidTokens(t *testing.T) {
	fixture := newJWTFixture(t)
	verifier := testAgentVerifier(t, fixture)

	for name, overrides := range map[string]map[string]any{
		"wrong issuer":          {"iss": "https://api.workos.com"},
		"issuer trailing slash": {"iss": testAuthkitIssuer + "/"},
		"missing sub":           {"sub": nil},
		"empty sub":             {"sub": ""},
		"missing org_id":        {"org_id": nil},
		"missing act":           {"act": nil},
		"act without sub":       {"act": map[string]any{}},
		"act sub not string":    {"act": map[string]any{"sub": 7}},
		"expired":               {"exp": time.Now().Add(-time.Second).Unix()},
		"not yet valid":         {"nbf": time.Now().Add(time.Minute).Unix()},
	} {
		t.Run(name, func(t *testing.T) {
			_, err := verifier.Verify(t.Context(), fixture.sign(t, agentClaims(overrides)))
			require.ErrorIs(t, err, ErrInvalidAgentToken)
		})
	}

	t.Run("missing kid", func(t *testing.T) {
		token := jwt.NewWithClaims(jwt.SigningMethodRS256, jwt.MapClaims(agentClaims(nil)))
		signed, err := token.SignedString(fixture.privateKey)
		require.NoError(t, err)
		_, err = verifier.Verify(t.Context(), signed)
		require.ErrorIs(t, err, ErrInvalidAgentToken)
	})

	t.Run("non RS256", func(t *testing.T) {
		token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims(agentClaims(nil)))
		token.Header["kid"] = "test-kid"
		signed, err := token.SignedString([]byte("secret"))
		require.NoError(t, err)
		_, err = verifier.Verify(t.Context(), signed)
		require.ErrorIs(t, err, ErrInvalidAgentToken)
	})

	t.Run("signed by another key", func(t *testing.T) {
		other := newJWTFixture(t)
		_, err := verifier.Verify(t.Context(), other.sign(t, agentClaims(nil)))
		require.ErrorIs(t, err, ErrInvalidAgentToken)
	})

	t.Run("not compact", func(t *testing.T) {
		_, err := verifier.Verify(t.Context(), "a..c")
		require.ErrorIs(t, err, ErrInvalidAgentToken)
	})
}

func TestAgentVerifierMatchesJsonwebtokenTimeDefaults(t *testing.T) {
	fixture := newJWTFixture(t)
	verifier := testAgentVerifier(t, fixture)

	_, err := verifier.Verify(t.Context(), fixture.sign(t, agentClaims(map[string]any{"exp": nil})))
	require.NoError(t, err, "exp is optional")

	_, err = verifier.Verify(t.Context(), fixture.sign(t, agentClaims(map[string]any{"iat": time.Now().Add(time.Hour).Unix()})))
	require.NoError(t, err, "iat is not validated")
}

func TestAgentVerifierFiltersScopes(t *testing.T) {
	fixture := newJWTFixture(t)
	verifier := testAgentVerifier(t, fixture)

	claims, err := verifier.Verify(t.Context(), fixture.sign(t, agentClaims(map[string]any{
		"scope": "  files:read\tadmin mcp\u00a0jobs:write\ufefffiles:write  ",
	})))
	require.NoError(t, err)
	require.Equal(t, []string{"files:read", "mcp", "jobs:write", "files:write"}, claims.Scopes)

	claims, err = verifier.Verify(t.Context(), fixture.sign(t, agentClaims(map[string]any{"scope": nil})))
	require.NoError(t, err)
	require.Empty(t, claims.Scopes)
}

func TestAgentVerifierRequiresConfiguration(t *testing.T) {
	fixture := newJWTFixture(t)
	token := fixture.sign(t, agentClaims(nil))

	for name, verifier := range map[string]*AgentVerifier{
		"nil":          nil,
		"no issuer":    NewAgentVerifier("", testWorkOSClientID, testPublicAppURL),
		"no audiences": NewAgentVerifier(testAuthkitDomain, "", ""),
	} {
		t.Run(name, func(t *testing.T) {
			_, err := verifier.Verify(t.Context(), token)
			require.ErrorIs(t, err, ErrInvalidAgentToken)
		})
	}
}

func TestNewAgentVerifierFromEnv(t *testing.T) {
	t.Setenv("WORKOS_AUTHKIT_DOMAIN", testAuthkitDomain)
	t.Setenv("WORKOS_CLIENT_ID", testWorkOSClientID)
	t.Setenv("HYPERLOCALISE_PUBLIC_APP_URL", testPublicAppURL)

	verifier := NewAgentVerifierFromEnv()
	require.Equal(t, testAuthkitIssuer, verifier.issuer)
	require.Equal(t, []string{testWorkOSClientID, "https://app.example.test/api/v1", "https://app.example.test/mcp"}, verifier.audiences)
	require.Equal(t, testAuthkitIssuer+"/.well-known/jwks.json", verifier.Keys.url)
}

func TestIsCompactJWT(t *testing.T) {
	require.True(t, IsCompactJWT("a.b.c"))
	for _, value := range []string{"", "a.b", "a.b.c.d", ".b.c", "a..c", "a.b."} {
		require.False(t, IsCompactJWT(value), value)
	}
}

func TestPublicAppOrigin(t *testing.T) {
	require.Equal(t, "https://app.example.test", PublicAppOrigin("https://app.example.test/some/path"))
	require.Equal(t, "https://app.example.test", PublicAppOrigin(" https://app.example.test/ "))
	require.Equal(t, "http://localhost:3000", PublicAppOrigin("http://localhost:3000/auth/callback"))
	require.Equal(t, "", PublicAppOrigin(""))
	require.Equal(t, "", PublicAppOrigin("   "))
	require.Equal(t, "", PublicAppOrigin("app.example.test"))
	require.Equal(t, "", PublicAppOrigin("/relative/path"))
	require.Equal(t, "", PublicAppOrigin("://missing-host"))
}

func TestNewAgentVerifierOmitsBlankPublicOrigin(t *testing.T) {
	verifier := NewAgentVerifier(testAuthkitDomain, testWorkOSClientID, "not-a-url")
	require.Equal(t, []string{testWorkOSClientID}, verifier.audiences)
}
