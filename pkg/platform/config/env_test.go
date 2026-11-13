package config

import (
	"testing"
	"time"
)

func TestLoadServiceConfigDefaults(t *testing.T) {
	t.Setenv("HYPERLOCALISE_HOST", "")
	t.Setenv("HYPERLOCALISE_PORT", "")

	got := LoadServiceConfig("api", 8080)
	want := ServiceConfig{
		ServiceName:       "api",
		Host:              "0.0.0.0",
		Port:              8080,
		ReadHeaderTimeout: 5 * time.Second,
		ShutdownTimeout:   10 * time.Second,
	}
	if got != want {
		t.Fatalf("LoadServiceConfig = %+v, want %+v", got, want)
	}
	if addr := got.Address(); addr != "0.0.0.0:8080" {
		t.Fatalf("Address() = %q, want %q", addr, "0.0.0.0:8080")
	}
}

func TestLoadServiceConfigFromEnv(t *testing.T) {
	tests := []struct {
		name     string
		host     string
		port     string
		wantHost string
		wantPort int
	}{
		{"overrides", "127.0.0.1", "9090", "127.0.0.1", 9090},
		{"invalid port", "localhost", "abc", "localhost", 8080},
		{"port with spaces", "localhost", " 9090", "localhost", 8080},
		{"zero port", "localhost", "0", "localhost", 0},
		{"negative port", "localhost", "-1", "localhost", -1},
		{"empty host", "", "9090", "0.0.0.0", 9090},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Setenv("HYPERLOCALISE_HOST", tt.host)
			t.Setenv("HYPERLOCALISE_PORT", tt.port)

			got := LoadServiceConfig("worker", 8080)
			if got.ServiceName != "worker" || got.Host != tt.wantHost || got.Port != tt.wantPort {
				t.Fatalf("LoadServiceConfig = %+v, want host %q port %d", got, tt.wantHost, tt.wantPort)
			}
		})
	}
}

func TestServiceConfigAddress(t *testing.T) {
	tests := []struct {
		cfg  ServiceConfig
		want string
	}{
		{ServiceConfig{Host: "localhost", Port: 3000}, "localhost:3000"},
		{ServiceConfig{Host: "", Port: 80}, ":80"},
		{ServiceConfig{Host: "::1", Port: 443}, "::1:443"},
	}
	for _, tt := range tests {
		if got := tt.cfg.Address(); got != tt.want {
			t.Fatalf("Address() = %q, want %q", got, tt.want)
		}
	}
}
