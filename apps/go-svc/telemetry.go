package main

import (
	"context"
	"os"
	"strings"

	ddotel "github.com/DataDog/dd-trace-go/v2/ddtrace/opentelemetry"
	ddtracer "github.com/DataDog/dd-trace-go/v2/ddtrace/tracer"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/propagation"
)

const (
	otelServiceName     = "go-svc"
	otelInstrumentation = "github.com/hyperlocalise/hyperlocalise/apps/go-svc"
)

// serviceResourceInfo holds service identity shared by tracing and log correlation.
type serviceResourceInfo struct {
	name    string
	version string
	env     string
}

func loadServiceResourceInfo() serviceResourceInfo {
	service := strings.TrimSpace(os.Getenv("DD_SERVICE"))
	if service == "" {
		service = otelServiceName
	}

	return serviceResourceInfo{
		name:    service,
		version: strings.TrimSpace(os.Getenv("DD_VERSION")),
		env:     strings.TrimSpace(os.Getenv("DD_ENV")),
	}
}

// initTelemetry starts Datadog's tracer and installs its OpenTelemetry bridge.
// The bridge keeps the existing route-safe custom middleware on the OTel API,
// while Orchestrion-instrumented dependencies use the native Datadog API.
func initTelemetry(ctx context.Context) (shutdown func(context.Context) error, err error) {
	_ = ctx
	provider := ddotel.NewTracerProvider(ddtracer.WithService(loadServiceResourceInfo().name))
	otel.SetTracerProvider(provider)
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))

	return func(context.Context) error {
		return provider.Shutdown()
	}, nil
}
