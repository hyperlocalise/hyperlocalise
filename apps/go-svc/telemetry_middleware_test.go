package main

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/propagation"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/sdk/trace/tracetest"
)

// OTel globals are process-wide, so tests using this helper must not run in parallel.
func withTestSpanRecorder(t *testing.T) *tracetest.SpanRecorder {
	t.Helper()
	rec := tracetest.NewSpanRecorder()
	tp := sdktrace.NewTracerProvider(sdktrace.WithSpanProcessor(rec))
	prevProvider := otel.GetTracerProvider()
	prevPropagator := otel.GetTextMapPropagator()
	otel.SetTracerProvider(tp)
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{}, propagation.Baggage{},
	))
	t.Cleanup(func() {
		otel.SetTracerProvider(prevProvider)
		otel.SetTextMapPropagator(prevPropagator)
	})
	return rec
}

func spanStringAttr(span sdktrace.ReadOnlySpan, key string) (string, bool) {
	for _, kv := range span.Attributes() {
		if string(kv.Key) == key {
			return kv.Value.AsString(), true
		}
	}
	return "", false
}

func requireSpanStringAttr(t *testing.T, span sdktrace.ReadOnlySpan, key string) string {
	t.Helper()
	v, ok := spanStringAttr(span, key)
	require.True(t, ok, "span %q missing attribute %q (attrs=%+v)", span.Name(), key, span.Attributes())
	return v
}

func spanAttrKeys(span sdktrace.ReadOnlySpan) []string {
	keys := make([]string, 0, len(span.Attributes()))
	for _, kv := range span.Attributes() {
		keys = append(keys, string(kv.Key))
	}
	return keys
}

func tracedTestMux(routes map[string]http.HandlerFunc) http.Handler {
	mux := http.NewServeMux()
	for pattern, handler := range routes {
		mux.Handle(pattern, handler)
	}
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	return tracingMiddleware(mux)
}

func TestTracingMiddlewarePropagatesIncomingTraceContext(t *testing.T) {
	rec := withTestSpanRecorder(t)
	handler := tracedTestMux(map[string]http.HandlerFunc{
		"GET /v1/orgs/{organizationSlug}/dictionaries": func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		},
	})

	const incomingTraceID = "4bf92f3577b34da6a3ce929d0e0e4736"
	const incomingSpanID = "00f067aa0ba902b7"
	req := httptest.NewRequest(http.MethodGet, "/v1/orgs/acme-corp/dictionaries", nil)
	req.Header.Set("traceparent", fmt.Sprintf("00-%s-%s-01", incomingTraceID, incomingSpanID))

	handler.ServeHTTP(httptest.NewRecorder(), req)

	spans := rec.Ended()
	require.Len(t, spans, 1)
	require.Equal(t, incomingTraceID, spans[0].SpanContext().TraceID().String(),
		"span should continue the incoming trace, not start a new one")
	require.True(t, spans[0].Parent().IsRemote())
	require.Equal(t, incomingSpanID, spans[0].Parent().SpanID().String())
}

func TestTracingMiddlewareStartsNewTraceWithoutIncomingHeader(t *testing.T) {
	rec := withTestSpanRecorder(t)
	handler := tracedTestMux(map[string]http.HandlerFunc{
		"GET /v1/validate/segment": func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		},
	})

	req := httptest.NewRequest(http.MethodGet, "/v1/validate/segment", nil)
	handler.ServeHTTP(httptest.NewRecorder(), req)

	spans := rec.Ended()
	require.Len(t, spans, 1)
	require.False(t, spans[0].Parent().IsValid(), "no traceparent header means no parent span context")
}

func TestHTTPRouteFromPattern(t *testing.T) {
	tests := []struct {
		pattern string
		want    string
	}{
		{pattern: "", want: "unmatched"},
		{pattern: "/v1/orgs/{organizationSlug}/dictionaries", want: "/v1/orgs/{organizationSlug}/dictionaries"},
		{pattern: "GET /v1/orgs/{organizationSlug}/dictionaries", want: "/v1/orgs/{organizationSlug}/dictionaries"},
		{pattern: "POST /v1/validate/segment", want: "/v1/validate/segment"},
		{pattern: "GET example.com/v1/orgs/{organizationSlug}/dictionaries", want: "example.com/v1/orgs/{organizationSlug}/dictionaries"},
	}
	for _, tc := range tests {
		require.Equal(t, tc.want, httpRouteFromPattern(tc.pattern), tc.pattern)
	}
}

