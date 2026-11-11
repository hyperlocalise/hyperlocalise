package cliotel

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/trace"
)

func newTraceCollector(t *testing.T) (*httptest.Server, *atomic.Int32) {
	t.Helper()
	var exports atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost && r.URL.Path == "/v1/traces" {
			exports.Add(1)
		}
		w.WriteHeader(http.StatusOK)
	}))
	t.Cleanup(server.Close)
	return server, &exports
}

func restoreGlobalOTel(t *testing.T) {
	t.Helper()
	provider := otel.GetTracerProvider()
	propagator := otel.GetTextMapPropagator()
	t.Cleanup(func() {
		otel.SetTracerProvider(provider)
		otel.SetTextMapPropagator(propagator)
	})
}

func setEnabledTelemetryEnv(t *testing.T, endpoint, ratio string) {
	t.Helper()
	t.Setenv("HYPERLOCALISE_OTEL", "1")
	t.Setenv("OTEL_SDK_DISABLED", "")
	t.Setenv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT", "")
	t.Setenv("OTEL_EXPORTER_OTLP_ENDPOINT", endpoint)
	t.Setenv("HYPERLOCALISE_OTEL_TRACE_SAMPLE_RATIO", ratio)
}

func TestInitExportsSpansWithConfiguredSampling(t *testing.T) {
	tests := []struct {
		name        string
		ratio       string
		wantSampled bool
	}{
		{name: "default ratio", ratio: "", wantSampled: true},
		{name: "explicit full ratio", ratio: " 1 ", wantSampled: true},
		{name: "zero ratio drops spans", ratio: "0", wantSampled: false},
		{name: "invalid ratio falls back to full", ratio: "often", wantSampled: true},
		{name: "out of range ratio falls back to full", ratio: "1.5", wantSampled: true},
		{name: "negative ratio falls back to full", ratio: "-0.1", wantSampled: true},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			restoreGlobalOTel(t)
			server, exports := newTraceCollector(t)
			setEnabledTelemetryEnv(t, server.URL, tc.ratio)

			ctx := context.Background()
			shutdown, err := Init(ctx, " 1.2.3 ")
			if err != nil {
				t.Fatalf("Init: %v", err)
			}
			if shutdown == nil {
				t.Fatal("expected shutdown func when telemetry is enabled")
			}

			_, span := otel.Tracer(InstrumentationName).Start(ctx, "hyperlocalise run")
			if span.SpanContext().IsSampled() != tc.wantSampled {
				t.Fatalf("sampled = %v, want %v", span.SpanContext().IsSampled(), tc.wantSampled)
			}
			span.End()

			if err := shutdown(ctx); err != nil {
				t.Fatalf("shutdown: %v", err)
			}
			if got := exports.Load() > 0; got != tc.wantSampled {
				t.Fatalf("exported = %v (requests=%d), want %v", got, exports.Load(), tc.wantSampled)
			}
		})
	}
}

func TestInitInstallsTraceContextAndBaggagePropagators(t *testing.T) {
	restoreGlobalOTel(t)
	server, _ := newTraceCollector(t)
	setEnabledTelemetryEnv(t, server.URL, "")

	ctx := context.Background()
	shutdown, err := Init(ctx, "dev")
	if err != nil {
		t.Fatalf("Init: %v", err)
	}
	t.Cleanup(func() { _ = shutdown(context.Background()) })

	fields := map[string]bool{}
	for _, field := range otel.GetTextMapPropagator().Fields() {
		fields[field] = true
	}
	if !fields["traceparent"] || !fields["baggage"] {
		t.Fatalf("propagator fields = %v", otel.GetTextMapPropagator().Fields())
	}

	spanCtx, span := otel.Tracer(InstrumentationName).Start(ctx, "inject")
	defer span.End()
	carrier := propagation.MapCarrier{}
	otel.GetTextMapPropagator().Inject(spanCtx, carrier)
	if carrier.Get("traceparent") == "" {
		t.Fatalf("expected traceparent header, got %v", carrier)
	}
	if !trace.SpanContextFromContext(spanCtx).IsValid() {
		t.Fatal("expected valid span context from installed provider")
	}
}

func TestInitUsesTracesSpecificEndpoint(t *testing.T) {
	restoreGlobalOTel(t)
	server, exports := newTraceCollector(t)
	setEnabledTelemetryEnv(t, "", "")
	t.Setenv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT", server.URL+"/v1/traces")

	ctx := context.Background()
	shutdown, err := Init(ctx, "dev")
	if err != nil {
		t.Fatalf("Init: %v", err)
	}
	_, span := otel.Tracer(InstrumentationName).Start(ctx, "traces endpoint")
	span.End()
	if err := shutdown(ctx); err != nil {
		t.Fatalf("shutdown: %v", err)
	}
	if exports.Load() == 0 {
		t.Fatal("expected spans exported to traces-specific endpoint")
	}
}

func TestInitDisabledBySDKFlagEvenWhenOptedIn(t *testing.T) {
	restoreGlobalOTel(t)
	server, _ := newTraceCollector(t)
	setEnabledTelemetryEnv(t, server.URL, "")
	t.Setenv("OTEL_SDK_DISABLED", "TRUE")

	before := otel.GetTracerProvider()
	shutdown, err := Init(context.Background(), "dev")
	if err != nil || shutdown != nil {
		t.Fatalf("expected disabled init, got shutdown=%v err=%v", shutdown != nil, err)
	}
	if otel.GetTracerProvider() != before {
		t.Fatal("disabled init must not replace the global tracer provider")
	}
}
