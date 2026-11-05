package main

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
)

type fakeOnboardingWorkos struct {
	user               workosSessionUser
	createdOrgs        []string
	deletedOrgs        []string
	membershipErr      error
	invitations        []workosInvitation
	accepted           []string
	activeMembershipID string
}

func (f *fakeOnboardingWorkos) GetUser(_ context.Context, id string) (workosSessionUser, error) {
	user := f.user
	user.ID = id
	return user, nil
}

func (f *fakeOnboardingWorkos) UpdateUserName(_ context.Context, id, firstName, lastName string) (workosSessionUser, error) {
	f.user.FirstName, f.user.LastName = &firstName, &lastName
	return f.GetUser(context.Background(), id)
}

func (f *fakeOnboardingWorkos) CreateOrganization(_ context.Context, name, _ string) (string, error) {
	id := "org_" + uuid.NewString()
	f.createdOrgs = append(f.createdOrgs, id)
	return id, nil
}

func (f *fakeOnboardingWorkos) DeleteOrganization(_ context.Context, id string) error {
	f.deletedOrgs = append(f.deletedOrgs, id)
	return nil
}

func (f *fakeOnboardingWorkos) CreateOrganizationMembership(context.Context, string, string, string) (string, error) {
	if f.membershipErr != nil {
		return "", f.membershipErr
	}
	return "om_" + uuid.NewString(), nil
}

func (f *fakeOnboardingWorkos) ListInvitations(context.Context, string, string) ([]workosInvitation, error) {
	return f.invitations, nil
}

func (f *fakeOnboardingWorkos) AcceptInvitation(_ context.Context, id string) error {
	f.accepted = append(f.accepted, id)
	return nil
}

func (f *fakeOnboardingWorkos) FindActiveOrganizationMembership(context.Context, string, string) (string, bool, error) {
	return f.activeMembershipID, f.activeMembershipID != "", nil
}

func onboardingRequest(api *sessionOnboardingAPI, method, path, body string, claims AuthClaims) *httptest.ResponseRecorder {
	mux := http.NewServeMux()
	api.register(mux, stubSessionVerifier{claims: claims})
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "session"})
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	return rec
}

func TestSlugifyWorkspaceName(t *testing.T) {
	require.Equal(t, "acme-studio", slugifyWorkspaceName("  Acme   Studio! "))
	require.Equal(t, "workspace", slugifyWorkspaceName("日本"))
}

func TestLatestInvitationFor(t *testing.T) {
	invitations := []workosInvitation{
		{ID: "old", Email: "a@x.com", State: "accepted", CreatedAt: "2026-01-01T00:00:00Z"},
		{ID: "new", Email: "A@x.com", State: "pending", CreatedAt: "2026-02-01T00:00:00Z"},
		{ID: "other", Email: "b@x.com", State: "pending", CreatedAt: "2026-03-01T00:00:00Z"},
	}
	latest, ok := latestInvitationFor(invitations, "a@x.com")
	require.True(t, ok)
	require.Equal(t, "new", latest.ID)
	_, ok = latestInvitationFor(invitations, "c@x.com")
	require.False(t, ok)
}

func TestSessionOnboardingGuards(t *testing.T) {
	t.Run("unconfigured database", func(t *testing.T) {
		rec := onboardingRequest(&sessionOnboardingAPI{workos: &fakeOnboardingWorkos{}}, http.MethodPost, "/v1/organizations", `{"name":"Acme"}`, AuthClaims{UserID: "user_1"})
		require.Equal(t, http.StatusServiceUnavailable, rec.Code)
	})

	t.Run("invited placeholder", func(t *testing.T) {
		scope := testenv.Seed(t, testenv.Options{Role: "admin"})
		rec := onboardingRequest(&sessionOnboardingAPI{pool: scope.Pool, workos: &fakeOnboardingWorkos{}}, http.MethodPost, "/v1/organizations", `{"name":"Acme"}`, AuthClaims{UserID: "invited_user_1"})
		require.Equal(t, http.StatusForbidden, rec.Code)
	})
}

