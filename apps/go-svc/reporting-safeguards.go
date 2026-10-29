package main

import (
	"context"
	"fmt"
	"sync"
	"time"

	"golang.org/x/sync/singleflight"
)

// Guards for a service whose size is not known: the flag check is cached, at most two requests
// read at once per copy, and each reads on one pooled connection with a time limit per statement.

const (
	reportingFlagCacheTTL   = time.Minute
	reportingFlagCacheLimit = 10_000
)

// cachedWorkspaceFlags remembers each flag answer for a minute, and lets one lookup serve the
// requests that miss together, so a Reports page's dozen requests ask WorkOS once rather than
// up to twice each. Failed lookups are not kept: those requests fail closed and the next asks again.
type cachedWorkspaceFlags struct {
	live workspaceFlagChecker
	now  func() time.Time

	mu      sync.Mutex
	entries map[string]cachedWorkspaceFlag
	flights singleflight.Group
}

type cachedWorkspaceFlag struct {
	enabled   bool
	expiresAt time.Time
}

func newCachedWorkspaceFlags(live workspaceFlagChecker) *cachedWorkspaceFlags {
	return &cachedWorkspaceFlags{live: live, now: time.Now, entries: map[string]cachedWorkspaceFlag{}}
}

func (c *cachedWorkspaceFlags) Enabled(ctx context.Context, workosOrganizationID, workosUserID, slug string) (bool, error) {
	if c.live == nil {
		return false, nil
	}
	key := workosOrganizationID + "\x00" + workosUserID + "\x00" + slug
	if enabled, ok := c.cached(key); ok {
		return enabled, nil
	}
	result, err, _ := c.flights.Do(key, func() (any, error) {
		if enabled, ok := c.cached(key); ok {
			return enabled, nil
		}
		enabled, err := c.live.Enabled(ctx, workosOrganizationID, workosUserID, slug)
		if err != nil {
			return false, err
		}
		c.mu.Lock()
		if len(c.entries) >= reportingFlagCacheLimit {
			clear(c.entries)
		}
		c.entries[key] = cachedWorkspaceFlag{enabled: enabled, expiresAt: c.now().Add(reportingFlagCacheTTL)}
		c.mu.Unlock()
		return enabled, nil
	})
	if err != nil {
		return false, err
	}
	return result.(bool), nil
}

func (c *cachedWorkspaceFlags) cached(key string) (bool, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	entry, ok := c.entries[key]
	if !ok || !entry.expiresAt.After(c.now()) {
		return false, false
	}
	return entry.enabled, true
}

// read runs fn's queries on one pooled connection, in a read-only transaction whose statements
// are each limited to reportingStatementTimeout, once one of the reportingQueriesAtOnce slots is
// free. The slot and the transaction end together, before the answer is written.
func (api *reportingAPI) read(ctx context.Context, fn func(db dictionaryDB) error) error {
	// Waiting runs out with the request's own time limit: busy either way.
	if err := api.queries.Acquire(ctx, 1); err != nil {
		return errReportingBusy
	}
	defer api.queries.Release(1)
	tx, err := api.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err := tx.Exec(ctx, "set transaction read only"); err != nil {
		return err
	}
	// SET takes no parameters; the value is a constant of this file.
	if _, err := tx.Exec(ctx, fmt.Sprintf("set local statement_timeout = %d", reportingStatementTimeout.Milliseconds())); err != nil {
		return err
	}
	return fn(tx)
}
