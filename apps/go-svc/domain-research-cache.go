package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"strings"
	"time"

	gosvcvalkey "github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/valkey"
)

// domainResearchCache stores keyword-idea response caches. Usage entitlement for
// research mutations is enforced by workspace-domains on each route; there is no
// per-organization daily quota in this layer.
type domainResearchCache interface {
	Get(context.Context, string) (string, error)
	Set(context.Context, string, string, time.Duration) error
}

const (
	DOMAIN_RESEARCH_KEYWORD_CACHE_TTL = 7 * 24 * time.Hour
	DOMAIN_RESEARCH_SERP_CACHE_TTL    = 24 * time.Hour
)

func domainResearchCacheKey(prefix string, parts ...string) string {
	h := sha256.New()
	for _, part := range parts {
		h.Write([]byte(strings.ToLower(strings.TrimSpace(part))))
		h.Write([]byte{0})
	}
	return "domain-research:" + prefix + ":" + hex.EncodeToString(h.Sum(nil))
}

func cachedJSON[T any](ctx context.Context, cache domainResearchCache, key string, target *T) (bool, error) {
	if cache == nil {
		return false, nil
	}
	value, err := cache.Get(ctx, key)
	if err == gosvcvalkey.ErrNil {
		return false, nil
	}
	if err != nil {
		return false, workspaceFailure(503, "research_cache_unavailable", "Research cache is temporarily unavailable.")
	}
	if err := json.Unmarshal([]byte(value), target); err != nil {
		return false, nil
	}
	return true, nil
}
