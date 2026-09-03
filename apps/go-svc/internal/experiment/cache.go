package experiment

import (
	"sync"
	"time"
)

type ttlCache struct {
	mu      sync.Mutex
	entries map[string]ttlEntry
	ttl     time.Duration
}

type ttlEntry struct {
	value     cachedEvaluation
	expiresAt time.Time
}

func newTTLCache(ttl time.Duration) *ttlCache {
	return &ttlCache{
		entries: make(map[string]ttlEntry),
		ttl:     ttl,
	}
}

func (c *ttlCache) get(key string) (cachedEvaluation, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	entry, ok := c.entries[key]
	if !ok || time.Now().After(entry.expiresAt) {
		delete(c.entries, key)
		return cachedEvaluation{}, false
	}
	return entry.value, true
}

func (c *ttlCache) set(key string, value cachedEvaluation) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.entries[key] = ttlEntry{value: value, expiresAt: time.Now().Add(c.ttl)}
}
