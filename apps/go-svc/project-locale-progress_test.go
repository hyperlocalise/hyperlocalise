package main

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func mustProjectTranslation(
	t *testing.T,
	api *projectAPI,
	orgID, projectID, keyID, locale, text, status string,
	updatedAt time.Time,
) {
	t.Helper()
	_, err := api.pool.Exec(t.Context(), `
        insert into project_translations (
            organization_id, project_id, translation_key_id, target_locale, text, status, updated_at
        ) values ($1, $2, $3, $4, $5, $6, $7)`,
		orgID, projectID, keyID, locale, text, status, updatedAt)
	require.NoError(t, err)
}

func TestLocaleProgressHandler(t *testing.T) {
	t.Run("computes per-locale word and phrase progress", func(t *testing.T) {
		api, scope := projectTestAPI(t)
		_, err := scope.Pool.Exec(t.Context(), `update projects set target_locales='["fr-FR","de-DE"]'::jsonb where id=$1`, scope.ProjectID)
		require.NoError(t, err)

		key1 := mustProjectTranslationKey(t, api, scope.OrganizationID, scope.ProjectID, "cta.buy", "Buy now")
		key2 := mustProjectTranslationKey(t, api, scope.OrganizationID, scope.ProjectID, "cta.cancel", "Cancel")

		now := time.Now().UTC().Truncate(time.Millisecond)
		mustProjectTranslation(t, api, scope.OrganizationID, scope.ProjectID, key1, "fr-FR", "Acheter maintenant", "approved", now)
		mustProjectTranslation(t, api, scope.OrganizationID, scope.ProjectID, key2, "fr-FR", "Annuler", "needs_review", now.Add(-time.Hour))

		rec := projectRequest(api, scope, scope.OrgPath("/projects/"+scope.ProjectID+"/locale-progress"))
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

		require.JSONEq(t, `{
			"locales": [
				{
					"locale": "fr-FR",
					"translationProgress": 100,
					"approvalProgress": 67,
					"words": {"total": 3, "translated": 3, "approved": 2},
					"phrases": {"total": 2, "translated": 2, "approved": 1},
					"lastActivityAt": "`+now.Format("2006-01-02T15:04:05.000Z")+`"
				},
				{
					"locale": "de-DE",
					"translationProgress": 0,
					"approvalProgress": 0,
					"words": {"total": 3, "translated": 0, "approved": 0},
					"phrases": {"total": 2, "translated": 0, "approved": 0},
					"lastActivityAt": null
				}
			]
		}`, rec.Body.String())
	})

	t.Run("ignores hidden keys and their translations", func(t *testing.T) {
		api, scope := projectTestAPI(t)
		_, err := scope.Pool.Exec(t.Context(), `update projects set target_locales='["fr-FR"]'::jsonb where id=$1`, scope.ProjectID)
		require.NoError(t, err)

		visible := mustProjectTranslationKey(t, api, scope.OrganizationID, scope.ProjectID, "cta.buy", "Buy now")
		hidden := mustProjectTranslationKey(t, api, scope.OrganizationID, scope.ProjectID, "cta.hidden", "Secret")
		_, err = scope.Pool.Exec(t.Context(), `update project_translation_keys set is_hidden=true where id=$1`, hidden)
		require.NoError(t, err)
		mustProjectTranslation(t, api, scope.OrganizationID, scope.ProjectID, visible, "fr-FR", "Acheter maintenant", "approved", time.Now())
		mustProjectTranslation(t, api, scope.OrganizationID, scope.ProjectID, hidden, "fr-FR", "Secret", "approved", time.Now())

		rec := projectRequest(api, scope, scope.OrgPath("/projects/"+scope.ProjectID+"/locale-progress"))
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

		var body struct {
			Locales []struct {
				Locale string `json:"locale"`
				Words  struct {
					Total int `json:"total"`
				} `json:"words"`
			} `json:"locales"`
		}
		require.NoError(t, unmarshalBody(rec.Body.Bytes(), &body))
		require.Len(t, body.Locales, 1)
		require.Equal(t, 2, body.Locales[0].Words.Total)
	})

	t.Run("appends locales seen only in translations, sorted, after target locales", func(t *testing.T) {
		api, scope := projectTestAPI(t)
		_, err := scope.Pool.Exec(t.Context(), `update projects set target_locales='["fr-FR"]'::jsonb where id=$1`, scope.ProjectID)
		require.NoError(t, err)
		key := mustProjectTranslationKey(t, api, scope.OrganizationID, scope.ProjectID, "cta.buy", "Buy now")
		mustProjectTranslation(t, api, scope.OrganizationID, scope.ProjectID, key, "it-IT", "Compra ora", "approved", time.Now())
		mustProjectTranslation(t, api, scope.OrganizationID, scope.ProjectID, key, "de-DE", "Jetzt kaufen", "approved", time.Now())

		rec := projectRequest(api, scope, scope.OrgPath("/projects/"+scope.ProjectID+"/locale-progress"))
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

		var body struct {
			Locales []struct {
				Locale string `json:"locale"`
			} `json:"locales"`
		}
		require.NoError(t, unmarshalBody(rec.Body.Bytes(), &body))
		require.Len(t, body.Locales, 3)
		require.Equal(t, "fr-FR", body.Locales[0].Locale)
		require.Equal(t, "de-DE", body.Locales[1].Locale)
		require.Equal(t, "it-IT", body.Locales[2].Locale)
	})

	t.Run("returns an empty list for a project with no target locales or translations", func(t *testing.T) {
		api, scope := projectTestAPI(t)
		rec := projectRequest(api, scope, scope.OrgPath("/projects/"+scope.ProjectID+"/locale-progress"))
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		require.JSONEq(t, `{"locales":[]}`, rec.Body.String())
	})

	t.Run("returns not found for an inaccessible team-scoped project", func(t *testing.T) {
		api, scope := projectTestAPI(t)
		otherTeam := scope.MustTeam(t, "other-team", "Other team", "")
		_, err := scope.Pool.Exec(t.Context(), `update projects set team_id=$1 where id=$2`, otherTeam, scope.ProjectID)
		require.NoError(t, err)

		api.membership = scope.Membership("member")
		rec := projectRequest(api, scope, scope.OrgPath("/projects/"+scope.ProjectID+"/locale-progress"))
		require.Equal(t, http.StatusNotFound, rec.Code)
		require.Contains(t, rec.Body.String(), `"project_not_found"`)
	})

	t.Run("does not serve external project ids", func(t *testing.T) {
		api, scope := projectTestAPI(t)
		rec := projectRequest(api, scope, scope.OrgPath("/projects/ext:crowdin:1/locale-progress"))
		require.Equal(t, http.StatusNotFound, rec.Code)
		require.Contains(t, rec.Body.String(), `"project_not_found"`)
	})

	t.Run("never surfaces a materialized provider project by its plain id", func(t *testing.T) {
		api, scope := projectTestAPI(t)
		providerProjectID := scope.ProjectID + "_provider"
		_, err := scope.Pool.Exec(t.Context(), `
            insert into projects (id, organization_id, created_by_user_id, name, identifier, source, external_provider_kind, external_project_id)
            select $1, organization_id, created_by_user_id, 'Provider project', 'PROVLOC', 'external_tms', 'crowdin', '123'
            from projects where id=$2`,
			providerProjectID, scope.ProjectID)
		require.NoError(t, err)

		rec := projectRequest(api, scope, scope.OrgPath("/projects/"+providerProjectID+"/locale-progress"))
		require.Equal(t, http.StatusNotFound, rec.Code)
		require.Contains(t, rec.Body.String(), `"project_not_found"`)
	})
}

func TestCountNativeSourceWordsCJKApproximation(t *testing.T) {
	require.Equal(t, 4, countNativeSourceWords("你好世界"))
}

func unmarshalBody(body []byte, target any) error {
	return json.Unmarshal(body, target)
}
