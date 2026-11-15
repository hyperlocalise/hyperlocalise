package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/experiment"
	"github.com/hyperlocalise/hyperlocalise/internal/ota"
	"github.com/stretchr/testify/require"
)

type memoryOtaLookup struct {
	releases map[string]*ota.Release
}

func (m memoryOtaLookup) LatestUnrevoked(_ context.Context, hash string) (*ota.Release, error) {
	release, ok := m.releases[hash]
	if !ok {
		return nil, ota.ErrNotFound
	}
	return release, nil
}

func TestPublicOTAConsumerRoutes(t *testing.T) {
	hash := "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	manifest, err := json.Marshal(map[string]any{"schema_version": 1, "format": "json"})
	require.NoError(t, err)
	h := newHandlerWithOutbound(
		authFunc(func(context.Context, string) (principal, error) {
			t.Fatal("OTA consumer routes do not authenticate")
			return principal{}, nil
		}),
		nil,
		nil,
		withOTA(ota.NewHandler(memoryOtaLookup{releases: map[string]*ota.Release{
			hash: {
				Manifest: manifest,
				Format:   "json",
				Contents: map[string]map[string]string{"fr-FR": {"messages.json": `{"hi":"bonjour"}`}},
			},
		}})),
	)

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/ota/"+hash+"/manifest.json", nil))
	require.Equal(t, http.StatusOK, rec.Code)
	require.Contains(t, rec.Body.String(), `"schema_version":1`)
	require.Equal(t, "public, max-age=3600", rec.Header().Get("Cache-Control"))

	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/ota/"+hash+"/content/fr-FR/messages.json", nil))
	require.Equal(t, http.StatusOK, rec.Code)
	require.Equal(t, `{"hi":"bonjour"}`, rec.Body.String())

	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/ota/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/manifest.json", nil))
	require.Equal(t, http.StatusNotFound, rec.Code)
	require.Empty(t, rec.Body.String())
}

func TestPublicOFREPConsumerRoute(t *testing.T) {
	store := experiment.NewMemoryStore("org-1")
	store.AddKey("hlk_test")
	store.SetFlags([]experiment.FlagRecord{
		{ID: "f-exp", Key: "checkout-cta", Kind: "experiment"},
	})
	store.SetRows([]experiment.EvalRow{{
		FlagID: "f-exp", ExperimentID: "exp-1", Seed: 1, VariantKey: "treatment",
		AllocStart: 0, AllocEnd: 9999, Enabled: true, Payload: []byte(`true`),
	}})
	store.SetOtaBindings([]experiment.OtaBinding{{
		FlagKey: "checkout-cta", VariantKey: "treatment",
		Hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", Branch: "main", Format: "json",
	}})
	h := newHandlerWithOutbound(
		authFunc(func(context.Context, string) (principal, error) {
			t.Fatal("OFREP uses Hyperlab client keys, not PATs")
			return principal{}, nil
		}),
		nil,
		nil,
		withOFREP(experiment.NewOFREPHandler(store)),
	)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/ofrep/v1/evaluate/flags/checkout-cta", bytes.NewBufferString(`{"context":{"targetingKey":"u1"}}`))
	req.Header.Set("X-API-Key", "hlk_test")
	h.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)
	require.Contains(t, rec.Body.String(), `"hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"`)
}
