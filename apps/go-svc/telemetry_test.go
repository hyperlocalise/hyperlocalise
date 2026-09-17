package main

import (
	"context"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/baggage"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	semconv "go.opentelemetry.io/otel/semconv/v1.43.0"
	"go.opentelemetry.io/otel/trace"
)

func TestTelemetryEnabled(t *testing.T) {
	tests := []struct {
		name         string
		sdkDisabled  string
		otlpEndpoint string
		otlpTraces   string
		want         bool
	}{
		{name: "nothing configured", want: false},
		{name: "endpoint set", otlpEndpoint: "http://collector:4318", want: true},
		{name: "traces-only endpoint set", otlpTraces: "http://collector:4318/v1/traces", want: true},
		{name: "sdk disabled overrides endpoint", sdkDisabled: "true", otlpEndpoint: "http://collector:4318", want: false},
		{name: "sdk disabled is case-insensitive", sdkDisabled: "TRUE", otlpEndpoint: "http://collector:4318", want: false},
		{name: "sdk disabled false leaves endpoint effective", sdkDisabled: "false", otlpEndpoint: "http://collector:4318", want: true},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("OTEL_SDK_DISABLED", tc.sdkDisabled)
			t.Setenv("OTEL_EXPORTER_OTLP_ENDPOINT", tc.otlpEndpoint)
			t.Setenv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT", tc.otlpTraces)

			require.Equal(t, tc.want, telemetryEnabled())
		})
	}
}

func TestInitTelemetryWhenDisabled(t *testing.T) {
	t.Setenv("OTEL_SDK_DISABLED", "")
	t.Setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "")
	t.Setenv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT", "")

	shutdown, err := initTelemetry(context.Background())

	require.NoError(t, err)
	require.Nil(t, shutdown)
}

func TestInitTelemetryWhenEnabled(t *testing.T) {
	t.Setenv("OTEL_SDK_DISABLED", "")
	t.Setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://127.0.0.1:1")
	t.Setenv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT", "")
	t.Setenv("OTEL_RESOURCE_ATTRIBUTES", "")
	t.Setenv("OTEL_SERVICE_NAME", "")

	tests := []struct {
		name      string
		commitSHA string
		vercelEnv string
	}{
		{name: "required resource attributes only"},
		{name: "vercel version and environment", commitSHA: "abc123def", vercelEnv: "preview"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("VERCEL_GIT_COMMIT_SHA", tc.commitSHA)
			t.Setenv("VERCEL_ENV", tc.vercelEnv)

			prevProvider := otel.GetTracerProvider()
			prevPropagator := otel.GetTextMapPropagator()
			t.Cleanup(func() {
				otel.SetTracerProvider(prevProvider)
				otel.SetTextMapPropagator(prevPropagator)
			})

			shutdown, err := initTelemetry(context.Background())
			require.NoError(t, err)
			require.NotNil(t, shutdown)
			t.Cleanup(func() {
				require.NoError(t, shutdown(context.Background()))
			})

			_, span := otel.Tracer(otelInstrumentation).Start(context.Background(), "init-probe")
			res := spanResource(t, span)
			requireResourceAttr(t, res, semconv.ServiceNameKey, otelServiceName)
			if tc.commitSHA == "" {
				requireNoResourceAttr(t, res, semconv.ServiceVersionKey)
			} else {
				requireResourceAttr(t, res, semconv.ServiceVersionKey, tc.commitSHA)
			}
			if tc.vercelEnv == "" {
				requireNoResourceAttr(t, res, semconv.DeploymentEnvironmentNameKey)
			} else {
				requireResourceAttr(t, res, semconv.DeploymentEnvironmentNameKey, tc.vercelEnv)
			}

			const incomingTraceID = "4bf92f3577b34da6a3ce929d0e0e4736"
			const incomingSpanID = "00f067aa0ba902b7"
			headers := make(http.Header)
			headers.Set("traceparent", "00-"+incomingTraceID+"-"+incomingSpanID+"-01")
			headers.Set("baggage", "userId=alice")
			ctx := otel.GetTextMapPropagator().Extract(context.Background(), propagation.HeaderCarrier(headers))
			sc := trace.SpanContextFromContext(ctx)
			require.True(t, sc.IsValid(), "TraceContext propagator should extract traceparent")
			require.Equal(t, incomingTraceID, sc.TraceID().String())
			require.Equal(t, incomingSpanID, sc.SpanID().String())
			require.Equal(t, "alice", baggage.FromContext(ctx).Member("userId").Value(),
				"Baggage propagator should extract baggage")
		})
	}
}

type resourceFromSpan interface {
	Resource() *resource.Resource
}

func spanResource(t *testing.T, span trace.Span) *resource.Resource {
	t.Helper()
	rs, ok := span.(resourceFromSpan)
	require.True(t, ok, "enabled tracer must expose the span resource")
	res := rs.Resource()
	require.NotNil(t, res)
	return res
}

func requireResourceAttr(t *testing.T, res *resource.Resource, key attribute.Key, want string) {
	t.Helper()
	v, ok := res.Set().Value(key)
	require.True(t, ok, "resource missing %s (attrs=%v)", key, res.Attributes())
	require.Equal(t, want, v.AsString())
}

func requireNoResourceAttr(t *testing.T, res *resource.Resource, key attribute.Key) {
	t.Helper()
	_, ok := res.Set().Value(key)
	require.False(t, ok, "resource should not have %s (attrs=%v)", key, res.Attributes())
}
