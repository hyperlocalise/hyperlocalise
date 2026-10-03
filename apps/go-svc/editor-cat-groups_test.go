package main

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
)

func readGroupedCatQueue(t *testing.T, api *editorCatAPI, scope *testenv.Scope, query string) editorCatQueueFile {
	t.Helper()
	rec := editorCatRequestScope(api, scope, http.MethodGet, editorCatPathFor(scope, "/files/detail/cat/queue?targetLocale=fr&grouped=true&"+query), "")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var body struct {
		ContentEditorQueue editorCatQueueFile `json:"contentEditorQueue"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	return body.ContentEditorQueue
}

func TestEditorCatGroupedQueueCollapsesIdenticalSources(t *testing.T) {
	api, scope := editorCatTestAPI(t, "translator")
	fileA := mustEditorCatSourceFile(t, scope, "a.json")
	fileB := mustEditorCatSourceFile(t, scope, "b.json")
	first := mustEditorCatKey(t, scope, fileA, "member.a", "Member")
	mustEditorCatKey(t, scope, fileA, "member.b", "Member")
	mustEditorCatKey(t, scope, fileB, "member.c", "Member")
	mustEditorCatKey(t, scope, fileA, "member.lower", "member")
	mustEditorCatKey(t, scope, fileA, "image.one", "https://example.com/image.png")
	mustEditorCatKey(t, scope, fileA, "image.two", "https://example.com/image.png")

	queue := readGroupedCatQueue(t, api, scope, "sourcePath=*")
	require.Equal(t, 4, queue.Pagination.TotalCount)
	require.Len(t, queue.Segments, 4)
	counts := map[string]int{}
	for _, segment := range queue.Segments {
		require.NotNil(t, segment.OccurrenceCount)
		counts[segment.Key] = *segment.OccurrenceCount
	}
	require.Equal(t, map[string]int{"image.one": 1, "image.two": 1, "member.a": 3, "member.lower": 1}, counts)

	queue = readGroupedCatQueue(t, api, scope, "sourcePath=*&limit=1")
	require.Equal(t, 4, queue.Pagination.TotalCount)
	require.True(t, queue.Pagination.HasMore)

	queue = readGroupedCatQueue(t, api, scope, "sourcePath=*&sourcePaths=b.json")
	require.Len(t, queue.Segments, 1)
	require.Equal(t, 1, *queue.Segments[0].OccurrenceCount)

	queue = readGroupedCatQueue(t, api, scope, "sourcePath=a.json&search=member.b")
	require.Len(t, queue.Segments, 1)
	require.Equal(t, "member.b", queue.Segments[0].Key)
	require.Equal(t, 2, *queue.Segments[0].OccurrenceCount, "occurrences count the whole file scope, not only search matches")

	mustEditorCatTranslation(t, scope, first, "fr", "Membre", "approved")
	queue = readGroupedCatQueue(t, api, scope, "sourcePath=*")
	for _, segment := range queue.Segments {
		if segment.Key == "member.a" {
			require.Equal(t, "pending", *segment.GroupStatus, "one approved copy does not make the group complete")
			require.Equal(t, []string{"fr"}, segment.DivergentLocales)
		}
		if segment.Key == "member.lower" {
			require.Nil(t, segment.GroupStatus)
		}
	}

	queue = readGroupedCatQueue(t, api, scope, "sourcePath=*&queueFilter=untranslated")
	for _, segment := range queue.Segments {
		if segment.SourceText == "Member" {
			require.NotEqual(t, first, segment.ExternalStringID)
			require.Equal(t, 3, *segment.OccurrenceCount)
		}
	}

	rec := editorCatRequestScope(api, scope, http.MethodGet, editorCatPathFor(scope, "/files/detail/cat/queue?targetLocale=fr&sourcePath=*"), "")
	require.Equal(t, http.StatusOK, rec.Code)
	require.NotContains(t, rec.Body.String(), "occurrenceCount")
}

func TestEditorCatGroupedSaveUpdatesEveryOccurrenceInScope(t *testing.T) {
	api, scope := editorCatTestAPI(t, "translator")
	fileA := mustEditorCatSourceFile(t, scope, "a.json")
	fileB := mustEditorCatSourceFile(t, scope, "b.json")
	fileC := mustEditorCatSourceFile(t, scope, "c.json")
	first := mustEditorCatKey(t, scope, fileA, "member.a", "Member")
	second := mustEditorCatKey(t, scope, fileB, "member.b", "Member")
	locked := mustEditorCatKey(t, scope, fileB, "member.locked", "Member")
	outside := mustEditorCatKey(t, scope, fileC, "member.c", "Member")
	other := mustEditorCatKey(t, scope, fileA, "other", "Members")
	_, err := scope.Pool.Exec(t.Context(), `insert into project_cat_segment_locks(organization_id,project_id,target_locale,external_string_id,locked_by_user_id) values($1,$2,'fr',$3,$4)`, scope.OrganizationID, scope.ProjectID, locked, scope.UserID)
	require.NoError(t, err)

	body := `{"sourcePath":"a.json","targetLocale":"fr","externalStringId":"` + first + `","text":"Membre","group":{"sourcePath":"*","sourcePaths":["a.json","b.json"]}}`
	rec := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/translations"), body)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var response struct {
		Translation  editorCatTranslation `json:"translation"`
		UpdatedCount int                  `json:"updatedCount"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &response))
	require.Equal(t, "Membre", response.Translation.Text)
	require.Equal(t, 2, response.UpdatedCount)

	translated := func(id string) bool {
		var count int
		require.NoError(t, scope.Pool.QueryRow(t.Context(), `select count(*) from project_translations where translation_key_id=$1 and target_locale='fr' and text='Membre'`, id).Scan(&count))
		return count == 1
	}
	require.True(t, translated(first))
	require.True(t, translated(second))
	require.False(t, translated(locked), "locked occurrences are skipped")
	require.False(t, translated(outside), "occurrences outside the queue scope are untouched")
	require.False(t, translated(other))

	var operations int
	require.NoError(t, scope.Pool.QueryRow(t.Context(), `select count(distinct payload->>'operationId') from organization_activity_events where payload->>'projectId'=$1 and event_type='string_segment_translation_updated'`, scope.ProjectID).Scan(&operations))
	require.Equal(t, 1, operations)
}

