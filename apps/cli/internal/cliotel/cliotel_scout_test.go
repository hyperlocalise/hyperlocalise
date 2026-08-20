package cliotel

import (
	"context"
	"testing"

	"github.com/spf13/cobra"
)

func TestCommandSpanName(t *testing.T) {
	rootCmd := &cobra.Command{Use: "hyperlocalise"}
	runCmd := &cobra.Command{Use: "run"}
	rootCmd.AddCommand(runCmd)

	tests := []struct {
		name     string
		cmd      *cobra.Command
		expected string
	}{
		{
			name:     "root command span name",
			cmd:      rootCmd,
			expected: "hyperlocalise",
		},
		{
			name:     "sub command span name",
			cmd:      runCmd,
			expected: "hyperlocalise.run",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := CommandSpanName(tt.cmd)
			if got != tt.expected {
				t.Errorf("CommandSpanName() = %q, want %q", got, tt.expected)
			}
		})
	}
}

func TestTelemetryEnabled(t *testing.T) {
	tests := []struct {
		name     string
		env      map[string]string
		expected bool
	}{
		{
			name:     "disabled by default",
			env:      map[string]string{},
			expected: false,
		},
		{
			name: "opted in but missing endpoints",
			env: map[string]string{
				"HYPERLOCALISE_OTEL": "1",
			},
			expected: false,
		},
		{
			name: "opted in and with endpoint",
			env: map[string]string{
				"HYPERLOCALISE_OTEL":          "1",
				"OTEL_EXPORTER_OTLP_ENDPOINT": "http://localhost:4318",
			},
			expected: true,
		},
		{
			name: "opted in and with traces endpoint",
			env: map[string]string{
				"HYPERLOCALISE_OTEL":                 "1",
				"OTEL_EXPORTER_OTLP_TRACES_ENDPOINT": "http://localhost:4318/v1/traces",
			},
			expected: true,
		},
		{
			name: "opted in with endpoint but sdk disabled",
			env: map[string]string{
				"HYPERLOCALISE_OTEL":          "1",
				"OTEL_EXPORTER_OTLP_ENDPOINT": "http://localhost:4318",
				"OTEL_SDK_DISABLED":           "true",
			},
			expected: false,
		},
		{
			name: "sdk disabled in any casing",
			env: map[string]string{
				"HYPERLOCALISE_OTEL":          "1",
				"OTEL_EXPORTER_OTLP_ENDPOINT": "http://localhost:4318",
				"OTEL_SDK_DISABLED":           "TrUe",
			},
			expected: false,
		},
		{
			name: "opt in has invalid value",
			env: map[string]string{
				"HYPERLOCALISE_OTEL":          "true",
				"OTEL_EXPORTER_OTLP_ENDPOINT": "http://localhost:4318",
			},
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Setenv("HYPERLOCALISE_OTEL", "")
			t.Setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "")
			t.Setenv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT", "")
			t.Setenv("OTEL_SDK_DISABLED", "")

			for k, v := range tt.env {
				t.Setenv(k, v)
			}

			got := Enabled()
			if got != tt.expected {
				t.Errorf("Enabled() = %v, want %v", got, tt.expected)
			}
		})
	}
}

func TestInitWhenDisabled(t *testing.T) {
	t.Setenv("HYPERLOCALISE_OTEL", "")
	t.Setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "")
	t.Setenv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT", "")
	t.Setenv("OTEL_SDK_DISABLED", "")

	shutdown, err := Init(context.Background(), "1.0.0")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if shutdown != nil {
		t.Fatalf("expected nil shutdown func, got %T", shutdown)
	}
}
