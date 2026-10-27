package main

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestAllowedBrowserOrigin(t *testing.T) {
	t.Setenv("GO_SVC_CORS_ORIGINS", "https://preview.example:443,http://legacy.example:80,https://custom.example:8443")

	for _, tc := range []struct {
		name, origin, host string
		allowed            bool
	}{
		{name: "apex web", origin: "https://hyperlocalise.com", host: "api.hyperlocalise.com", allowed: true},
		{name: "us spelling web", origin: "https://hyperlocalize.com", host: "api.hyperlocalise.com", allowed: true},
		{name: "www web", origin: "https://www.hyperlocalise.com", host: "api.hyperlocalise.com", allowed: true},
		{name: "same host rewrite", origin: "https://hyperlocalise.com", host: "hyperlocalise.com", allowed: true},
		{name: "loopback", origin: "http://localhost:3000", host: "127.0.0.1:8080", allowed: true},
		{name: "extra env origin omits default https port", origin: "https://preview.example", host: "api.hyperlocalise.com", allowed: true},
		{name: "extra env origin with default https port", origin: "https://preview.example:443", host: "api.hyperlocalise.com", allowed: true},
		{name: "extra env origin omits default http port", origin: "http://legacy.example", host: "api.hyperlocalise.com", allowed: true},
		{name: "extra env origin keeps non-default port", origin: "https://custom.example:8443", host: "api.hyperlocalise.com", allowed: true},
		{name: "extra env origin without non-default port", origin: "https://custom.example", host: "api.hyperlocalise.com", allowed: false},
		{name: "evil", origin: "https://evil.example", host: "api.hyperlocalise.com", allowed: false},
		{name: "opaque", origin: "null", host: "api.hyperlocalise.com", allowed: false},
		{name: "empty", origin: "", host: "api.hyperlocalise.com", allowed: false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			require.Equal(t, tc.allowed, allowedBrowserOrigin(tc.origin, tc.host))
		})
	}
}

func TestDenyBrowserMutation(t *testing.T) {
	allowed := httptest.NewRequest(http.MethodPost, "http://api.hyperlocalise.com/v1/orgs/acme/teams", nil)
	allowed.Header.Set("Origin", "https://hyperlocalize.com")
	allowed.Header.Set("Sec-Fetch-Site", "cross-site")
	require.False(t, denyBrowserMutation(allowed))

	evil := httptest.NewRequest(http.MethodPost, "http://api.hyperlocalise.com/v1/orgs/acme/teams", nil)
	evil.Header.Set("Origin", "https://evil.example")
	require.True(t, denyBrowserMutation(evil))

	crossSiteNoOrigin := httptest.NewRequest(http.MethodPost, "http://api.hyperlocalise.com/v1/orgs/acme/teams", nil)
	crossSiteNoOrigin.Header.Set("Sec-Fetch-Site", "cross-site")
	require.True(t, denyBrowserMutation(crossSiteNoOrigin))

	get := httptest.NewRequest(http.MethodGet, "http://api.hyperlocalise.com/v1/orgs/acme/teams", nil)
	get.Header.Set("Origin", "https://evil.example")
	require.False(t, denyBrowserMutation(get))
}

