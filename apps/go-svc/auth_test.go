package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/ironsession"
	"github.com/stretchr/testify/require"
)

const testCookiePassword = "this-is-a-test-cookie-password-at-least-32-characters"

type stubSessionVerifier struct {
	claims AuthClaims
	err    error
}

func (s stubSessionVerifier) Verify(_ context.Context, _ string) (SessionResult, error) {
	if s.err != nil {
		return SessionResult{}, s.err
	}
	return SessionResult{Claims: s.claims}, nil
}

func TestSessionCookieValue(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/v1/validate/segment", nil)
	_, err := sessionCookieValue(req)
	require.Error(t, err)

	req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "sealed-session"})
	value, err := sessionCookieValue(req)
	require.NoError(t, err)
	require.Equal(t, "sealed-session", value)
}

func TestAuthMiddlewareRequiresSessionCookie(t *testing.T) {
	called := false
	handler := authMiddleware(stubSessionVerifier{claims: AuthClaims{UserID: "user_123"}})(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		called = true
		w.WriteHeader(http.StatusNoContent)
	}))

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/v1/validate/segment", nil)
	handler.ServeHTTP(rec, req)

	require.False(t, called)
	require.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestAuthMiddlewareAcceptsSessionCookie(t *testing.T) {
	called := false
	handler := authMiddleware(stubSessionVerifier{claims: AuthClaims{UserID: "user_123"}})(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		claims := r.Context().Value(authContextKey{}).(AuthClaims)
		require.Equal(t, "user_123", claims.UserID)
		w.WriteHeader(http.StatusNoContent)
	}))

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/v1/validate/segment", nil)
	req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "sealed-session"})
	handler.ServeHTTP(rec, req)

	require.True(t, called)
	require.Equal(t, http.StatusNoContent, rec.Code)
}

func TestWorkOSSessionVerifierAcceptsAuthKitCookie(t *testing.T) {
	verifier := mustVerifier(t)
	sealed := mustSealAuthKit(t, authKitSession{
		AccessToken:  testJWT("user_golden", "sess_golden", "org_golden", time.Now().Add(time.Hour).Unix()),
		RefreshToken: "refresh_golden",
		User:         json.RawMessage(`{"id":"user_golden"}`),
	})

	result, err := verifier.Verify(context.Background(), sealed)
	require.NoError(t, err)
	require.Equal(t, "user_golden", result.Claims.UserID)
	require.Equal(t, "org_golden", result.Claims.OrgID)
	require.Equal(t, "sess_golden", result.Claims.SessionID)
	require.Empty(t, result.SealedCookie)
}

func TestWorkOSSessionVerifierRejectsTamperedAuthKitCookie(t *testing.T) {
	verifier := mustVerifier(t)
	sealed := mustSealAuthKit(t, authKitSession{
		AccessToken:  testJWT("user_golden", "sess_golden", "org_golden", time.Now().Add(time.Hour).Unix()),
		RefreshToken: "refresh_golden",
		User:         json.RawMessage(`{"id":"user_golden"}`),
	})
	tampered := strings.Replace(sealed, "Fe26.2*1*", "Fe26.2*1*x", 1)

	_, err := verifier.Verify(context.Background(), tampered)
	require.Error(t, err)
	require.Equal(t, "invalid_session_cookie", authReason(err))
}

func TestWorkOSSessionVerifierAcceptsNodeAuthKitCookie(t *testing.T) {
	verifier := mustVerifier(t)
	// Same iron-session@8 cookie as ironsession.TestUnsealNodeAuthKitCookie.
	sealed := "Fe26.2*1*fa67fa919f1d22ae7cf035dc3d4ac085aedd51c4a8826432ace797d7521aaf86*nlWwonA1c8Ml2eRM6hD1nQ*erJmrxU_OzI_H_NiyEtn3Egw8hRZXCcSmVOfY-ohLIzV7XdXR20qJkFe9NqAiU26TNimFlrJw1devrxbzYIiZfvRiEJv0Nm29FZTBqtLvHRmCCUO7h2xgV9WM_LuiMXaaxgPKDJYNv3RcTCFlrPHG9sZs1AHGGSghldWJGl7T6-cam8o4dzl9JyUO10t-lICZ_ig2Q3J8uhk-raNVH4srgG1Yy9WgMecebgLCwuPsgygP_Jk2Buv17ejK4SK-8FibyOKTcFkh0UDpAAfTXXP38Xq1yJWuUdlMBA3Vnd-1uESlVI6pNA8ZOiKUUon0hjsOGlpViTVU7ixgG5x6_xO0QrfMl12tjgcoWdEUnyrVLMzsO9pzzazp1mOmPB0Gt_uERuDYHAmxYUe4M5OSZuLr-J72C9kNbijXlkd7PvdXUK_SzwX1BArm0TcJnlJaIsWfi3Emn_3BACrgYWPbKTEjLDPjKFvq1t4bv9vZvpaupQfYr_6n5DElvXPx6kPtcdPtSDYVB6rmIyz_bxnzcLd6tFjxO66vETMSQs-uHjjabc**d0a5746c69d150f525cf3a077421f8501184e6058b9c9c757a45472866c55feb*6YA3OEOh6v-8vMf7dxnhoTaVy6uJcq3DM0UE-c_p-04~2"

	result, err := verifier.Verify(context.Background(), sealed)
	require.NoError(t, err)
	require.Equal(t, "user_golden", result.Claims.UserID)
	require.Equal(t, "org_golden", result.Claims.OrgID)
	require.Equal(t, "sess_golden", result.Claims.SessionID)
}

