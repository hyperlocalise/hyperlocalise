package experiment

import (
	"sync"
	"time"
)

const defaultEvaluationCacheMaxEntries = 4096

type ttlCache struct {
	mu         sync.Mutex
	entries    map[string]ttlEntry
	ttl        time.Duration
	maxEntries int
}

type ttlEntry struct {
	value     cachedEvaluation
	expiresAt time.Time
}

func newTTLCache(ttl time.Duration) *ttlCache {
	return newBoundedTTLCache(ttl, defaultEvaluationCacheMaxEntries)
}

func newBoundedTTLCache(ttl time.Duration, maxEntries int) *ttlCache {
	if maxEntries < 1 {
		maxEntries = 1
	}
	return &ttlCache{
		entries:    make(map[string]ttlEntry),
		ttl:        ttl,
		maxEntries: maxEntries,
	}
}

func (c *ttlCache) get(key string) (cachedEvaluation, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	entry, ok := c.entries[key]
	if !ok {
		return cachedEvaluation{}, false
	}
	if time.Now().After(entry.expiresAt) {
		delete(c.entries, key)
		return cachedEvaluation{}, false
	}
	return entry.value, true
}

func (c *ttlCache) set(key string, value cachedEvaluation) {
	c.mu.Lock()
	defer c.mu.Unlock()
	now := time.Now()
	c.entries[key] = ttlEntry{value: value, expiresAt: now.Add(c.ttl)}
	if len(c.entries) <= c.maxEntries {
		return
	}
	c.evictExpiredLocked(now)
	for len(c.entries) > c.maxEntries {
		c.deleteOldestLocked()
	}
}

func (c *ttlCache) evictExpiredLocked(now time.Time) {
	for key, entry := range c.entries {
		if now.After(entry.expiresAt) {
			delete(c.entries, key)
		}
	}
}

func (c *ttlCache) deleteOldestLocked() {
	var oldestKey string
	var oldest time.Time
	first := true
	for key, entry := range c.entries {
		if first || entry.expiresAt.Before(oldest) {
			oldestKey = key
			oldest = entry.expiresAt
			first = false
		}
	}
	if oldestKey != "" {
		delete(c.entries, oldestKey)
	}
}

func (c *ttlCache) len() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return len(c.entries)
}
