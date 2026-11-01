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

type publicMemoryFixture struct {
	scope   *testenv.Scope
	key     string
	handler http.Handler
	api     *memoryAPI
}

func newPublicMemoryFixture(t *testing.T, role string, permissions []string) publicMemoryFixture {
	t.Helper()
	scope := testenv.Seed(t, testenv.Options{Role: role})
	key, _ := mustPublicAPIKey(t, scope, publicAPIKeyOptions{permissions: permissions})
	memories := &memoryAPI{pool: scope.Pool, membership: scope.Membership(role)}
	mux := http.NewServeMux()
	(&publicMemoryAPI{
		auth:     publicAPIIntegrationAuth(scope, scope.Membership(role)),
		memories: memories,
	}).register(mux)
	return publicMemoryFixture{scope: scope, key: key, handler: mux, api: memories}
}

func (f publicMemoryFixture) do(t *testing.T, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	req.Header.Set("X-API-Key", f.key)
	rec := httptest.NewRecorder()
	f.handler.ServeHTTP(rec, req)
	return rec
}

func TestPublicMemoryTMXExport(t *testing.T) {
	f := newPublicMemoryFixture(t, "admin", []string{"memories:read", "memories:write"})
	id := f.scope.MustMemory(t, "", "Product TM")
	mustMemoryEntry(t, f.scope, id, "en-US", "fr-FR", "Hello", "Bonjour")

	rec := f.do(t, http.MethodGet, "/v1/translation-memories/"+id+"/entries/export?format=tmx", "")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Contains(t, rec.Header().Get("Content-Type"), "application/x-tmx+xml")
	require.Contains(t, rec.Body.String(), "Hello")
	require.Contains(t, rec.Body.String(), "Bonjour")
	require.Equal(t, "no-store", rec.Header().Get("Cache-Control"))
}

func TestPublicMemoryTMXImport(t *testing.T) {
	f := newPublicMemoryFixture(t, "admin", []string{"memories:read", "memories:write"})
	id := f.scope.MustMemory(t, "", "Product TM")
	payload, err := json.Marshal(map[string]string{"format": "tmx", "content": sampleMemoryTMX(2)})
	require.NoError(t, err)

	rec := f.do(t, http.MethodPost, "/v1/translation-memories/"+id+"/entries/import", string(payload))
	require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"imported":2`)

	export := f.do(t, http.MethodGet, "/v1/translation-memories/"+id+"/entries/export?format=tmx", "")
	require.Equal(t, http.StatusOK, export.Code, export.Body.String())
	require.Contains(t, export.Body.String(), "Hello 0")
	require.Contains(t, export.Body.String(), "Bonjour 1")
}

func TestPublicMemoryTMXAuth(t *testing.T) {
	t.Run("requires authentication", func(t *testing.T) {
		f := newPublicMemoryFixture(t, "admin", []string{"memories:read", "memories:write"})
		id := f.scope.MustMemory(t, "", "Product TM")
		rec := httptest.NewRecorder()
		f.handler.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/v1/translation-memories/"+id+"/entries/export", nil))
		requirePublicAPIError(t, rec, http.StatusUnauthorized, "unauthorized", "Authentication required")
	})

	t.Run("requires memories:read to export", func(t *testing.T) {
		f := newPublicMemoryFixture(t, "admin", []string{"files:read", "jobs:read"})
		id := f.scope.MustMemory(t, "", "Product TM")
		requirePublicAPIError(t, f.do(t, http.MethodGet, "/v1/translation-memories/"+id+"/entries/export", ""),
			http.StatusForbidden, "forbidden", "Missing required permission: memories:read")
	})

	t.Run("requires memories:write to import", func(t *testing.T) {
		f := newPublicMemoryFixture(t, "admin", []string{"memories:read"})
		id := f.scope.MustMemory(t, "", "Product TM")
		payload, err := json.Marshal(map[string]string{"format": "tmx", "content": sampleMemoryTMX(1)})
		require.NoError(t, err)
		requirePublicAPIError(t, f.do(t, http.MethodPost, "/v1/translation-memories/"+id+"/entries/import", string(payload)),
			http.StatusForbidden, "forbidden", "Missing required permission: memories:write")
	})

	t.Run("hides memories in other workspaces", func(t *testing.T) {
		f := newPublicMemoryFixture(t, "admin", []string{"memories:read", "memories:write"})
		other := testenv.Seed(t, testenv.Options{Role: "admin"})
		foreign := other.MustMemory(t, "", "Foreign TM")
		rec := f.do(t, http.MethodGet, "/v1/translation-memories/"+foreign+"/entries/export", "")
		require.Equal(t, http.StatusNotFound, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), `"memory_not_found"`)
	})

	t.Run("without a database", func(t *testing.T) {
		mux := http.NewServeMux()
		(&publicMemoryAPI{auth: &publicAPIAuth{}}).register(mux)
		req := httptest.NewRequest(http.MethodGet, "/v1/translation-memories/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/entries/export", nil)
		req.Header.Set("X-API-Key", "hl_secret")
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)
		requirePublicAPIError(t, rec, http.StatusServiceUnavailable, "public_api_unavailable", "Public API is unavailable")
		require.Equal(t, "no-store", rec.Header().Get("Cache-Control"))
	})
}

func TestPublicMemoryTMXRoleCaps(t *testing.T) {
	t.Run("translator can export", func(t *testing.T) {
		f := newPublicMemoryFixture(t, "translator", []string{"memories:read"})
		id := f.scope.MustMemory(t, "", "Product TM")
		mustMemoryEntry(t, f.scope, id, "en-US", "fr-FR", "Hello", "Bonjour")
		rec := f.do(t, http.MethodGet, "/v1/translation-memories/"+id+"/entries/export?format=tmx", "")
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), "Hello")
	})

	t.Run("translator cannot import", func(t *testing.T) {
		f := newPublicMemoryFixture(t, "translator", []string{"memories:read", "memories:write"})
		id := f.scope.MustMemory(t, "", "Product TM")
		payload, err := json.Marshal(map[string]string{"format": "tmx", "content": sampleMemoryTMX(1)})
		require.NoError(t, err)
		requirePublicAPIError(t, f.do(t, http.MethodPost, "/v1/translation-memories/"+id+"/entries/import", string(payload)),
			http.StatusForbidden, "forbidden", "Missing required permission: memories:write")
	})
}