func TestEditorCatGroupVariantsListDivergentTranslationsAndSaveOneVariant(t *testing.T) {
	api, scope := editorCatTestAPI(t, "translator")
	file := mustEditorCatSourceFile(t, scope, "a.json")
	first := mustEditorCatKey(t, scope, file, "member.a", "Member")
	second := mustEditorCatKey(t, scope, file, "member.b", "Member")
	third := mustEditorCatKey(t, scope, file, "member.c", "Member")
	mustEditorCatTranslation(t, scope, first, "fr", "Membre", "approved")
	mustEditorCatTranslation(t, scope, second, "fr", "Adhérent", "draft")

	readVariants := func() []editorCatGroupVariant {
		path := editorCatPathFor(scope, "/files/detail/cat/segments/"+first+"/variants?targetLocale=fr&sourcePath=a.json&groupSourcePath=a.json")
		rec := editorCatRequestScope(api, scope, http.MethodGet, path, "")
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		var body struct {
			Variants []editorCatGroupVariant `json:"variants"`
		}
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
		return body.Variants
	}
	variants := readVariants()
	require.Len(t, variants, 3)
	require.Equal(t, "Membre", variants[0].Text)
	require.True(t, variants[0].IsApproved)
	require.Equal(t, "Adhérent", variants[1].Text)
	require.False(t, variants[1].IsApproved)
	require.Equal(t, "", variants[2].Text)
	require.Equal(t, third, variants[2].Occurrences[0].ID)

	body := `{"sourcePath":"a.json","targetLocale":"fr","externalStringId":"` + third + `","text":"Adhérent","group":{"sourcePath":"a.json","occurrenceIds":["` + third + `"]}}`
	rec := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/translations"), body)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

	variants = readVariants()
	require.Len(t, variants, 2)
	require.Equal(t, "Membre", variants[0].Text, "the other variant is untouched")
	require.Len(t, variants[1].Occurrences, 2)

	queue := readGroupedCatQueue(t, api, scope, "sourcePath=a.json")
	require.Len(t, queue.Segments, 1)
	require.Equal(t, "needs_review", *queue.Segments[0].GroupStatus)
	require.Equal(t, []string{"fr"}, queue.Segments[0].DivergentLocales)

	body = `{"sourcePath":"a.json","targetLocale":"fr","externalStringId":"` + first + `","text":"Membre","approve":true,"group":{"sourcePath":"a.json"}}`
	rec = editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/translations"), body)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	queue = readGroupedCatQueue(t, api, scope, "sourcePath=a.json")
	require.Equal(t, "reviewed", *queue.Segments[0].GroupStatus)
	require.Empty(t, queue.Segments[0].DivergentLocales)
}