func TestTracingMiddlewareUsesRegisteredDictionaryEndpoint(t *testing.T) {
	rec := withTestSpanRecorder(t)
	mux := http.NewServeMux()
	api := &dictionaryAPI{}
	api.register(mux, stubSessionVerifier{claims: AuthClaims{UserID: "user_live"}})
	handler := tracingMiddleware(mux)

	req := httptest.NewRequest(http.MethodGet, "/v1/orgs/acme-corp/dictionaries", nil)
	req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "session"})
	handler.ServeHTTP(httptest.NewRecorder(), req)

	spans := rec.Ended()
	require.Len(t, spans, 1)
	const pattern = "/v1/orgs/{organizationSlug}/dictionaries"
	require.Equal(t, "GET "+pattern, spans[0].Name())
	require.Equal(t, pattern, requireSpanStringAttr(t, spans[0], "http.route"))
	require.NotContains(t, spans[0].Name(), "acme-corp")
}

func TestTracingMiddlewareStripsMatchedGetVerbFromHeadRoute(t *testing.T) {
	rec := withTestSpanRecorder(t)
	const pattern = "/v1/orgs/{organizationSlug}/dictionaries"
	handler := tracedTestMux(map[string]http.HandlerFunc{
		"GET " + pattern: func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		},
	})

	req := httptest.NewRequest(http.MethodHead, "/v1/orgs/acme-corp/dictionaries", nil)
	handler.ServeHTTP(httptest.NewRecorder(), req)

	spans := rec.Ended()
	require.Len(t, spans, 1)
	require.Equal(t, "HEAD "+pattern, spans[0].Name())
	require.Equal(t, pattern, requireSpanStringAttr(t, spans[0], "http.route"))
	require.Equal(t, "HEAD", requireSpanStringAttr(t, spans[0], "http.request.method"))
	require.NotContains(t, spans[0].Name(), "GET")
}

func TestTracingMiddlewareUsesBoundedRouteTemplate(t *testing.T) {
	rec := withTestSpanRecorder(t)
	const pattern = "/v1/orgs/{organizationSlug}/dictionaries"
	handler := tracedTestMux(map[string]http.HandlerFunc{
		pattern: func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusOK) },
	})

	req := httptest.NewRequest(http.MethodGet, "/v1/orgs/acme-corp/dictionaries", nil)
	handler.ServeHTTP(httptest.NewRecorder(), req)

	spans := rec.Ended()
	require.Len(t, spans, 1)
	span := spans[0]
	require.Equal(t, "GET "+pattern, span.Name())
	require.Equal(t, pattern, requireSpanStringAttr(t, span, "http.route"))
	require.NotContains(t, span.Name(), "acme-corp")
	require.NotContains(t, requireSpanStringAttr(t, span, "http.route"), "acme-corp")
}

func TestTracingMiddlewareUnmatchedRouteDoesNotLeakPath(t *testing.T) {
	rec := withTestSpanRecorder(t)
	handler := tracedTestMux(nil)

	req := httptest.NewRequest(http.MethodGet, "/v1/orgs/acme-corp/totally-unregistered-path", nil)
	handler.ServeHTTP(httptest.NewRecorder(), req)

	spans := rec.Ended()
	require.Len(t, spans, 1)
	require.Equal(t, "GET unmatched", spans[0].Name())
	require.Equal(t, "unmatched", requireSpanStringAttr(t, spans[0], "http.route"))
}