func TestSessionOnboardingCreateOrganization(t *testing.T) {
	t.Run("creates a workspace for a user with no local row", func(t *testing.T) {
		scope := testenv.Seed(t, testenv.Options{Role: "admin"})
		workosUserID := "user_" + uuid.NewString()
		workos := &fakeOnboardingWorkos{user: workosSessionUser{Email: workosUserID + "@example.com", EmailVerified: true}}
		api := &sessionOnboardingAPI{pool: scope.Pool, workos: workos}

		rec := onboardingRequest(api, http.MethodPost, "/v1/organizations", `{"name":"  Nimbus Studio "}`, AuthClaims{UserID: workosUserID})
		require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
		require.Len(t, workos.createdOrgs, 1)
		t.Cleanup(func() {
			_, _ = scope.Pool.Exec(context.Background(), `delete from organizations where workos_organization_id=$1`, workos.createdOrgs[0])
			_, _ = scope.Pool.Exec(context.Background(), `delete from users where workos_user_id=$1`, workosUserID)
		})
		require.Contains(t, rec.Body.String(), `"name":"Nimbus Studio"`)

		var role, teamRole string
		require.NoError(t, scope.Pool.QueryRow(t.Context(), `
            select m.role::text, tm.role::text
            from organizations o
            join organization_memberships m on m.organization_id=o.id
            join users u on u.id=m.user_id
            join teams t on t.organization_id=o.id and t.slug='default'
            join team_memberships tm on tm.team_id=t.id and tm.user_id=u.id
            where o.workos_organization_id=$1 and u.workos_user_id=$2`, workos.createdOrgs[0], workosUserID).Scan(&role, &teamRole))
		require.Equal(t, "admin", role)
		require.Equal(t, "manager", teamRole)

		list := sessionOrganizationsRequest(&sessionOrganizationsAPI{pool: scope.Pool}, AuthClaims{UserID: workosUserID}, true)
		require.Contains(t, list.Body.String(), "Nimbus Studio")
	})

	t.Run("rejects a short or reserved name", func(t *testing.T) {
		scope := testenv.Seed(t, testenv.Options{Role: "admin"})
		workos := &fakeOnboardingWorkos{}
		api := &sessionOnboardingAPI{pool: scope.Pool, workos: workos}
		for _, body := range []string{`{"name":"a"}`, `{"name":"Test workspace"}`, `{}`} {
			rec := onboardingRequest(api, http.MethodPost, "/v1/organizations", body, AuthClaims{UserID: scope.WorkOSUserID})
			require.Equal(t, http.StatusBadRequest, rec.Code, body)
		}
		require.Empty(t, workos.createdOrgs)
	})

	t.Run("deletes the WorkOS organization when the membership fails", func(t *testing.T) {
		scope := testenv.Seed(t, testenv.Options{Role: "admin"})
		workos := &fakeOnboardingWorkos{user: workosSessionUser{Email: scope.WorkOSUserID + "@example.com"}, membershipErr: errors.New("boom")}
		api := &sessionOnboardingAPI{pool: scope.Pool, workos: workos}
		rec := onboardingRequest(api, http.MethodPost, "/v1/organizations", `{"name":"Nimbus"}`, AuthClaims{UserID: scope.WorkOSUserID})
		require.Equal(t, http.StatusInternalServerError, rec.Code)
		require.Equal(t, workos.createdOrgs, workos.deletedOrgs)
	})
}

