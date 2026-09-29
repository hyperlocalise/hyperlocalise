package main

import (
	"context"
	"encoding/json"
	"net/http"
	"sync"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
)

type recordingActivityLogPublisher struct {
	mu     sync.Mutex
	events []activityLogEventInput
}

func (p *recordingActivityLogPublisher) Publish(_ context.Context, input activityLogEventInput) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.events = append(p.events, input)
	return nil
}

func (p *recordingActivityLogPublisher) Ping(context.Context) error { return nil }

func (p *recordingActivityLogPublisher) recorded() []activityLogEventInput {
	p.mu.Lock()
	defer p.mu.Unlock()
	out := make([]activityLogEventInput, len(p.events))
	copy(out, p.events)
	return out
}

func seedNativeProjectWithLocales(t *testing.T, scope *testenv.Scope, projectID, sourceLocale string, targetLocales []string) {
	t.Helper()
	scope.MustProject(t, projectID, "Existing Project")
	targetLocalesJSON, err := json.Marshal(targetLocales)
	require.NoError(t, err)
	_, err = scope.Pool.Exec(t.Context(), `
		update projects set source_locale=$2, target_locales=$3::jsonb where id=$1`,
		projectID, sourceLocale, targetLocalesJSON)
	require.NoError(t, err)
}

func TestUpdateProjectHappyPath(t *testing.T) {
	testenv.Require(t)
	scope := testenv.Seed(t, testenv.Options{Role: "admin"})
	seedNativeProjectWithLocales(t, scope, scope.ProjectID, "en", []string{"fr", "de"})
	api := &projectAPI{pool: scope.Pool, membership: scope.Membership("admin")}

	rec := projectMutationRequest(api, scope, http.MethodPatch, scope.OrgPath("/projects/"+scope.ProjectID), map[string]any{
		"name":               "Renamed Project",
		"description":        "Updated description",
		"translationContext": "Updated context",
		"targetLocales":      []string{"fr", "de", "it"},
	})
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

	var resp projectResponseBody
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Equal(t, "Renamed Project", resp.Project.Name)
	require.Equal(t, "Updated description", resp.Project.Description)
	require.Equal(t, "Updated context", resp.Project.TranslationContext)
	require.ElementsMatch(t, []string{"fr", "de", "it"}, resp.Project.TargetLocales)
	require.NotNil(t, resp.Project.SourceLocale)
	require.Equal(t, "en", *resp.Project.SourceLocale, "sourceLocale was not part of this patch and must be unchanged")
}

func TestUpdateProjectAuthorizationMatrix(t *testing.T) {
	testenv.Require(t)
	cases := []struct {
		role    string
		allowed bool
	}{
		{"admin", true},
		{"localization_manager", true},
		{"developer", true},
		{"reviewer", false},
		{"translator", false},
		{"member", false},
	}
	for _, tc := range cases {
		t.Run(tc.role, func(t *testing.T) {
			scope := testenv.Seed(t, testenv.Options{Role: tc.role})
			// Every role, org-wide or not, must be able to see the project
			// itself; only the capability check is under test here, so put
			// the caller on the project's own team regardless of role.
			teamID := scope.MustTeam(t, "team-"+tc.role, "Team", "member")
			scope.MustProject(t, scope.ProjectID, "Role Patch Test")
			_, err := scope.Pool.Exec(t.Context(), `update projects set team_id=$2 where id=$1`, scope.ProjectID, teamID)
			require.NoError(t, err)

			api := &projectAPI{pool: scope.Pool, membership: scope.Membership(tc.role)}
			rec := projectMutationRequest(api, scope, http.MethodPatch, scope.OrgPath("/projects/"+scope.ProjectID), map[string]any{
				"name": "Role Patch Test",
			})
			if tc.allowed {
				require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
			} else {
				require.Equal(t, http.StatusForbidden, rec.Code, rec.Body.String())
				require.Contains(t, rec.Body.String(), `"forbidden"`)
			}
		})
	}
}

