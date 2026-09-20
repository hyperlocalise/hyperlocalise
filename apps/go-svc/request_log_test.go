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

func TestRequestAccessLogCorrelatesWithRecordedSpan(t *testing.T) {
	rec := withTestSpanRecorder(t)

	var buf bytes.Buffer
	previous := slog.Default()
	slog.SetDefault(slog.New(newTestDatadogHandler(&buf, slog.String("dd.service", "go-svc"))))
	t.Cleanup(func() { slog.SetDefault(previous) })

	mux := http.NewServeMux()
	mux.HandleFunc("POST /v1/validate/segment", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	handler := withOptionalPrefix(publicPathPrefix, tracingMiddleware(requestLogMiddleware(mux)))

	req := httptest.NewRequest(http.MethodPost, "/v1/validate/segment", nil)
	handler.ServeHTTP(httptest.NewRecorder(), req)

	spans := rec.Ended()
	require.Len(t, spans, 1)
	wantTraceID := spans[0].SpanContext().TraceID().String()
	wantSpanID := spans[0].SpanContext().SpanID().String()

	entry := findLogEntry(t, &buf, "request")
	require.Equal(t, wantTraceID, entry["dd.trace_id"])
	require.Equal(t, wantSpanID, entry["dd.span_id"])
	require.Equal(t, "go-svc", entry["dd.service"])
}

func TestRequestAccessLogPreservesPublicPathPrefix(t *testing.T) {
	tests := []struct {
		name       string
		method     string
		path       string
		wantLogged string
	}{
		{
			name:       "unbounded route keeps full public path",
			method:     http.MethodPost,
			path:       publicPathPrefix + "/v1/validate/segment",
			wantLogged: publicPathPrefix + "/v1/validate/segment",
		},
		{
			name:       "bounded org route keeps prefix and bounding",
			method:     http.MethodGet,
			path:       publicPathPrefix + "/v1/orgs/acme-corp/dictionaries",
			wantLogged: publicPathPrefix + "/v1/orgs/{organizationSlug}/dictionaries/{resource}",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			rec := withTestSpanRecorder(t)

			var buf bytes.Buffer
			previous := slog.Default()
			slog.SetDefault(slog.New(newTestDatadogHandler(&buf, slog.String("dd.service", "go-svc"))))
			t.Cleanup(func() { slog.SetDefault(previous) })

			mux := http.NewServeMux()
			mux.HandleFunc("POST /v1/validate/segment", func(w http.ResponseWriter, _ *http.Request) {
				w.WriteHeader(http.StatusOK)
			})
			mux.HandleFunc("GET /v1/orgs/{organizationSlug}/dictionaries", func(w http.ResponseWriter, _ *http.Request) {
				w.WriteHeader(http.StatusOK)
			})
			handler := withOptionalPrefix(publicPathPrefix, tracingMiddleware(requestLogMiddleware(mux)))

			req := httptest.NewRequest(tc.method, tc.path, nil)
			handler.ServeHTTP(httptest.NewRecorder(), req)

			spans := rec.Ended()
			require.Len(t, spans, 1)
			wantTraceID := spans[0].SpanContext().TraceID().String()
			wantSpanID := spans[0].SpanContext().SpanID().String()

			entry := findLogEntry(t, &buf, "request")
			require.Equal(t, tc.wantLogged, entry["path"])
			require.NotContains(t, entry["path"], "acme-corp")
			require.Equal(t, wantTraceID, entry["dd.trace_id"])
			require.Equal(t, wantSpanID, entry["dd.span_id"])
		})
	}
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
