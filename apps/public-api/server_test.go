package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
)

type authFunc func(context.Context, string) (principal, error)

func (f authFunc) authenticate(ctx context.Context, token string) (principal, error) {
	return f(ctx, token)
}

func TestRoutes(t *testing.T) {
	for _, tt := range []struct {
		name, method, path, token string
		authErr                   error
		status                    int
		calls                     int
	}{
		{"health", "GET", "/healthz", "", nil, 200, 0},
		{"missing token", "GET", "/v1/me", "", nil, 401, 0},
		{"valid token", "GET", "/v1/me", "hl_test", nil, 200, 1},
		{"revoked token", "GET", "/v1/me", "hl_test", errUnauthorized, 401, 1},
		{"forbidden", "GET", "/v1/me", "hl_test", errForbidden, 403, 1},
		{"auth unavailable", "GET", "/v1/me", "hl_test", errAuthUnavailable, 503, 1},
		{"method", "POST", "/v1/me", "hl_test", nil, 405, 0},
		{"unknown route", "GET", "/v1/missing", "hl_test", nil, 404, 0},
		{"ambiguous token", "GET", "/v1/me", "hl_a,hl_b", nil, 401, 0},
		{"head authenticates", "HEAD", "/v1/me", "hl_test", nil, 200, 1},
	} {
		t.Run(tt.name, func(t *testing.T) {
			calls := 0
			h := newHandler(authFunc(func(_ context.Context, token string) (principal, error) {
				calls++
				require.Equal(t, tt.token, token)
				return principal{"t", "u", "o", []string{"files:read"}}, tt.authErr
			}))
			r := httptest.NewRequest(tt.method, tt.path, nil)
			if tt.token != "" {
				r.Header.Set("X-Api-Key", tt.token)
			}
			w := httptest.NewRecorder()
			h.ServeHTTP(w, r)
			require.Equal(t, tt.status, w.Code)
			require.Equal(t, tt.calls, calls)
			require.Equal(t, "no-store", w.Header().Get("Cache-Control"))
			require.Equal(t, "application/json", w.Header().Get("Content-Type"))
			if tt.status >= 400 {
				require.Contains(t, w.Body.String(), `"error":`)
			}
		})
	}
}

func TestIntrospectionDoesNotForwardClientIdentity(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer "+testServiceSecret || r.Header.Get("X-Api-Key") != "hl_test" {
			t.Error("unexpected credentials")
		}
		for _, header := range []string{"Cookie", "X-Organization-Id", "X-User-Id"} {
			if r.Header.Get(header) != "" {
				t.Errorf("client header forwarded: %s", header)
			}
		}
		_, _ = w.Write([]byte(validPrincipalJSON))
	}))
	defer upstream.Close()
	auth, err := newPlatformAuthenticator(upstream.URL, testServiceSecret)
	require.NoError(t, err)
	r := httptest.NewRequest(http.MethodGet, "/v1/me", nil)
	r.Header.Set("X-Api-Key", "hl_test")
	r.Header.Set("Authorization", "Bearer client-credential")
	r.Header.Set("Cookie", "session=client-cookie")
	r.Header.Set("X-Organization-Id", "other-org")
	r.Header.Set("X-User-Id", "other-user")
	w := httptest.NewRecorder()
	newHandler(auth).ServeHTTP(w, r)
	require.Equal(t, http.StatusOK, w.Code)
	require.JSONEq(t, validPrincipalJSON, w.Body.String())
}

func TestDuplicateTokensRejected(t *testing.T) {
	h := newHandler(authFunc(func(context.Context, string) (principal, error) {
		t.Fatal("ambiguous token reached authenticator")
		return principal{}, nil
	}))
	r := httptest.NewRequest(http.MethodGet, "/v1/me", nil)
	r.Header.Add("X-Api-Key", "hl_a")
	r.Header.Add("X-Api-Key", "hl_b")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	require.Equal(t, http.StatusUnauthorized, w.Code)
}