func TestUpdateProjectNotFound(t *testing.T) {
	testenv.Require(t)
	scope := testenv.Seed(t, testenv.Options{Role: "admin"})
	api := &projectAPI{pool: scope.Pool, membership: scope.Membership("admin")}

	rec := projectMutationRequest(api, scope, http.MethodPatch, scope.OrgPath("/projects/does-not-exist"), map[string]any{
		"name": "X",
	})
	require.Equal(t, http.StatusNotFound, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"project_not_found"`)
}

func TestUpdateProjectInvalidPayload(t *testing.T) {
	testenv.Require(t)
	scope := testenv.Seed(t, testenv.Options{Role: "admin", WithProject: true})
	api := &projectAPI{pool: scope.Pool, membership: scope.Membership("admin")}

	cases := map[string]map[string]any{
		"no fields":             {},
		"empty name":            {"name": ""},
		"invalid source locale": {"sourceLocale": "not a locale !!"},
		"empty target locales":  {"targetLocales": []string{}},
		"source in targets": {
			"sourceLocale": "en", "targetLocales": []string{"en"},
		},
	}
	for name, body := range cases {
		t.Run(name, func(t *testing.T) {
			rec := projectMutationRequest(api, scope, http.MethodPatch, scope.OrgPath("/projects/"+scope.ProjectID), body)
			require.Equal(t, http.StatusBadRequest, rec.Code, rec.Body.String())
		})
	}
}

func TestUpdateProjectIdentifierUniqueness(t *testing.T) {
	testenv.Require(t)
	scope := testenv.Seed(t, testenv.Options{Role: "admin", WithProject: true})
	// Capture this before creating a second project: MustProject overwrites
	// scope.ProjectID with whatever id it was just given.
	projectID := scope.ProjectID
	api := &projectAPI{pool: scope.Pool, membership: scope.Membership("admin")}
	otherID := scope.MustProject(t, uniqueProjectID("other_"), "Other Project")

	var otherIdentifier string
	require.NoError(t, scope.Pool.QueryRow(t.Context(), `select identifier from projects where id=$1`, otherID).Scan(&otherIdentifier))

	t.Run("collides with another project's identifier", func(t *testing.T) {
		rec := projectMutationRequest(api, scope, http.MethodPatch, scope.OrgPath("/projects/"+projectID), map[string]any{
			"identifier": otherIdentifier,
		})
		require.Equal(t, http.StatusConflict, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), `"identifier_taken"`)
	})

	t.Run("collides with an existing issue identifier prefix", func(t *testing.T) {
		_, err := scope.Pool.Exec(t.Context(), `
			insert into issue_sheet_issues (organization_id, project_id, identifier, number, title, status, issue_type)
			values ($1, $2, 'TAKEN-1', 1, 'Issue', 'open', 'bug')`,
			scope.OrganizationID, otherID)
		require.NoError(t, err)

		rec := projectMutationRequest(api, scope, http.MethodPatch, scope.OrgPath("/projects/"+projectID), map[string]any{
			"identifier": "TAKEN",
		})
		require.Equal(t, http.StatusConflict, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), `"identifier_taken"`)
	})

	t.Run("accepts an unused identifier", func(t *testing.T) {
		rec := projectMutationRequest(api, scope, http.MethodPatch, scope.OrgPath("/projects/"+projectID), map[string]any{
			"identifier": "FRESHID",
		})
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		var resp projectResponseBody
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
		require.Equal(t, "FRESHID", resp.Project.Identifier)
	})

	t.Run("rejects a malformed identifier", func(t *testing.T) {
		rec := projectMutationRequest(api, scope, http.MethodPatch, scope.OrgPath("/projects/"+projectID), map[string]any{
			"identifier": "123-bad",
		})
		require.Equal(t, http.StatusBadRequest, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), `"invalid_identifier"`)
	})
}

func TestUpdateProjectInvalidTeam(t *testing.T) {
	testenv.Require(t)
	scope := testenv.Seed(t, testenv.Options{Role: "developer"})
	ownTeamID := scope.MustTeam(t, "own-team-update", "Own Team", "member")
	scope.MustProject(t, scope.ProjectID, "Existing Project")
	_, err := scope.Pool.Exec(t.Context(), `update projects set team_id=$2 where id=$1`, scope.ProjectID, ownTeamID)
	require.NoError(t, err)
	api := &projectAPI{pool: scope.Pool, membership: scope.Membership("developer")}
	otherTeamID := scope.MustTeam(t, "other-team-update", "Other Team", "")

	rec := projectMutationRequest(api, scope, http.MethodPatch, scope.OrgPath("/projects/"+scope.ProjectID), map[string]any{
		"teamId": otherTeamID,
	})
	require.Equal(t, http.StatusBadRequest, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"invalid_project_team"`)
}

func TestUpdateProjectSourceLocaleAttachedGlossaryConflict(t *testing.T) {
	testenv.Require(t)
	scope := testenv.Seed(t, testenv.Options{Role: "admin"})
	seedNativeProjectWithLocales(t, scope, scope.ProjectID, "en", []string{"fr"})
	api := &projectAPI{pool: scope.Pool, membership: scope.Membership("admin")}

	glossaryID := scope.MustGlossary(t, "", "Team glossary", "en")
	scope.MustAttachGlossaryToProject(t, scope.ProjectID, glossaryID, 0)

	t.Run("changing to a locale the attached glossary does not use is rejected", func(t *testing.T) {
		rec := projectMutationRequest(api, scope, http.MethodPatch, scope.OrgPath("/projects/"+scope.ProjectID), map[string]any{
			"sourceLocale": "de",
		})
		require.Equal(t, http.StatusBadRequest, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), `"project_source_locale_attached_glossaries"`)

		var stored string
		require.NoError(t, scope.Pool.QueryRow(t.Context(), `select source_locale from projects where id=$1`, scope.ProjectID).Scan(&stored))
		require.Equal(t, "en", stored, "the rejected update must not have partially applied")
	})

	t.Run("changing to the glossary's own locale is allowed", func(t *testing.T) {
		rec := projectMutationRequest(api, scope, http.MethodPatch, scope.OrgPath("/projects/"+scope.ProjectID), map[string]any{
			"sourceLocale":  "en",
			"targetLocales": []string{"fr", "de"},
		})
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	})
}

func TestUpdateProjectNoOpStillPublishesActivity(t *testing.T) {
	testenv.Require(t)
	scope := testenv.Seed(t, testenv.Options{Role: "admin", WithProject: true})
	publisher := &recordingActivityLogPublisher{}
	api := &projectAPI{pool: scope.Pool, membership: scope.Membership("admin"), activityLog: publisher}

	var currentName string
	require.NoError(t, scope.Pool.QueryRow(t.Context(), `select name from projects where id=$1`, scope.ProjectID).Scan(&currentName))

	rec := projectMutationRequest(api, scope, http.MethodPatch, scope.OrgPath("/projects/"+scope.ProjectID), map[string]any{
		"name": currentName,
	})
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

	events := publisher.recorded()
	require.Len(t, events, 1, "a no-op update must still publish exactly one project_settings_changed event")
	require.Equal(t, "project_settings_changed", events[0].EventType)
	require.Equal(t, []string{"name"}, events[0].Payload["changedFields"])
}
