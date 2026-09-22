package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/workos/workos-go/v10"
	"golang.org/x/sync/singleflight"
)

const (
	organizationMembershipCacheTTL        = 30 * time.Second
	organizationMembershipCacheTimeout    = 75 * time.Millisecond
	organizationMembershipLocalCacheLimit = 10_000
)

type organizationMembershipCacheStore interface {
	Get(context.Context, string) (string, error)
	Set(context.Context, string, string, time.Duration) error
}

type cachedOrganizationMembership struct {
	ID             string `json:"id"`
	UserID         string `json:"userId"`
	OrganizationID string `json:"organizationId"`
	Status         string `json:"status"`
	Role           string `json:"role"`
}

// cachedMembershipPayload is the shared-store representation. The absolute
// expiry keeps every instance inside the same revocation window instead of
// restarting the TTL each time an entry is copied into a local cache.
type cachedMembershipPayload struct {
	cachedOrganizationMembership
	ExpiresAtMilli int64 `json:"expiresAt"`
}

func cachedMembershipFromWorkOS(member *workos.UserOrganizationMembership) (cachedOrganizationMembership, bool) {
	if member == nil || member.Role == nil {
		return cachedOrganizationMembership{}, false
	}
	cached := cachedOrganizationMembership{
		ID:             strings.TrimSpace(member.ID),
		UserID:         strings.TrimSpace(member.UserID),
		OrganizationID: strings.TrimSpace(member.OrganizationID),
		Status:         strings.TrimSpace(string(member.Status)),
		Role:           strings.TrimSpace(member.Role.Slug),
	}
	return cached, cached.ID != "" && cached.UserID != "" && cached.OrganizationID != "" && cached.Status != "" && cached.Role != ""
}

func (m cachedOrganizationMembership) workOSMembership() *workos.UserOrganizationMembership {
	return &workos.UserOrganizationMembership{
		ID:             m.ID,
		UserID:         m.UserID,
		OrganizationID: m.OrganizationID,
		Status:         workos.UserOrganizationMembershipStatus(m.Status),
		Role:           &workos.SlimRole{Slug: m.Role},
	}
}

type localMembershipCacheEntry struct {
	membership cachedOrganizationMembership
	expiresAt  time.Time
}

type organizationMembershipCache struct {
	live  organizationMembershipLookup
	store organizationMembershipCacheStore
	now   func() time.Time

	mu      sync.Mutex
	local   map[string]localMembershipCacheEntry
	flights singleflight.Group
}

func newCachedOrganizationMembershipLookup(
	live organizationMembershipLookup,
	store organizationMembershipCacheStore,
) organizationMembershipLookup {
	if live == nil {
		return nil
	}
	cache := &organizationMembershipCache{
		live:  live,
		store: store,
		now:   time.Now,
		local: make(map[string]localMembershipCacheEntry),
	}
	return cache.lookup
}

func membershipCacheKey(membershipID string) string {
	digest := sha256.Sum256([]byte(strings.TrimSpace(membershipID)))
	return "go-svc:organization-membership:v1:" + hex.EncodeToString(digest[:])
}

func (c *organizationMembershipCache) localGet(key string) (*workos.UserOrganizationMembership, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	entry, ok := c.local[key]
	if !ok {
		return nil, false
	}
	if !c.now().Before(entry.expiresAt) {
		delete(c.local, key)
		return nil, false
	}
	return entry.membership.workOSMembership(), true
}

func (c *organizationMembershipCache) localSet(key string, membership cachedOrganizationMembership, expiresAt time.Time) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if limit := c.now().Add(organizationMembershipCacheTTL); expiresAt.After(limit) {
		expiresAt = limit
	}
	if len(c.local) >= organizationMembershipLocalCacheLimit {
		clear(c.local)
	}
	c.local[key] = localMembershipCacheEntry{
		membership: membership,
		expiresAt:  expiresAt,
	}
}

func (c *organizationMembershipCache) storeGet(ctx context.Context, key string) (*workos.UserOrganizationMembership, bool) {
	if c.store == nil {
		return nil, false
	}
	cacheCtx, cancel := context.WithTimeout(ctx, organizationMembershipCacheTimeout)
	raw, err := c.store.Get(cacheCtx, key)
	cancel()
	if err != nil {
		return nil, false
	}
	var payload cachedMembershipPayload
	if json.Unmarshal([]byte(raw), &payload) != nil {
		return nil, false
	}
	member := payload.workOSMembership()
	if _, ok := cachedMembershipFromWorkOS(member); !ok {
		return nil, false
	}
	expiresAt := time.UnixMilli(payload.ExpiresAtMilli)
	if !c.now().Before(expiresAt) {
		return nil, false
	}
	c.localSet(key, payload.cachedOrganizationMembership, expiresAt)
	return member, true
}

func (c *organizationMembershipCache) storeSet(ctx context.Context, key string, membership cachedOrganizationMembership, expiresAt time.Time) {
	if c.store == nil {
		return
	}
	payload, err := json.Marshal(cachedMembershipPayload{
		cachedOrganizationMembership: membership,
		ExpiresAtMilli:               expiresAt.UnixMilli(),
	})
	if err != nil {
		return
	}
	ttl := expiresAt.Sub(c.now())
	if ttl <= 0 {
		return
	}
	cacheCtx, cancel := context.WithTimeout(ctx, organizationMembershipCacheTimeout)
	err = c.store.Set(cacheCtx, key, string(payload), ttl)
	cancel()
	if err != nil {
		slog.WarnContext(ctx, "organization_membership_cache_write_failed")
	}
}

func (c *organizationMembershipCache) lookup(ctx context.Context, membershipID string) (*workos.UserOrganizationMembership, error) {
	key := membershipCacheKey(membershipID)
	if member, ok := c.localGet(key); ok {
		return member, nil
	}

	value, err, _ := c.flights.Do(key, func() (any, error) {
		if member, ok := c.localGet(key); ok {
			return member, nil
		}
		if member, ok := c.storeGet(ctx, key); ok {
			return member, nil
		}
		member, err := c.live(ctx, membershipID)
		if err != nil {
			return nil, err
		}
		cached, ok := cachedMembershipFromWorkOS(member)
		if !ok {
			return member, nil
		}
		expiresAt := c.now().Add(organizationMembershipCacheTTL)
		c.localSet(key, cached, expiresAt)
		c.storeSet(ctx, key, cached, expiresAt)
		return member, nil
	})
	if err != nil {
		return nil, err
	}
	member, _ := value.(*workos.UserOrganizationMembership)
	return member, nil
}
