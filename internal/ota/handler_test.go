package ota

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
)

type memoryLookup struct {
	releases map[string]*Release
}

func (m memoryLookup) LatestUnrevoked(_ context.Context, hash string) (*Release, error) {
	release, ok := m.releases[hash]
	if !ok {
		return nil, ErrNotFound
	}
	return release, nil
}

func TestServeManifestAndContent(t *testing.T) {
	hash := "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	manifest, err := json.Marshal(map[string]any{
		"schema_version": 1,
		"format":         "json",
		"files":          []string{"/messages.json"},
		"languages":      []string{"fr-FR"},
	})
	require.NoError(t, err)
	handler := NewHandler(memoryLookup{releases: map[string]*Release{
		hash: {
			Manifest: manifest,
			Format:   "json",
			Contents: map[string]map[string]string{
				"fr-FR": {"messages.json": `{"greeting":"Bonjour"}`},
			},
		},
	}})
	mux := http.NewServeMux()
	handler.Register(mux)

	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/ota/"+hash+"/manifest.json", nil))
	require.Equal(t, http.StatusOK, rec.Code)
	require.Contains(t, rec.Body.String(), `"schema_version":1`)

	rec = httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/ota/"+hash+"/content/fr-FR/messages.json", nil))
	require.Equal(t, http.StatusOK, rec.Code)
	require.Equal(t, `{"greeting":"Bonjour"}`, rec.Body.String())
	require.Equal(t, "application/json; charset=utf-8", rec.Header().Get("Content-Type"))
}

func TestUnknownHashIsNotFound(t *testing.T) {
	handler := NewHandler(memoryLookup{releases: map[string]*Release{}})
	mux := http.NewServeMux()
	handler.Register(mux)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/ota/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/manifest.json", nil))
	require.Equal(t, http.StatusNotFound, rec.Code)
	require.Empty(t, rec.Body.String())
}

type errorLookup struct {
	err error
}

func (e errorLookup) LatestUnrevoked(context.Context, string) (*Release, error) {
	return nil, e.err
}

func TestServeOTAEdgeCases(t *testing.T) {
	hash := "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	handler := NewHandler(memoryLookup{releases: map[string]*Release{
		hash: {
			Manifest: nil,
			Format:   "android_xml",
			Contents: map[string]map[string]string{
				"fr-FR": {"messages.xml": `<string name="hi">bonjour</string>`},
			},
		},
	}})
	mux := http.NewServeMux()
	handler.Register(mux)

	t.Run("invalid hash", func(t *testing.T) {
		for _, path := range []string{
			"/ota/not-a-hash/manifest.json",
			"/ota/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAZ/manifest.json",
			"/ota/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/manifest.json",
		} {
			rec := httptest.NewRecorder()
			mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
			require.Equal(t, http.StatusNotFound, rec.Code, path)
			require.Empty(t, rec.Body.String(), path)
		}
	})

	t.Run("uppercase hash is accepted", func(t *testing.T) {
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/ota/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/manifest.json", nil))
		require.Equal(t, http.StatusOK, rec.Code)
		require.Equal(t, `{}`, rec.Body.String())
	})

	t.Run("dot-dot path segment is not found", func(t *testing.T) {
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/ota/"+hash+"/content/fr-FR/evil..path.xml", nil))
		require.Equal(t, http.StatusNotFound, rec.Code)
		require.Empty(t, rec.Body.String())
	})

	t.Run("options is cors preflight", func(t *testing.T) {
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, httptest.NewRequest(http.MethodOptions, "/ota/"+hash+"/manifest.json", nil))
		require.Equal(t, http.StatusNoContent, rec.Code)
		require.Equal(t, "*", rec.Header().Get("Access-Control-Allow-Origin"))
		require.Empty(t, rec.Body.String())
	})

	t.Run("android xml content type", func(t *testing.T) {
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/ota/"+hash+"/content/fr-FR/messages.xml", nil))
		require.Equal(t, http.StatusOK, rec.Code)
		require.Equal(t, "application/xml; charset=utf-8", rec.Header().Get("Content-Type"))
	})

	t.Run("head omits body", func(t *testing.T) {
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, httptest.NewRequest(http.MethodHead, "/ota/"+hash+"/content/fr-FR/messages.xml", nil))
		require.Equal(t, http.StatusOK, rec.Code)
		require.Empty(t, rec.Body.String())
	})
}

func TestServeOTALookupFailure(t *testing.T) {
	handler := NewHandler(errorLookup{err: context.DeadlineExceeded})
	mux := http.NewServeMux()
	handler.Register(mux)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/ota/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/manifest.json", nil))
	require.Equal(t, http.StatusInternalServerError, rec.Code)
	require.Contains(t, rec.Body.String(), `"error":"general"`)
}

func TestOTAContentType(t *testing.T) {
	require.Equal(t, "application/xml; charset=utf-8", contentType("android-xml"))
	require.Equal(t, "text/plain; charset=utf-8", contentType("ios_strings"))
	require.Equal(t, "application/json; charset=utf-8", contentType("json"))
}
