package reporting

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

type countingWorkspaceFlags struct {
	enabled bool
	err     error
	calls   int
}

func (f *countingWorkspaceFlags) Enabled(context.Context, string, string, string) (bool, error) {
	f.calls++
	return f.enabled, f.err
}

func TestCachedWorkspaceFlagsRemembersAnswersForAMinute(t *testing.T) {
	live := &countingWorkspaceFlags{enabled: true}
	cache := newCachedWorkspaceFlags(live)
	now := time.Date(2026, 6, 15, 12, 0, 0, 0, time.UTC)
	cache.now = func() time.Time { return now }
	ctx := t.Context()

	for range 3 {
		enabled, err := cache.Enabled(ctx, "org_1", "user_1", workspaceReportsFlag)
		require.NoError(t, err)
		require.True(t, enabled)
	}
	require.Equal(t, 1, live.calls, "one lookup serves a minute of requests")

	// Another person, workspace or flag is its own entry.
	_, err := cache.Enabled(ctx, "org_1", "user_2", workspaceReportsFlag)
	require.NoError(t, err)
	_, err = cache.Enabled(ctx, "org_2", "user_1", workspaceReportsFlag)
	require.NoError(t, err)
	require.Equal(t, 3, live.calls)

	now = now.Add(reportingFlagCacheTTL + time.Second)
	live.enabled = false
	enabled, err := cache.Enabled(ctx, "org_1", "user_1", workspaceReportsFlag)
	require.NoError(t, err)
	require.False(t, enabled, "a change reaches the cache once the entry expires")
	require.Equal(t, 4, live.calls)
}

func TestCachedWorkspaceFlagsLookupOutlivesTheFirstCaller(t *testing.T) {
	live := &contextWorkspaceFlags{}
	cache := newCachedWorkspaceFlags(live)
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	// The caller that started the lookup is gone; the lookup still answers for the others.
	enabled, err := cache.Enabled(ctx, "org_1", "user_1", workspaceReportsFlag)
	require.NoError(t, err)
	require.True(t, enabled)
	require.NoError(t, live.seen)
}

type contextWorkspaceFlags struct{ seen error }

func (f *contextWorkspaceFlags) Enabled(ctx context.Context, _, _, _ string) (bool, error) {
	f.seen = ctx.Err()
	return true, nil
}

func TestCachedWorkspaceFlagsNeverKeepsAFailedLookup(t *testing.T) {
	live := &countingWorkspaceFlags{err: errors.New("workos unavailable")}
	cache := newCachedWorkspaceFlags(live)
	ctx := t.Context()
	for range 2 {
		enabled, err := cache.Enabled(ctx, "org_1", "user_1", workspaceReportsFlag)
		require.Error(t, err)
		require.False(t, enabled)
	}
	require.Equal(t, 2, live.calls, "each request asks again after a failure")

	none := newCachedWorkspaceFlags(nil)
	enabled, err := none.Enabled(ctx, "org_1", "user_1", workspaceReportsFlag)
	require.NoError(t, err)
	require.False(t, enabled, "no WorkOS client means no flag")
}

func TestCachedWorkspaceFlagsAsksOnceForRequestsThatMissTogether(t *testing.T) {
	live := &blockingWorkspaceFlags{release: make(chan struct{})}
	cache := newCachedWorkspaceFlags(live)
	ctx := t.Context()
	var wg sync.WaitGroup
	for range 12 {
		wg.Go(func() {
			enabled, err := cache.Enabled(ctx, "org_1", "user_1", workspaceReportsFlag)
			require.NoError(t, err)
			require.True(t, enabled)
		})
	}
	require.Eventually(t, func() bool { return live.started.Load() == 1 }, time.Second, time.Millisecond)
	close(live.release)
	wg.Wait()
	require.Equal(t, int32(1), live.started.Load(), "a page load's requests share one lookup")
}

type blockingWorkspaceFlags struct {
	release chan struct{}
	started atomic.Int32
}

func (f *blockingWorkspaceFlags) Enabled(context.Context, string, string, string) (bool, error) {
	f.started.Add(1)
	<-f.release
	return true, nil
}

func TestReportingWorkspaceCannotHoldEverySlot(t *testing.T) {
	api := New()
	busy := withReportingWorkspace(t.Context(), "org_busy")
	var releases []func()
	for range reportingWorkspaceQueriesAtOnce {
		release, err := api.admit(busy)
		require.NoError(t, err)
		releases = append(releases, release)
	}

	// The busy workspace's next request waits for its own slot and runs out of time.
	ctx, cancel := context.WithTimeout(busy, 50*time.Millisecond)
	defer cancel()
	_, err := api.admit(ctx)
	require.ErrorIs(t, err, errReportingBusy)

	// Another workspace still gets in at once.
	other, err := api.admit(withReportingWorkspace(t.Context(), "org_other"))
	require.NoError(t, err)
	other()

	for _, release := range releases {
		release()
	}
	require.Equal(t, 0, api.Workspaces.held(), "a workspace's slots are forgotten once nobody holds them")
}

func TestReportingServiceLimitStillHoldsAcrossWorkspaces(t *testing.T) {
	api := New()
	var releases []func()
	for i := range reportingQueriesAtOnce {
		release, err := api.admit(withReportingWorkspace(t.Context(), fmt.Sprintf("org_%d", i)))
		require.NoError(t, err)
		releases = append(releases, release)
	}
	ctx, cancel := context.WithTimeout(withReportingWorkspace(t.Context(), "org_late"), 50*time.Millisecond)
	defer cancel()
	_, err := api.admit(ctx)
	require.ErrorIs(t, err, errReportingBusy)
	for _, release := range releases {
		release()
	}
	require.Equal(t, 0, api.Workspaces.held(), "a request that gave up leaves no slot behind")
}

func TestReportingAdmitWithoutAWorkspaceUsesTheServiceLimitOnly(t *testing.T) {
	api := New()
	release, err := api.admit(t.Context())
	require.NoError(t, err)
	release()
	require.Equal(t, 0, api.Workspaces.held())
}
