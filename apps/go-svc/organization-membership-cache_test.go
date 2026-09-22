package main

import (
	"context"
	"errors"
	"strconv"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"github.com/workos/workos-go/v10"
)

type membershipCacheTestStore struct {
	mu       sync.Mutex
	value    string
	getErr   error
	setErr   error
	setCalls int
	setTTL   time.Duration
}

func (s *membershipCacheTestStore) Get(context.Context, string) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.value, s.getErr
}

func (s *membershipCacheTestStore) Set(_ context.Context, _ string, value string, ttl time.Duration) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.setCalls++
	s.value = value
	s.setTTL = ttl
	return s.setErr
}

func sharedMembershipValue(role string, expiresAt time.Time) string {
	return `{"id":"om_live","userId":"user_live","organizationId":"org_live","status":"active","role":"` + role +
		`","expiresAt":` + strconv.FormatInt(expiresAt.UnixMilli(), 10) + `}`
}

func activeMembership() *workos.UserOrganizationMembership {
	return &workos.UserOrganizationMembership{
		ID:             "om_live",
		UserID:         "user_live",
		OrganizationID: "org_live",
		Status:         "active",
		Role:           &workos.SlimRole{Slug: "admin"},
	}
}

func TestOrganizationMembershipCache(t *testing.T) {
	t.Run("coalesces concurrent misses and caches locally", func(t *testing.T) {
		var calls atomic.Int32
		release := make(chan struct{})
		lookup := newCachedOrganizationMembershipLookup(
			func(context.Context, string) (*workos.UserOrganizationMembership, error) {
				calls.Add(1)
				<-release
				return activeMembership(), nil
			},
			nil,
		)

		const readers = 8
		results := make(chan *workos.UserOrganizationMembership, readers)
		for range readers {
			go func() {
				member, err := lookup(t.Context(), "om_live")
				require.NoError(t, err)
				results <- member
			}()
		}
		require.Eventually(t, func() bool { return calls.Load() == 1 }, time.Second, time.Millisecond)
		close(release)
		for range readers {
			require.Equal(t, "admin", (<-results).Role.Slug)
		}

		_, err := lookup(t.Context(), "om_live")
		require.NoError(t, err)
		require.Equal(t, int32(1), calls.Load())
	})

	t.Run("uses shared store before WorkOS", func(t *testing.T) {
		store := &membershipCacheTestStore{
			value: sharedMembershipValue("reviewer", time.Now().Add(organizationMembershipCacheTTL)),
		}
		var calls atomic.Int32
		lookup := newCachedOrganizationMembershipLookup(
			func(context.Context, string) (*workos.UserOrganizationMembership, error) {
				calls.Add(1)
				return activeMembership(), nil
			},
			store,
		)

		member, err := lookup(t.Context(), "om_live")
		require.NoError(t, err)
		require.Equal(t, "reviewer", member.Role.Slug)
		require.Zero(t, calls.Load())
	})

	for _, tc := range []struct {
		name     string
		store    *membershipCacheTestStore
		wantSets int
	}{
		{name: "cache miss", store: &membershipCacheTestStore{getErr: errors.New("miss")}, wantSets: 1},
		{name: "corrupt cache value", store: &membershipCacheTestStore{value: "{"}, wantSets: 1},
		{name: "cache write failure is non fatal", store: &membershipCacheTestStore{getErr: errors.New("down"), setErr: errors.New("down")}, wantSets: 1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var calls atomic.Int32
			lookup := newCachedOrganizationMembershipLookup(
				func(context.Context, string) (*workos.UserOrganizationMembership, error) {
					calls.Add(1)
					return activeMembership(), nil
				},
				tc.store,
			)

			member, err := lookup(t.Context(), "om_live")
			require.NoError(t, err)
			require.Equal(t, "admin", member.Role.Slug)
			require.Equal(t, int32(1), calls.Load())
			require.Equal(t, tc.wantSets, tc.store.setCalls)
		})
	}

	t.Run("expired local value is refreshed", func(t *testing.T) {
		now := time.Date(2026, 9, 22, 12, 0, 0, 0, time.UTC)
		var calls atomic.Int32
		cache := &organizationMembershipCache{
			live: func(context.Context, string) (*workos.UserOrganizationMembership, error) {
				calls.Add(1)
				return activeMembership(), nil
			},
			now:   func() time.Time { return now },
			local: make(map[string]localMembershipCacheEntry),
		}

		_, err := cache.lookup(t.Context(), "om_live")
		require.NoError(t, err)
		now = now.Add(organizationMembershipCacheTTL + time.Second)
		_, err = cache.lookup(t.Context(), "om_live")
		require.NoError(t, err)
		require.Equal(t, int32(2), calls.Load())
	})

	t.Run("local copy inherits the shared expiry", func(t *testing.T) {
		now := time.Date(2026, 9, 22, 12, 0, 0, 0, time.UTC)
		var calls atomic.Int32
		store := &membershipCacheTestStore{
			value: sharedMembershipValue("reviewer", now.Add(time.Second)),
		}
		cache := &organizationMembershipCache{
			live: func(context.Context, string) (*workos.UserOrganizationMembership, error) {
				calls.Add(1)
				return activeMembership(), nil
			},
			store: store,
			now:   func() time.Time { return now },
			local: make(map[string]localMembershipCacheEntry),
		}

		member, err := cache.lookup(t.Context(), "om_live")
		require.NoError(t, err)
		require.Equal(t, "reviewer", member.Role.Slug)
		require.Zero(t, calls.Load())

		// The shared entry expires one second from now, so the local copy must
		// expire with it rather than surviving another full TTL.
		now = now.Add(2 * time.Second)
		member, err = cache.lookup(t.Context(), "om_live")
		require.NoError(t, err)
		require.Equal(t, "admin", member.Role.Slug)
		require.Equal(t, int32(1), calls.Load())
		require.Equal(t, organizationMembershipCacheTTL, store.setTTL)
	})

	for _, tc := range []struct {
		name  string
		value string
	}{
		{name: "expired shared value", value: sharedMembershipValue("reviewer", time.Now().Add(-time.Second))},
		{name: "shared value without expiry", value: `{"id":"om_live","userId":"user_live","organizationId":"org_live","status":"active","role":"reviewer"}`},
	} {
		t.Run(tc.name+" is ignored", func(t *testing.T) {
			var calls atomic.Int32
			store := &membershipCacheTestStore{value: tc.value}
			lookup := newCachedOrganizationMembershipLookup(
				func(context.Context, string) (*workos.UserOrganizationMembership, error) {
					calls.Add(1)
					return activeMembership(), nil
				},
				store,
			)

			member, err := lookup(t.Context(), "om_live")
			require.NoError(t, err)
			require.Equal(t, "admin", member.Role.Slug)
			require.Equal(t, int32(1), calls.Load())
		})
	}
}
