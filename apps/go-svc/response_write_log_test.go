package main

import (
	"bytes"
	"context"
	"errors"
	"log/slog"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"
	"go.opentelemetry.io/otel/trace"
)

type failingResponseWriter struct {
	header http.Header
	status int
}

func (w *failingResponseWriter) Header() http.Header {
	if w.header == nil {
		w.header = make(http.Header)
	}
	return w.header
}

func (w *failingResponseWriter) WriteHeader(status int) {
	w.status = status
}

func (w *failingResponseWriter) Write([]byte) (int, error) {
	return 0, errors.New("write failed")
}

func TestResponseWriteFailureLogsCarryRequestSpan(t *testing.T) {
	const (
		traceIDHex = "4bf92f3577b34da6a3ce929d0e0e4736"
		spanIDHex  = "00f067aa0ba902b7"
	)
	ctx := trace.ContextWithSpanContext(
		context.Background(),
		testSpanContext(t, traceIDHex, spanIDHex, false),
	)

	tests := []struct {
		name    string
		message string
		write   func(ctx context.Context, w http.ResponseWriter)
	}{
		{
			name:    "dictionary json",
			message: "dictionary_response_write_failed",
			write: func(ctx context.Context, w http.ResponseWriter) {
				dictionaryJSON(ctx, w, http.StatusOK, map[string]string{"ok": "true"})
			},
		},
		{
			name:    "dictionary export",
			message: "dictionary_export_write_failed",
			write: func(ctx context.Context, w http.ResponseWriter) {
				writeDictionaryExport(ctx, w, http.StatusOK, dictionaryExport{locale: "en", body: "word\n"})
			},
		},
		{
			name:    "qa report json",
			message: "qa_report_json_encode_failed",
			write: func(ctx context.Context, w http.ResponseWriter) {
				qaReportJSON(ctx, w, http.StatusOK, map[string]string{"ok": "true"})
			},
		},
		{
			name:    "team json",
			message: "team_response_write_failed",
			write: func(ctx context.Context, w http.ResponseWriter) {
				teamJSON(ctx, w, http.StatusOK, map[string]string{"ok": "true"})
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			var buf bytes.Buffer
			previous := slog.Default()
			slog.SetDefault(slog.New(newTestDatadogHandler(&buf, slog.String("dd.service", "go-svc"))))
			t.Cleanup(func() { slog.SetDefault(previous) })

			tc.write(ctx, &failingResponseWriter{})

			entry := decodeLogLine(t, &buf)
			require.Equal(t, tc.message, entry["msg"])
			require.Equal(t, "WARN", entry["level"])
			require.Equal(t, "go-svc", entry["dd.service"])
			require.Equal(t, traceIDHex, entry["dd.trace_id"])
			require.Equal(t, spanIDHex, entry["dd.span_id"])
		})
	}
}