func TestCORSMiddleware(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /v1/orgs/acme/teams", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	handler := corsMiddleware(mux)

	preflight := httptest.NewRequest(http.MethodOptions, "http://api.hyperlocalise.com/v1/orgs/acme/teams", nil)
	preflight.Header.Set("Origin", "https://hyperlocalise.com")
	preflight.Header.Set("Access-Control-Request-Method", "POST")
	preflight.Header.Set("Access-Control-Request-Headers", "authorization,content-type")
	preflightRec := httptest.NewRecorder()
	handler.ServeHTTP(preflightRec, preflight)
	require.Equal(t, http.StatusNoContent, preflightRec.Code)
	require.Equal(t, "https://hyperlocalise.com", preflightRec.Header().Get("Access-Control-Allow-Origin"))
	require.Contains(t, preflightRec.Header().Get("Access-Control-Allow-Headers"), "Authorization")
	require.Equal(t, "Origin", preflightRec.Header().Get("Vary"))

	denied := httptest.NewRequest(http.MethodOptions, "http://api.hyperlocalise.com/v1/orgs/acme/teams", nil)
	denied.Header.Set("Origin", "https://evil.example")
	deniedRec := httptest.NewRecorder()
	handler.ServeHTTP(deniedRec, denied)
	require.Contains(t, []int{http.StatusNotFound, http.StatusMethodNotAllowed}, deniedRec.Code)
	require.Empty(t, deniedRec.Header().Get("Access-Control-Allow-Origin"))

	get := httptest.NewRequest(http.MethodGet, "http://api.hyperlocalise.com/v1/orgs/acme/teams", nil)
	get.Header.Set("Origin", "https://hyperlocalize.com")
	getRec := httptest.NewRecorder()
	handler.ServeHTTP(getRec, get)
	require.Equal(t, http.StatusOK, getRec.Code)
	require.Equal(t, "https://hyperlocalize.com", getRec.Header().Get("Access-Control-Allow-Origin"))
	require.Contains(t, getRec.Header().Get("Access-Control-Expose-Headers"), "X-Export-Extension")

	t.Setenv("GO_SVC_CORS_ORIGINS", "https://preview.example:443")
	preview := httptest.NewRequest(http.MethodOptions, "http://api.hyperlocalise.com/v1/orgs/acme/teams", nil)
	preview.Header.Set("Origin", "https://preview.example")
	preview.Header.Set("Access-Control-Request-Method", "POST")
	previewRec := httptest.NewRecorder()
	handler.ServeHTTP(previewRec, preview)
	require.Equal(t, http.StatusNoContent, previewRec.Code)
	require.Equal(t, "https://preview.example", previewRec.Header().Get("Access-Control-Allow-Origin"))

	pna := httptest.NewRequest(http.MethodOptions, "http://127.0.0.1:8080/v1/orgs/acme/projects", nil)
	pna.Header.Set("Origin", "http://localhost:3000")
	pna.Header.Set("Access-Control-Request-Method", "GET")
	pna.Header.Set("Access-Control-Request-Private-Network", "true")
	pnaRec := httptest.NewRecorder()
	handler.ServeHTTP(pnaRec, pna)
	require.Equal(t, http.StatusNoContent, pnaRec.Code)
	require.Equal(t, "true", pnaRec.Header().Get("Access-Control-Allow-Private-Network"))

	deniedPna := httptest.NewRequest(http.MethodOptions, "http://127.0.0.1:8080/v1/orgs/acme/projects", nil)
	deniedPna.Header.Set("Origin", "https://evil.example")
	deniedPna.Header.Set("Access-Control-Request-Method", "GET")
	deniedPna.Header.Set("Access-Control-Request-Private-Network", "true")
	deniedPnaRec := httptest.NewRecorder()
	handler.ServeHTTP(deniedPnaRec, deniedPna)
	require.Empty(t, deniedPnaRec.Header().Get("Access-Control-Allow-Private-Network"))
	require.Empty(t, deniedPnaRec.Header().Get("Access-Control-Allow-Origin"))

	allowedWithoutPna := httptest.NewRequest(http.MethodOptions, "http://127.0.0.1:8080/v1/orgs/acme/projects", nil)
	allowedWithoutPna.Header.Set("Origin", "http://localhost:3000")
	allowedWithoutPna.Header.Set("Access-Control-Request-Method", "GET")
	allowedWithoutPnaRec := httptest.NewRecorder()
	handler.ServeHTTP(allowedWithoutPnaRec, allowedWithoutPna)
	require.Equal(t, http.StatusNoContent, allowedWithoutPnaRec.Code)
	require.Empty(t, allowedWithoutPnaRec.Header().Get("Access-Control-Allow-Private-Network"))
	require.Equal(t, "http://localhost:3000", allowedWithoutPnaRec.Header().Get("Access-Control-Allow-Origin"))
}
