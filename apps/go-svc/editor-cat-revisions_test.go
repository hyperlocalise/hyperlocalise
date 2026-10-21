package main

import (
	"encoding/json"
	"net/http"
	"net/url"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
)

type editorCatRevisionsResponse struct {
	Revisions  []editorCatRevisionView `json:"revisions"`
	NextCursor *string                 `json:"nextCursor"`
}

func editorCatSave(t *testing.T, api *editorCatAPI, scope *testenv.Scope, keyID, text string) {
	t.Helper()
	rec := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/translations"),
		`{"sourcePath":"a.json","targetLocale":"fr","externalStringId":"`+keyID+`","text":"`+text+`"}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
}

func editorCatRevisions(t *testing.T, api *editorCatAPI, scope *testenv.Scope, keyID string) []editorCatRevisionView {
	t.Helper()
	rec := editorCatRequestScope(api, scope, http.MethodGet,
		editorCatPathFor(scope, "/files/detail/cat/segments/"+keyID+"/revisions?sourcePath=a.json&targetLocale=fr"), "")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var body editorCatRevisionsResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	return body.Revisions
}

func TestFilterEditorCatActivityEventTypes(t *testing.T) {
	allowed := []string{"string_segment_translation_updated", "string_segment_approved", "string_segment_locked"}

	selected, err := filterEditorCatActivityEventTypes(allowed, nil)
	require.NoError(t, err)
	require.Equal(t, allowed, selected)

	selected, err = filterEditorCatActivityEventTypes(allowed, []string{"string_segment_locked,string_segment_approved", "string_segment_locked"})
	require.NoError(t, err)
	require.Equal(t, []string{"string_segment_approved", "string_segment_locked"}, selected)

	_, err = filterEditorCatActivityEventTypes(allowed, []string{"member_invited"})
	require.Error(t, err)
}

func TestEditorCatSaveRecordsRevisionsWithBaseline(t *testing.T) {
	api, scope := editorCatTestAPI(t, "translator")
	fileID := mustEditorCatSourceFile(t, scope, "a.json")
	keyID := mustEditorCatKey(t, scope, fileID, "hello", "Hello")
	mustEditorCatTranslation(t, scope, keyID, "fr", "Salut", "draft")

	editorCatSave(t, api, scope, keyID, "Bonjour")
	editorCatSave(t, api, scope, keyID, "Bonjour")

	revisions := editorCatRevisions(t, api, scope, keyID)
	require.Len(t, revisions, 2, "an unchanged save records nothing")
	require.Equal(t, "Bonjour", revisions[0].Text)
	require.True(t, revisions[0].IsCurrent)
	require.Equal(t, "user", revisions[0].Actor.Kind)
	require.Equal(t, "Ada Lovelace", revisions[0].Actor.DisplayName)
	require.Equal(t, "Salut", revisions[1].Text, "the pre-history text is kept as a baseline")
	require.False(t, revisions[1].IsCurrent)

	var revisionID string
	require.NoError(t, scope.Pool.QueryRow(t.Context(), `select payload->>'revisionId' from organization_activity_events where target_id=$1 and event_type='string_segment_translation_updated'`, keyID).Scan(&revisionID))
	require.Equal(t, revisions[0].ID, revisionID)
}

func TestEditorCatRestoreRevision(t *testing.T) {
	api, scope := editorCatTestAPI(t, "translator")
	fileID := mustEditorCatSourceFile(t, scope, "a.json")
	keyID := mustEditorCatKey(t, scope, fileID, "hello", "Hello")
	editorCatSave(t, api, scope, keyID, "Bonjour")
	editorCatSave(t, api, scope, keyID, "Salut")
	revisions := editorCatRevisions(t, api, scope, keyID)
	require.Len(t, revisions, 2)
	current, original := revisions[0], revisions[1]

	restorePath := editorCatPathFor(scope, "/files/detail/cat/segments/"+keyID+"/revisions/"+original.ID+"/restore")
	stale := editorCatRequestScope(api, scope, http.MethodPost, restorePath,
		`{"sourcePath":"a.json","targetLocale":"fr","expectedCurrentRevisionId":"`+original.ID+`"}`)
	require.Equal(t, http.StatusConflict, stale.Code, stale.Body.String())

	rec := editorCatRequestScope(api, scope, http.MethodPost, restorePath,
		`{"sourcePath":"a.json","targetLocale":"fr","expectedCurrentRevisionId":"`+current.ID+`"}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var body struct {
		Translation editorCatTranslation `json:"translation"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Equal(t, "Bonjour", body.Translation.Text)

	revisions = editorCatRevisions(t, api, scope, keyID)
	require.Len(t, revisions, 3)
	require.Equal(t, "Bonjour", revisions[0].Text)
	require.NotNil(t, revisions[0].RestoredFromRevisionID)
	require.Equal(t, original.ID, *revisions[0].RestoredFromRevisionID)

	var restoredFrom string
	require.NoError(t, scope.Pool.QueryRow(t.Context(), `select payload->>'restoredFromRevisionId' from organization_activity_events where target_id=$1 and payload ? 'restoredFromRevisionId'`, keyID).Scan(&restoredFrom))
	require.Equal(t, original.ID, restoredFrom)
}

func TestEditorCatRestoreRevisionRejectsLockedSegment(t *testing.T) {
	api, scope := editorCatTestAPI(t, "translator")
	fileID := mustEditorCatSourceFile(t, scope, "a.json")
	keyID := mustEditorCatKey(t, scope, fileID, "hello", "Hello")
	editorCatSave(t, api, scope, keyID, "Bonjour")
	editorCatSave(t, api, scope, keyID, "Salut")
	revisions := editorCatRevisions(t, api, scope, keyID)
	require.Len(t, revisions, 2)
	_, err := scope.Pool.Exec(t.Context(), `insert into project_cat_segment_locks(organization_id,project_id,target_locale,external_string_id,locked_by_user_id) values($1,$2,'fr',$3,$4)`, scope.OrganizationID, scope.ProjectID, keyID, scope.UserID)
	require.NoError(t, err)

	rec := editorCatRequestScope(api, scope, http.MethodPost,
		editorCatPathFor(scope, "/files/detail/cat/segments/"+keyID+"/revisions/"+revisions[1].ID+"/restore"),
		`{"sourcePath":"a.json","targetLocale":"fr"}`)
	require.Equal(t, http.StatusConflict, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), "cat_segment_locked")
}

func TestEditorCatBaselineOfJobTranslationHasNoOperation(t *testing.T) {
	api, scope := editorCatTestAPI(t, "translator")
	fileID := mustEditorCatSourceFile(t, scope, "a.json")
	keyID := mustEditorCatKey(t, scope, fileID, "hello", "Hello")
	translationID := mustEditorCatTranslation(t, scope, keyID, "fr", "Salut", "needs_review")
	_, err := scope.Pool.Exec(t.Context(), `update project_translations set provenance='translation_job' where id=$1`, translationID)
	require.NoError(t, err)

	editorCatSave(t, api, scope, keyID, "Bonjour")

	var baselineOperations int
	require.NoError(t, scope.Pool.QueryRow(t.Context(), `select count(operation_id) from project_translation_revisions where translation_id=$1 and text='Salut'`, translationID).Scan(&baselineOperations))
	require.Zero(t, baselineOperations, "a baseline belongs to no operation, so undo can return to it")
}

func TestEditorCatRestoreRevisionRequiresEditor(t *testing.T) {
	api, scope := editorCatTestAPI(t, "member")
	rec := editorCatRequestScope(api, scope, http.MethodPost,
		editorCatPathFor(scope, "/files/detail/cat/segments/"+testEditorCatKeyID+"/revisions/"+testEditorCatKeyID+"/restore"),
		`{"sourcePath":"a.json","targetLocale":"fr"}`)
	require.Equal(t, http.StatusForbidden, rec.Code, rec.Body.String())
}

func TestEditorCatUndoGroupedSave(t *testing.T) {
	api, scope := editorCatTestAPI(t, "translator")
	fileA := mustEditorCatSourceFile(t, scope, "a.json")
	fileB := mustEditorCatSourceFile(t, scope, "b.json")
	first := mustEditorCatKey(t, scope, fileA, "member.a", "Member")
	second := mustEditorCatKey(t, scope, fileB, "member.b", "Member")
	mustEditorCatTranslation(t, scope, first, "fr", "Adhérent", "draft")

	body := `{"sourcePath":"a.json","targetLocale":"fr","externalStringId":"` + first + `","text":"Membre","group":{"sourcePath":"*","sourcePaths":["a.json","b.json"]}}`
	rec := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/translations"), body)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

	var operationID string
	require.NoError(t, scope.Pool.QueryRow(t.Context(), `select distinct operation_id from project_translation_revisions where project_id=$1 and operation_id is not null`, scope.ProjectID).Scan(&operationID))

	rec = editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/operations/"+url.PathEscape(operationID)+"/undo"), "")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var undo struct {
		RestoredCount       int `json:"restoredCount"`
		SkippedChangedCount int `json:"skippedChangedCount"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &undo))
	require.Equal(t, 2, undo.RestoredCount)
	require.Zero(t, undo.SkippedChangedCount)

	text := func(keyID string) string {
		var value string
		require.NoError(t, scope.Pool.QueryRow(t.Context(), `select text from project_translations where translation_key_id=$1 and target_locale='fr'`, keyID).Scan(&value))
		return value
	}
	require.Equal(t, "Adhérent", text(first), "an existing translation returns to its earlier text")
	require.Equal(t, "", text(second), "a translation the operation created becomes untranslated")

	rec = editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/operations/"+url.PathEscape(operationID)+"/undo"), "")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &undo))
	require.Zero(t, undo.RestoredCount)
	require.Equal(t, 2, undo.SkippedChangedCount, "a second undo leaves strings changed since the operation")
}
