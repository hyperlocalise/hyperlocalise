package main

import (
	"net/http"
	"testing"
	"time"

	"github.com/google/uuid"
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

func TestDeleteProjectCascadesCanvaConnection(t *testing.T) {
	testenv.Require(t)
	scope := testenv.Seed(t, testenv.Options{Role: "admin", WithProject: true})
	api := &projectAPI{pool: scope.Pool, membership: scope.Membership("admin")}

	apiKeyID := uuid.NewString()
	connectionID := uuid.NewString()
	_, err := scope.Pool.Exec(t.Context(), `
        insert into organization_api_keys (id, organization_id, name, key_hash, key_prefix, created_by_user_id)
        values ($1, $2, 'Canva test key', 'hash-canva-test', 'hl_canva1', $3)`,
		apiKeyID, scope.OrganizationID, scope.UserID)
	require.NoError(t, err)

	_, err = scope.Pool.Exec(t.Context(), `
        insert into canva_connections (
            id, organization_id, api_key_id, project_id, display_name,
            connection_token_hash, connection_token_prefix
        ) values ($1, $2, $3, $4, 'Test Canva', 'canva-token-hash', 'hl_canva_tes')`,
		connectionID, scope.OrganizationID, apiKeyID, scope.ProjectID)
	require.NoError(t, err)

	_, err = scope.Pool.Exec(t.Context(), `
        insert into canva_oauth_tokens (
            connection_id, user_id, organization_id,
            access_token_hash, refresh_token_hash,
            access_token_expires_at, refresh_token_expires_at
        ) values ($1, $2, $3, 'access-hash', 'refresh-hash', $4, $5)`,
		connectionID, scope.UserID, scope.OrganizationID,
		time.Now().Add(time.Hour), time.Now().Add(24*time.Hour))
	require.NoError(t, err)

	rec := projectMutationRequest(api, scope, http.MethodDelete, scope.OrgPath("/projects/"+scope.ProjectID), nil)
	require.Equal(t, http.StatusNoContent, rec.Code, rec.Body.String())

	var connectionCount int
	require.NoError(t, scope.Pool.QueryRow(t.Context(),
		`select count(*) from canva_connections where id=$1`, connectionID).Scan(&connectionCount))
	require.Equal(t, 0, connectionCount, "Canva connection must cascade-delete with the project")

	var tokenCount int
	require.NoError(t, scope.Pool.QueryRow(t.Context(),
		`select count(*) from canva_oauth_tokens where connection_id=$1`, connectionID).Scan(&tokenCount))
	require.Equal(t, 0, tokenCount, "Canva OAuth tokens must cascade-delete with the connection")
}