func TestWorkOSSessionVerifierRefreshesExpiredAuthKitJWT(t *testing.T) {
	verifier := mustVerifier(t)
	freshAccess := testJWT("user_golden", "sess_refreshed", "org_golden", time.Now().Add(time.Hour).Unix())
	verifier.refresh = func(_ context.Context, refreshToken, organizationID string) (string, string, error) {
		require.Equal(t, "refresh_golden", refreshToken)
		require.Equal(t, "org_golden", organizationID)
		return freshAccess, "refresh_rotated", nil
	}

	sealed := mustSealAuthKit(t, authKitSession{
		AccessToken:  testJWT("user_golden", "sess_golden", "org_golden", time.Now().Add(-time.Minute).Unix()),
		RefreshToken: "refresh_golden",
		User:         json.RawMessage(`{"object":"user","id":"user_golden","email":"golden@example.com"}`),
	})

	result, err := verifier.Verify(context.Background(), sealed)
	require.NoError(t, err)
	require.Equal(t, "user_golden", result.Claims.UserID)
	require.Equal(t, "sess_refreshed", result.Claims.SessionID)
	require.NotEmpty(t, result.SealedCookie)
	require.True(t, ironsession.IsSealed(result.SealedCookie))

	var resealed authKitSession
	require.NoError(t, ironsession.Unseal(result.SealedCookie, testCookiePassword, &resealed))
	require.Equal(t, freshAccess, resealed.AccessToken)
	require.Equal(t, "refresh_rotated", resealed.RefreshToken)
	require.Contains(t, string(resealed.User), `"id":"user_golden"`)
	require.Contains(t, string(resealed.User), `"email":"golden@example.com"`)
}

func TestWorkOSSessionVerifierExpiredJWTWithoutRefreshKeys(t *testing.T) {
	verifier := mustVerifier(t)
	sealed := mustSealAuthKit(t, authKitSession{
		AccessToken:  testJWT("user_golden", "sess_golden", "org_golden", time.Now().Add(-time.Minute).Unix()),
		RefreshToken: "refresh_golden",
		User:         json.RawMessage(`{"id":"user_golden"}`),
	})

	_, err := verifier.Verify(context.Background(), sealed)
	require.Error(t, err)
	require.Equal(t, "session_expired", authReason(err))
}

func TestAuthMiddlewareSetsRefreshedCookie(t *testing.T) {
	handler := authMiddleware(cookieStubVerifier{
		result: SessionResult{
			Claims:       AuthClaims{UserID: "user_123"},
			SealedCookie: "Fe26.2*refreshed~2",
		},
	})(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/v1/validate/segment", nil)
	req.Header.Set("X-Forwarded-Proto", "https")
	req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "sealed-session"})
	handler.ServeHTTP(rec, req)

	require.Equal(t, http.StatusNoContent, rec.Code)
	cookie := rec.Result().Cookies()
	require.NotEmpty(t, cookie)
	require.Equal(t, workOSSessionCookieName, cookie[0].Name)
	require.Equal(t, "Fe26.2*refreshed~2", cookie[0].Value)
	require.True(t, cookie[0].HttpOnly)
	require.True(t, cookie[0].Secure)
	require.Equal(t, "/", cookie[0].Path)
}

type cookieStubVerifier struct {
	result SessionResult
	err    error
}

func (s cookieStubVerifier) Verify(_ context.Context, _ string) (SessionResult, error) {
	if s.err != nil {
		return SessionResult{}, s.err
	}
	return s.result, nil
}

func mustVerifier(t *testing.T) *WorkOSSessionVerifier {
	t.Helper()
	verifier, err := NewWorkOSSessionVerifier(testCookiePassword)
	require.NoError(t, err)
	return verifier
}

func mustSealAuthKit(t *testing.T, session authKitSession) string {
	t.Helper()
	sealed, err := ironsession.Seal(session, testCookiePassword)
	require.NoError(t, err)
	return sealed
}

func testJWT(sub, sid, org string, exp int64) string {
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"none","typ":"JWT"}`))
	payload, err := json.Marshal(map[string]any{
		"sub":    sub,
		"sid":    sid,
		"org_id": org,
		"exp":    exp,
	})
	if err != nil {
		panic(err)
	}
	return header + "." + base64.RawURLEncoding.EncodeToString(payload) + ".sig"
}
