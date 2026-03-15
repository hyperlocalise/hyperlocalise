package translationsvc

import (
	"context"
	"fmt"
	"sync"

	"github.com/quiet-circles/hyperlocalise/domains/translation"
)

type MemoryDispatcher struct {
	mu               sync.Mutex
	ExecuteMessages  []translation.ExecuteMessage
	FinalizeMessages []string
}

// TODO: Replace this test/dev helper with a real Pub/Sub publisher implementation.
func (d *MemoryDispatcher) PublishExecute(ctx context.Context, msg translation.ExecuteMessage) error {
	d.mu.Lock()
	defer d.mu.Unlock()
	_ = ctx

	d.ExecuteMessages = append(d.ExecuteMessages, msg)
	return nil
}

// TODO: Replace this test/dev helper with a real Pub/Sub publisher implementation.
func (d *MemoryDispatcher) PublishFinalize(ctx context.Context, jobID string) error {
	d.mu.Lock()
	defer d.mu.Unlock()
	_ = ctx

	d.FinalizeMessages = append(d.FinalizeMessages, jobID)
	return nil
}

type MemoryArtifactStore struct {
	mu      sync.Mutex
	objects map[string]memoryObject
}

type memoryObject struct {
	contentType string
	payload     []byte
}

// TODO: Replace this in-memory store with object storage backed by persisted URIs.
func NewMemoryArtifactStore() *MemoryArtifactStore {
	return &MemoryArtifactStore{objects: map[string]memoryObject{}}
}

func (s *MemoryArtifactStore) Seed(uri string, contentType string, payload []byte) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.objects[uri] = memoryObject{
		contentType: contentType,
		payload:     append([]byte(nil), payload...),
	}
}

func (s *MemoryArtifactStore) Get(ctx context.Context, uri string) ([]byte, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	_ = ctx

	item, ok := s.objects[uri]
	if !ok {
		return nil, fmt.Errorf("artifact %q not found", uri)
	}
	return append([]byte(nil), item.payload...), nil
}

func (s *MemoryArtifactStore) Put(ctx context.Context, key string, contentType string, payload []byte) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	_ = ctx

	uri := "memory://" + key
	s.objects[uri] = memoryObject{
		contentType: contentType,
		payload:     append([]byte(nil), payload...),
	}
	return uri, nil
}
