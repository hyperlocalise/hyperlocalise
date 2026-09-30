package main

import (
	"net/http"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
)

func TestDeleteProjectHappyPath(t *testing.T) {
	testenv.Require(t)
	scope := testenv.Seed(t, testenv.Options{Role: "admin", WithProject: true})
	publisher := &recordingActivityLogPublisher{}
	api := &projectAPI{pool: scope.Pool, membership: scope.Membership("admin"), activityLog: publisher}

	rec := projectMutationRequest(api, scope, http.MethodDelete, scope.OrgPath("/projects/"+scope.ProjectID), nil)
	require.Equal(t, http.StatusNoContent, rec.Code, rec.Body.String())
	require.Empty(t, rec.Body.Bytes())

	var count int
	require.NoError(t, scope.Pool.QueryRow(t.Context(), `select count(*) from projects where id=$1`, scope.ProjectID).Scan(&count))
	require.Equal(t, 0, count, "project row must be gone")

	events := publisher.recorded()
	require.Len(t, events, 1)
	require.Equal(t, "project_deleted", events[0].EventType)
	require.Equal(t, scope.ProjectID, events[0].Payload["resourceId"])
}

func TestDeleteProjectAuthorizationMatrix(t *testing.T) {
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
			teamID := scope.MustTeam(t, "team-"+tc.role, "Team", "member")
			scope.MustProject(t, scope.ProjectID, "Delete Role Test")
			_, err := scope.Pool.Exec(t.Context(), `update projects set team_id=$2 where id=$1`, scope.ProjectID, teamID)
			require.NoError(t, err)

			api := &projectAPI{pool: scope.Pool, membership: scope.Membership(tc.role)}
			rec := projectMutationRequest(api, scope, http.MethodDelete, scope.OrgPath("/projects/"+scope.ProjectID), nil)
			if tc.allowed {
				require.Equal(t, http.StatusNoContent, rec.Code, rec.Body.String())
			} else {
				require.Equal(t, http.StatusForbidden, rec.Code, rec.Body.String())
				require.Contains(t, rec.Body.String(), `"forbidden"`)
			}
		})
	}
}

func TestDeleteProjectNotFound(t *testing.T) {
	testenv.Require(t)
	scope := testenv.Seed(t, testenv.Options{Role: "admin"})
	api := &projectAPI{pool: scope.Pool, membership: scope.Membership("admin")}

	rec := projectMutationRequest(api, scope, http.MethodDelete, scope.OrgPath("/projects/does-not-exist"), nil)
	require.Equal(t, http.StatusNotFound, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"project_not_found"`)
}

func TestDeleteProjectTeamGlossaryGuard(t *testing.T) {
	testenv.Require(t)
	scope := testenv.Seed(t, testenv.Options{Role: "admin", WithProject: true})
	api := &projectAPI{pool: scope.Pool, membership: scope.Membership("admin")}
	teamID := scope.MustTeam(t, "glossary-owning-team", "Glossary Team", "")
	glossaryID := scope.MustTeamGlossary(t, "", "Shared Team Glossary", "en", teamID)

	t.Run("blocked when this is the glossary's only native project", func(t *testing.T) {
		scope.MustAttachGlossaryToProject(t, scope.ProjectID, glossaryID, 0)

		rec := projectMutationRequest(api, scope, http.MethodDelete, scope.OrgPath("/projects/"+scope.ProjectID), nil)
		require.Equal(t, http.StatusForbidden, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), `"glossary_team_project_required"`)

		var count int
		require.NoError(t, scope.Pool.QueryRow(t.Context(), `select count(*) from projects where id=$1`, scope.ProjectID).Scan(&count))
		require.Equal(t, 1, count, "the rejected delete must not have removed the project")
	})

	t.Run("allowed once the glossary has another native project attached", func(t *testing.T) {
		secondProjectID := uniqueProjectID("second_")
		scope.MustProject(t, secondProjectID, "Second Attached Project")
		scope.MustAttachGlossaryToProject(t, secondProjectID, glossaryID, 0)

		rec := projectMutationRequest(api, scope, http.MethodDelete, scope.OrgPath("/projects/"+scope.ProjectID), nil)
		require.Equal(t, http.StatusNoContent, rec.Code, rec.Body.String())

		var count int
		require.NoError(t, scope.Pool.QueryRow(t.Context(), `select count(*) from projects where id=$1`, scope.ProjectID).Scan(&count))
		require.Equal(t, 0, count)

		var glossaryStillExists bool
		require.NoError(t, scope.Pool.QueryRow(t.Context(), `select exists(select 1 from glossaries where id=$1)`, glossaryID).Scan(&glossaryStillExists))
		require.True(t, glossaryStillExists, "deleting the project must not cascade-delete the shared team glossary")
	})
}
