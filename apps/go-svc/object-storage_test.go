package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/objectstore"
	"github.com/hyperlocalise/hyperlocalise/internal/objectstore/memory"
	"github.com/stretchr/testify/require"
)

func TestStorageRoutes(t *testing.T) {
	t.Setenv("WORKOS_COOKIE_PASSWORD", strings.Repeat("a", 32))
	token := serverCallToken()
	registry, err := objectstore.NewRegistry("r2-primary", map[string]objectstore.Store{"r2-primary": memory.New()})
	require.NoError(t, err)
	h := newHandler()
	h.objects = registry
	mux := http.NewServeMux()
	registerRoutes(mux, h, stubSessionVerifier{claims: AuthClaims{UserID: "user_123"}})
	call := func(method, path, body, auth string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set(serverCallTokenHeader, auth)
		req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "sealed-session"})
		req.Header.Set("Content-Type", "text/plain")
		req.Header.Set("X-Object-Key", "file.json")
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)
		return rec
	}
	for _, path := range []string{"/v1/storage/read", "/v1/storage/stat", "/v1/storage/delete", "/v1/storage/sign-upload", "/v1/storage/sign-download", "/v1/guidelines/sync", "/v1/guidelines/search"} {
		t.Run("unauthorized "+path, func(t *testing.T) {
			require.Equal(t, http.StatusUnauthorized, call(http.MethodPost, path, `{}`, "wrong").Code)
		})
	}
	require.Equal(t, http.StatusUnauthorized, call(http.MethodPut, "/v1/storage/object", "data", "").Code)
	uploaded := call(http.MethodPut, "/v1/storage/object", "data", token)
	require.Equal(t, http.StatusCreated, uploaded.Code, uploaded.Body.String())
	var result struct {
		Ref objectstore.Ref `json:"ref"`
	}
	require.NoError(t, json.Unmarshal(uploaded.Body.Bytes(), &result))
	require.Equal(t, "r2-primary", result.Ref.LocationID)
	require.Equal(t, http.StatusConflict, call(http.MethodPut, "/v1/storage/object", "different", token).Code)
	ref := `{"locationId":"r2-primary","key":"file.json"}`
	read := call(http.MethodPost, "/v1/storage/read", ref, token)
	require.Equal(t, http.StatusOK, read.Code)
	require.Equal(t, "data", read.Body.String())
	require.Equal(t, "no-store", read.Header().Get("Cache-Control"))
	require.Equal(t, http.StatusOK, call(http.MethodPost, "/v1/storage/stat", ref, token).Code)
	require.Equal(t, http.StatusBadRequest, call(http.MethodPost, "/v1/storage/read", `{"key":"file.json"}`, token).Code)
	require.Equal(t, http.StatusBadRequest, call(http.MethodPost, "/v1/storage/stat", ref+` {}`, token).Code)
	require.Equal(t, http.StatusBadRequest, call(http.MethodPost, "/v1/storage/sign-download", `{"ref":{"locationId":"r2-primary","key":"file.json"},"expiresInSeconds":9223372036854775807}`, token).Code)
	require.Equal(t, http.StatusNoContent, call(http.MethodPost, "/v1/storage/delete", ref, token).Code)
	require.Equal(t, http.StatusNoContent, call(http.MethodPost, "/v1/storage/delete", ref, token).Code)
	require.Equal(t, http.StatusNotFound, call(http.MethodPost, "/v1/storage/read", ref, token).Code)
	require.Equal(t, http.StatusServiceUnavailable, call(http.MethodPost, "/v1/guidelines/search", `{}`, token).Code)
	request := httptest.NewRequest(http.MethodPut, "/v1/storage/object", bytes.NewReader(nil))
	request.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "sealed-session"})
	request.ContentLength = maxStoredObjectBytes + 1
	request.Header.Set(serverCallTokenHeader, token)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, request)
	require.Equal(t, http.StatusRequestEntityTooLarge, rec.Code)
}

func TestConfigureObjectStorageIsOptIn(t *testing.T) {
	t.Setenv("OBJECT_STORAGE_LOCATIONS", "")
	t.Setenv("OBJECT_STORAGE_DEFAULT_LOCATION", "")
	store, err := configureObjectStorage(t.Context())
	require.NoError(t, err)
	require.Nil(t, store)
	t.Setenv("OBJECT_STORAGE_LOCATIONS", "primary")
	t.Setenv("OBJECT_STORAGE_PRIMARY_PROVIDER", "r2")
	t.Setenv("OBJECT_STORAGE_PRIMARY_BUCKET", "files")
	t.Setenv("OBJECT_STORAGE_PRIMARY_ENDPOINT", "https://account.r2.cloudflarestorage.com")
	t.Setenv("OBJECT_STORAGE_PRIMARY_ACCESS_KEY_ID", "test-key")
	t.Setenv("OBJECT_STORAGE_PRIMARY_SECRET_ACCESS_KEY", "test-secret")
	t.Setenv("OBJECT_STORAGE_DEFAULT_LOCATION", "primary")
	store, err = configureObjectStorage(t.Context())
	require.NoError(t, err)
	require.NotNil(t, store)
	t.Setenv("OBJECT_STORAGE_DEFAULT_LOCATION", "missing")
	_, err = configureObjectStorage(t.Context())
	require.ErrorContains(t, err, "OBJECT_STORAGE_DEFAULT_LOCATION")
}

func TestProviderRoutesReuseSessionAndServerCallAuth(t *testing.T) {
	t.Setenv("WORKOS_COOKIE_PASSWORD", strings.Repeat("p", 32))
	for _, tc := range []struct {
		name           string
		cookie         bool
		token          bool
		invalidSession bool
		status         int
	}{
		{"token alone", false, true, false, http.StatusUnauthorized},
		{"session alone", true, false, false, http.StatusUnauthorized},
		{"invalid session", true, true, true, http.StatusUnauthorized},
		{"existing credentials", true, true, false, http.StatusServiceUnavailable},
	} {
		t.Run(tc.name, func(t *testing.T) {
			verifier := stubSessionVerifier{claims: AuthClaims{UserID: "user_123"}}
			if tc.invalidSession {
				verifier.err = errors.New("invalid session")
			}
			h := newHandler()
			mux := http.NewServeMux()
			registerRoutes(mux, h, verifier)
			req := httptest.NewRequest(http.MethodPost, "/v1/storage/stat", strings.NewReader(`{"locationId":"primary","key":"key"}`))
			if tc.cookie {
				req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "sealed-session"})
			}
			if tc.token {
				req.Header.Set(serverCallTokenHeader, serverCallToken())
			}
			rec := httptest.NewRecorder()
			mux.ServeHTTP(rec, req)
			require.Equal(t, tc.status, rec.Code)
		})
	}
}
