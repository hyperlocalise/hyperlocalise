// Package cliotel configures OpenTelemetry for the CLI when explicitly enabled.
// Telemetry is off unless HYPERLOCALISE_OTEL=1 and an OTLP traces endpoint is set.
package cliotel

import (
	"context"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.26.0"
)

const (
	// envOptIn must be exactly "1" to allow exporting telemetry.
	envOptIn = "HYPERLOCALISE_OTEL"

	// InstrumentationName is the OTEL tracer scope name for CLI commands.
	InstrumentationName = "github.com/hyperlocalise/hyperlocalise/apps/cli"
)

// Enabled reports whether the CLI should initialize a tracer and export spans.
// Requires explicit opt-in and a traces OTLP endpoint; honors OTEL_SDK_DISABLED=true.
func Enabled() bool {
	if strings.EqualFold(strings.TrimSpace(os.Getenv("OTEL_SDK_DISABLED")), "true") {
		return false
	}
	if strings.TrimSpace(os.Getenv(envOptIn)) != "1" {
		return false
	}
	ep := strings.TrimSpace(os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT"))
	epTraces := strings.TrimSpace(os.Getenv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT"))
	if ep == "" && epTraces == "" {
		return false
	}
	return true
}

// Init registers a global TracerProvider and OTLP HTTP trace exporter.
// When telemetry is disabled, it returns (nil, nil). Caller must invoke shutdown on success.
func Init(ctx context.Context, serviceVersion string) (shutdown func(context.Context) error, err error) {
	if !Enabled() {
		return nil, nil
	}

	exporter, err := otlptracehttp.New(ctx)
	if err != nil {
		return nil, fmt.Errorf("cliotel: OTLP HTTP exporter: %w", err)
	}

	res, err := resource.New(ctx,
		resource.WithAttributes(
			semconv.ServiceName("hyperlocalise-cli"),
			semconv.ServiceVersion(strings.TrimSpace(serviceVersion)),
			semconv.ProcessRuntimeName("go"),
		),
	)
	if err != nil {
		return nil, fmt.Errorf("cliotel: resource: %w", err)
	}

	ratio := 1.0
	if v := strings.TrimSpace(os.Getenv("HYPERLOCALISE_OTEL_TRACE_SAMPLE_RATIO")); v != "" {
		if f, e := strconv.ParseFloat(v, 64); e == nil && f >= 0 && f <= 1 {
			ratio = f
		}
	}

	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exporter),
		sdktrace.WithResource(res),
		sdktrace.WithSampler(sdktrace.ParentBased(sdktrace.TraceIDRatioBased(ratio))),
	)
	otel.SetTracerProvider(tp)
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))

	return func(c context.Context) error {
		cctx, cancel := context.WithTimeout(c, 5*time.Second)
		defer cancel()
		return tp.Shutdown(cctx)
	}, nil
}
