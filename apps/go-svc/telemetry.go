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

// serviceResourceInfo holds service identity shared by tracing and log correlation.
type serviceResourceInfo struct {
	name    string
	version string
	env     string
}

func loadServiceResourceInfo() serviceResourceInfo {
	return serviceResourceInfo{
		name:    otelServiceName,
		version: strings.TrimSpace(os.Getenv("VERCEL_GIT_COMMIT_SHA")),
		env:     strings.TrimSpace(os.Getenv("VERCEL_ENV")),
	}
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

	info := loadServiceResourceInfo()
	attrs := []attribute.KeyValue{semconv.ServiceName(info.name)}
	if info.version != "" {
		attrs = append(attrs, semconv.ServiceVersion(info.version))
	}
	if info.env != "" {
		attrs = append(attrs, semconv.DeploymentEnvironmentNameKey.String(info.env))
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
