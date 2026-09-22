package main

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/require"
	"github.com/workos/workos-go/v10"
)

const testTeamBase = "/api/go-svc/v1/orgs/acme/teams"

func teamRequestForTest(api *teamAPI, method, path, body string) *httptest.ResponseRecorder {
	mux := http.NewServeMux()
	api.register(mux, stubSessionVerifier{claims: AuthClaims{UserID: "user_live"}})
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "session"})
	rec := httptest.NewRecorder()
	withOptionalPrefix(publicPathPrefix, mux).ServeHTTP(rec, req)
	return rec
}

func TestTeamRoutesRequireDatabase(t *testing.T) {
	api := &teamAPI{}
	rec := teamRequestForTest(api, http.MethodGet, testTeamBase, "")
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
			req := httptest.NewRequest(http.MethodPost, testTeamBase, strings.NewReader(`{"name":"Platform"}`))
			req.Header.Set("Content-Type", "application/json")
			if tc.cookie != "" {
				req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: tc.cookie})
			}
			req.Header.Set("Origin", tc.origin)
			req.Header.Set("Sec-Fetch-Site", tc.site)
			rec := httptest.NewRecorder()
			withOptionalPrefix(publicPathPrefix, mux).ServeHTTP(rec, req)
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
			api, _ := teamTestAPI(t, "admin")
			api.membership = func(context.Context, string) (*workos.UserOrganizationMembership, error) {
				m := &workos.UserOrganizationMembership{
					ID: "om_live", UserID: "user_live", OrganizationID: "org_live",
					Status: "active", Role: &workos.SlimRole{Slug: "admin"},
				}
				if tc.modify != nil {
					tc.modify(m)
				}
				return m, tc.err
			}
			rec := teamRequestForTest(api, http.MethodGet, testTeamBase, "")
			require.Equal(t, tc.status, rec.Code, rec.Body.String())
		})
	}
	t.Run("local membership absent", func(t *testing.T) {
		step := teamAuthStep()
		step.err = pgx.ErrNoRows
		api := &teamAPI{pool: newDictionaryTestDB(t, step)}
		rec := teamRequestForTest(api, http.MethodGet, testTeamBase, "")
		require.Equal(t, 403, rec.Code)
	})
	t.Run("invited user never queries database", func(t *testing.T) {
		api := &teamAPI{pool: newDictionaryTestDB(t)}
		_, err := api.actor(t.Context(), AuthClaims{UserID: "invited_user_123"}, "acme")
		require.EqualError(t, err, "organization_access_denied")
	})
}

func TestTeamCreateAuthorization(t *testing.T) {
	for _, role := range []string{"member", "developer", "translator", "reviewer"} {
		t.Run(role, func(t *testing.T) {
			api, _ := teamTestAPI(t, role)
			rec := teamRequestForTest(api, http.MethodPost, testTeamBase, `{"name":"Platform"}`)
			require.Equal(t, 403, rec.Code)
			require.Contains(t, rec.Body.String(), `"forbidden"`)
		})
	}
}

func TestTeamCreateValidation(t *testing.T) {
	for _, body := range []string{`{}`, `{"name":""}`, `{"name":"Platform","slug":"Bad Slug"}`} {
		t.Run(body, func(t *testing.T) {
			api, _ := teamTestAPI(t, "admin")
			rec := teamRequestForTest(api, http.MethodPost, testTeamBase, body)
			require.Equal(t, 400, rec.Code)
			require.Contains(t, rec.Body.String(), `"invalid_team_payload"`)
		})
	}
}

