package main

import (
	"context"
	"os"
	"strings"

	gosvcvalkey "github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/valkey"
)

func valkeyConfigFromEnv() gosvcvalkey.Config {
	return gosvcvalkey.Config{
		URL:      strings.TrimSpace(os.Getenv("VALKEY_URL")),
		Address:  strings.TrimSpace(os.Getenv("VALKEY_ADDR")),
		Username: strings.TrimSpace(os.Getenv("VALKEY_USERNAME")),
		Password: strings.TrimSpace(os.Getenv("VALKEY_PASSWORD")),
	}
}

// configureValkey returns nil until VALKEY_URL or VALKEY_ADDR is set.
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
