package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	gosvcvalkey "github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/valkey"
)

type domainResearchCache interface {
	Get(context.Context, string) (string, error)
	Set(context.Context, string, string, time.Duration) error
	Incr(context.Context, string) (int64, error)
}

const (
	domainResearchKeywordCacheTTL = 7 * 24 * time.Hour
	domainResearchSerpCacheTTL    = 24 * time.Hour
	domainResearchQuotaTimeout    = 500 * time.Millisecond
	domainResearchKeywordQuota    = 100
	domainResearchSerpQuota       = 500
	domainResearchRankQuota       = 1000
)

func domainResearchCacheKey(prefix string, parts ...string) string {
	h := sha256.New()
	for _, part := range parts {
		h.Write([]byte(strings.ToLower(strings.TrimSpace(part))))
		h.Write([]byte{0})
	}
	return "domain-research:" + prefix + ":" + hex.EncodeToString(h.Sum(nil))
}

func (h *handler) consumeDomainResearchQuota(ctx context.Context, organizationID, operation string, units, limit int) error {
	if h.researchCache == nil || units <= 0 {
		return nil
	}
	quotaCtx, cancel := context.WithTimeout(ctx, domainResearchQuotaTimeout)
	defer cancel()
	key := domainResearchCacheKey("quota", organizationID, operation, time.Now().UTC().Format("2006-01-02"))
	var count int64
	for i := 0; i < units; i++ {
		var err error
		count, err = h.researchCache.Incr(quotaCtx, key)
		if err != nil {
			return workspaceFailure(503, "research_quota_unavailable", "Usage controls are temporarily unavailable.")
		}
	}
	if count == int64(units) {
		ttl := time.Until(time.Now().UTC().Truncate(24 * time.Hour).Add(24 * time.Hour))
		if err := h.researchCache.Set(quotaCtx, key, fmt.Sprint(count), ttl); err != nil {
			return workspaceFailure(503, "research_quota_unavailable", "Usage controls are temporarily unavailable.")
		}
	}
	if count > int64(limit) {
		return workspaceFailure(429, "research_quota_exceeded", "This organization has reached its daily domain research limit.")
	}
	return nil
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
