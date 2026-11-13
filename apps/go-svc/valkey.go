package main

import (
	"context"
	"net"
	"os"
	"strings"

	gosvcvalkey "github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/valkey"
)

func valkeyConfigFromEnv() gosvcvalkey.Config {
	url := strings.TrimSpace(os.Getenv("VALKEY_URL"))
	if url == "" {
		url = valkeyURLFromEnv()
	}

	return gosvcvalkey.Config{
		URL:      url,
		Address:  strings.TrimSpace(os.Getenv("VALKEY_ADDR")),
		Username: strings.TrimSpace(os.Getenv("VALKEY_USERNAME")),
		Password: strings.TrimSpace(os.Getenv("VALKEY_PASSWORD")),
	}
}

func valkeyURLFromEnv() string {
	endpoint := strings.TrimSpace(os.Getenv("VALKEY_ENDPOINT"))
	if endpoint == "" {
		return ""
	}

	port := strings.TrimSpace(os.Getenv("VALKEY_PORT"))
	if port == "" {
		port = "6379"
	}

	scheme := "redis"
	switch strings.ToLower(strings.TrimSpace(os.Getenv("VALKEY_TLS"))) {
	case "required", "true", "enabled":
		scheme = "rediss"
	}

	return scheme + "://" + net.JoinHostPort(endpoint, port)
}

// configureValkey returns nil until an endpoint URL or address is set.
func configureValkey(ctx context.Context) (*gosvcvalkey.Client, error) {
	cfg := valkeyConfigFromEnv()
	if !cfg.Enabled() {
		return nil, nil
	}
	client, err := gosvcvalkey.NewClient(cfg)
	if err != nil {
		return nil, err
	}
	if err := client.Ping(ctx); err != nil {
		client.Close()
		return nil, err
	}
	return client, nil
}
