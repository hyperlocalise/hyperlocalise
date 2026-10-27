package main

import (
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestFileProgressHandler(t *testing.T) {
	t.Run("computes per-file progress for one locale", func(t *testing.T) {
		api, scope := projectTestAPI(t)

		homeID := mustEditorCatSourceFile(t, scope, "home.json")
		buy := mustEditorCatKey(t, scope, homeID, "cta.buy", "Buy now")
		cancel := mustEditorCatKey(t, scope, homeID, "cta.cancel", "Cancel")
		hidden := mustEditorCatKey(t, scope, homeID, "cta.hidden", "Secret words here")
		mustEditorCatKey(t, scope, homeID, "fence", ":::")
		_, err := scope.Pool.Exec(t.Context(), `update project_translation_keys set is_hidden=true where id=$1`, hidden)
		require.NoError(t, err)
		mustEditorCatTranslation(t, scope, buy, "fr-FR", "Acheter maintenant", "approved")
		mustEditorCatTranslation(t, scope, cancel, "fr-FR", "Annuler", "needs_review")
		mustEditorCatTranslation(t, scope, cancel, "de-DE", "Abbrechen", "approved")

		numbersID := mustEditorCatSourceFile(t, scope, "numbers.json")
		mustEditorCatKey(t, scope, numbersID, "count", "{count}")

		rec := projectRequest(api, scope, scope.OrgPath("/projects/"+scope.ProjectID+"/file-progress?locale=fr-FR"))
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		require.JSONEq(t, `{
			"files": [
				{
					"sourcePath": "home.json",
					"translationProgress": 100,
					"approvalProgress": 67,
					"phrases": {"total": 2, "translated": 2, "approved": 1}
				},
				{
					"sourcePath": "numbers.json",
					"translationProgress": 0,
					"approvalProgress": 0,
					"phrases": {"total": 1, "translated": 0, "approved": 0}
				}
			]
		}`, rec.Body.String())
	})

	t.Run("requires a locale", func(t *testing.T) {
		api, scope := projectTestAPI(t)
		rec := projectRequest(api, scope, scope.OrgPath("/projects/"+scope.ProjectID+"/file-progress"))
		require.Equal(t, http.StatusBadRequest, rec.Code, rec.Body.String())
	})
}
