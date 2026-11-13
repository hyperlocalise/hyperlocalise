package distribution

import (
	"context"
	"errors"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/objectstore"
	"github.com/hyperlocalise/hyperlocalise/internal/objectstore/memory"
	"github.com/stretchr/testify/require"
)

type failingStore struct {
	objectstore.Store
	failKey string
	writes  []string
}

func (s *failingStore) Put(ctx context.Context, input objectstore.PutInput) (objectstore.Info, error) {
	s.writes = append(s.writes, input.Key)
	if input.Key == s.failKey {
		return objectstore.Info{}, errors.New("upload failed")
	}
	return s.Store.Put(ctx, input)
}

func TestPublishIsImmutableAndRetryable(t *testing.T) {
	store := &failingStore{Store: memory.New(), failKey: "projects/proj/releases/v1/fr.json"}
	registry, err := objectstore.NewRegistry("r2", map[string]objectstore.Store{"r2": store})
	require.NoError(t, err)
	publisher, err := NewPublisher(registry, "r2")
	require.NoError(t, err)
	bundles := []Bundle{{Locale: "fr", Content: []byte(`{"hello":"bonjour"}`)}, {Locale: "en", Content: []byte(`{"hello":"hello"}`)}}
	_, err = publisher.Publish(t.Context(), "proj", "v1", bundles)
	require.Error(t, err)
	_, err = store.Stat(t.Context(), "projects/proj/releases/v1/manifest.json")
	require.ErrorIs(t, err, objectstore.ErrNotFound)
	store.failKey = ""
	ref, err := publisher.Publish(t.Context(), "proj", "v1", bundles)
	require.NoError(t, err)
	require.Equal(t, "r2", ref.LocationID)
	require.Equal(t, "projects/proj/releases/v1/manifest.json", store.writes[len(store.writes)-1])
	retryRef, err := publisher.Publish(t.Context(), "proj", "v1", bundles)
	require.NoError(t, err)
	require.Equal(t, ref, retryRef)
	bundles[0].Content = []byte(`{"hello":"changed"}`)
	_, err = publisher.Publish(t.Context(), "proj", "v1", bundles)
	require.ErrorIs(t, err, objectstore.ErrAlreadyExists)
}

func TestPublishValidatesBeforeWriting(t *testing.T) {
	for _, tc := range []struct {
		name    string
		project string
		bundles []Bundle
	}{
		{"path traversal", "../escape", []Bundle{{Locale: "en", Content: []byte(`{}`)}}},
		{"duplicate locale", "proj", []Bundle{{Locale: "en", Content: []byte(`{}`)}, {Locale: "en", Content: []byte(`{}`)}}},
		{"invalid JSON", "proj", []Bundle{{Locale: "en", Content: []byte(`invalid`)}}},
		{"reserved manifest", "proj", []Bundle{{Locale: "manifest", Content: []byte(`{}`)}}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			store := &failingStore{Store: memory.New()}
			registry, err := objectstore.NewRegistry("s3", map[string]objectstore.Store{"s3": store})
			require.NoError(t, err)
			publisher, err := NewPublisher(registry, "s3")
			require.NoError(t, err)
			_, err = publisher.Publish(t.Context(), tc.project, "v1", tc.bundles)
			require.ErrorIs(t, err, objectstore.ErrInvalidInput)
			require.Empty(t, store.writes)
		})
	}
}
