package main

import (
	"net/http"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func mustProjectTranslationKey(t *testing.T, api *projectAPI, orgID, projectID, key, sourceText string) string {
	t.Helper()
	id := uuid.NewString()
	_, err := api.pool.Exec(t.Context(), `
        insert into project_translation_keys (
            id, organization_id, project_id, key, source_text, normalized_source_text
        ) values ($1, $2, $3, $4, $5, $6)`,
		id, orgID, projectID, key, sourceText, strings.ToLower(sourceText))
	require.NoError(t, err)
	return id
}

func TestContentEditorBehaviorPreviewHandler(t *testing.T) {
	t.Run("reports duplicate source text groups for an operator", func(t *testing.T) {
		api, scope := projectTestAPI(t)
		mustProjectTranslationKey(t, api, scope.OrganizationID, scope.ProjectID, "cta.buy_1", "Buy now")
		mustProjectTranslationKey(t, api, scope.OrganizationID, scope.ProjectID, "cta.buy_2", "Buy now")
		mustProjectTranslationKey(t, api, scope.OrganizationID, scope.ProjectID, "cta.buy_3", "Buy now")
		mustProjectTranslationKey(t, api, scope.OrganizationID, scope.ProjectID, "cta.cancel", "Cancel")
		mustProjectTranslationKey(t, api, scope.OrganizationID, scope.ProjectID, "cta.ok_1", "OK")
		mustProjectTranslationKey(t, api, scope.OrganizationID, scope.ProjectID, "cta.ok_2", "OK")

		api.membership = scope.Membership("admin")
		rec := projectRequest(api, scope, scope.OrgPath("/projects/"+scope.ProjectID+"/content-editor-behavior/preview"))
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		require.JSONEq(t, `{"preview":{"affectedOccurrences":5,"groups":2}}`, rec.Body.String())
	})

	t.Run("returns zero groups when there are no duplicate keys", func(t *testing.T) {
		api, scope := projectTestAPI(t)
		mustProjectTranslationKey(t, api, scope.OrganizationID, scope.ProjectID, "cta.buy", "Buy now")

		api.membership = scope.Membership("localization_manager")
		rec := projectRequest(api, scope, scope.OrgPath("/projects/"+scope.ProjectID+"/content-editor-behavior/preview"))
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		require.JSONEq(t, `{"preview":{"affectedOccurrences":0,"groups":0}}`, rec.Body.String())
	})

	t.Run("forbids non-operator roles before checking whether the project exists", func(t *testing.T) {
		api, scope := projectTestAPI(t)
		for _, role := range []string{"member", "developer", "translator", "reviewer"} {
			api.membership = scope.Membership(role)
			rec := projectRequest(api, scope, scope.OrgPath("/projects/does-not-exist/content-editor-behavior/preview"))
			require.Equal(t, http.StatusForbidden, rec.Code, role)
			require.JSONEq(t, `{"error":"forbidden","message":"Insufficient permissions"}`, rec.Body.String(), role)
		}
	})

	t.Run("returns not found for an operator when the project does not exist", func(t *testing.T) {
		api, scope := projectTestAPI(t)
		api.membership = scope.Membership("localization_manager")
		rec := projectRequest(api, scope, scope.OrgPath("/projects/does-not-exist/content-editor-behavior/preview"))
		require.Equal(t, http.StatusNotFound, rec.Code)
		require.Contains(t, rec.Body.String(), `"project_not_found"`)
	})

	t.Run("does not serve external project ids for an operator", func(t *testing.T) {
		api, scope := projectTestAPI(t)
		api.membership = scope.Membership("admin")
		rec := projectRequest(api, scope, scope.OrgPath("/projects/ext:crowdin:1/content-editor-behavior/preview"))
		require.Equal(t, http.StatusNotFound, rec.Code)
		require.Contains(t, rec.Body.String(), `"project_not_found"`)
	})

	t.Run("never previews a materialized provider project by its plain id", func(t *testing.T) {
		api, scope := projectTestAPI(t)
		providerProjectID := scope.ProjectID + "_provider"
		_, err := scope.Pool.Exec(t.Context(), `
            insert into projects (id, organization_id, created_by_user_id, name, identifier, source, external_provider_kind, external_project_id)
            select $1, organization_id, created_by_user_id, 'Provider project', 'PROVPREV', 'external_tms', 'crowdin', '123'
            from projects where id=$2`,
			providerProjectID, scope.ProjectID)
		require.NoError(t, err)

		api.membership = scope.Membership("admin")
		rec := projectRequest(api, scope, scope.OrgPath("/projects/"+providerProjectID+"/content-editor-behavior/preview"))
		require.Equal(t, http.StatusNotFound, rec.Code)
		require.Contains(t, rec.Body.String(), `"project_not_found"`)
	})
}
