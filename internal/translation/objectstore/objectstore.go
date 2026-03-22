package objectstore

import (
	"context"
	"errors"
	"fmt"
	"time"
)

const (
	DriverMemory = "memory"
	DriverGCP    = "gcp"
	DriverAWS    = "aws"
)

var ErrObjectNotFound = errors.New("object store object not found")

type ObjectRef struct {
	Driver string
	Bucket string
	Key    string
}

type UploadRequest struct {
	Object      ObjectRef
	ContentType string
	ExpiresAt   time.Time
}

type DownloadRequest struct {
	Object    ObjectRef
	ExpiresAt time.Time
}

type PutRequest struct {
	Object      ObjectRef
	ContentType string
	Body        []byte
}

type GetRequest struct {
	Object ObjectRef
}

type StatRequest struct {
	Object ObjectRef
}

type ObjectInfo struct {
	SizeBytes int64
}

type Store interface {
	CreateUploadURL(ctx context.Context, req UploadRequest) (string, error)
	CreateDownloadURL(ctx context.Context, req DownloadRequest) (string, error)
	PutObject(ctx context.Context, req PutRequest) error
	GetObject(ctx context.Context, req GetRequest) ([]byte, error)
	StatObject(ctx context.Context, req StatRequest) (ObjectInfo, error)
}

type Config struct {
	Driver string

	GCPBucket            string
	GCPSigningAccount    string
	GCPSigningPrivateKey string

	AWSBucket          string
	AWSRegion          string
	AWSAccessKeyID     string
	AWSSecretAccessKey string
	AWSSessionToken    string
	AWSEndpoint        string
}

func BucketForDriver(cfg Config) (string, error) {
	switch cfg.Driver {
	case DriverMemory:
		return "memory", nil
	case DriverGCP:
		if cfg.GCPBucket == "" {
			return "", fmt.Errorf("translation object store: GCP bucket is required")
		}
		return cfg.GCPBucket, nil
	case DriverAWS:
		if cfg.AWSBucket == "" {
			return "", fmt.Errorf("translation object store: AWS bucket is required")
		}
		return cfg.AWSBucket, nil
	default:
		return "", fmt.Errorf("translation object store: unsupported driver %q", cfg.Driver)
	}
}

func nowUTC() time.Time {
	return time.Now().UTC()
}
