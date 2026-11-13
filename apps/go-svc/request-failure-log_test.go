package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/require"
)

func TestWriteEditorCatErrorLogsQueryCallSite(t *testing.T) {
	var buf bytes.Buffer
	previous := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&buf, nil)))
	t.Cleanup(func() { slog.SetDefault(previous) })

	req := httptest.NewRequest(http.MethodGet, "/v1/orgs/acme/projects/project_1/files/detail/cat/queue?sourcePath=lang/en-US.json&queueFilter=all&queueSort=file_order", nil)
	req = req.WithContext(context.WithValue(req.Context(), authContextKey{}, AuthClaims{UserID: "user_01"}))
	req.Header.Set("X-Request-Id", "req-1")
	err := &dbError{
		caller:       "editor-cat-queue.go:410 listKeys",
		sql:          "select count(*) from project_translation_keys k where k.organization_id=$1 and k.project_id=$2 and k.repository_source_file_id=$3",
		argCount:     4,
		placeholders: 3,
		err:          errors.New("expected 3 arguments, got 4"),
	}
	rec := httptest.NewRecorder()
	writeEditorCatError(rec, req, "handle", err)

	require.Equal(t, http.StatusInternalServerError, rec.Code)
	require.NotContains(t, rec.Body.String(), "expected 3 arguments")
	require.NotContains(t, rec.Body.String(), "project_translation_keys")

	var entry map[string]any
	require.NoError(t, json.Unmarshal(buf.Bytes(), &entry))
	require.Equal(t, "editor_cat_request_failed", entry["msg"])
	require.Equal(t, "handle", entry["phase"])
	require.Equal(t, "GET", entry["method"])
	require.Equal(t, "req-1", entry["request_id"])
	require.Equal(t, "user_01", entry["user_id"])
	require.Equal(t, "all", entry["queue_filter"])
	require.Equal(t, "file_order", entry["queue_sort"])
	require.Contains(t, entry["error"], "editor-cat-queue.go:410 listKeys")
	require.Contains(t, entry["error"], "expected 3 arguments, got 4")
	require.Equal(t, "editor-cat-queue.go:410 listKeys", entry["db_caller"])
	require.Contains(t, entry["db_sql"], "project_translation_keys")
	require.Equal(t, float64(4), entry["db_arg_count"])
	require.Equal(t, float64(3), entry["db_placeholders"])
	require.NotContains(t, buf.String(), "lang/en-US.json")
}

func TestLogRequestFailureIncludesPostgresFields(t *testing.T) {
	var buf bytes.Buffer
	previous := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&buf, nil)))
	t.Cleanup(func() { slog.SetDefault(previous) })

	req := httptest.NewRequest(http.MethodGet, "/v1/orgs/acme/dictionaries", nil)
	logRequestFailure(req, "dictionary_request_failed", "handle", &pgconn.PgError{
		Severity:  "ERROR",
		Code:      "42P01",
		Message:   `relation "spellcheck_word_libraries" does not exist`,
		TableName: "spellcheck_word_libraries",
	})

	var entry map[string]any
	require.NoError(t, json.Unmarshal(buf.Bytes(), &entry))
	require.Equal(t, "42P01", entry["pg_code"])
	require.Equal(t, "ERROR", entry["pg_severity"])
	require.Equal(t, "spellcheck_word_libraries", entry["pg_table"])
	require.Contains(t, entry["error"], "spellcheck_word_libraries")
}