func TestTracingMiddlewareCapturesMethodStatusAndErrors(t *testing.T) {
	tests := []struct {
		name     string
		status   int
		wantCode codes.Code
	}{
		{name: "200 ok", status: http.StatusOK, wantCode: codes.Unset},
		{name: "400 bad request", status: http.StatusBadRequest, wantCode: codes.Unset},
		{name: "500 internal error", status: http.StatusInternalServerError, wantCode: codes.Error},
		{name: "503 unavailable", status: http.StatusServiceUnavailable, wantCode: codes.Error},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			rec := withTestSpanRecorder(t)
			handler := tracedTestMux(map[string]http.HandlerFunc{
				"POST /v1/validate/segment": func(w http.ResponseWriter, r *http.Request) {
					w.WriteHeader(tc.status)
				},
			})

			req := httptest.NewRequest(http.MethodPost, "/v1/validate/segment", nil)
			handler.ServeHTTP(httptest.NewRecorder(), req)

			spans := rec.Ended()
			require.Len(t, spans, 1)
			require.Equal(t, "POST", requireSpanStringAttr(t, spans[0], "http.request.method"))
			statusAttr, ok := func() (int64, bool) {
				for _, kv := range spans[0].Attributes() {
					if string(kv.Key) == "http.response.status_code" {
						return kv.Value.AsInt64(), true
					}
				}
				return 0, false
			}()
			require.True(t, ok, "missing http.response.status_code attribute")
			require.Equal(t, int64(tc.status), statusAttr)
			require.Equal(t, tc.wantCode, spans[0].Status().Code)
		})
	}
}

func TestTracingMiddlewareImplicit200WhenHandlerNeverWritesHeader(t *testing.T) {
	rec := withTestSpanRecorder(t)
	handler := tracedTestMux(map[string]http.HandlerFunc{
		"GET /v1/validate/segment": func(w http.ResponseWriter, r *http.Request) {
			_, _ = w.Write([]byte("ok"))
		},
	})

	req := httptest.NewRequest(http.MethodGet, "/v1/validate/segment", nil)
	handler.ServeHTTP(httptest.NewRecorder(), req)

	spans := rec.Ended()
	require.Len(t, spans, 1)
	require.Equal(t, codes.Unset, spans[0].Status().Code)
}

func TestTracingMiddlewareSkipsHealthCheck(t *testing.T) {
	rec := withTestSpanRecorder(t)
	handler := tracedTestMux(nil)

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code)

	require.Empty(t, rec.Ended(), "health checks must not produce spans")
}

func TestTracingMiddlewareTracesNonGetHealth(t *testing.T) {
	rec := withTestSpanRecorder(t)
	handler := tracedTestMux(nil)

	req := httptest.NewRequest(http.MethodPost, "/health", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)
	require.Equal(t, http.StatusMethodNotAllowed, w.Code)

	spans := rec.Ended()
	require.Len(t, spans, 1)
	for _, span := range spans {
		require.Equal(t, "POST unmatched", span.Name())
		require.Equal(t, "unmatched", requireSpanStringAttr(t, span, "http.route"))
		require.Equal(t, "POST", requireSpanStringAttr(t, span, "http.request.method"))
		statusAttr, ok := func() (int64, bool) {
			for _, kv := range span.Attributes() {
				if string(kv.Key) == "http.response.status_code" {
					return kv.Value.AsInt64(), true
				}
			}
			return 0, false
		}()
		require.True(t, ok, "missing http.response.status_code attribute")
		require.Equal(t, int64(http.StatusMethodNotAllowed), statusAttr)
	}
}

func TestTracingMiddlewareOmitsSensitiveAttributes(t *testing.T) {
	rec := withTestSpanRecorder(t)
	handler := tracedTestMux(map[string]http.HandlerFunc{
		"POST /v1/validate/segment": func(w http.ResponseWriter, r *http.Request) {
			_, _ = w.Write([]byte("ok"))
		},
	})

	req := httptest.NewRequest(http.MethodPost, "/v1/validate/segment", nil)
	req.Header.Set("Authorization", "Bearer super-secret-token")
	req.Header.Set("Cookie", "wos-session=super-secret-session")
	handler.ServeHTTP(httptest.NewRecorder(), req)

	spans := rec.Ended()
	require.Len(t, spans, 1)

	allowed := map[string]bool{
		"http.request.method":       true,
		"http.route":                true,
		"http.response.status_code": true,
	}
	for _, key := range spanAttrKeys(spans[0]) {
		require.True(t, allowed[key], "unexpected span attribute %q may leak sensitive data", key)
	}
	for _, kv := range spans[0].Attributes() {
		require.NotContains(t, kv.Value.String(), "super-secret")
	}
}