func TestEditorCatGroupedSaveValidatesEachOccurrenceMaxLength(t *testing.T) {
	api, scope := editorCatTestAPI(t, "translator")
	file := mustEditorCatSourceFile(t, scope, "a.json")
	first := mustEditorCatKey(t, scope, file, "member.a", "Member")
	second := mustEditorCatKey(t, scope, file, "member.b", "Member")
	_, err := scope.Pool.Exec(t.Context(), `update project_translation_keys set max_length=20 where id=$1`, first)
	require.NoError(t, err)
	_, err = scope.Pool.Exec(t.Context(), `update project_translation_keys set max_length=5 where id=$1`, second)
	require.NoError(t, err)

	body := `{"sourcePath":"a.json","targetLocale":"fr","externalStringId":"` + first + `","text":"123456","group":{"sourcePath":"a.json"}}`
	rec := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/translations"), body)
	require.Equal(t, http.StatusUnprocessableEntity, rec.Code, rec.Body.String())

	var count int
	require.NoError(t, scope.Pool.QueryRow(t.Context(), `select count(*) from project_translations where translation_key_id=$1`, second).Scan(&count))
	require.Zero(t, count)
}

func TestEditorCatGroupVariantsRejectsForeignSegment(t *testing.T) {
	foreign := testenv.Seed(t, testenv.Options{Role: "translator", WithProject: true})
	foreignFile := mustEditorCatSourceFile(t, foreign, "a.json")
	foreignKey := mustEditorCatKey(t, foreign, foreignFile, "member.foreign", "Member")

	api, scope := editorCatTestAPI(t, "translator")
	file := mustEditorCatSourceFile(t, scope, "a.json")
	mustEditorCatKey(t, scope, file, "member.local", "Member")

	path := editorCatPathFor(scope, "/files/detail/cat/segments/"+foreignKey+"/variants?targetLocale=fr&sourcePath=a.json&groupSourcePath=a.json")
	rec := editorCatRequestScope(api, scope, http.MethodGet, path, "")
	require.Equal(t, http.StatusNotFound, rec.Code, rec.Body.String())
}

func TestEditorCatGroupedSaveRejectsLockedRepresentative(t *testing.T) {
	api, scope := editorCatTestAPI(t, "translator")
	file := mustEditorCatSourceFile(t, scope, "a.json")
	first := mustEditorCatKey(t, scope, file, "member.a", "Member")
	second := mustEditorCatKey(t, scope, file, "member.b", "Member")
	_, err := scope.Pool.Exec(t.Context(), `insert into project_cat_segment_locks(organization_id,project_id,target_locale,external_string_id,locked_by_user_id) values($1,$2,'fr',$3,$4)`, scope.OrganizationID, scope.ProjectID, first, scope.UserID)
	require.NoError(t, err)

	body := `{"sourcePath":"a.json","targetLocale":"fr","externalStringId":"` + first + `","text":"Membre","group":{"sourcePath":"a.json"}}`
	rec := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/translations"), body)
	require.Equal(t, http.StatusConflict, rec.Code, rec.Body.String())
	var count int
	require.NoError(t, scope.Pool.QueryRow(t.Context(), `select count(*) from project_translations where translation_key_id=$1`, second).Scan(&count))
	require.Zero(t, count)
}