func TestSessionOnboardingInvitations(t *testing.T) {
	seedInvitation := func(t *testing.T) (*testenv.Scope, string, string) {
		scope := testenv.Seed(t, testenv.Options{Role: "admin"})
		workosUserID := "user_" + uuid.NewString()
		email := workosUserID + "@example.com"
		var placeholderID string
		require.NoError(t, scope.Pool.QueryRow(t.Context(), `
            insert into users (workos_user_id, email) values ($1, $2) returning id`,
			"invited_user_"+uuid.NewString(), email).Scan(&placeholderID))
		_, err := scope.Pool.Exec(t.Context(), `
            insert into organization_memberships (organization_id, user_id, role) values ($1, $2, 'member')`,
			scope.OrganizationID, placeholderID)
		require.NoError(t, err)
		t.Cleanup(func() {
			_, _ = scope.Pool.Exec(context.Background(), `delete from organization_memberships where user_id=$1`, placeholderID)
			_, _ = scope.Pool.Exec(context.Background(), `delete from users where id=$1`, placeholderID)
		})
		return scope, workosUserID, email
	}

	t.Run("lists an invitation made before the person signed up", func(t *testing.T) {
		scope, workosUserID, email := seedInvitation(t)
		api := &sessionOnboardingAPI{pool: scope.Pool, workos: &fakeOnboardingWorkos{user: workosSessionUser{Email: email}}}
		rec := onboardingRequest(api, http.MethodGet, "/v1/invitations", "", AuthClaims{UserID: workosUserID})
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), `"organizationSlug":"`+scope.Slug+`"`)
	})

	t.Run("accepts the pending invitation and activates the membership", func(t *testing.T) {
		scope, workosUserID, email := seedInvitation(t)
		workos := &fakeOnboardingWorkos{
			user:               workosSessionUser{Email: email, EmailVerified: true},
			invitations:        []workosInvitation{{ID: "inv_1", Email: email, State: "pending", CreatedAt: "2026-01-01T00:00:00Z"}},
			activeMembershipID: "om_" + uuid.NewString(),
		}
		api := &sessionOnboardingAPI{pool: scope.Pool, workos: workos}
		rec := onboardingRequest(api, http.MethodPost, "/v1/invitations/"+scope.Slug+"/accept", "", AuthClaims{UserID: workosUserID})
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		require.Equal(t, []string{"inv_1"}, workos.accepted)

		list := sessionOrganizationsRequest(&sessionOrganizationsAPI{pool: scope.Pool}, AuthClaims{UserID: workosUserID}, true)
		require.Contains(t, list.Body.String(), scope.Slug)
	})

	t.Run("needs a verified email", func(t *testing.T) {
		scope, workosUserID, email := seedInvitation(t)
		api := &sessionOnboardingAPI{pool: scope.Pool, workos: &fakeOnboardingWorkos{user: workosSessionUser{Email: email}}}
		rec := onboardingRequest(api, http.MethodPost, "/v1/invitations/"+scope.Slug+"/accept", "", AuthClaims{UserID: workosUserID})
		require.Equal(t, http.StatusForbidden, rec.Code)
		require.Contains(t, rec.Body.String(), "email_not_verified")
	})

	t.Run("activates an invitation already accepted in WorkOS", func(t *testing.T) {
		scope, workosUserID, email := seedInvitation(t)
		workos := &fakeOnboardingWorkos{
			user:               workosSessionUser{Email: email, EmailVerified: true},
			invitations:        []workosInvitation{{ID: "inv_accepted", Email: email, State: "accepted", CreatedAt: "2026-01-01T00:00:00Z"}},
			activeMembershipID: "om_" + uuid.NewString(),
		}
		api := &sessionOnboardingAPI{pool: scope.Pool, workos: workos}
		rec := onboardingRequest(api, http.MethodPost, "/v1/invitations/"+scope.Slug+"/accept", "", AuthClaims{UserID: workosUserID})
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		require.Empty(t, workos.accepted)

		list := sessionOrganizationsRequest(&sessionOrganizationsAPI{pool: scope.Pool}, AuthClaims{UserID: workosUserID}, true)
		require.Contains(t, list.Body.String(), scope.Slug)
	})

	t.Run("returns invitation_not_found for a missing slug or WorkOS invite", func(t *testing.T) {
		scope, workosUserID, email := seedInvitation(t)
		workos := &fakeOnboardingWorkos{user: workosSessionUser{Email: email, EmailVerified: true}}
		api := &sessionOnboardingAPI{pool: scope.Pool, workos: workos}

		missingSlug := onboardingRequest(api, http.MethodPost, "/v1/invitations/not-this-workspace/accept", "", AuthClaims{UserID: workosUserID})
		require.Equal(t, http.StatusNotFound, missingSlug.Code)
		require.Contains(t, missingSlug.Body.String(), "invitation_not_found")

		noInvite := onboardingRequest(api, http.MethodPost, "/v1/invitations/"+scope.Slug+"/accept", "", AuthClaims{UserID: workosUserID})
		require.Equal(t, http.StatusNotFound, noInvite.Code)
		require.Contains(t, noInvite.Body.String(), "invitation_not_found")
	})

	t.Run("returns membership_not_activated when WorkOS has no membership yet", func(t *testing.T) {
		scope, workosUserID, email := seedInvitation(t)
		workos := &fakeOnboardingWorkos{
			user:        workosSessionUser{Email: email, EmailVerified: true},
			invitations: []workosInvitation{{ID: "inv_pending", Email: email, State: "pending", CreatedAt: "2026-01-01T00:00:00Z"}},
		}
		api := &sessionOnboardingAPI{pool: scope.Pool, workos: workos}
		rec := onboardingRequest(api, http.MethodPost, "/v1/invitations/"+scope.Slug+"/accept", "", AuthClaims{UserID: workosUserID})
		require.Equal(t, http.StatusConflict, rec.Code)
		require.Contains(t, rec.Body.String(), "membership_not_activated")
		require.Equal(t, []string{"inv_pending"}, workos.accepted)
	})

	t.Run("returns invitation_not_found when the membership is already activated", func(t *testing.T) {
		scope, workosUserID, email := seedInvitation(t)
		workos := &fakeOnboardingWorkos{
			user:               workosSessionUser{Email: email, EmailVerified: true},
			invitations:        []workosInvitation{{ID: "inv_1", Email: email, State: "pending", CreatedAt: "2026-01-01T00:00:00Z"}},
			activeMembershipID: "om_" + uuid.NewString(),
		}
		api := &sessionOnboardingAPI{pool: scope.Pool, workos: workos}
		first := onboardingRequest(api, http.MethodPost, "/v1/invitations/"+scope.Slug+"/accept", "", AuthClaims{UserID: workosUserID})
		require.Equal(t, http.StatusOK, first.Code, first.Body.String())

		second := onboardingRequest(api, http.MethodPost, "/v1/invitations/"+scope.Slug+"/accept", "", AuthClaims{UserID: workosUserID})
		require.Equal(t, http.StatusNotFound, second.Code)
		require.Contains(t, second.Body.String(), "invitation_not_found")
	})
}

