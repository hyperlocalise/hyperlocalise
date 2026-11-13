package main

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestDictionaryProjectAccess(t *testing.T) {
	for _, role := range []string{"admin", "localization_manager", "member", "translator"} {
		t.Run(role, func(t *testing.T) {
			api, scope := dictionaryTestAPI(t, role)
			if !(dictionaryActor{role: role}).canWrite() {
				scope.MustTeam(t, "default", "Default", "member")
			}
			projectID := scope.MustProject(t, scope.ProjectID, "Project")
			actor := dictionaryActor{userID: scope.UserID, organizationID: scope.OrganizationID, role: role}
			id, err := api.ownedProject(t.Context(), actor, " "+projectID+" ")
			require.NoError(t, err)
			require.Equal(t, projectID, id)
		})
	}
	t.Run("other tenant or inaccessible team", func(t *testing.T) {
		api, scope := dictionaryTestAPI(t, "admin")
		actor := dictionaryActor{userID: scope.UserID, organizationID: scope.OrganizationID, role: "admin"}
		_, err := api.ownedProject(t.Context(), actor, "project_other")
		require.EqualError(t, err, "project_not_found")
	})
	t.Run("encoded identifier", func(t *testing.T) {
		require.Equal(t, "ext:provider:project", normalizeDictionaryProjectID("ext%253Aprovider%253Aproject"))
	})
}

func TestDictionaryProjectAttachmentIdempotency(t *testing.T) {
	t.Run("new", func(t *testing.T) {
		api, scope := dictionaryTestAPI(t, "admin")
		dictID := scope.MustDictionary(t, "", "Brand names")
		projectID := scope.MustProject(t, scope.ProjectID, "Project")
		rec := dictionaryRequest(api, scope, "POST", scope.OrgPath("/projects/"+projectID+"/dictionaries"), `{"dictionaryId":"`+dictID+`"}`)
		require.Equal(t, 201, rec.Code, rec.Body.String())
		requireJSONField(t, rec.Body.String(), "id", dictID)
		require.Contains(t, rec.Body.String(), `"priority":`)
		require.Contains(t, rec.Body.String(), `"dictionary":`)
	})
	t.Run("existing", func(t *testing.T) {
		api, scope := dictionaryTestAPI(t, "admin")
		dictID := scope.MustDictionary(t, "", "Brand names")
		projectID := scope.MustProject(t, scope.ProjectID, "Project")
		scope.MustAttachDictionary(t, projectID, dictID, 1)
		rec := dictionaryRequest(api, scope, "POST", scope.OrgPath("/projects/"+projectID+"/dictionaries"), `{"dictionaryId":"`+dictID+`"}`)
		require.Equal(t, 200, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), `"priority":1`)
		require.Contains(t, rec.Body.String(), `"dictionary":`)
	})
	t.Run("dictionary side explicit priority", func(t *testing.T) {
		api, scope := dictionaryTestAPI(t, "localization_manager")
		dictID := scope.MustDictionary(t, "", "Brand names")
		projectID := scope.MustProject(t, scope.ProjectID, "Project")
		rec := dictionaryRequest(api, scope, "POST", scope.OrgPath("/dictionaries/"+dictID+"/projects"), `{"projectId":"`+projectID+`","priority":9}`)
		require.Equal(t, 200, rec.Code, rec.Body.String())
		require.JSONEq(t, `{"projects":[{"projectId":"`+projectID+`","projectName":"Project","priority":9}]}`, rec.Body.String())
	})
}

