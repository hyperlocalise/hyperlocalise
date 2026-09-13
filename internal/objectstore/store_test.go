package objectstore_test

import (
	"context"
	"errors"
	"io"
	"strings"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/objectstore"
	"github.com/hyperlocalise/hyperlocalise/internal/objectstore/memory"
	"github.com/stretchr/testify/require"
)

func TestRegistryPreservesOldLocation(t *testing.T) {
	ctx := t.Context()
	oldStore, newStore := memory.New(), memory.New()
	locations := map[string]objectstore.Store{"old": oldStore, "new": newStore}
	oldRegistry, err := objectstore.NewRegistry("old", locations)
	require.NoError(t, err)
	ref, _, err := oldRegistry.Put(ctx, objectstore.PutInput{Key: "file", Body: strings.NewReader("old"), Size: 3, ContentType: "text/plain"})
	require.NoError(t, err)
	registry, err := objectstore.NewRegistry("new", locations)
	require.NoError(t, err)
	locations["old"] = newStore // Registry must own a copy.
	resolved, err := registry.Resolve(ref.LocationID)
	require.NoError(t, err)
	body, _, err := resolved.Get(ctx, ref.Key)
	require.NoError(t, err)
	content, err := io.ReadAll(body)
	require.NoError(t, err)
	require.NoError(t, body.Close())
	require.Equal(t, "old", string(content))
	_, err = registry.Resolve("missing")
	require.ErrorIs(t, err, objectstore.ErrUnknownLocation)
	_, _, err = newStore.Get(ctx, ref.Key)
	require.ErrorIs(t, err, objectstore.ErrNotFound)
}

func TestMemoryContract(t *testing.T) {
	for _, tc := range []struct {
		name      string
		size      int64
		wantError bool
	}{
		{"empty", 0, false}, {"short", 2, true}, {"long", 4, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			content := "abc"
			if tc.size == 0 {
				content = ""
			}
			_, err := memory.New().Put(t.Context(), objectstore.PutInput{Key: "key", Body: strings.NewReader(content), Size: tc.size, ContentType: "text/plain"})
			if tc.wantError {
				require.ErrorIs(t, err, objectstore.ErrInvalidInput)
			} else {
				require.NoError(t, err)
			}
		})
	}
	store := memory.New()
	var winners atomic.Int32
	var wg sync.WaitGroup
	for range 20 {
		wg.Go(func() {
			_, err := store.Put(t.Context(), objectstore.PutInput{Key: "same", Body: strings.NewReader("a"), Size: 1, ContentType: "text/plain", IfAbsent: true})
			if err == nil {
				winners.Add(1)
			} else if !errors.Is(err, objectstore.ErrAlreadyExists) {
				t.Errorf("put: %v", err)
			}
		})
	}
	wg.Wait()
	require.EqualValues(t, 1, winners.Load())
	require.NoError(t, store.Delete(t.Context(), "same"))
	require.NoError(t, store.Delete(t.Context(), "same"))
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	_, err := store.Stat(ctx, "same")
	require.ErrorIs(t, err, context.Canceled)
}
