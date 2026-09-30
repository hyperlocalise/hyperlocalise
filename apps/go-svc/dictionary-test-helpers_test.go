package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
)

const testDictionaryBase = "/v1/orgs/acme/dictionaries"

var testDictionaryTime = time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)

func dictionaryTestAPI(t *testing.T, role string) (*dictionaryAPI, *testenv.Scope) {
	t.Helper()
	scope := testenv.Seed(t, testenv.Options{Role: role})
	return &dictionaryAPI{
		pool:       scope.Pool,
		wordsCache: scope.Valkey,
		membership: scope.Membership(role),
	}, scope
}

func dictionaryRequest(api *dictionaryAPI, scope *testenv.Scope, method, path, body string) *httptest.ResponseRecorder {
	return sessionRequest(api, scope.WorkOSUserID, method, path, body, "session", "", "")
}

func dictionaryRequestForTest(api *dictionaryAPI, method, path, body string) *httptest.ResponseRecorder {
	return sessionRequest(api, "user_live", method, path, body, "session", "", "")
}

func sessionRequest(api *dictionaryAPI, userID, method, path, body, cookie, origin, site string) *httptest.ResponseRecorder {
	mux := http.NewServeMux()
	api.register(mux, stubSessionVerifier{claims: AuthClaims{UserID: userID}})
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if cookie != "" {
		req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: cookie})
	}
	req.Header.Set("Origin", origin)
	req.Header.Set("Sec-Fetch-Site", site)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	return rec
}

func requireJSONField(t *testing.T, body, key, want string) {
	t.Helper()
	require.Contains(t, body, `"`+key+`":"`+want+`"`)
}
