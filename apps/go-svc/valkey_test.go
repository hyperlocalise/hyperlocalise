package main

import (
	"strings"
	"testing"
)

func TestValkeyConfigFromEnvEmpty(t *testing.T) {
	t.Setenv("VALKEY_URL", "")
	t.Setenv("VALKEY_ADDR", "")
	t.Setenv("VALKEY_USERNAME", "")
	t.Setenv("VALKEY_PASSWORD", "")

	cfg := valkeyConfigFromEnv()
	if cfg.Enabled() {
		t.Fatalf("expected disabled config, got %#v", cfg)
	}
}

func TestValkeyConfigFromEnvURL(t *testing.T) {
	t.Setenv("VALKEY_URL", " redis://127.0.0.1:6379 ")
	t.Setenv("VALKEY_ADDR", "ignored:6379")
	t.Setenv("VALKEY_USERNAME", "alice")
	t.Setenv("VALKEY_PASSWORD", "s3cret")

	cfg := valkeyConfigFromEnv()
	if cfg.URL != "redis://127.0.0.1:6379" {
		t.Fatalf("URL = %q", cfg.URL)
	}
	if cfg.Address != "ignored:6379" {
		t.Fatalf("Address = %q", cfg.Address)
	}
	if cfg.Username != "alice" || cfg.Password != "s3cret" {
		t.Fatalf("auth = %q %q", cfg.Username, cfg.Password)
	}

	opt, err := cfg.ClientOption()
	if err != nil {
		t.Fatal(err)
	}
	if len(opt.InitAddress) != 1 || opt.InitAddress[0] != "127.0.0.1:6379" {
		t.Fatalf("InitAddress = %#v", opt.InitAddress)
	}
	if opt.Username != "alice" || opt.Password != "s3cret" {
		t.Fatalf("option auth = %q %q", opt.Username, opt.Password)
	}
}

func TestConfigureValkeyDisabled(t *testing.T) {
	t.Setenv("VALKEY_URL", "")
	t.Setenv("VALKEY_ADDR", "")

	client, err := configureValkey(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	if client != nil {
		t.Fatal("expected nil client")
	}
}

func TestConfigureValkeyInvalidURL(t *testing.T) {
	t.Setenv("VALKEY_URL", "http://127.0.0.1:6379")
	t.Setenv("VALKEY_ADDR", "")

	_, err := configureValkey(t.Context())
	if err == nil {
		t.Fatal("expected error")
	}
	if !strings.Contains(err.Error(), "parse URL") {
		t.Fatalf("error = %v", err)
	}
}
