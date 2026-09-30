package main

import (
	"context"
	"errors"
	"os"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
	"github.com/workos/workos-go/v10"
)

func TestResolveOrganizationActor(t *testing.T) {
	lookup := func(scope *testenv.Scope, modify func(*workos.UserOrganizationMembership), err error) organizationMembershipLookup {
		return func(context.Context, string) (*workos.UserOrganizationMembership, error) {
			m := &workos.UserOrganizationMembership{
				ID:             scope.WorkOSMembershipID,
				UserID:         scope.WorkOSUserID,
				OrganizationID: scope.WorkOSOrganizationID,
				Status:         "active",
				Role:           &workos.SlimRole{Slug: "admin"},
			}
			if modify != nil {
				modify(m)
			}
			return m, err
		}
	}

	t.Run("placeholder never queries database", func(t *testing.T) {
		_, err := resolveOrganizationActor(t.Context(), nil, func(context.Context, string) (*workos.UserOrganizationMembership, error) {
			t.Fatal("must not look up membership")
			return nil, nil
		}, AuthClaims{UserID: "invited_user_123"}, "acme")
		require.EqualError(t, err, "organization_access_denied")
	})

	t.Run("local membership absent", func(t *testing.T) {
		scope := testenv.Seed(t, testenv.Options{Role: "admin"})
		_, err := resolveOrganizationActor(t.Context(), scope.Pool, lookup(scope, nil, nil), AuthClaims{UserID: scope.WorkOSUserID}, "missing-slug")
		require.EqualError(t, err, "organization_access_denied")
	})

	t.Run("database error is not remapped", func(t *testing.T) {
		scope := testenv.Seed(t, testenv.Options{Role: "admin"})
		closed, err := pgxpool.New(t.Context(), os.Getenv(testenv.EnvDatabaseURL))
		require.NoError(t, err)
		closed.Close()
		_, err = resolveOrganizationActor(t.Context(), closed, lookup(scope, nil, nil), AuthClaims{UserID: scope.WorkOSUserID}, scope.Slug)
		require.Error(t, err)
		require.NotEqual(t, "organization_access_denied", err.Error())
	})

	for _, tc := range []struct {
		name   string
		modify func(*workos.UserOrganizationMembership)
		err    error
		nilFn  bool
		code   string
	}{
		{name: "revoked", modify: func(m *workos.UserOrganizationMembership) { m.Status = "inactive" }, code: "organization_access_denied"},
		{name: "pending", modify: func(m *workos.UserOrganizationMembership) { m.Status = "pending" }, code: "organization_access_denied"},
		{name: "wrong user", modify: func(m *workos.UserOrganizationMembership) { m.UserID = "other" }, code: "organization_access_denied"},
		{name: "wrong org", modify: func(m *workos.UserOrganizationMembership) { m.OrganizationID = "other" }, code: "organization_access_denied"},
		{name: "wrong membership", modify: func(m *workos.UserOrganizationMembership) { m.ID = "other" }, code: "organization_access_denied"},
		{name: "missing role", modify: func(m *workos.UserOrganizationMembership) { m.Role = nil }, code: "organization_access_denied"},
		{name: "unknown role", modify: func(m *workos.UserOrganizationMembership) { m.Role.Slug = "owner" }, code: "organization_access_denied"},
		{name: "lookup unavailable", err: errors.New("unavailable"), code: "workos_membership_lookup_failed"},
		{name: "removed membership", err: &workos.APIError{StatusCode: 404}, code: "organization_access_denied"},
		{name: "lookup missing", nilFn: true, code: "workos_membership_lookup_failed"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			scope := testenv.Seed(t, testenv.Options{Role: "admin"})
			var fn organizationMembershipLookup
			if !tc.nilFn {
				fn = lookup(scope, tc.modify, tc.err)
			}
			_, err := resolveOrganizationActor(t.Context(), scope.Pool, fn, AuthClaims{UserID: scope.WorkOSUserID}, scope.Slug)
			require.EqualError(t, err, tc.code)
		})
	}

	t.Run("active known role", func(t *testing.T) {
		scope := testenv.Seed(t, testenv.Options{Role: "admin"})
		actor, err := resolveOrganizationActor(t.Context(), scope.Pool, lookup(scope, nil, nil), AuthClaims{UserID: scope.WorkOSUserID}, scope.Slug)
		require.NoError(t, err)
		require.Equal(t, organizationActor{userID: scope.UserID, organizationID: scope.OrganizationID, role: "admin"}, actor)
	})
}

func TestMapOrganizationAccessError(t *testing.T) {
	err := mapOrganizationAccessError(organizationAccessDenied(), dictionaryFailure)
	require.EqualError(t, err, "organization_access_denied")
	var failure *dictionaryError
	require.True(t, errors.As(err, &failure))
	require.Equal(t, 403, failure.status)
	require.Equal(t, "Organization access denied", failure.message)

	passthrough := errors.New("query failed")
	require.Equal(t, passthrough, mapOrganizationAccessError(passthrough, dictionaryFailure))

	coded := mapOrganizationAccessCode(organizationMembershipLookupFailed(), teamFailure)
	require.EqualError(t, coded, "workos_membership_lookup_failed")
	var teamErr *teamError
	require.True(t, errors.As(coded, &teamErr))
	require.Equal(t, 503, teamErr.status)
}
