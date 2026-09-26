package main

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

const (
	testServiceSecret  = "test-service-secret-at-least-32-characters"
	validPrincipalJSON = `{"principal":{"tokenId":"token-1","userId":"user-1","organizationId":"org-1","permissions":["files:read"]}}`
)

func TestPlatformAuthenticator(t *testing.T) {
	for _, tt := range []struct {
		name    string
		status  int
		body    string
		wantErr error
	}{
		{"valid", 200, validPrincipalJSON, nil},
		{"invalid token", 401, `{"error":"unauthorized"}`, errUnauthorized},
		{"service secret rejected", 401, `{"error":"service_unauthorized"}`, errAuthUnavailable},
		{"missing membership", 403, `{"error":"forbidden"}`, errForbidden},
		{"archived workspace", 403, `{"error":"workspace_archived"}`, errForbidden},
		{"unexpected forbidden", 403, `{"error":"edge_denied"}`, errAuthUnavailable},
		{"platform failure", 500, `{"error":"internal_error"}`, errAuthUnavailable},
		{"invalid JSON", 200, `{`, errAuthUnavailable},
		{"missing principal", 200, `{}`, errAuthUnavailable},
		{"missing permissions", 200, `{"principal":{"tokenId":"t","userId":"u","organizationId":"o"}}`, errAuthUnavailable},
		{"oversized response", 200, strings.Repeat(" ", maxIntrospectionBytes+1), errAuthUnavailable},
		{"trailing data", 200, validPrincipalJSON + `{}`, errAuthUnavailable},
	} {
		t.Run(tt.name, func(t *testing.T) {
			upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Method != http.MethodPost || r.URL.Path != introspectionPath || r.Header.Get("X-Api-Key") != "hl_test" || r.Header.Get("Authorization") != "Bearer "+testServiceSecret {
					t.Error("incorrect introspection request")
				}
				w.WriteHeader(tt.status)
				_, _ = w.Write([]byte(tt.body)) // Test response writer.
			}))
			defer upstream.Close()
			auth, err := newPlatformAuthenticator(upstream.URL, testServiceSecret)
			require.NoError(t, err)
			p, err := auth.authenticate(context.Background(), "hl_test")
			if tt.wantErr != nil {
				require.ErrorIs(t, err, tt.wantErr)
				require.Empty(t, p)
			} else {
				require.NoError(t, err)
				require.Equal(t, principal{"token-1", "user-1", "org-1", []string{"files:read"}}, p)
			}
		})
	}
}

func TestPlatformAuthenticatorRejectsRedirects(t *testing.T) {
	target := httptest.NewServer(http.HandlerFunc(func(_ http.ResponseWriter, _ *http.Request) { t.Error("credentials reached redirect target") }))
	defer target.Close()
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, target.URL, http.StatusTemporaryRedirect)
	}))
	defer upstream.Close()
	auth, err := newPlatformAuthenticator(upstream.URL, testServiceSecret)
	require.NoError(t, err)
	_, err = auth.authenticate(context.Background(), "hl_test")
	require.ErrorIs(t, err, errAuthUnavailable)
}

func TestPlatformAuthenticatorCancellationAndTimeout(t *testing.T) {
	for _, canceled := range []bool{false, true} {
		t.Run(map[bool]string{true: "canceled", false: "timeout"}[canceled], func(t *testing.T) {
			upstream := httptest.NewServer(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) { <-r.Context().Done() }))
			defer upstream.Close()
			auth, err := newPlatformAuthenticator(upstream.URL, testServiceSecret)
			require.NoError(t, err)
			auth.client.Timeout = 20 * time.Millisecond
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			if canceled {
				cancel()
			}
			_, err = auth.authenticate(ctx, "hl_test")
			require.ErrorIs(t, err, errAuthUnavailable)
		})
	}
}

func TestPlatformConfiguration(t *testing.T) {
	for _, origin := range []string{"https://platform.example", "http://localhost:3000", "http://127.0.0.1:3000", "http://[::1]:3000"} {
		_, err := newPlatformAuthenticator(origin, testServiceSecret)
		require.NoError(t, err)
	}
	for _, origin := range []string{"", "/relative", "http://platform.example", "ftp://localhost", "https://user:password@platform.example", "https://platform.example/path", "https://platform.example?token=secret", "https://platform.example/#fragment"} {
		_, err := newPlatformAuthenticator(origin, testServiceSecret)
		require.Error(t, err)
		require.NotContains(t, err.Error(), "password")
	}
	for _, secret := range []string{"", "short", " " + testServiceSecret, testServiceSecret + "\n", testServiceSecret + "\r\nmore"} {
		_, err := newPlatformAuthenticator("https://platform.example", secret)
		require.Error(t, err)
	}
}

func TestNoAuthenticationCache(t *testing.T) {
	calls := 0
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls++
		if calls == 1 {
			_, _ = w.Write([]byte(validPrincipalJSON))
			return
		}
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"error":"unauthorized"}`))
	}))
	defer upstream.Close()
	auth, err := newPlatformAuthenticator(upstream.URL, testServiceSecret)
	require.NoError(t, err)
	_, err = auth.authenticate(context.Background(), "hl_test")
	require.NoError(t, err)
	_, err = auth.authenticate(context.Background(), "hl_test")
	require.True(t, errors.Is(err, errUnauthorized))
}
