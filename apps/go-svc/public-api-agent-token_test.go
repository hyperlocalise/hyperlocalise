package main

import (
	"context"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/require"
	"github.com/workos/workos-go/v10"
)

const (
	testAuthkitDomain = "auth.example.test"
	testAuthkitIssuer = "https://" + testAuthkitDomain
	testPublicAppURL  = "https://app.example.test/some/path"
)

func testAgentVerifier(t *testing.T, fixture accessTokenFixture) *agentAccessTokenVerifier {
	t.Helper()
	verifier := newAgentAccessTokenVerifier(testAuthkitDomain, testWorkOSClientID, testPublicAppURL)
	verifier.jwks.fetch = func(_ context.Context, jwksURL string) (*workos.JWKSResponse, error) {
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

func TestAgentAccessTokenVerifierAcceptsRegistrationToken(t *testing.T) {
	fixture := newAccessTokenFixture(t)
	verifier := testAgentVerifier(t, fixture)

	claims, err := verifier.verify(t.Context(), fixture.sign(t, agentClaims(nil)))
	require.NoError(t, err)
	require.Equal(t, agentAccessTokenClaims{
		registrationID:       "agent_registration_1",
		workosUserID:         "user_agent",
		workosOrganizationID: "org_agent",
		scopes:               []string{"files:read", "jobs:read"},
	}, claims)
}

func TestAgentAccessTokenVerifierAudiences(t *testing.T) {
	fixture := newAccessTokenFixture(t)
	verifier := testAgentVerifier(t, fixture)

	for _, aud := range []any{
		testWorkOSClientID,
		"https://app.example.test/api/v1",
		"https://app.example.test/mcp",
		[]any{"https://other.example.test", "https://app.example.test/mcp"},
	} {
		_, err := verifier.verify(t.Context(), fixture.sign(t, agentClaims(map[string]any{"aud": aud})))
		require.NoError(t, err, "aud %v", aud)
	}

	for _, aud := range []any{
		"https://app.example.test/some/path/api/v1",
		"https://app.example.test/api/v1/",
		[]any{"https://other.example.test"},
		nil,
	} {
		_, err := verifier.verify(t.Context(), fixture.sign(t, agentClaims(map[string]any{"aud": aud})))
		require.ErrorIs(t, err, errInvalidAgentAccessToken, "aud %v", aud)
	}
}

func TestAgentAccessTokenVerifierRejectsInvalidTokens(t *testing.T) {
	fixture := newAccessTokenFixture(t)
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
			_, err := verifier.verify(t.Context(), fixture.sign(t, agentClaims(overrides)))
			require.ErrorIs(t, err, errInvalidAgentAccessToken)
		})
	}

	t.Run("missing kid", func(t *testing.T) {
		token := jwt.NewWithClaims(jwt.SigningMethodRS256, jwt.MapClaims(agentClaims(nil)))
		signed, err := token.SignedString(fixture.privateKey)
		require.NoError(t, err)
		_, err = verifier.verify(t.Context(), signed)
		require.ErrorIs(t, err, errInvalidAgentAccessToken)
	})

	t.Run("non RS256", func(t *testing.T) {
		token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims(agentClaims(nil)))
		token.Header["kid"] = "test-kid"
		signed, err := token.SignedString([]byte("secret"))
		require.NoError(t, err)
		_, err = verifier.verify(t.Context(), signed)
		require.ErrorIs(t, err, errInvalidAgentAccessToken)
	})

	t.Run("signed by another key", func(t *testing.T) {
		other := newAccessTokenFixture(t)
		_, err := verifier.verify(t.Context(), other.sign(t, agentClaims(nil)))
		require.ErrorIs(t, err, errInvalidAgentAccessToken)
	})

	t.Run("not compact", func(t *testing.T) {
		_, err := verifier.verify(t.Context(), "a..c")
		require.ErrorIs(t, err, errInvalidAgentAccessToken)
	})
}

func TestAgentAccessTokenVerifierMatchesJsonwebtokenTimeDefaults(t *testing.T) {
	fixture := newAccessTokenFixture(t)
	verifier := testAgentVerifier(t, fixture)

	_, err := verifier.verify(t.Context(), fixture.sign(t, agentClaims(map[string]any{"exp": nil})))
	require.NoError(t, err, "exp is optional")

	_, err = verifier.verify(t.Context(), fixture.sign(t, agentClaims(map[string]any{"iat": time.Now().Add(time.Hour).Unix()})))
	require.NoError(t, err, "iat is not validated")
}

func TestAgentAccessTokenVerifierFiltersScopes(t *testing.T) {
	fixture := newAccessTokenFixture(t)
	verifier := testAgentVerifier(t, fixture)

	claims, err := verifier.verify(t.Context(), fixture.sign(t, agentClaims(map[string]any{
		"scope": "  files:read\tadmin mcp\u00a0jobs:write\ufefffiles:write  ",
	})))
	require.NoError(t, err)
	require.Equal(t, []string{"files:read", "mcp", "jobs:write", "files:write"}, claims.scopes)

	claims, err = verifier.verify(t.Context(), fixture.sign(t, agentClaims(map[string]any{"scope": nil})))
	require.NoError(t, err)
	require.Empty(t, claims.scopes)
}

func TestAgentAccessTokenVerifierRequiresConfiguration(t *testing.T) {
	fixture := newAccessTokenFixture(t)
	token := fixture.sign(t, agentClaims(nil))

	for name, verifier := range map[string]*agentAccessTokenVerifier{
		"nil":          nil,
		"no issuer":    newAgentAccessTokenVerifier("", testWorkOSClientID, testPublicAppURL),
		"no audiences": newAgentAccessTokenVerifier(testAuthkitDomain, "", ""),
	} {
		t.Run(name, func(t *testing.T) {
			_, err := verifier.verify(t.Context(), token)
			require.ErrorIs(t, err, errInvalidAgentAccessToken)
		})
	}
}

func TestNewAgentAccessTokenVerifierFromEnv(t *testing.T) {
	t.Setenv("WORKOS_AUTHKIT_DOMAIN", testAuthkitDomain)
	t.Setenv("WORKOS_CLIENT_ID", testWorkOSClientID)
	t.Setenv("HYPERLOCALISE_PUBLIC_APP_URL", testPublicAppURL)

	verifier := newAgentAccessTokenVerifierFromEnv()
	require.Equal(t, testAuthkitIssuer, verifier.issuer)
	require.Equal(t, []string{testWorkOSClientID, "https://app.example.test/api/v1", "https://app.example.test/mcp"}, verifier.audiences)
	require.Equal(t, testAuthkitIssuer+"/.well-known/jwks.json", verifier.jwks.url)
}

func TestIsCompactJWT(t *testing.T) {
	require.True(t, isCompactJWT("a.b.c"))
	for _, value := range []string{"", "a.b", "a.b.c.d", ".b.c", "a..c", "a.b."} {
		require.False(t, isCompactJWT(value), value)
	}
}
