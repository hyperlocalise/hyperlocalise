package main

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"github.com/workos/workos-go/v10"
)

func TestTeamRoutesRequireDatabase(t *testing.T) {
	api := &teamAPI{}
	rec := teamRequestForTest(api, http.MethodGet, "/v1/orgs/acme/teams", "")
	require.Equal(t, 503, rec.Code)
	require.Contains(t, rec.Body.String(), `"team_unavailable"`)
}

func TestSlugifyTeamName(t *testing.T) {
	require.Equal(t, "platform", slugifyTeamName("Platform"))
	require.Equal(t, "platform-core", slugifyTeamName("Platform Core"))
	require.LessOrEqual(t, len(slugifyTeamName(strings.Repeat("a", 200))), 120)
}

func TestTeamSessionAndOrigin(t *testing.T) {
	for _, tc := range []struct {
		name, cookie, origin, site string
		status                     int
	}{
		{name: "missing cookie", status: 401},
		{name: "cross origin", cookie: "session", origin: "https://evil.example", status: 403},
		{name: "opaque origin", cookie: "session", origin: "null", status: 403},
		{name: "cross site", cookie: "session", site: "cross-site", status: 403},
		{name: "web origin", cookie: "session", origin: "https://hyperlocalise.com", status: 503},
		{name: "us spelling origin", cookie: "session", origin: "https://hyperlocalize.com", site: "cross-site", status: 503},
		{name: "unconfigured database", cookie: "session", status: 503},
	} {
		t.Run(tc.name, func(t *testing.T) {
			api := &teamAPI{}
			mux := http.NewServeMux()
			api.register(mux, stubSessionVerifier{claims: AuthClaims{UserID: "user_live"}})
			req := httptest.NewRequest(http.MethodPost, "/v1/orgs/acme/teams", strings.NewReader(`{"name":"Platform"}`))
			req.Header.Set("Content-Type", "application/json")
			if tc.cookie != "" {
				req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: tc.cookie})
			}
			req.Header.Set("Origin", tc.origin)
			req.Header.Set("Sec-Fetch-Site", tc.site)
			rec := httptest.NewRecorder()
			mux.ServeHTTP(rec, req)
			require.Equal(t, tc.status, rec.Code, rec.Body.String())
		})
	}
}

func TestTeamMembershipFailsClosed(t *testing.T) {
	for _, tc := range []struct {
		name   string
		modify func(*workos.UserOrganizationMembership)
		err    error
		status int
	}{
		{name: "revoked", modify: func(m *workos.UserOrganizationMembership) { m.Status = "inactive" }, status: 403},
		{name: "pending", modify: func(m *workos.UserOrganizationMembership) { m.Status = "pending" }, status: 403},
		{name: "wrong user", modify: func(m *workos.UserOrganizationMembership) { m.UserID = "other" }, status: 403},
		{name: "wrong org", modify: func(m *workos.UserOrganizationMembership) { m.OrganizationID = "other" }, status: 403},
		{name: "wrong membership", modify: func(m *workos.UserOrganizationMembership) { m.ID = "other" }, status: 403},
		{name: "missing role", modify: func(m *workos.UserOrganizationMembership) { m.Role = nil }, status: 403},
		{name: "unknown role", modify: func(m *workos.UserOrganizationMembership) { m.Role.Slug = "owner" }, status: 403},
		{name: "lookup unavailable", err: errors.New("unavailable"), status: 503},
		{name: "removed membership", err: &workos.APIError{StatusCode: 404}, status: 403},
	} {
		t.Run(tc.name, func(t *testing.T) {
			api, scope := teamTestAPI(t, "admin")
			api.membership = func(context.Context, string) (*workos.UserOrganizationMembership, error) {
				m := &workos.UserOrganizationMembership{
					ID:             scope.WorkOSMembershipID,
					UserID:         scope.WorkOSUserID,
					OrganizationID: scope.WorkOSOrganizationID,
					Status:         "active",
					Role:           &workos.SlimRole{Slug: "admin"},
				}
				if tc.modify != nil {
					tc.modify(m)
				}
				return m, tc.err
			}
			rec := teamRequest(api, scope, http.MethodGet, scope.OrgPath("/teams"), "")
			require.Equal(t, tc.status, rec.Code, rec.Body.String())
		})
	}
	t.Run("local membership absent", func(t *testing.T) {
		api, scope := teamTestAPI(t, "admin")
		rec := teamRequest(api, scope, http.MethodGet, "/v1/orgs/missing-slug/teams", "")
		require.Equal(t, 403, rec.Code)
	})
	t.Run("invited user never queries database", func(t *testing.T) {
		api := &teamAPI{}
		_, err := api.actor(t.Context(), AuthClaims{UserID: "invited_user_123"}, "acme")
		require.EqualError(t, err, "organization_access_denied")
	})
}

