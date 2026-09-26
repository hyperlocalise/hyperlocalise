package main

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/require"
)

func TestRecordDictionaryFailureLogsInternalError(t *testing.T) {
	var buf bytes.Buffer
	previous := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&buf, nil)))
	t.Cleanup(func() { slog.SetDefault(previous) })

	req := httptest.NewRequest(http.MethodGet, "/v1/orgs/acme/dictionaries", nil)
	req.Header.Set("X-Vercel-Id", "syd1::req-1")
	req = req.WithContext(context.WithValue(req.Context(), authContextKey{}, AuthClaims{UserID: "user_01"}))

	recordDictionaryFailure(req, "handle", &pgconn.PgError{Code: "42P01", Message: `relation "spellcheck_word_libraries" does not exist`})

	var entry map[string]any
	require.NoError(t, json.Unmarshal(buf.Bytes(), &entry))
	require.Equal(t, "dictionary_request_failed", entry["msg"])
	require.Equal(t, "handle", entry["phase"])
	require.Equal(t, "syd1::req-1", entry["request_id"])
	require.Equal(t, "user_01", entry["user_id"])
	require.Equal(t, "42P01", entry["pg_code"])
	require.Contains(t, entry["error"], "spellcheck_word_libraries")
}

func TestRecordDictionaryFailureLogsClientErrors(t *testing.T) {
	var buf bytes.Buffer
	previous := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&buf, nil)))
	t.Cleanup(func() { slog.SetDefault(previous) })

	req := httptest.NewRequest(http.MethodGet, "/v1/orgs/acme/dictionaries", nil)
	recordDictionaryFailure(req, "resolve_actor", dictionaryFailure(403, "organization_access_denied", "Organization access denied"))

	var entry map[string]any
	require.NoError(t, json.Unmarshal(buf.Bytes(), &entry))
	require.Equal(t, "dictionary_request_failed", entry["msg"])
	require.Equal(t, "resolve_actor", entry["phase"])
	require.Equal(t, "organization_access_denied", entry["code"])
	require.Equal(t, "WARN", entry["level"])
	require.NotContains(t, buf.String(), "acme")
}
