package main

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestRequestLogMiddlewareRecordsStatus(t *testing.T) {
	var buf bytes.Buffer
	previous := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&buf, nil)))
	t.Cleanup(func() { slog.SetDefault(previous) })

	handler := requestLogMiddleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"error":"unauthorized"}`))
	}))

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/v1/validate/segment", nil)
	req.Header.Set("X-Vercel-Id", "iad1::abc")
	handler.ServeHTTP(rec, req)

	require.Equal(t, http.StatusUnauthorized, rec.Code)

	var entry map[string]any
	require.NoError(t, json.Unmarshal(buf.Bytes(), &entry))
	require.Equal(t, "request", entry["msg"])
	require.Equal(t, "POST", entry["method"])
	require.Equal(t, "/v1/validate/segment", entry["path"])
	require.Equal(t, float64(http.StatusUnauthorized), entry["status"])
	require.Equal(t, "iad1::abc", entry["request_id"])
	require.NotContains(t, buf.String(), "wos-session")
}

func TestRequestLogMiddlewareSkipsHealth(t *testing.T) {
	var buf bytes.Buffer
	previous := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&buf, nil)))
	t.Cleanup(func() { slog.SetDefault(previous) })

	handler := requestLogMiddleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	handler.ServeHTTP(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	require.Empty(t, buf.String())
}