func TestTeamCreateAuthorization(t *testing.T) {
	for _, role := range []string{"member", "developer", "translator", "reviewer"} {
		t.Run(role, func(t *testing.T) {
			api, scope := teamTestAPI(t, role)
			rec := teamRequest(api, scope, http.MethodPost, scope.OrgPath("/teams"), `{"name":"Platform"}`)
			require.Equal(t, 403, rec.Code)
			require.Contains(t, rec.Body.String(), `"forbidden"`)
		})
	}
}

func TestTeamCreateValidation(t *testing.T) {
	for _, body := range []string{`{}`, `{"name":""}`, `{"name":"Platform","slug":"Bad Slug"}`} {
		t.Run(body, func(t *testing.T) {
			api, scope := teamTestAPI(t, "admin")
			rec := teamRequest(api, scope, http.MethodPost, scope.OrgPath("/teams"), body)
			require.Equal(t, 400, rec.Code)
			require.Contains(t, rec.Body.String(), `"invalid_team_payload"`)
		})
	}
}

func TestTeamCreateSuccess(t *testing.T) {
	api, scope := teamTestAPI(t, "admin")
	rec := teamRequest(api, scope, http.MethodPost, scope.OrgPath("/teams"), `{"name":"Platform"}`)
	require.Equal(t, 201, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"team"`)
	require.Contains(t, rec.Body.String(), `"slug":"platform"`)
	require.Equal(t, "no-store", rec.Header().Get("Cache-Control"))
}

func TestTeamCreateDuplicateSlug(t *testing.T) {
	api, scope := teamTestAPI(t, "admin")
	scope.MustTeam(t, "platform", "Platform", "manager")
	rec := teamRequest(api, scope, http.MethodPost, scope.OrgPath("/teams"), `{"name":"Platform"}`)
	require.Equal(t, 409, rec.Code)
	require.Contains(t, rec.Body.String(), `"team_slug_already_exists"`)
}

func TestTeamListTeams(t *testing.T) {
	t.Run("empty organization", func(t *testing.T) {
		api, scope := teamTestAPI(t, "admin")
		rec := teamRequest(api, scope, http.MethodGet, scope.OrgPath("/teams"), "")
		require.Equal(t, 200, rec.Code)
		require.Contains(t, rec.Body.String(), `"teams":[]`)
	})
	t.Run("returns summaries", func(t *testing.T) {
		api, scope := teamTestAPI(t, "admin")
		scope.MustTeam(t, "platform", "Platform", "manager")
		rec := teamRequest(api, scope, http.MethodGet, scope.OrgPath("/teams"), "")
		require.Equal(t, 200, rec.Code)
		require.Contains(t, rec.Body.String(), `"name":"Platform"`)
		require.Contains(t, rec.Body.String(), `"memberCount":1`)
		require.Contains(t, rec.Body.String(), `"currentUserRole":"manager"`)
	})
	t.Run("member scopes visible teams", func(t *testing.T) {
		api, scope := teamTestAPI(t, "member")
		scope.MustTeam(t, "platform", "Platform", "member")
		rec := teamRequest(api, scope, http.MethodGet, scope.OrgPath("/teams"), "")
		require.Equal(t, 200, rec.Code)
		require.Contains(t, rec.Body.String(), `"currentUserRole":"member"`)
	})
}

func TestTeamMemberDirectory(t *testing.T) {
	api, scope := teamTestAPI(t, "admin")
	rec := teamRequest(api, scope, http.MethodGet, scope.OrgPath("/teams/member-directory"), "")
	require.Equal(t, 200, rec.Code)
	require.Contains(t, rec.Body.String(), `"members"`)
	require.Contains(t, rec.Body.String(), "@example.com")
}

func TestTeamGet(t *testing.T) {
	t.Run("invalid team id", func(t *testing.T) {
		api, scope := teamTestAPI(t, "admin")
		rec := teamRequest(api, scope, http.MethodGet, scope.OrgPath("/teams/not-a-uuid"), "")
		require.Equal(t, 404, rec.Code)
		require.Contains(t, rec.Body.String(), `"team_not_found"`)
	})
	t.Run("missing team", func(t *testing.T) {
		api, scope := teamTestAPI(t, "admin")
		rec := teamRequest(api, scope, http.MethodGet, scope.OrgPath("/teams/"+uuid.NewString()), "")
		require.Equal(t, 404, rec.Code)
	})
	t.Run("member without membership", func(t *testing.T) {
		api, scope := teamTestAPI(t, "member")
		id := scope.MustTeam(t, "platform", "Platform", "")
		rec := teamRequest(api, scope, http.MethodGet, scope.OrgPath("/teams/"+id), "")
		require.Equal(t, 404, rec.Code)
	})
	t.Run("includes members", func(t *testing.T) {
		api, scope := teamTestAPI(t, "admin")
		id := scope.MustTeam(t, "platform", "Platform", "manager")
		rec := teamRequest(api, scope, http.MethodGet, scope.OrgPath("/teams/"+id), "")
		require.Equal(t, 200, rec.Code)
		require.Contains(t, rec.Body.String(), `"members"`)
		require.Contains(t, rec.Body.String(), `"role":"manager"`)
	})
}

func TestTeamUpdate(t *testing.T) {
	t.Run("forbidden for members", func(t *testing.T) {
		api, scope := teamTestAPI(t, "member")
		id := scope.MustTeam(t, "platform", "Platform", "member")
		rec := teamRequest(api, scope, http.MethodPatch, scope.OrgPath("/teams/"+id), `{"name":"Renamed"}`)
		require.Equal(t, 403, rec.Code)
	})
	t.Run("invalid payload", func(t *testing.T) {
		api, scope := teamTestAPI(t, "admin")
		id := scope.MustTeam(t, "platform", "Platform", "manager")
		rec := teamRequest(api, scope, http.MethodPatch, scope.OrgPath("/teams/"+id), `{}`)
		require.Equal(t, 400, rec.Code)
	})
	t.Run("success", func(t *testing.T) {
		api, scope := teamTestAPI(t, "admin")
		id := scope.MustTeam(t, "platform", "Platform", "manager")
		rec := teamRequest(api, scope, http.MethodPatch, scope.OrgPath("/teams/"+id), `{"name":"Platform Core","slug":"platform-core"}`)
		require.Equal(t, 200, rec.Code)
		require.Contains(t, rec.Body.String(), `"slug":"platform-core"`)
	})
}

func TestTeamDelete(t *testing.T) {
	t.Run("forbidden for members", func(t *testing.T) {
		api, scope := teamTestAPI(t, "member")
		id := scope.MustTeam(t, "platform", "Platform", "member")
		rec := teamRequest(api, scope, http.MethodDelete, scope.OrgPath("/teams/"+id), "")
		require.Equal(t, 403, rec.Code)
	})
	t.Run("blocked by projects", func(t *testing.T) {
		api, scope := teamTestAPI(t, "admin")
		id := scope.MustTeam(t, "platform", "Platform", "manager")
		scope.MustProject(t, scope.ProjectID, "Project")
		_, err := scope.Pool.Exec(t.Context(), `update projects set team_id=$1 where id=$2`, id, scope.ProjectID)
		require.NoError(t, err)
		rec := teamRequest(api, scope, http.MethodDelete, scope.OrgPath("/teams/"+id), "")
		require.Equal(t, 409, rec.Code)
		require.Contains(t, rec.Body.String(), `"team_has_projects"`)
	})
	t.Run("blocked by glossaries", func(t *testing.T) {
		api, scope := teamTestAPI(t, "admin")
		id := scope.MustTeam(t, "platform", "Platform", "manager")
		_, err := scope.Pool.Exec(t.Context(), `
            insert into glossaries (
                organization_id, created_by_user_id, name, source_locale, status, source, control_level, team_id
            ) values ($1, $2, 'Team terms', 'en', 'active', 'native', 'team', $3)`,
			scope.OrganizationID, scope.UserID, id)
		require.NoError(t, err)
		rec := teamRequest(api, scope, http.MethodDelete, scope.OrgPath("/teams/"+id), "")
		require.Equal(t, 409, rec.Code)
		require.Contains(t, rec.Body.String(), `"team_has_glossaries"`)
	})
	t.Run("success", func(t *testing.T) {
		api, scope := teamTestAPI(t, "admin")
		id := scope.MustTeam(t, "platform", "Platform", "manager")
		rec := teamRequest(api, scope, http.MethodDelete, scope.OrgPath("/teams/"+id), "")
		require.Equal(t, 204, rec.Code, rec.Body.String())
		var n int
		require.NoError(t, scope.Pool.QueryRow(t.Context(), `select count(*) from teams where id=$1`, id).Scan(&n))
		require.Zero(t, n)
	})
}

func TestTeamMembershipMutations(t *testing.T) {
	t.Run("add member forbidden", func(t *testing.T) {
		api, scope := teamTestAPI(t, "member")
		id := scope.MustTeam(t, "platform", "Platform", "member")
		rec := teamRequest(api, scope, http.MethodPost, scope.OrgPath("/teams/"+id+"/members"), `{"workosUserId":"other_user"}`)
		require.Equal(t, 403, rec.Code)
	})
	t.Run("add unknown org member", func(t *testing.T) {
		api, scope := teamTestAPI(t, "admin")
		id := scope.MustTeam(t, "platform", "Platform", "manager")
		rec := teamRequest(api, scope, http.MethodPost, scope.OrgPath("/teams/"+id+"/members"), `{"workosUserId":"missing_user"}`)
		require.Equal(t, 404, rec.Code)
		require.Contains(t, rec.Body.String(), `"organization_member_not_found"`)
	})
	t.Run("add member success", func(t *testing.T) {
		api, scope := teamTestAPI(t, "admin")
		id := scope.MustTeam(t, "platform", "Platform", "manager")
		mustOrgTeammate(t, scope, "teammate_live", "teammate@example.com", "member")
		rec := teamRequest(api, scope, http.MethodPost, scope.OrgPath("/teams/"+id+"/members"), `{"workosUserId":"teammate_live","role":"member"}`)
		require.Equal(t, 201, rec.Code)
		require.Contains(t, rec.Body.String(), `"teammate@example.com"`)
	})
	t.Run("remove unknown user is noop", func(t *testing.T) {
		api, scope := teamTestAPI(t, "admin")
		id := scope.MustTeam(t, "platform", "Platform", "manager")
		rec := teamRequest(api, scope, http.MethodDelete, scope.OrgPath("/teams/"+id+"/members/missing_user"), "")
		require.Equal(t, 204, rec.Code)
	})
}

func TestTeamUnknownRoute(t *testing.T) {
	api := &teamAPI{}
	rec := teamRequestForTest(api, http.MethodGet, "/v1/orgs/acme/teams/"+uuid.NewString()+"/unknown", "")
	require.Equal(t, 404, rec.Code)
}
