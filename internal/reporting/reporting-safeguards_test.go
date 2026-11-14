package reporting

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

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
