package experiment

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestTTLCacheExpiresSingleKey(t *testing.T) {
	cache := newBoundedTTLCache(20*time.Millisecond, 8)
	cache.set("a", cachedEvaluation{etag: "1"})
	got, ok := cache.get("a")
	require.True(t, ok)
	require.Equal(t, "1", got.etag)

	time.Sleep(30 * time.Millisecond)
	_, ok = cache.get("a")
	require.False(t, ok)
	require.Equal(t, 0, cache.len())
}

func TestTTLCacheEvictsExpiredOnOverflow(t *testing.T) {
	cache := newBoundedTTLCache(20*time.Millisecond, 2)
	cache.set("stale-1", cachedEvaluation{etag: "1"})
	cache.set("stale-2", cachedEvaluation{etag: "2"})
	time.Sleep(30 * time.Millisecond)
	cache.set("fresh", cachedEvaluation{etag: "3"})
	require.Equal(t, 1, cache.len())
	got, ok := cache.get("fresh")
	require.True(t, ok)
	require.Equal(t, "3", got.etag)
}

func TestTTLCacheBoundsUnexpiredEntries(t *testing.T) {
	cache := newBoundedTTLCache(time.Hour, 2)
	cache.set("one", cachedEvaluation{etag: "1"})
	time.Sleep(2 * time.Millisecond)
	cache.set("two", cachedEvaluation{etag: "2"})
	time.Sleep(2 * time.Millisecond)
	cache.set("three", cachedEvaluation{etag: "3"})
	require.Equal(t, 2, cache.len())
	_, ok := cache.get("one")
	require.False(t, ok)
	got, ok := cache.get("three")
	require.True(t, ok)
	require.Equal(t, "3", got.etag)
}
