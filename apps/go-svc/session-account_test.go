package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
)

func sessionAccountRequest(api *sessionAccountAPI, claims AuthClaims, method, path, body string) *httptest.ResponseRecorder {
	mux := http.NewServeMux()
	api.register(mux, stubSessionVerifier{claims: claims})
	var req *http.Request
	if body == "" {
		req = httptest.NewRequest(method, path, nil)
	} else {
		req = httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
	}
	req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "session"})
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	return rec
}

func TestSessionAccountGet(t *testing.T) {
	t.Run("unauthenticated", func(t *testing.T) {
		mux := http.NewServeMux()
		(&sessionAccountAPI{}).register(mux, stubSessionVerifier{})
		req := httptest.NewRequest(http.MethodGet, "/v1/me", nil)
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)
		require.Equal(t, http.StatusUnauthorized, rec.Code)
	})

	t.Run("unconfigured database", func(t *testing.T) {
		rec := sessionAccountRequest(&sessionAccountAPI{}, AuthClaims{UserID: "user_1"}, http.MethodGet, "/v1/me", "")
		require.Equal(t, http.StatusServiceUnavailable, rec.Code)
		require.Contains(t, rec.Body.String(), "account_unavailable")
	})

	t.Run("unknown user", func(t *testing.T) {
		scope := testenv.Seed(t, testenv.Options{Role: "admin"})
		rec := sessionAccountRequest(&sessionAccountAPI{pool: scope.Pool}, AuthClaims{UserID: "user_missing"}, http.MethodGet, "/v1/me", "")
		require.Equal(t, http.StatusNotFound, rec.Code)
		require.Contains(t, rec.Body.String(), "account_not_found")
	})

	t.Run("returns profile and default preferences", func(t *testing.T) {
		scope := testenv.Seed(t, testenv.Options{Role: "admin"})
		rec := sessionAccountRequest(&sessionAccountAPI{pool: scope.Pool}, AuthClaims{UserID: scope.WorkOSUserID}, http.MethodGet, "/v1/me", "")
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		var body sessionAccount
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
		require.Equal(t, scope.UserID, body.ID)
		require.Equal(t, false, body.NotificationPreferences["emailEnabled"])
		require.Equal(t, "digest", body.NotificationPreferences["emailFormat"])
	})
}

func TestSessionAccountPatchPreferences(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "admin"})
	api := &sessionAccountAPI{pool: scope.Pool}
	claims := AuthClaims{UserID: scope.WorkOSUserID}

	rec := sessionAccountRequest(api, claims, http.MethodPatch, "/v1/me/notification-preferences", `{"emailEnabled":true,"emailFormat":"immediate"}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var body sessionAccount
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Equal(t, true, body.NotificationPreferences["emailEnabled"])
	require.Equal(t, "immediate", body.NotificationPreferences["emailFormat"])

	again := sessionAccountRequest(api, claims, http.MethodGet, "/v1/me", "")
	require.Equal(t, http.StatusOK, again.Code)
	require.NoError(t, json.Unmarshal(again.Body.Bytes(), &body))
	require.Equal(t, true, body.NotificationPreferences["emailEnabled"])
	require.Equal(t, "immediate", body.NotificationPreferences["emailFormat"])

	bad := sessionAccountRequest(api, claims, http.MethodPatch, "/v1/me/notification-preferences", `{"emailEnabled":true,"emailFormat":"weekly"}`)
	require.Equal(t, http.StatusBadRequest, bad.Code)
}

func TestSessionAccountDelete(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "admin"})
	rec := sessionAccountRequest(&sessionAccountAPI{pool: scope.Pool}, AuthClaims{UserID: scope.WorkOSUserID}, http.MethodDelete, "/v1/me", "")
	require.Equal(t, http.StatusConflict, rec.Code)
	require.Contains(t, rec.Body.String(), "account_deletion_not_supported")
}
