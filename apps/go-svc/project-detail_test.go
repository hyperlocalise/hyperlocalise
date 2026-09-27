package main

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestProjectDetailHandler(t *testing.T) {
	t.Run("returns the full native project record with open job count", func(t *testing.T) {
		api, scope := projectTestAPI(t)
		_, err := scope.Pool.Exec(t.Context(), `
            update projects set description='Landing page copy', target_locales='["fr-FR","de-DE"]'::jsonb
            where id=$1`, scope.ProjectID)
		require.NoError(t, err)
		_, err = scope.Pool.Exec(t.Context(), `
            insert into jobs (id, organization_id, project_id, kind, status, input_payload)
            values ($1, $2, $3, 'translation', 'queued', '{}'::jsonb)`,
			"job_"+scope.ProjectID, scope.OrganizationID, scope.ProjectID)
		require.NoError(t, err)

		rec := projectRequest(api, scope, scope.OrgPath("/projects/"+scope.ProjectID))
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

		var body struct {
			Project struct {
				ID           string   `json:"id"`
				Source       string   `json:"source"`
				Description  string   `json:"description"`
				TargetLocale []string `json:"targetLocales"`
				OpenJobCount int      `json:"openJobCount"`
			} `json:"project"`
		}
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
		require.Equal(t, scope.ProjectID, body.Project.ID)
		require.Equal(t, "native", body.Project.Source)
		require.Equal(t, "Landing page copy", body.Project.Description)
		require.Equal(t, []string{"fr-FR", "de-DE"}, body.Project.TargetLocale)
		require.Equal(t, 1, body.Project.OpenJobCount)
	})

	t.Run("does not filter is_active for direct-by-id reads", func(t *testing.T) {
		api, scope := projectTestAPI(t)
		_, err := scope.Pool.Exec(t.Context(), `update projects set is_active=false where id=$1`, scope.ProjectID)
		require.NoError(t, err)

		rec := projectRequest(api, scope, scope.OrgPath("/projects/"+scope.ProjectID))
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	})

	t.Run("returns not found for an inaccessible team-scoped project", func(t *testing.T) {
		api, scope := projectTestAPI(t)
		otherTeam := scope.MustTeam(t, "other-team", "Other team", "")
		_, err := scope.Pool.Exec(t.Context(), `update projects set team_id=$1 where id=$2`, otherTeam, scope.ProjectID)
		require.NoError(t, err)
		scope.MustTeam(t, "my-team", "My team", "member")

		api.membership = scope.Membership("member")
		rec := projectRequest(api, scope, scope.OrgPath("/projects/"+scope.ProjectID))
		require.Equal(t, http.StatusNotFound, rec.Code)
		require.Contains(t, rec.Body.String(), `"project_not_found"`)
	})

	t.Run("allows access via the org's default team when the project has no team", func(t *testing.T) {
		api, scope := projectTestAPI(t)
		scope.MustTeam(t, "default", "Default", "member")

		api.membership = scope.Membership("member")
		rec := projectRequest(api, scope, scope.OrgPath("/projects/"+scope.ProjectID))
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	})

	t.Run("does not serve external project ids", func(t *testing.T) {
		api, scope := projectTestAPI(t)
		rec := projectRequest(api, scope, scope.OrgPath("/projects/ext:crowdin:1"))
		require.Equal(t, http.StatusNotFound, rec.Code)
		require.Contains(t, rec.Body.String(), `"project_not_found"`)
	})

	t.Run("never surfaces a materialized provider project by its plain id", func(t *testing.T) {
		api, scope := projectTestAPI(t)
		providerProjectID := scope.ProjectID + "_provider"
		_, err := scope.Pool.Exec(t.Context(), `
            insert into projects (id, organization_id, created_by_user_id, name, identifier, source, external_provider_kind, external_project_id)
            select $1, organization_id, created_by_user_id, 'Provider project', 'PROVPROJ', 'external_tms', 'crowdin', '123'
            from projects where id=$2`,
			providerProjectID, scope.ProjectID)
		require.NoError(t, err)

		rec := projectRequest(api, scope, scope.OrgPath("/projects/"+providerProjectID))
		require.Equal(t, http.StatusNotFound, rec.Code)
		require.Contains(t, rec.Body.String(), `"project_not_found"`)
	})
}
