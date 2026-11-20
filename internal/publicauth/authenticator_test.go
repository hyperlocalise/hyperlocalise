package publicauth

import (
	"context"
	"errors"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/workos/workos-go/v10"
)

func requireAuthError(t *testing.T, err error, status int, code string, challenge bool) {
	t.Helper()
	var failure *Error
	require.ErrorAs(t, err, &failure)
	require.Equal(t, status, failure.Status)
	require.Equal(t, code, failure.Code)
	require.Equal(t, challenge, failure.Challenge)
}

func TestAuthenticateRequiresCredentials(t *testing.T) {
	auth := Authenticator{}
	for name, authorization := range map[string]string{
		"none":                "",
		"lowercase bearer":    "bearer a.b.c",
		"bearer without jwt":  "Bearer ",
		"bearer not compact":  "Bearer opaque-token",
		"bearer double space": "Bearer  a.b.c",
		"unverifiable jwt":    "Bearer a.b.c",
		"basic":               "Basic dXNlcjpwYXNz",
	} {
		t.Run(name, func(t *testing.T) {
			_, err := auth.Authenticate(t.Context(), "", authorization)
			requireAuthError(t, err, http.StatusUnauthorized, "unauthorized", true)
		})
	}
}

func TestAuthenticateWithoutDatabase(t *testing.T) {
	_, err := Authenticator{}.Authenticate(t.Context(), "hl_secret", "")
	requireAuthError(t, err, http.StatusServiceUnavailable, "public_api_unavailable", false)

	fixture := newJWTFixture(t)
	auth := Authenticator{Agent: testAgentVerifier(t, fixture)}
	_, err = auth.Authenticate(t.Context(), "", "Bearer "+fixture.sign(t, agentClaims(nil)))
	requireAuthError(t, err, http.StatusServiceUnavailable, "public_api_unavailable", false)
}

func TestHashAPIKey(t *testing.T) {
	require.Equal(t, "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", HashAPIKey(""))
	require.Len(t, HashAPIKey("hl_secret"), 64)
}

func TestParsePermissions(t *testing.T) {
	permissions, err := parsePermissions([]byte(`["files:read", 7, null, "jobs:read"]`))
	require.NoError(t, err)
	require.Equal(t, []string{"files:read", "jobs:read"}, permissions)

	_, err = parsePermissions([]byte(`{"files:read": true}`))
	require.Error(t, err)
}

func TestMapMembershipError(t *testing.T) {
	requireAuthError(t, mapMembershipError(AccessDenied(), "denied"), http.StatusForbidden, "forbidden", false)
	requireAuthError(t, mapMembershipError(MembershipLookupFailed(), "denied"), http.StatusServiceUnavailable, "workos_membership_lookup_failed", false)
	requireAuthError(t, mapMembershipError(errors.New("db down"), "denied"), http.StatusInternalServerError, "internal_error", false)
}

func TestVerifyLiveMembership(t *testing.T) {
	member := func(mutate func(*workos.UserOrganizationMembership)) MembershipLookup {
		return func(context.Context, string) (*workos.UserOrganizationMembership, error) {
			m := &workos.UserOrganizationMembership{
				ID: "om_1", UserID: "user_1", OrganizationID: "org_1", Status: "active",
				Role: &workos.SlimRole{Slug: "translator"},
			}
			if mutate != nil {
				mutate(m)
			}
			return m, nil
		}
	}

	role, err := VerifyLiveMembership(t.Context(), member(nil), "om_1", "user_1", "org_1")
	require.NoError(t, err)
	require.Equal(t, "translator", role)

	for name, mutate := range map[string]func(*workos.UserOrganizationMembership){
		"other membership":   func(m *workos.UserOrganizationMembership) { m.ID = "om_2" },
		"other user":         func(m *workos.UserOrganizationMembership) { m.UserID = "user_2" },
		"other organization": func(m *workos.UserOrganizationMembership) { m.OrganizationID = "org_2" },
		"inactive":           func(m *workos.UserOrganizationMembership) { m.Status = "inactive" },
		"no role":            func(m *workos.UserOrganizationMembership) { m.Role = nil },
		"unknown role":       func(m *workos.UserOrganizationMembership) { m.Role.Slug = "owner" },
	} {
		t.Run(name, func(t *testing.T) {
			_, err := VerifyLiveMembership(t.Context(), member(mutate), "om_1", "user_1", "org_1")
			require.Equal(t, AccessDenied(), err)
		})
	}

	_, err = VerifyLiveMembership(t.Context(), nil, "om_1", "user_1", "org_1")
	require.Equal(t, MembershipLookupFailed(), err)

	notFound := func(context.Context, string) (*workos.UserOrganizationMembership, error) {
		return nil, &workos.APIError{StatusCode: http.StatusNotFound}
	}
	_, err = VerifyLiveMembership(t.Context(), notFound, "om_1", "user_1", "org_1")
	require.Equal(t, AccessDenied(), err)

	down := func(context.Context, string) (*workos.UserOrganizationMembership, error) {
		return nil, errors.New("unavailable")
	}
	_, err = VerifyLiveMembership(t.Context(), down, "om_1", "user_1", "org_1")
	require.Equal(t, MembershipLookupFailed(), err)
}