func TestDictionaryProjectListAndDetach(t *testing.T) {
	t.Run("list project dictionaries", func(t *testing.T) {
		api, scope := dictionaryTestAPI(t, "member")
		scope.MustTeam(t, "default", "Default", "member")
		dictID := scope.MustDictionary(t, "", "Brand names")
		projectID := scope.MustProject(t, scope.ProjectID, "Project")
		scope.MustAttachDictionary(t, projectID, dictID, 7)
		rec := dictionaryRequest(api, scope, "GET", scope.OrgPath("/projects/"+projectID+"/dictionaries"), "")
		require.Equal(t, 200, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), `"priority":7`)
	})
	t.Run("detach via project", func(t *testing.T) {
		api, scope := dictionaryTestAPI(t, "admin")
		dictID := scope.MustDictionary(t, "", "Brand names")
		projectID := scope.MustProject(t, scope.ProjectID, "Project")
		scope.MustAttachDictionary(t, projectID, dictID, 0)
		rec := dictionaryRequest(api, scope, "DELETE", scope.OrgPath("/projects/"+projectID+"/dictionaries/"+dictID), "")
		require.Equal(t, 204, rec.Code)
		require.Empty(t, rec.Body.String())
	})
	t.Run("detach via dictionary", func(t *testing.T) {
		api, scope := dictionaryTestAPI(t, "admin")
		dictID := scope.MustDictionary(t, "", "Brand names")
		projectID := scope.MustProject(t, scope.ProjectID, "Project")
		scope.MustAttachDictionary(t, projectID, dictID, 0)
		rec := dictionaryRequest(api, scope, "DELETE", scope.OrgPath("/dictionaries/"+dictID+"/projects/"+projectID), "")
		require.Equal(t, 204, rec.Code)
	})
	t.Run("list dictionary projects filters by team for members", func(t *testing.T) {
		api, scope := dictionaryTestAPI(t, "member")
		scope.MustTeam(t, "default", "Default", "member")
		dictID := scope.MustDictionary(t, "", "Brand names")
		projectID := scope.MustProject(t, scope.ProjectID, "Visible")
		scope.MustAttachDictionary(t, projectID, dictID, 1)
		rec := dictionaryRequest(api, scope, "GET", scope.OrgPath("/dictionaries/"+dictID+"/projects"), "")
		require.Equal(t, 200, rec.Code, rec.Body.String())
		require.JSONEq(t, `{"projects":[{"projectId":"`+projectID+`","projectName":"Visible","priority":1}]}`, rec.Body.String())
	})
	t.Run("list dictionaries by inaccessible projectId returns empty", func(t *testing.T) {
		api, scope := dictionaryTestAPI(t, "member")
		rec := dictionaryRequest(api, scope, "GET", scope.OrgPath("/dictionaries?projectId=project_secret"), "")
		require.Equal(t, 200, rec.Code, rec.Body.String())
		require.JSONEq(t, `{"dictionaries":[]}`, rec.Body.String())
	})
}

func TestDictionaryProjectResolvedWords(t *testing.T) {
	t.Run("priority merge and version", func(t *testing.T) {
		api, scope := dictionaryTestAPI(t, "member")
		scope.MustTeam(t, "default", "Default", "member")
		dictID := scope.MustDictionary(t, "", "Brand names")
		other := scope.MustDictionary(t, "", "Other")
		projectID := scope.MustProject(t, scope.ProjectID, "Project")
		scope.MustAttachDictionary(t, projectID, dictID, 0)
		scope.MustAttachDictionary(t, projectID, other, 10)
		scope.MustDictionaryWord(t, dictID, "en-US", "AuthKit")
		scope.MustDictionaryWord(t, other, "en-US", "authkit")
		rec := dictionaryRequest(api, scope, "GET", scope.OrgPath("/projects/"+projectID+"/dictionaries/resolved?locale=en_us"), "")
		require.Equal(t, 200, rec.Code, rec.Body.String())
		var body struct {
			Locale        string   `json:"locale"`
			Words         []string `json:"words"`
			DictionaryIDs []string `json:"dictionaryIds"`
			WordsVersion  string   `json:"wordsVersion"`
		}
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
		require.Equal(t, "en-US", body.Locale)
		require.Equal(t, []string{"AuthKit"}, body.Words)
		require.Equal(t, []string{dictID}, body.DictionaryIDs)
		require.Equal(t, dictID+":1,en-US", body.WordsVersion)
	})
	t.Run("no dictionaries yields arrays", func(t *testing.T) {
		api, scope := dictionaryTestAPI(t, "member")
		scope.MustTeam(t, "default", "Default", "member")
		projectID := scope.MustProject(t, scope.ProjectID, "Project")
		rec := dictionaryRequest(api, scope, "GET", scope.OrgPath("/projects/"+projectID+"/dictionaries/resolved?locale=en"), "")
		require.Equal(t, 200, rec.Code)
		require.JSONEq(t, `{"locale":"en","words":[],"dictionaryIds":[],"wordsVersion":"en"}`, rec.Body.String())
	})
}
