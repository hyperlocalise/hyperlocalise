// Package memory provides a concurrency-safe in-memory object store for tests.
package memory

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"maps"
	"sync"

	"github.com/hyperlocalise/hyperlocalise/internal/objectstore"
)

type object struct {
	body []byte
	info objectstore.Info
}

// Store implements the object-store contract without network access.
type Store struct {
	mu      sync.RWMutex
	objects map[string]object
}

// New creates an empty store.
func New() *Store { return &Store{objects: make(map[string]object)} }

func cloneInfo(info objectstore.Info) objectstore.Info {
	info.Metadata = maps.Clone(info.Metadata)
	return info
}

// Put enforces the declared size and atomic conditional creation.
func (s *Store) Put(ctx context.Context, input objectstore.PutInput) (objectstore.Info, error) {
	if err := ctx.Err(); err != nil {
		return objectstore.Info{}, err
	}
	if err := objectstore.ValidatePut(input); err != nil {
		return objectstore.Info{}, err
	}
	if input.Size > 64<<20 {
		return objectstore.Info{}, objectstore.ErrInvalidInput
	}
	body, err := io.ReadAll(io.LimitReader(input.Body, input.Size+1))
	if err != nil {
		return objectstore.Info{}, err
	}
	if int64(len(body)) != input.Size {
		return objectstore.Info{}, objectstore.ErrInvalidInput
	}
	if err := ctx.Err(); err != nil {
		return objectstore.Info{}, err
	}
	sum := sha256.Sum256(body)
	info := objectstore.Info{Size: input.Size, ContentType: input.ContentType, CacheControl: input.CacheControl, ETag: hex.EncodeToString(sum[:]), Metadata: maps.Clone(input.Metadata)}
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, exists := s.objects[input.Key]; exists && input.IfAbsent {
		return objectstore.Info{}, objectstore.ErrAlreadyExists
	}
	s.objects[input.Key] = object{body: body, info: info}
	return cloneInfo(info), nil
}

// Get returns an independent reader and metadata copy.
func (s *Store) Get(ctx context.Context, key string) (io.ReadCloser, objectstore.Info, error) {
	if err := ctx.Err(); err != nil {
		return nil, objectstore.Info{}, err
	}
	if err := objectstore.ValidateKey(key); err != nil {
		return nil, objectstore.Info{}, err
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	obj, ok := s.objects[key]
	if !ok {
		return nil, objectstore.Info{}, objectstore.ErrNotFound
	}
	return io.NopCloser(bytes.NewReader(obj.body)), cloneInfo(obj.info), nil
}

// Stat returns an independent metadata copy.
func (s *Store) Stat(ctx context.Context, key string) (objectstore.Info, error) {
	body, info, err := s.Get(ctx, key)
	if err != nil {
		return objectstore.Info{}, err
	}
	return info, body.Close()
}

// Delete is idempotent.
func (s *Store) Delete(ctx context.Context, key string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if err := objectstore.ValidateKey(key); err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.objects, key)
	return nil
}
