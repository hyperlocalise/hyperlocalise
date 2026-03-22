package objectstore

import (
	"context"
	"fmt"
)

func New(ctx context.Context, cfg Config) (Store, error) {
	switch cfg.Driver {
	case DriverMemory:
		return NewMemoryStore(), nil
	case DriverGCP:
		return newGCSStore(ctx, cfg)
	case DriverAWS:
		return newS3Store(ctx, cfg)
	default:
		return nil, fmt.Errorf("translation object store: unsupported driver %q", cfg.Driver)
	}
}
