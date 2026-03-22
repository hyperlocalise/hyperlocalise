package objectstore

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"

	"cloud.google.com/go/storage"
)

type gcsStore struct {
	client            *storage.Client
	signingAccount    string
	signingPrivateKey []byte
}

func newGCSStore(ctx context.Context, cfg Config) (Store, error) {
	if cfg.GCPBucket == "" {
		return nil, fmt.Errorf("translation object store: GCP bucket is required")
	}
	if cfg.GCPSigningAccount == "" || cfg.GCPSigningPrivateKey == "" {
		return nil, fmt.Errorf("translation object store: GCP signing account and private key are required")
	}

	client, err := storage.NewClient(ctx)
	if err != nil {
		return nil, fmt.Errorf("translation object store: create GCS client: %w", err)
	}

	return &gcsStore{
		client:            client,
		signingAccount:    cfg.GCPSigningAccount,
		signingPrivateKey: []byte(cfg.GCPSigningPrivateKey),
	}, nil
}

func (s *gcsStore) CreateUploadURL(_ context.Context, req UploadRequest) (string, error) {
	return storage.SignedURL(req.Object.Bucket, req.Object.Key, &storage.SignedURLOptions{
		GoogleAccessID: s.signingAccount,
		PrivateKey:     s.signingPrivateKey,
		Method:         "PUT",
		Expires:        req.ExpiresAt,
		ContentType:    req.ContentType,
	})
}

func (s *gcsStore) CreateDownloadURL(_ context.Context, req DownloadRequest) (string, error) {
	return storage.SignedURL(req.Object.Bucket, req.Object.Key, &storage.SignedURLOptions{
		GoogleAccessID: s.signingAccount,
		PrivateKey:     s.signingPrivateKey,
		Method:         "GET",
		Expires:        req.ExpiresAt,
	})
}

func (s *gcsStore) PutObject(ctx context.Context, req PutRequest) error {
	writer := s.client.Bucket(req.Object.Bucket).Object(req.Object.Key).NewWriter(ctx)
	writer.ContentType = req.ContentType
	if _, err := io.Copy(writer, bytes.NewReader(req.Body)); err != nil {
		_ = writer.Close()
		return fmt.Errorf("translation object store: put GCS object: %w", err)
	}
	if err := writer.Close(); err != nil {
		return fmt.Errorf("translation object store: close GCS writer: %w", err)
	}
	return nil
}

func (s *gcsStore) GetObject(ctx context.Context, req GetRequest) ([]byte, error) {
	reader, err := s.client.Bucket(req.Object.Bucket).Object(req.Object.Key).NewReader(ctx)
	if err != nil {
		if errors.Is(err, storage.ErrObjectNotExist) {
			return nil, fmt.Errorf("%w: open GCS reader: %v", ErrObjectNotFound, err)
		}
		return nil, fmt.Errorf("translation object store: open GCS reader: %w", err)
	}
	defer func() {
		_ = reader.Close()
	}()
	body, err := io.ReadAll(reader)
	if err != nil {
		return nil, fmt.Errorf("translation object store: read GCS object: %w", err)
	}
	return body, nil
}

func (s *gcsStore) StatObject(ctx context.Context, req StatRequest) (ObjectInfo, error) {
	attrs, err := s.client.Bucket(req.Object.Bucket).Object(req.Object.Key).Attrs(ctx)
	if err != nil {
		if errors.Is(err, storage.ErrObjectNotExist) {
			return ObjectInfo{}, fmt.Errorf("%w: stat GCS object: %v", ErrObjectNotFound, err)
		}
		return ObjectInfo{}, fmt.Errorf("translation object store: stat GCS object: %w", err)
	}
	return ObjectInfo{SizeBytes: attrs.Size}, nil
}
