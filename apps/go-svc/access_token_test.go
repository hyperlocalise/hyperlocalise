package main

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/require"
	"github.com/workos/workos-go/v10"
)

const testWorkOSClientID = "client_test_go_svc"

type accessTokenFixture struct {
	privateKey *rsa.PrivateKey
	jwks       *workos.JWKSResponse
}

func newAccessTokenFixture(t *testing.T) accessTokenFixture {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	return accessTokenFixture{
		privateKey: key,
		jwks: &workos.JWKSResponse{
			Keys: []*workos.JWKSResponseKeys{{
				Alg: "RS256",
				Kty: "RSA",
				Use: "sig",
				Kid: "test-kid",
				N:   base64.RawURLEncoding.EncodeToString(key.N.Bytes()),
				E:   base64.RawURLEncoding.EncodeToString(big.NewInt(int64(key.E)).Bytes()),
			}},
		},
	}
}

func (f accessTokenFixture) sign(t *testing.T, claims map[string]any) string {
	t.Helper()
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, jwt.MapClaims(claims))
	token.Header["kid"] = "test-kid"
	signed, err := token.SignedString(f.privateKey)
	require.NoError(t, err)
	return signed
}

func accessTokenVerifier(t *testing.T, fixture accessTokenFixture) *WorkOSSessionVerifier {
	t.Helper()
	t.Setenv("WORKOS_CLIENT_ID", testWorkOSClientID)
	verifier := mustVerifier(t)
	verifier.clientID = testWorkOSClientID
	verifier.apiBaseURL = workOSProductionAPIURL
	verifier.jwks = newJWKSCache("https://jwks.test/sso/jwks/" + testWorkOSClientID)
	verifier.jwks.fetch = func(_ context.Context, _ string) (*workos.JWKSResponse, error) {
		return fixture.jwks, nil
	}
	return verifier
}

func TestWorkOSSessionVerifierAcceptsAccessToken(t *testing.T) {
	fixture := newAccessTokenFixture(t)
	verifier := accessTokenVerifier(t, fixture)
	token := fixture.sign(t, map[string]any{
		"iss":    workOSProductionAPIURL,
		"aud":    testWorkOSClientID,
		"sub":    "user_native",
		"sid":    "session_native",
		"org_id": "org_native",
		"exp":    time.Now().Add(time.Hour).Unix(),
		"iat":    time.Now().Add(-time.Minute).Unix(),
	})

	claims, err := verifier.VerifyAccessToken(context.Background(), token)
	require.NoError(t, err)
	require.Equal(t, "user_native", claims.UserID)
	require.Equal(t, "org_native", claims.OrgID)
	require.Equal(t, "session_native", claims.SessionID)
}

func TestWorkOSSessionVerifierAcceptsAccessTokenIssuerWithClientID(t *testing.T) {
	fixture := newAccessTokenFixture(t)
	verifier := accessTokenVerifier(t, fixture)
	token := fixture.sign(t, map[string]any{
		"iss": workOSProductionAPIURL + "/" + testWorkOSClientID,
		"aud": testWorkOSClientID,
		"sub": "user_native",
		"sid": "session_native",
		"exp": time.Now().Add(time.Hour).Unix(),
	})

	claims, err := verifier.VerifyAccessToken(context.Background(), token)
	require.NoError(t, err)
	require.Equal(t, "user_native", claims.UserID)
}

func TestWorkOSSessionVerifierAcceptsAuthKitAccessToken(t *testing.T) {
	fixture := newAccessTokenFixture(t)
	verifier := accessTokenVerifier(t, fixture)
	token := fixture.sign(t, map[string]any{
		"iss":       workOSProductionAPIURL + "/user_management/" + testWorkOSClientID,
		"client_id": testWorkOSClientID,
		"sub":       "user_authkit",
		"sid":       "session_authkit",
		"org_id":    "org_authkit",
		"exp":       time.Now().Add(time.Hour).Unix(),
	})

	claims, err := verifier.VerifyAccessToken(context.Background(), token)
	require.NoError(t, err)
	require.Equal(t, "user_authkit", claims.UserID)
	require.Equal(t, "org_authkit", claims.OrgID)
	require.Equal(t, "session_authkit", claims.SessionID)
}

func TestWorkOSSessionVerifierRejectsAuthKitAccessTokenWithWrongClientID(t *testing.T) {
	fixture := newAccessTokenFixture(t)
	verifier := accessTokenVerifier(t, fixture)
	token := fixture.sign(t, map[string]any{
		"iss":       workOSProductionAPIURL + "/user_management/" + testWorkOSClientID,
		"client_id": "client_other",
		"sub":       "user_authkit",
		"sid":       "session_authkit",
		"org_id":    "org_authkit",
		"exp":       time.Now().Add(time.Hour).Unix(),
	})

	_, err := verifier.VerifyAccessToken(context.Background(), token)
	require.Error(t, err)
	require.Equal(t, "invalid_access_token", authReason(err))
}

