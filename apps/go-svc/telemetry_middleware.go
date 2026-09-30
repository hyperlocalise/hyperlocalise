package main

import (
	"fmt"
	"net/http"
	"strings"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/propagation"
	semconv "go.opentelemetry.io/otel/semconv/v1.43.0"
	"go.opentelemetry.io/otel/trace"
)

// Unknown methods use _OTHER plus the original method per OTel semconv.
var knownHTTPMethods = map[string]attribute.KeyValue{
	http.MethodConnect: semconv.HTTPRequestMethodConnect,
	http.MethodDelete:  semconv.HTTPRequestMethodDelete,
	http.MethodGet:     semconv.HTTPRequestMethodGet,
	http.MethodHead:    semconv.HTTPRequestMethodHead,
	http.MethodOptions: semconv.HTTPRequestMethodOptions,
	http.MethodPatch:   semconv.HTTPRequestMethodPatch,
	http.MethodPost:    semconv.HTTPRequestMethodPost,
	http.MethodPut:     semconv.HTTPRequestMethodPut,
	http.MethodTrace:   semconv.HTTPRequestMethodTrace,
}

// httpRouteFromPattern returns the host/path from a ServeMux pattern.
// Patterns are "[METHOD ][HOST]/[PATH]". Strip the method independently of
// the request method so HEAD on a GET route does not keep "GET" in http.route.
func httpRouteFromPattern(pattern string) string {
	if pattern == "" {
		return "unmatched"
	}
	if _, rest, ok := strings.Cut(pattern, " "); ok {
		return rest
	}
	return pattern
}

func httpRequestMethodAttrs(method string) []attribute.KeyValue {
	if attr, ok := knownHTTPMethods[method]; ok {
		return []attribute.KeyValue{attr}
	}
	return []attribute.KeyValue{semconv.HTTPRequestMethodOther, semconv.HTTPRequestMethodOriginal(method)}
}

// tracingMiddleware reads r.Pattern after next returns. Inner middleware that
// calls Request.WithContext must copy Pattern back onto this request.
func tracingMiddleware(next http.Handler) http.Handler {
	tracer := otel.Tracer(otelInstrumentation)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet && isHealthPath(r.URL.Path) {
			next.ServeHTTP(w, r)
			return
		}

		ctx := otel.GetTextMapPropagator().Extract(r.Context(), propagation.HeaderCarrier(r.Header))
		ctx, span := tracer.Start(ctx, "HTTP "+r.Method, trace.WithSpanKind(trace.SpanKindServer))
		defer span.End()
		r = r.WithContext(ctx)

		rec := &statusRecorder{ResponseWriter: w, status: 0}
		next.ServeHTTP(rec, r)

		route := httpRouteFromPattern(r.Pattern)
		span.SetName(r.Method + " " + route)

		status := rec.status
		if status == 0 {
			status = http.StatusOK
		}
		attrs := append(httpRequestMethodAttrs(r.Method),
			semconv.HTTPRoute(route), semconv.HTTPResponseStatusCode(status))
		span.SetAttributes(attrs...)
		if status >= http.StatusInternalServerError {
			span.SetStatus(codes.Error, fmt.Sprintf("HTTP %d", status))
		}
	})
}