func TestTeamCreateSuccess(t *testing.T) {
	api, _ := teamTestAPI(t, "admin", teamCreateSteps()...)
	rec := teamRequestForTest(api, http.MethodPost, testTeamBase, `{"name":"Platform"}`)
	require.Equal(t, 201, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"team"`)
	require.Contains(t, rec.Body.String(), `"slug":"platform"`)
	require.Equal(t, "no-store", rec.Header().Get("Cache-Control"))
}

func TestTeamCreateDuplicateSlug(t *testing.T) {
	steps := []dictionaryDBStep{
		{kind: "begin"},
		{kind: "row", sql: "insert into teams", err: &pgconn.PgError{Code: "23505"}},
	}
	api, _ := teamTestAPI(t, "admin", steps...)
	rec := teamRequestForTest(api, http.MethodPost, testTeamBase, `{"name":"Platform"}`)
	require.Equal(t, 409, rec.Code)
	require.Contains(t, rec.Body.String(), `"team_slug_already_exists"`)
}

func TestTeamListTeams(t *testing.T) {
	t.Run("empty organization", func(t *testing.T) {
		api, _ := teamTestAPI(t, "admin", dictionaryDBStep{
			kind: "query", sql: "select id from teams where organization_id", values: [][]any{},
		})
		rec := teamRequestForTest(api, http.MethodGet, testTeamBase, "")
		require.Equal(t, 200, rec.Code)
		require.Contains(t, rec.Body.String(), `"teams":[]`)
	})
	t.Run("returns summaries", func(t *testing.T) {
		api, _ := teamTestAPI(t, "admin", teamListIDSteps(testTeamID)...)
		rec := teamRequestForTest(api, http.MethodGet, testTeamBase, "")
		require.Equal(t, 200, rec.Code)
		require.Contains(t, rec.Body.String(), `"name":"Platform"`)
		require.Contains(t, rec.Body.String(), `"memberCount":1`)
		require.Contains(t, rec.Body.String(), `"currentUserRole":"manager"`)
	})
	t.Run("member scopes visible teams", func(t *testing.T) {
		steps := []dictionaryDBStep{
			{
				kind:   "query",
				sql:    "team_memberships m join teams t",
				values: [][]any{{testTeamID}},
			},
			{
				kind: "query",
				sql:  "member_count",
				values: [][]any{{
					testTeamID, "platform", "Platform", testDictionaryTime, testDictionaryTime, 2, ptrString("member"),
				}},
			},
		}
		api, _ := teamTestAPI(t, "member", steps...)
		rec := teamRequestForTest(api, http.MethodGet, testTeamBase, "")
		require.Equal(t, 200, rec.Code)
		require.Contains(t, rec.Body.String(), `"currentUserRole":"member"`)
	})
}

func TestTeamMemberDirectory(t *testing.T) {
	api, _ := teamTestAPI(t, "admin", dictionaryDBStep{
		kind:   "query",
		sql:    "organization_memberships",
		values: [][]any{{"user_live", "admin@example.com"}},
	})
	rec := teamRequestForTest(api, http.MethodGet, testTeamBase+"/member-directory", "")
	require.Equal(t, 200, rec.Code)
	require.Contains(t, rec.Body.String(), `"members"`)
	require.Contains(t, rec.Body.String(), `"admin@example.com"`)
}

func TestTeamGet(t *testing.T) {
	t.Run("invalid team id", func(t *testing.T) {
		api, _ := teamTestAPI(t, "admin")
		rec := teamRequestForTest(api, http.MethodGet, testTeamBase+"/not-a-uuid", "")
		require.Equal(t, 404, rec.Code)
		require.Contains(t, rec.Body.String(), `"team_not_found"`)
	})
	t.Run("missing team", func(t *testing.T) {
		step := teamOwnedRowStep()
		step.err = pgx.ErrNoRows
		api, _ := teamTestAPI(t, "admin", step)
		rec := teamRequestForTest(api, http.MethodGet, testTeamBase+"/"+testTeamID, "")
		require.Equal(t, 404, rec.Code)
	})
	t.Run("member without membership", func(t *testing.T) {
		membershipStep := dictionaryRowStep("team_memberships where team_id=$1 and user_id=$2")
		membershipStep.args = []any{testTeamID, testDictionaryUserID}
		membershipStep.err = pgx.ErrNoRows
		api, _ := teamTestAPI(t, "member", teamOwnedRowStep(), membershipStep)
		rec := teamRequestForTest(api, http.MethodGet, testTeamBase+"/"+testTeamID, "")
		require.Equal(t, 404, rec.Code)
	})
	t.Run("includes members", func(t *testing.T) {
		api, _ := teamTestAPI(t, "admin", teamOwnedRowStep(), dictionaryDBStep{
			kind:   "query",
			sql:    "team_memberships m",
			values: [][]any{{"user_live", "admin@example.com", "manager"}},
		})
		rec := teamRequestForTest(api, http.MethodGet, testTeamBase+"/"+testTeamID, "")
		require.Equal(t, 200, rec.Code)
		require.Contains(t, rec.Body.String(), `"members"`)
		require.Contains(t, rec.Body.String(), `"role":"manager"`)
	})
}

func TestTeamUpdate(t *testing.T) {
	t.Run("forbidden for members", func(t *testing.T) {
		api, _ := teamTestAPI(t, "member")
		rec := teamRequestForTest(api, http.MethodPatch, testTeamBase+"/"+testTeamID, `{"name":"Renamed"}`)
		require.Equal(t, 403, rec.Code)
	})
	t.Run("invalid payload", func(t *testing.T) {
		api, _ := teamTestAPI(t, "admin")
		rec := teamRequestForTest(api, http.MethodPatch, testTeamBase+"/"+testTeamID, `{}`)
		require.Equal(t, 400, rec.Code)
	})
	t.Run("success", func(t *testing.T) {
		updated := teamRecordValues()
		updated[2] = "platform-core"
		updated[3] = "Platform Core"
		updateStep := dictionaryRowStep("update teams set", updated...)
		updateStep.args = []any{testTeamID, testDictionaryOrgID, true, "Platform Core", true, "platform-core"}
		api, _ := teamTestAPI(t, "admin", teamOwnedRowStep(), updateStep)
		rec := teamRequestForTest(api, http.MethodPatch, testTeamBase+"/"+testTeamID, `{"name":"Platform Core","slug":"platform-core"}`)
		require.Equal(t, 200, rec.Code)
		require.Contains(t, rec.Body.String(), `"slug":"platform-core"`)
	})
}

func TestTeamDelete(t *testing.T) {
	t.Run("forbidden for members", func(t *testing.T) {
		api, _ := teamTestAPI(t, "member")
		rec := teamRequestForTest(api, http.MethodDelete, testTeamBase+"/"+testTeamID, "")
		require.Equal(t, 403, rec.Code)
	})
	t.Run("blocked by projects", func(t *testing.T) {
		projectStep := dictionaryRowStep("from projects where team_id=$1", "project_1")
		projectStep.args = []any{testTeamID}
		api, _ := teamTestAPI(t, "admin", teamOwnedRowStep(), projectStep)
		rec := teamRequestForTest(api, http.MethodDelete, testTeamBase+"/"+testTeamID, "")
		require.Equal(t, 409, rec.Code)
		require.Contains(t, rec.Body.String(), `"team_has_projects"`)
	})
	t.Run("blocked by glossaries", func(t *testing.T) {
		projectStep := dictionaryRowStep("from projects where team_id=$1")
		projectStep.args = []any{testTeamID}
		projectStep.err = pgx.ErrNoRows
		glossaryStep := dictionaryRowStep("from glossaries where team_id=$1", testTeamID)
		glossaryStep.args = []any{testTeamID}
		api, _ := teamTestAPI(t, "admin", teamOwnedRowStep(), projectStep, glossaryStep)
		rec := teamRequestForTest(api, http.MethodDelete, testTeamBase+"/"+testTeamID, "")
		require.Equal(t, 409, rec.Code)
		require.Contains(t, rec.Body.String(), `"team_has_glossaries"`)
	})
	t.Run("success", func(t *testing.T) {
		projectStep := dictionaryRowStep("from projects where team_id=$1")
		projectStep.args = []any{testTeamID}
		projectStep.err = pgx.ErrNoRows
		glossaryStep := dictionaryRowStep("from glossaries where team_id=$1")
		glossaryStep.args = []any{testTeamID}
		glossaryStep.err = pgx.ErrNoRows
		api, _ := teamTestAPI(t, "admin", teamOwnedRowStep(), projectStep, glossaryStep, dictionaryDBStep{
			kind: "exec", sql: "delete from teams", affected: 1,
		})
		rec := teamRequestForTest(api, http.MethodDelete, testTeamBase+"/"+testTeamID, "")
		require.Equal(t, 204, rec.Code, rec.Body.String())
	})
}

func TestTeamMembershipMutations(t *testing.T) {
	t.Run("add member forbidden", func(t *testing.T) {
		membershipStep := dictionaryRowStep("team_memberships where team_id=$1 and user_id=$2", testTeamID)
		membershipStep.args = []any{testTeamID, testDictionaryUserID}
		roleStep := dictionaryRowStep("role from team_memberships", "member")
		roleStep.args = []any{testTeamID, testDictionaryUserID}
		api, _ := teamTestAPI(t, "member", teamOwnedRowStep(), membershipStep, roleStep)
		rec := teamRequestForTest(api, http.MethodPost, testTeamBase+"/"+testTeamID+"/members", `{"workosUserId":"other_user"}`)
		require.Equal(t, 403, rec.Code)
	})
	t.Run("add unknown org member", func(t *testing.T) {
		lookupStep := dictionaryRowStep("organization_memberships")
		lookupStep.args = []any{"missing_user", testDictionaryOrgID}
		lookupStep.err = pgx.ErrNoRows
		api, _ := teamTestAPI(t, "admin", teamOwnedRowStep(), lookupStep)
		rec := teamRequestForTest(api, http.MethodPost, testTeamBase+"/"+testTeamID+"/members", `{"workosUserId":"missing_user"}`)
		require.Equal(t, 404, rec.Code)
		require.Contains(t, rec.Body.String(), `"organization_member_not_found"`)
	})
	t.Run("add member success", func(t *testing.T) {
		lookupStep := dictionaryRowStep("organization_memberships")
		lookupStep.args = []any{"teammate_live", testDictionaryOrgID}
		lookupStep.values = [][]any{{testDictionaryUserID, "teammate_live", "teammate@example.com"}}
		insertStep := dictionaryRowStep("insert into team_memberships")
		insertStep.values = [][]any{{"member"}}
		api, _ := teamTestAPI(t, "admin", teamOwnedRowStep(), lookupStep, insertStep)
		rec := teamRequestForTest(api, http.MethodPost, testTeamBase+"/"+testTeamID+"/members", `{"workosUserId":"teammate_live","role":"member"}`)
		require.Equal(t, 201, rec.Code)
		require.Contains(t, rec.Body.String(), `"teammate@example.com"`)
	})
	t.Run("remove unknown user is noop", func(t *testing.T) {
		lookupStep := dictionaryRowStep("organization_memberships")
		lookupStep.args = []any{"missing_user", testDictionaryOrgID}
		lookupStep.err = pgx.ErrNoRows
		api, _ := teamTestAPI(t, "admin", teamOwnedRowStep(), lookupStep)
		rec := teamRequestForTest(api, http.MethodDelete, testTeamBase+"/"+testTeamID+"/members/missing_user", "")
		require.Equal(t, 204, rec.Code)
	})
}

func TestTeamUnknownRoute(t *testing.T) {
	api := &teamAPI{}
	rec := teamRequestForTest(api, http.MethodGet, testTeamBase+"/"+testTeamID+"/unknown", "")
	require.Equal(t, 404, rec.Code)
}
