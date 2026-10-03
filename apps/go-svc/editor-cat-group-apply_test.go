package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
)

func TestEditorCatGroupApplyRejectsInvalidPreview(t *testing.T) {
	for _, body := range []editorCatGroupApplyBody{
		{SourceText: "Save", TargetLocale: "fr"},
		{SourceText: "Save", TargetLocale: "fr", Members: []editorCatApplyMember{{ID: uuid.NewString()}}},
		{SourceText: "Save", TargetLocale: "fr", Members: []editorCatApplyMember{{ID: "invalid", SourceRevision: "1", TranslationRevision: "missing"}}},
	} {
		data, _ := json.Marshal(body)
		r := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(string(data)))
		r.SetPathValue("groupId", editorCatTextGroupID("Save"))
		_, _, err := (&editorCatAPI{}).applyStringGroup(r, editorCatActor{role: "translator"}, editorCatProject{Source: "native"})
		require.Error(t, err)
		require.Equal(t, 400, err.(*editorCatError).status)
	}
	_, _, err := (&editorCatAPI{}).applyStringGroup(httptest.NewRequest(http.MethodPost, "/", nil), editorCatActor{role: "member"}, editorCatProject{Source: "native"})
	require.Equal(t, 403, err.(*editorCatError).status)
}

func bulkPreview(t *testing.T, api *editorCatAPI, scope *testenv.Scope, source string) []editorCatApplyMember {
	t.Helper()
	rec := editorCatRequestScope(api, scope, http.MethodGet, editorCatPathFor(scope, "/files/detail/cat/groups/"+editorCatTextGroupID(source)+"/members?sourcePath=*&targetLocale=fr"), "")
	require.Equal(t, 200, rec.Code, rec.Body.String())
	var response struct {
		Members []editorCatApplyMember `json:"members"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &response))
	return response.Members
}

func TestEditorCatBulkApplyAtomicityAndHistory(t *testing.T) {
	for _, scenario := range []string{"success", "translation conflict", "source conflict", "locked", "format"} {
		t.Run(scenario, func(t *testing.T) {
			api, scope := editorCatTestAPI(t, "translator")
			a := mustEditorCatKey(t, scope, mustEditorCatSourceFile(t, scope, "a.json"), "save", "Save")
			b := mustEditorCatKey(t, scope, mustEditorCatSourceFile(t, scope, "b.json"), "save", "Save")
			members := bulkPreview(t, api, scope, "Save")
			switch scenario {
			case "translation conflict":
				_, err := scope.Pool.Exec(t.Context(), `insert into project_translations(organization_id,project_id,translation_key_id,target_locale,text,status,provenance) values($1,$2,$3,'fr','Concurrent','draft','manual')`, scope.OrganizationID, scope.ProjectID, b)
				require.NoError(t, err)
			case "source conflict":
				_, err := scope.Pool.Exec(t.Context(), `update project_translation_keys set source_text='Changed' where id=$1`, b)
				require.NoError(t, err)
			case "locked":
				_, err := scope.Pool.Exec(t.Context(), `insert into project_cat_segment_locks(organization_id,project_id,target_locale,external_string_id,locked_by_user_id) values($1,$2,'fr',$3,$4)`, scope.OrganizationID, scope.ProjectID, b, scope.UserID)
				require.NoError(t, err)
			case "format":
				_, err := scope.Pool.Exec(t.Context(), `update project_translation_keys set max_length=2 where id=$1`, b)
				require.NoError(t, err)
				members = bulkPreview(t, api, scope, "Save")
			}
			body, _ := json.Marshal(editorCatGroupApplyBody{SourceText: "Save", TargetLocale: "fr", Text: "Enregistrer", Members: members})
			rec := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/groups/"+editorCatTextGroupID("Save")+"/apply"), string(body))
			var count int
			if scenario == "success" {
				require.Equal(t, 200, rec.Code, rec.Body.String())
				require.NoError(t, scope.Pool.QueryRow(t.Context(), `select count(*) from project_translations where project_id=$1 and text='Enregistrer'`, scope.ProjectID).Scan(&count))
				require.Equal(t, 2, count)
				require.NoError(t, scope.Pool.QueryRow(t.Context(), `select count(distinct payload->>'operationId') from organization_activity_events where payload->>'projectId'=$1 and event_type='string_segment_translation_updated'`, scope.ProjectID).Scan(&count))
				require.Equal(t, 1, count)
				rec = editorCatRequestScope(api, scope, http.MethodGet, editorCatPathFor(scope, "/files/detail/cat/activity-logs?sourcePath=*&targetLocale=fr&segmentId="+a), "")
				require.Equal(t, 200, rec.Code)
				var logs struct {
					ActivityLogs []activityLogListItem `json:"activityLogs"`
				}
				require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &logs))
				require.Len(t, logs.ActivityLogs, 1)
				rec = editorCatRequestScope(api, scope, http.MethodGet, editorCatPathFor(scope, "/files/detail/cat/activity-logs?sourcePath=*&targetLocale=de&segmentId="+a), "")
				require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &logs))
				require.Empty(t, logs.ActivityLogs)
			} else {
				if scenario == "format" {
					require.Equal(t, 422, rec.Code, rec.Body.String())
				} else {
					require.Equal(t, 409, rec.Code, rec.Body.String())
				}
				require.NoError(t, scope.Pool.QueryRow(t.Context(), `select count(*) from project_translations where project_id=$1 and text='Enregistrer'`, scope.ProjectID).Scan(&count))
				require.Zero(t, count)
				require.NoError(t, scope.Pool.QueryRow(t.Context(), `select count(*) from organization_activity_events where payload->>'projectId'=$1 and event_type='string_segment_translation_updated'`, scope.ProjectID).Scan(&count))
				require.Zero(t, count)
			}
		})
	}
}
