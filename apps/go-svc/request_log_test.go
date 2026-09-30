package main

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
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
	require.True(t, strings.HasPrefix(entry["msg"].(string), "POST /v1/validate/segment 401 "))
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
	handler := tracingMiddleware(requestLogMiddleware(mux))

	req := httptest.NewRequest(http.MethodPost, "/v1/validate/segment", nil)
	handler.ServeHTTP(httptest.NewRecorder(), req)

	spans := rec.Ended()
	require.Len(t, spans, 1)
	require.Equal(t, "POST /v1/validate/segment", spans[0].Name())
	require.Equal(t, "/v1/validate/segment", requireSpanStringAttr(t, spans[0], "http.route"))
	wantTraceID := spans[0].SpanContext().TraceID().String()
	wantSpanID := spans[0].SpanContext().SpanID().String()

	entry := findLogEntryPrefix(t, &buf, "POST /v1/validate/segment 200 ")
	require.Equal(t, wantTraceID, entry["dd.trace_id"])
	require.Equal(t, wantSpanID, entry["dd.span_id"])
	require.Equal(t, "go-svc", entry["dd.service"])
}

func TestRequestAccessLogPathBounding(t *testing.T) {
	tests := []struct {
		name       string
		method     string
		path       string
		wantLogged string
	}{
		{
			name:       "unbounded route keeps full public path",
			method:     http.MethodPost,
			path:       "/v1/validate/segment",
			wantLogged: "/v1/validate/segment",
		},
		{
			name:       "bounded org route keeps prefix and bounding",
			method:     http.MethodGet,
			path:       "/v1/orgs/acme-corp/dictionaries",
			wantLogged: "/v1/orgs/{organizationSlug}/dictionaries/{resource}",
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
			handler := tracingMiddleware(requestLogMiddleware(mux))

			req := httptest.NewRequest(tc.method, tc.path, nil)
			handler.ServeHTTP(httptest.NewRecorder(), req)

			spans := rec.Ended()
			require.Len(t, spans, 1)
			wantTraceID := spans[0].SpanContext().TraceID().String()
			wantSpanID := spans[0].SpanContext().SpanID().String()

			entry := findLogEntryPrefix(t, &buf, tc.method+" ")
			require.Contains(t, entry["msg"], " 200 ")
			require.Equal(t, tc.wantLogged, entry["path"])
			require.NotContains(t, entry["path"], "acme-corp")
			require.Equal(t, wantTraceID, entry["dd.trace_id"])
			require.Equal(t, wantSpanID, entry["dd.span_id"])
		})
	}
}

func TestRequestLogMiddlewarePreservesMuxPatternForTracing(t *testing.T) {
	rec := withTestSpanRecorder(t)
	mux := http.NewServeMux()
	mux.HandleFunc("POST /v1/validate/segment", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	handler := tracingMiddleware(requestLogMiddleware(corsMiddleware(mux)))

	req := httptest.NewRequest(http.MethodPost, "/v1/validate/segment", nil)
	handler.ServeHTTP(httptest.NewRecorder(), req)

	spans := rec.Ended()
	require.Len(t, spans, 1)
	require.Equal(t, "POST /v1/validate/segment", spans[0].Name())
	require.Equal(t, "/v1/validate/segment", requireSpanStringAttr(t, spans[0], "http.route"))
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

func TestRequestLogCarriesHandlerOutcome(t *testing.T) {
	var buf bytes.Buffer
	previous := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&buf, nil)))
	t.Cleanup(func() { slog.SetDefault(previous) })

	mux := http.NewServeMux()
	mux.HandleFunc("GET /v1/orgs/{organizationSlug}/projects/{projectId}/files/detail/cat/queue", func(w http.ResponseWriter, r *http.Request) {
		noteRequest(r,
			"queue_kind", "text",
			"target_locale", "de-DE",
			"queue_filter", "all",
			"segments", 20,
			"total", 140,
		)
		logRequestFailure(r, "editor_cat_request_failed", "handle", editorCatFailure(404, "project_not_found", "Project not found"),
			"status", 404, "code", "project_not_found")
		w.WriteHeader(http.StatusNotFound)
	})
	handler := requestLogMiddleware(mux)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/v1/orgs/acme/projects/project_1/files/detail/cat/queue?sourcePath=lang/en-US.json&search=hello", nil)
	handler.ServeHTTP(rec, req)

	require.Equal(t, http.StatusNotFound, rec.Code)
	lines := strings.Split(strings.TrimSpace(buf.String()), "\n")
	require.Len(t, lines, 1)

	var entry map[string]any
	require.NoError(t, json.Unmarshal([]byte(lines[0]), &entry))
	message := entry["msg"].(string)
	require.Contains(t, message, "GET /v1/orgs/{organizationSlug}/projects/{projectId}/files/detail/cat/queue 404 ")
	require.Contains(t, message, "editor_cat_request_failed")
	require.Contains(t, message, "phase=handle")
	require.Contains(t, message, "code=project_not_found")
	require.Contains(t, message, "queue_filter=all")
	require.Contains(t, message, "target_locale=de-DE")
	require.Contains(t, message, "segments=20")
	require.Contains(t, message, "total=140")
	require.NotContains(t, message, "lang/en-US.json")
	require.NotContains(t, message, "hello")
	require.NotContains(t, message, "acme")
	require.Equal(t, "WARN", entry["level"])
	require.Equal(t, "project_not_found", entry["code"])
	require.Equal(t, float64(20), entry["segments"])
}

func findLogEntryPrefix(t *testing.T, buf *bytes.Buffer, prefix string) map[string]any {
	t.Helper()
	for _, line := range strings.Split(strings.TrimSpace(buf.String()), "\n") {
		if line == "" {
			continue
		}
		var entry map[string]any
		require.NoError(t, json.Unmarshal([]byte(line), &entry))
		message, _ := entry["msg"].(string)
		if strings.HasPrefix(message, prefix) {
			return entry
		}
	}
	t.Fatalf("no log line with prefix %q found in: %s", prefix, buf.String())
	return nil
}
