package main

import (
	"context"
	"errors"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"
	"github.com/workos/workos-go/v10"
)

func TestResolveOrganizationActor(t *testing.T) {
	liveMember := func() *workos.UserOrganizationMembership {
		return &workos.UserOrganizationMembership{
			ID:             "om_live",
			UserID:         "user_live",
			OrganizationID: "org_live",
			Status:         "active",
			Role:           &workos.SlimRole{Slug: "admin"},
		}
	}
	lookup := func(modify func(*workos.UserOrganizationMembership), err error) organizationMembershipLookup {
		return func(context.Context, string) (*workos.UserOrganizationMembership, error) {
			m := liveMember()
			if modify != nil {
				modify(m)
			}
			return m, err
		}
	}

	t.Run("placeholder never queries database", func(t *testing.T) {
		db := newDictionaryTestDB(t)
		_, err := resolveOrganizationActor(t.Context(), db, lookup(nil, nil), AuthClaims{UserID: "invited_user_123"}, "acme")
		require.EqualError(t, err, "organization_access_denied")
	})

	t.Run("local membership absent", func(t *testing.T) {
		step := dictionaryAuthStep()
		step.err = pgx.ErrNoRows
		db := newDictionaryTestDB(t, step)
		_, err := resolveOrganizationActor(t.Context(), db, lookup(nil, nil), AuthClaims{UserID: "user_live"}, "acme")
		require.EqualError(t, err, "organization_access_denied")
	})

	t.Run("database error is not remapped", func(t *testing.T) {
		step := dictionaryAuthStep()
		step.err = errors.New("db down")
		db := newDictionaryTestDB(t, step)
		_, err := resolveOrganizationActor(t.Context(), db, lookup(nil, nil), AuthClaims{UserID: "user_live"}, "acme")
		require.EqualError(t, err, "db down")
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
			db := newDictionaryTestDB(t, dictionaryAuthStep())
			var fn organizationMembershipLookup
			if !tc.nilFn {
				fn = lookup(tc.modify, tc.err)
			}
			_, err := resolveOrganizationActor(t.Context(), db, fn, AuthClaims{UserID: "user_live"}, "acme")
			require.EqualError(t, err, tc.code)
		})
	}

	t.Run("active known role", func(t *testing.T) {
		db := newDictionaryTestDB(t, dictionaryAuthStep())
		actor, err := resolveOrganizationActor(t.Context(), db, lookup(nil, nil), AuthClaims{UserID: "user_live"}, "acme")
		require.NoError(t, err)
		require.Equal(t, organizationActor{userID: testDictionaryUserID, organizationID: testDictionaryOrgID, role: "admin"}, actor)
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
