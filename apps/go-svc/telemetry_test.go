package main

import (
	"testing"

	"github.com/stretchr/testify/require"
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