func TestWorkOSSessionVerifierRejectsAuthKitAccessTokenWithoutClientID(t *testing.T) {
	fixture := newAccessTokenFixture(t)
	verifier := accessTokenVerifier(t, fixture)
	token := fixture.sign(t, map[string]any{
		"iss":    workOSProductionAPIURL + "/user_management/" + testWorkOSClientID,
		"sub":    "user_authkit",
		"sid":    "session_authkit",
		"org_id": "org_authkit",
		"exp":    time.Now().Add(time.Hour).Unix(),
	})

	_, err := verifier.VerifyAccessToken(context.Background(), token)
	require.Error(t, err)
	require.Equal(t, "invalid_access_token", authReason(err))
}

func TestAccessTokenAudienceAllowed(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name             string
		audience         jwt.ClaimStrings
		clientID         string
		expectedClientID string
		want             bool
	}{
		{
			name:             "aud matches expected client",
			audience:         jwt.ClaimStrings{testWorkOSClientID},
			clientID:         "ignored",
			expectedClientID: testWorkOSClientID,
			want:             true,
		},
		{
			name:             "aud list includes expected client",
			audience:         jwt.ClaimStrings{"other", testWorkOSClientID},
			clientID:         "ignored",
			expectedClientID: testWorkOSClientID,
			want:             true,
		},
		{
			name:             "aud present but wrong",
			audience:         jwt.ClaimStrings{"client_other"},
			clientID:         testWorkOSClientID,
			expectedClientID: testWorkOSClientID,
			want:             false,
		},
		{
			name:             "empty aud falls back to matching client_id",
			audience:         nil,
			clientID:         testWorkOSClientID,
			expectedClientID: testWorkOSClientID,
			want:             true,
		},
		{
			name:             "empty aud rejects mismatched client_id",
			audience:         nil,
			clientID:         "client_other",
			expectedClientID: testWorkOSClientID,
			want:             false,
		},
		{
			name:             "empty aud rejects missing client_id",
			audience:         jwt.ClaimStrings{},
			clientID:         "",
			expectedClientID: testWorkOSClientID,
			want:             false,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := accessTokenAudienceAllowed(tc.audience, tc.clientID, tc.expectedClientID)
			require.Equal(t, tc.want, got)
		})
	}
}

func TestWorkOSSessionVerifierRejectsAccessTokenTampering(t *testing.T) {
	fixture := newAccessTokenFixture(t)
	verifier := accessTokenVerifier(t, fixture)
	other, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)

	token := jwt.NewWithClaims(jwt.SigningMethodRS256, jwt.MapClaims{
		"iss": workOSProductionAPIURL,
		"aud": testWorkOSClientID,
		"sub": "user_native",
		"sid": "session_native",
		"exp": time.Now().Add(time.Hour).Unix(),
	})
	token.Header["kid"] = "test-kid"
	signed, err := token.SignedString(other)
	require.NoError(t, err)

	_, verifyErr := verifier.VerifyAccessToken(context.Background(), signed)
	require.Error(t, verifyErr)
	require.Equal(t, "invalid_access_token", authReason(verifyErr))
}

func TestWorkOSSessionVerifierRejectsExpiredAccessToken(t *testing.T) {
	fixture := newAccessTokenFixture(t)
	verifier := accessTokenVerifier(t, fixture)
	token := fixture.sign(t, map[string]any{
		"iss": workOSProductionAPIURL,
		"aud": testWorkOSClientID,
		"sub": "user_native",
		"sid": "session_native",
		"exp": time.Now().Add(-time.Minute).Unix(),
		"iat": time.Now().Add(-time.Hour).Unix(),
	})

	_, err := verifier.VerifyAccessToken(context.Background(), token)
	require.Error(t, err)
	require.Equal(t, "invalid_access_token", authReason(err))
}

func TestWorkOSSessionVerifierRejectsAgentAccessToken(t *testing.T) {
	fixture := newAccessTokenFixture(t)
	verifier := accessTokenVerifier(t, fixture)
	token := fixture.sign(t, map[string]any{
		"iss":    workOSProductionAPIURL,
		"aud":    testWorkOSClientID,
		"sub":    "agent_reg_01TEST",
		"sid":    "session_native",
		"org_id": "org_native",
		"act":    map[string]any{"sub": "user_native"},
		"exp":    time.Now().Add(time.Hour).Unix(),
	})

	_, err := verifier.VerifyAccessToken(context.Background(), token)
	require.Error(t, err)
	require.Equal(t, "invalid_access_token", authReason(err))
}

