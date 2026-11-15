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