func TestSessionOnboardingUniqueWorkspaceSlug(t *testing.T) {
	t.Run("suffixes a taken slug", func(t *testing.T) {
		scope := testenv.Seed(t, testenv.Options{Role: "admin"})
		name := "Atlas " + uuid.NewString()[:8]
		base := slugifyWorkspaceName(name)
		slug, err := uniqueWorkspaceSlug(t.Context(), scope.Pool, name)
		require.NoError(t, err)
		require.Equal(t, base, slug)

		_, err = scope.Pool.Exec(t.Context(), `update organizations set slug=$1 where id=$2`, base, scope.OrganizationID)
		require.NoError(t, err)

		next, err := uniqueWorkspaceSlug(t.Context(), scope.Pool, name)
		require.NoError(t, err)
		require.Equal(t, base+"-2", next)
	})

	t.Run("creates a second workspace with the same name on a new slug", func(t *testing.T) {
		scope := testenv.Seed(t, testenv.Options{Role: "admin"})
		firstUser := "user_" + uuid.NewString()
		secondUser := "user_" + uuid.NewString()
		name := "Nimbus " + uuid.NewString()[:8]
		base := slugifyWorkspaceName(name)
		workos := &fakeOnboardingWorkos{user: workosSessionUser{Email: firstUser + "@example.com", EmailVerified: true}}
		api := &sessionOnboardingAPI{pool: scope.Pool, workos: workos}

		first := onboardingRequest(api, http.MethodPost, "/v1/organizations", `{"name":"`+name+`"}`, AuthClaims{UserID: firstUser})
		require.Equal(t, http.StatusCreated, first.Code, first.Body.String())
		require.Contains(t, first.Body.String(), `"slug":"`+base+`"`)
		t.Cleanup(func() {
			_, _ = scope.Pool.Exec(context.Background(), `delete from organizations where workos_organization_id=$1`, workos.createdOrgs[0])
			_, _ = scope.Pool.Exec(context.Background(), `delete from users where workos_user_id=$1`, firstUser)
		})

		workos.user = workosSessionUser{Email: secondUser + "@example.com", EmailVerified: true}
		second := onboardingRequest(api, http.MethodPost, "/v1/organizations", `{"name":"`+name+`"}`, AuthClaims{UserID: secondUser})
		require.Equal(t, http.StatusCreated, second.Code, second.Body.String())
		require.Contains(t, second.Body.String(), `"slug":"`+base+`-2"`)
		t.Cleanup(func() {
			_, _ = scope.Pool.Exec(context.Background(), `delete from organizations where workos_organization_id=$1`, workos.createdOrgs[1])
			_, _ = scope.Pool.Exec(context.Background(), `delete from users where workos_user_id=$1`, secondUser)
		})
	})
}

func TestSessionOnboardingUpdateProfile(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "admin"})
	workos := &fakeOnboardingWorkos{user: workosSessionUser{Email: scope.WorkOSUserID + "@example.com"}}
	api := &sessionOnboardingAPI{pool: scope.Pool, workos: workos}

	rec := onboardingRequest(api, http.MethodPatch, "/v1/me", `{"firstName":"  ","lastName":"Lee"}`, AuthClaims{UserID: scope.WorkOSUserID})
	require.Equal(t, http.StatusBadRequest, rec.Code)

	rec = onboardingRequest(api, http.MethodPatch, "/v1/me", `{"firstName":"Ada","lastName":"Lee"}`, AuthClaims{UserID: scope.WorkOSUserID})
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"firstName":"Ada"`)
}
