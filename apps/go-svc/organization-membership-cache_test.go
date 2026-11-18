package main

import (
	"context"
	"sync/atomic"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/hyperlocalise/hyperlocalise/internal/publicauth"
	"github.com/stretchr/testify/require"
	"github.com/workos/workos-go/v10"
)

func TestOrganizationMembershipCacheLiveValkey(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "admin"})
	membershipID := "om_live_" + scope.Slug
	var calls atomic.Int32
	live := func(context.Context, string) (*workos.UserOrganizationMembership, error) {
		calls.Add(1)
		return &workos.UserOrganizationMembership{
			ID:             membershipID,
			UserID:         scope.WorkOSUserID,
			OrganizationID: "org_live",
			Status:         "active",
			Role:           &workos.SlimRole{Slug: "admin"},
		}, nil
	}
	first := publicauth.NewCachedMembershipLookup(live, scope.Valkey)
	member, err := first(t.Context(), membershipID)
	require.NoError(t, err)
	require.Equal(t, "admin", member.Role.Slug)
	require.Equal(t, int32(1), calls.Load())

	second := publicauth.NewCachedMembershipLookup(live, scope.Valkey)
	member, err = second(t.Context(), membershipID)
	require.NoError(t, err)
	require.Equal(t, "admin", member.Role.Slug)
	require.Equal(t, int32(1), calls.Load())
}
