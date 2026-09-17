package main

import (
	"context"
	"fmt"
	"os"
	"strings"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.43.0"
)

const (
	otelServiceName     = "go-svc"
	otelInstrumentation = "github.com/hyperlocalise/hyperlocalise/apps/go-svc"
)

func telemetryEnabled() bool {
	if strings.EqualFold(strings.TrimSpace(os.Getenv("OTEL_SDK_DISABLED")), "true") {
		return false
	}
	ep := strings.TrimSpace(os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT"))
	epTraces := strings.TrimSpace(os.Getenv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT"))
	return ep != "" || epTraces != ""
}

// initTelemetry configures OTLP tracing and returns a caller-bounded shutdown function.
func initTelemetry(ctx context.Context) (shutdown func(context.Context) error, err error) {
	if !telemetryEnabled() {
		return nil, nil
	}

	exporter, err := otlptracehttp.New(ctx)
	if err != nil {
		return nil, fmt.Errorf("telemetry: OTLP HTTP exporter: %w", err)
	}

	attrs := []attribute.KeyValue{semconv.ServiceName(otelServiceName)}
	if v := strings.TrimSpace(os.Getenv("VERCEL_GIT_COMMIT_SHA")); v != "" {
		attrs = append(attrs, semconv.ServiceVersion(v))
	}
	if v := strings.TrimSpace(os.Getenv("VERCEL_ENV")); v != "" {
		attrs = append(attrs, semconv.DeploymentEnvironmentNameKey.String(v))
	}

	res, err := resource.New(ctx, resource.WithAttributes(attrs...))
	if err != nil {
		_ = exporter.Shutdown(ctx)
		return nil, fmt.Errorf("telemetry: resource: %w", err)
	}

	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exporter),
		sdktrace.WithResource(res),
	)
	otel.SetTracerProvider(tp)
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))

	return tp.Shutdown, nil
}
