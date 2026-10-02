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

func TestResolveOrganizationActorByID(t *testing.T) {
	lookup := func(scope *testenv.Scope, modify func(*workos.UserOrganizationMembership), err error) organizationMembershipLookup {
		return func(_ context.Context, membershipID string) (*workos.UserOrganizationMembership, error) {
			require.Equal(t, scope.WorkOSMembershipID, membershipID)
			m := &workos.UserOrganizationMembership{
				ID:             scope.WorkOSMembershipID,
				UserID:         scope.WorkOSUserID,
				OrganizationID: scope.WorkOSOrganizationID,
				Status:         "active",
				Role:           &workos.SlimRole{Slug: "translator"},
			}
			if modify != nil {
				modify(m)
			}
			return m, err
		}
	}

	t.Run("active known role uses live WorkOS role", func(t *testing.T) {
		scope := testenv.Seed(t, testenv.Options{Role: "admin"})
		actor, err := resolveOrganizationActorByID(t.Context(), scope.Pool, lookup(scope, nil, nil), scope.UserID, scope.OrganizationID)
		require.NoError(t, err)
		require.Equal(t, organizationActor{userID: scope.UserID, organizationID: scope.OrganizationID, role: "translator"}, actor)
	})

	t.Run("membership in another organization", func(t *testing.T) {
		scope := testenv.Seed(t, testenv.Options{Role: "admin"})
		other := testenv.Seed(t, testenv.Options{Role: "admin"})
		_, err := resolveOrganizationActorByID(t.Context(), scope.Pool, lookup(scope, nil, nil), scope.UserID, other.OrganizationID)
		require.EqualError(t, err, "organization_access_denied")
	})

	for _, tc := range []struct {
		name string
		sql  string
	}{
		{name: "archived organization", sql: `update organizations set lifecycle_status='archived' where id=$1`},
		{name: "replacing membership", sql: `update organization_memberships set workos_membership_id='replacing' where organization_id=$1`},
		{name: "missing membership id", sql: `update organization_memberships set workos_membership_id=null where organization_id=$1`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			scope := testenv.Seed(t, testenv.Options{Role: "admin"})
			_, err := scope.Pool.Exec(t.Context(), tc.sql, scope.OrganizationID)
			require.NoError(t, err)
			_, err = resolveOrganizationActorByID(t.Context(), scope.Pool, func(context.Context, string) (*workos.UserOrganizationMembership, error) {
				t.Fatal("must not look up membership")
				return nil, nil
			}, scope.UserID, scope.OrganizationID)
			require.EqualError(t, err, "organization_access_denied")
		})
	}

	t.Run("invited placeholder user", func(t *testing.T) {
		scope := testenv.Seed(t, testenv.Options{Role: "admin"})
		_, err := scope.Pool.Exec(t.Context(), `update users set workos_user_id=$2 where id=$1`, scope.UserID, "invited_user_"+scope.UserID)
		require.NoError(t, err)
		_, err = resolveOrganizationActorByID(t.Context(), scope.Pool, func(context.Context, string) (*workos.UserOrganizationMembership, error) {
			t.Fatal("must not look up membership")
			return nil, nil
		}, scope.UserID, scope.OrganizationID)
		require.EqualError(t, err, "organization_access_denied")
	})

	for _, tc := range []struct {
		name   string
		modify func(*workos.UserOrganizationMembership)
		err    error
		nilFn  bool
		code   string
	}{
		{name: "revoked", modify: func(m *workos.UserOrganizationMembership) { m.Status = "inactive" }, code: "organization_access_denied"},
		{name: "wrong user", modify: func(m *workos.UserOrganizationMembership) { m.UserID = "other" }, code: "organization_access_denied"},
		{name: "wrong org", modify: func(m *workos.UserOrganizationMembership) { m.OrganizationID = "other" }, code: "organization_access_denied"},
		{name: "unknown role", modify: func(m *workos.UserOrganizationMembership) { m.Role.Slug = "owner" }, code: "organization_access_denied"},
		{name: "removed membership", err: &workos.APIError{StatusCode: 404}, code: "organization_access_denied"},
		{name: "lookup unavailable", err: errors.New("unavailable"), code: "workos_membership_lookup_failed"},
		{name: "lookup missing", nilFn: true, code: "workos_membership_lookup_failed"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			scope := testenv.Seed(t, testenv.Options{Role: "admin"})
			var fn organizationMembershipLookup
			if !tc.nilFn {
				fn = lookup(scope, tc.modify, tc.err)
			}
			actor, err := resolveOrganizationActorByID(t.Context(), scope.Pool, fn, scope.UserID, scope.OrganizationID)
			require.EqualError(t, err, tc.code)
			require.Equal(t, organizationActor{}, actor)
		})
	}
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
