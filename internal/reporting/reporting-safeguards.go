package reporting

import (
	"context"
	"fmt"
	"sync"

	"github.com/jackc/pgx/v5"
	"golang.org/x/sync/semaphore"
)

// Guards for a service whose size is not known: at most reportingQueriesAtOnce requests read at
// once per copy (and one workspace holds at most reportingWorkspaceQueriesAtOnce of them), and
// each reads on one pooled connection with a time limit per statement.

// write runs fn in a transaction on one pooled connection, under the same admission limit and
// statement time limit as a read, and commits when fn returns nil.
func (api *API) write(ctx context.Context, fn func(tx pgx.Tx) error) error {
	release, err := api.admit(ctx)
	if err != nil {
		return err
	}
	defer release()
	tx, err := api.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err := tx.Exec(ctx, fmt.Sprintf("set local statement_timeout = %d", reportingStatementTimeout.Milliseconds())); err != nil {
		return err
	}
	if err := fn(tx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// read runs fn's queries on one pooled connection, in a read-only transaction whose statements
// are each limited to reportingStatementTimeout, once one of the reportingQueriesAtOnce slots is
// free. The slot and the transaction end together, before the answer is written.
func (api *API) read(ctx context.Context, fn func(db DB) error) error {
	release, err := api.admit(ctx)
	if err != nil {
		return err
	}
	defer release()
	tx, err := api.Pool.Begin(ctx)
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

// admit takes the request's workspace slot, then one of the service's. The workspace slot comes
// first, so a workspace's queued requests wait on each other without holding a service slot.
// Waiting runs out with the request's own time limit: busy either way.
func (api *API) admit(ctx context.Context) (func(), error) {
	releaseWorkspace := func() {}
	if organizationID, ok := reportingWorkspaceOf(ctx); ok && api.Workspaces != nil {
		release, err := api.Workspaces.acquire(ctx, organizationID)
		if err != nil {
			return nil, errReportingBusy
		}
		releaseWorkspace = release
	}
	if err := api.Queries.Acquire(ctx, 1); err != nil {
		releaseWorkspace()
		return nil, errReportingBusy
	}
	return func() {
		api.Queries.Release(1)
		releaseWorkspace()
	}, nil
}

type reportingWorkspaceKey struct{}

// withReportingWorkspace names the workspace a request reads for, so read and write admit it
// under that workspace's own limit.
func withReportingWorkspace(ctx context.Context, organizationID string) context.Context {
	return context.WithValue(ctx, reportingWorkspaceKey{}, organizationID)
}

func reportingWorkspaceOf(ctx context.Context) (string, bool) {
	organizationID, ok := ctx.Value(reportingWorkspaceKey{}).(string)
	return organizationID, ok && organizationID != ""
}

// reportingWorkspaceSlots is a semaphore per workspace, kept only while someone holds or waits
// for it, so the map never grows past the workspaces reading right now.
type reportingWorkspaceSlots struct {
	limit   int64
	mu      sync.Mutex
	entries map[string]*reportingWorkspaceSlot
}

type reportingWorkspaceSlot struct {
	slots *semaphore.Weighted
	users int
}

func newReportingWorkspaceSlots(limit int) *reportingWorkspaceSlots {
	return &reportingWorkspaceSlots{limit: int64(max(limit, 1)), entries: map[string]*reportingWorkspaceSlot{}}
}

func (s *reportingWorkspaceSlots) acquire(ctx context.Context, organizationID string) (func(), error) {
	s.mu.Lock()
	entry, ok := s.entries[organizationID]
	if !ok {
		entry = &reportingWorkspaceSlot{slots: semaphore.NewWeighted(s.limit)}
		s.entries[organizationID] = entry
	}
	entry.users++
	s.mu.Unlock()
	if err := entry.slots.Acquire(ctx, 1); err != nil {
		s.leave(organizationID, entry)
		return nil, err
	}
	return func() {
		entry.slots.Release(1)
		s.leave(organizationID, entry)
	}, nil
}

func (s *reportingWorkspaceSlots) leave(organizationID string, entry *reportingWorkspaceSlot) {
	s.mu.Lock()
	defer s.mu.Unlock()
	entry.users--
	if entry.users == 0 {
		delete(s.entries, organizationID)
	}
}

// held is how many workspaces hold or wait for a slot; for tests.
func (s *reportingWorkspaceSlots) held() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.entries)
}
