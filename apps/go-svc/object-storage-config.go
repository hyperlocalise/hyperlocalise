package main

import (
	"context"

	"github.com/hyperlocalise/hyperlocalise/internal/objectstore"
	"github.com/hyperlocalise/hyperlocalise/internal/objectstore/s3compat"
)

// configureObjectStorage returns nil until storage locations are configured. The environment
// parsing lives in s3compat, shared with the public API.
func configureObjectStorage(ctx context.Context) (*objectstore.Registry, error) {
	return s3compat.RegistryFromEnv(ctx)
}

func objectStorageConfigsFromEnv() (map[string]s3compat.Config, error) {
	return s3compat.ConfigsFromEnv()
}