func TestWorkOSSessionVerifierRejectsWrongAudience(t *testing.T) {
	fixture := newAccessTokenFixture(t)
	verifier := accessTokenVerifier(t, fixture)
	token := fixture.sign(t, map[string]any{
		"iss": workOSProductionAPIURL,
		"aud": "client_other",
		"sub": "user_native",
		"sid": "session_native",
		"exp": time.Now().Add(time.Hour).Unix(),
	})

	_, err := verifier.VerifyAccessToken(context.Background(), token)
	require.Error(t, err)
	require.Equal(t, "invalid_access_token", authReason(err))
}

func TestWorkOSSessionVerifierRejectsMissingSessionID(t *testing.T) {
	fixture := newAccessTokenFixture(t)
	verifier := accessTokenVerifier(t, fixture)
	token := fixture.sign(t, map[string]any{
		"iss": workOSProductionAPIURL,
		"aud": testWorkOSClientID,
		"sub": "user_native",
		"exp": time.Now().Add(time.Hour).Unix(),
	})

	_, err := verifier.VerifyAccessToken(context.Background(), token)
	require.Error(t, err)
	require.Equal(t, "invalid_access_token", authReason(err))
}

func TestAuthMiddlewareAcceptsVerifiedWorkOSAccessToken(t *testing.T) {
	fixture := newAccessTokenFixture(t)
	verifier := accessTokenVerifier(t, fixture)
	token := fixture.sign(t, map[string]any{
		"iss":    workOSProductionAPIURL,
		"aud":    testWorkOSClientID,
		"sub":    "user_native",
		"sid":    "session_native",
		"org_id": "org_native",
		"exp":    time.Now().Add(time.Hour).Unix(),
	})

	called := false
	handler := authMiddleware(verifier)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		claims := r.Context().Value(authContextKey{}).(AuthClaims)
		require.Equal(t, "user_native", claims.UserID)
		require.Equal(t, "org_native", claims.OrgID)
		w.WriteHeader(http.StatusNoContent)
	}))

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/v1/validate/segment", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	handler.ServeHTTP(rec, req)

	require.True(t, called)
	require.Equal(t, http.StatusNoContent, rec.Code)
}

func TestFetchWorkOSJWKS(t *testing.T) {
	fixture := newAccessTokenFixture(t)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		require.NoError(t, json.NewEncoder(w).Encode(fixture.jwks))
	}))
	t.Cleanup(server.Close)

	resp, err := fetchWorkOSJWKS(context.Background(), server.URL)
	require.NoError(t, err)
	require.Len(t, resp.Keys, 1)
	require.Equal(t, "test-kid", resp.Keys[0].Kid)
}

func TestIssuerAllowed(t *testing.T) {
	require.True(t, issuerAllowed("https://api.workos.com", "https://api.workos.com", "client_1"))
	require.True(t, issuerAllowed("https://api.workos.com/client_1", "https://api.workos.com", "client_1"))
	require.True(t, issuerAllowed("https://api.workos.com/user_management/client_1", "https://api.workos.com", "client_1"))
	require.False(t, issuerAllowed("https://authkit.example", "https://api.workos.com", "client_1"))
	require.False(t, issuerAllowed("", "https://api.workos.com", "client_1"))
}

func TestJWKSCacheDoesNotRefreshUnknownKidWhileFresh(t *testing.T) {
	fixture := newAccessTokenFixture(t)
	verifier := accessTokenVerifier(t, fixture)
	fetches := 0
	verifier.jwks.fetch = func(_ context.Context, _ string) (*workos.JWKSResponse, error) {
		fetches++
		return fixture.jwks, nil
	}

	_, err := verifier.jwks.publicKey(context.Background(), "test-kid")
	require.NoError(t, err)
	require.Equal(t, 1, fetches)

	_, err = verifier.jwks.publicKey(context.Background(), "unknown-kid-1")
	require.Error(t, err)
	_, err = verifier.jwks.publicKey(context.Background(), "unknown-kid-2")
	require.Error(t, err)
	require.Equal(t, 1, fetches)

	_, err = verifier.jwks.publicKey(context.Background(), "test-kid")
	require.NoError(t, err)
	require.Equal(t, 1, fetches)
}

func TestJWKSCacheRefreshesUnknownKidAfterExpiry(t *testing.T) {
	fixture := newAccessTokenFixture(t)
	verifier := accessTokenVerifier(t, fixture)
	fetches := 0
	verifier.jwks.fetch = func(_ context.Context, _ string) (*workos.JWKSResponse, error) {
		fetches++
		return fixture.jwks, nil
	}

	_, err := verifier.jwks.publicKey(context.Background(), "test-kid")
	require.NoError(t, err)
	require.Equal(t, 1, fetches)

	verifier.jwks.mu.Lock()
	verifier.jwks.expiry = time.Now().Add(-time.Second)
	verifier.jwks.mu.Unlock()

	_, err = verifier.jwks.publicKey(context.Background(), "unknown-kid")
	require.Error(t, err)
	require.Equal(t, 2, fetches)
}
