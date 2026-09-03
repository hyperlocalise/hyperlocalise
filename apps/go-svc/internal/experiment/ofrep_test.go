package experiment

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestOFREPUnauthorized(t *testing.T) {
	store := NewMemoryStore("org-1")
	handler := NewOFREPHandler(store)
	mux := http.NewServeMux()
	handler.Register(mux)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/ofrep/v1/evaluate/flags/checkout-cta", bytes.NewBufferString(`{"context":{"targetingKey":"u1"}}`))
	mux.ServeHTTP(rec, req)
	require.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestOFREPMissingTargetingKey(t *testing.T) {
	store := NewMemoryStore("org-1")
	store.AddKey("hlk_test")
	handler := NewOFREPHandler(store)
	mux := http.NewServeMux()
	handler.Register(mux)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/ofrep/v1/evaluate/flags/checkout-cta", bytes.NewBufferString(`{"context":{}}`))
	req.Header.Set("X-API-Key", "hlk_test")
	mux.ServeHTTP(rec, req)
	require.Equal(t, http.StatusBadRequest, rec.Code)
	require.Contains(t, rec.Body.String(), "TARGETING_KEY_MISSING")
}

func TestOFREPFlagNotFound(t *testing.T) {
	store := NewMemoryStore("org-1")
	store.AddKey("hlk_test")
	handler := NewOFREPHandler(store)
	mux := http.NewServeMux()
	handler.Register(mux)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/ofrep/v1/evaluate/flags/missing", bytes.NewBufferString(`{"context":{"targetingKey":"u1"}}`))
	req.Header.Set("Authorization", "Bearer hlk_test")
	mux.ServeHTTP(rec, req)
	require.Equal(t, http.StatusNotFound, rec.Code)
	require.Contains(t, rec.Body.String(), "FLAG_NOT_FOUND")
}

func TestOFREPConfigAndExperiment(t *testing.T) {
	store := NewMemoryStore("org-1")
	store.AddKey("hlk_test")
	store.SetFlags([]FlagRecord{
		{ID: "f-config", Key: "copy", Kind: "config", ConfigValue: []byte(`{"title":"Hello"}`)},
		{ID: "f-exp", Key: "checkout-cta", Kind: "experiment"},
	})
	store.SetRows([]EvalRow{
		{
			FlagID:       "f-exp",
			ExperimentID: "exp-1",
			Seed:         1,
			VariantKey:   "treatment",
			AllocStart:   0,
			AllocEnd:     9999,
			Enabled:      true,
			Payload:      []byte(`true`),
		},
	})
	handler := NewOFREPHandler(store)
	mux := http.NewServeMux()
	handler.Register(mux)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/ofrep/v1/evaluate/flags/copy", bytes.NewBufferString(`{"context":{"targetingKey":"u1"}}`))
	req.Header.Set("X-API-Key", "hlk_test")
	mux.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)
	var one map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &one))
	require.Equal(t, "STATIC", one["reason"])

	rec = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPost, "/ofrep/v1/evaluate/flags", bytes.NewBufferString(`{"context":{"targetingKey":"u1"}}`))
	req.Header.Set("X-API-Key", "hlk_test")
	mux.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)
	var bulk map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &bulk))
	flags, ok := bulk["flags"].([]any)
	require.True(t, ok)
	require.Len(t, flags, 2)
}

func TestOFREPUnconfiguredConfigFlag(t *testing.T) {
	store := NewMemoryStore("org-1")
	store.AddKey("hlk_test")
	store.SetFlags([]FlagRecord{
		{ID: "f-empty", Key: "empty-config", Kind: "config"},
	})
	handler := NewOFREPHandler(store)
	mux := http.NewServeMux()
	handler.Register(mux)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/ofrep/v1/evaluate/flags/empty-config", bytes.NewBufferString(`{"context":{"targetingKey":"u1"}}`))
	req.Header.Set("X-API-Key", "hlk_test")
	mux.ServeHTTP(rec, req)
	require.Equal(t, http.StatusInternalServerError, rec.Code)
	var one map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &one))
	require.Equal(t, "GENERAL", one["errorCode"])
	require.Equal(t, "ERROR", one["reason"])
	_, hasValue := one["value"]
	require.False(t, hasValue)

	rec = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPost, "/ofrep/v1/evaluate/flags", bytes.NewBufferString(`{"context":{"targetingKey":"u1"}}`))
	req.Header.Set("X-API-Key", "hlk_test")
	mux.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)
	var bulk map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &bulk))
	flags, ok := bulk["flags"].([]any)
	require.True(t, ok)
	require.Len(t, flags, 1)
	item, ok := flags[0].(map[string]any)
	require.True(t, ok)
	require.Equal(t, "GENERAL", item["errorCode"])
	require.Equal(t, "empty-config", item["key"])
}

func TestOFREPGeneralErrorIncludesCode(t *testing.T) {
	handler := NewOFREPHandler(nil)
	mux := http.NewServeMux()
	handler.Register(mux)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/ofrep/v1/evaluate/flags/checkout-cta", bytes.NewBufferString(`{"context":{"targetingKey":"u1"}}`))
	req.Header.Set("X-API-Key", "hlk_test")
	mux.ServeHTTP(rec, req)
	require.Equal(t, http.StatusInternalServerError, rec.Code)
	require.Contains(t, rec.Body.String(), `"errorCode":"GENERAL"`)
}
