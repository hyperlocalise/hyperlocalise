package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
)

type stubSessionVerifier struct {
	claims AuthClaims
	err    error
}

func (s stubSessionVerifier) Verify(_ context.Context, _ string) (AuthClaims, error) {
	if s.err != nil {
		return AuthClaims{}, s.err
	}
	return s.claims, nil
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
