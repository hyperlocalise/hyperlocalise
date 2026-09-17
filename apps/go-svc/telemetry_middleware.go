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

func httpRequestMethodAttrs(method string) []attribute.KeyValue {
	if attr, ok := knownHTTPMethods[method]; ok {
		return []attribute.KeyValue{attr}
	}
	return []attribute.KeyValue{semconv.HTTPRequestMethodOther, semconv.HTTPRequestMethodOriginal(method)}
}

// Must wrap ServeMux directly so tracing observes the request with Pattern populated.
func tracingMiddleware(next http.Handler) http.Handler {
	tracer := otel.Tracer(otelInstrumentation)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if isHealthPath(r.URL.Path) {
			next.ServeHTTP(w, r)
			return
		}

		ctx := otel.GetTextMapPropagator().Extract(r.Context(), propagation.HeaderCarrier(r.Header))
		ctx, span := tracer.Start(ctx, "HTTP "+r.Method, trace.WithSpanKind(trace.SpanKindServer))
		defer span.End()
		r = r.WithContext(ctx)

		rec := &statusRecorder{ResponseWriter: w, status: 0}
		next.ServeHTTP(rec, r)

		route := r.Pattern
		if route == "" {
			route = "unmatched"
		} else if rest, ok := strings.CutPrefix(route, r.Method+" "); ok {
			route = rest
		}
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
