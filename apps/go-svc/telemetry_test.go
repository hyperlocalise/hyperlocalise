package main

import (
	"testing"

	"github.com/stretchr/testify/require"
	"go.opentelemetry.io/otel"
)

func TestLoadServiceResourceInfoUsesDatadogServiceOverride(t *testing.T) {
	t.Setenv("DD_SERVICE", "custom-go-svc")
	t.Setenv("DD_ENV", "production")
	t.Setenv("DD_VERSION", "release-123")

	info := loadServiceResourceInfo()

	require.Equal(t, "custom-go-svc", info.name)
	require.Equal(t, "production", info.env)
	require.Equal(t, "release-123", info.version)
}

func TestLoadServiceResourceInfoDefaultsServiceName(t *testing.T) {
	t.Setenv("DD_SERVICE", " ")

	info := loadServiceResourceInfo()

	require.Equal(t, otelServiceName, info.name)
}

func TestInitTelemetryInstallsDatadogBridge(t *testing.T) {
	t.Setenv("DD_TRACE_STARTUP_LOGS", "false")
	previousProvider := otel.GetTracerProvider()
	previousPropagator := otel.GetTextMapPropagator()
	t.Cleanup(func() {
		otel.SetTracerProvider(previousProvider)
		otel.SetTextMapPropagator(previousPropagator)
	})

	shutdown, err := initTelemetry(t.Context())
	require.NoError(t, err)
	require.NotNil(t, shutdown)
	require.NotEqual(t, previousProvider, otel.GetTracerProvider())
	require.NoError(t, shutdown(t.Context()))
}
