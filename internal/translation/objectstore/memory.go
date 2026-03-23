package objectstore

import (
	"context"
	"fmt"
	"sync"
)

type MemoryStore struct {
	mu      sync.Mutex
	objects map[ObjectRef][]byte
}

func NewMemoryStore() *MemoryStore {
	return &MemoryStore{objects: map[ObjectRef][]byte{}}
}

func (s *MemoryStore) CreateUploadURL(_ context.Context, req UploadRequest) (string, error) {
	return fmt.Sprintf("memory://%s/%s?expires=%d", req.Object.Bucket, req.Object.Key, req.ExpiresAt.Unix()), nil
}

func (s *MemoryStore) CreateDownloadURL(_ context.Context, req DownloadRequest) (string, error) {
	return fmt.Sprintf("memory://%s/%s?expires=%d", req.Object.Bucket, req.Object.Key, req.ExpiresAt.Unix()), nil
}

func (s *MemoryStore) PutObject(_ context.Context, req PutRequest) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.objects[req.Object] = append([]byte(nil), req.Body...)
	return nil
}

func (s *MemoryStore) GetObject(_ context.Context, req GetRequest) ([]byte, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	body, ok := s.objects[req.Object]
	if !ok {
		return nil, fmt.Errorf("%w: memory object not found", ErrObjectNotFound)
	}
	return append([]byte(nil), body...), nil
}

func (s *MemoryStore) StatObject(_ context.Context, req StatRequest) (ObjectInfo, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	body, ok := s.objects[req.Object]
	if !ok {
		return ObjectInfo{}, fmt.Errorf("%w: memory object not found", ErrObjectNotFound)
	}
	return ObjectInfo{SizeBytes: int64(len(body))}, nil
}

func (s *MemoryStore) DeleteObject(_ context.Context, req DeleteRequest) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.objects[req.Object]; !ok {
		return fmt.Errorf("%w: memory object not found", ErrObjectNotFound)
	}
	delete(s.objects, req.Object)
	return nil
}
