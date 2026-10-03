package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
)

func readCatGroups(t *testing.T, api *editorCatAPI, scope *testenv.Scope, query string) ([]editorCatStringGroup, editorCatPagination) {
	t.Helper()
	rec := editorCatRequestScope(api, scope, http.MethodGet, editorCatPathFor(scope, "/files/detail/cat/groups?targetLocale=fr&"+query), "")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var body struct {
		Groups     []editorCatStringGroup `json:"groups"`
		Pagination editorCatPagination    `json:"pagination"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	return body.Groups, body.Pagination
}

func TestEditorCatGroupsExactSourcesBeforePagination(t *testing.T) {
	api, scope := editorCatTestAPI(t, "translator")
	fileA := mustEditorCatSourceFile(t, scope, "a.json")
	fileB := mustEditorCatSourceFile(t, scope, "b.json")
	for _, item := range []struct{ file, key, source string }{
		{fileA, "a", "Save"},
		{fileB, "z", "Save"},
		{fileA, "b", "save"},
		{fileA, "c", "Save "},
		{fileA, "d", "<b>Save</b>"},
	} {
		mustEditorCatKey(t, scope, item.file, item.key, item.source)
	}
	groups, page := readCatGroups(t, api, scope, "sourcePath=*&limit=1")
	require.Len(t, groups, 1)
	require.Equal(t, 4, page.TotalCount)
	require.True(t, page.HasMore)
	require.Equal(t, "Save", groups[0].SourceText)
	require.Equal(t, 2, groups[0].OccurrenceCount)
	firstID := groups[0].ID
	groups, _ = readCatGroups(t, api, scope, "sourcePath=*&limit=1&offset=1")
	require.NotEqual(t, firstID, groups[0].ID)
	groups, _ = readCatGroups(t, api, scope, "sourcePath=*&sourcePaths=b.json")
	require.Len(t, groups, 1)
	require.Equal(t, 1, groups[0].OccurrenceCount)
	groups, _ = readCatGroups(t, api, scope, "sourcePath=b.json")
	require.Len(t, groups, 1)
	require.Equal(t, firstID, groups[0].ID)
}

func TestEditorCatGroupInspectionKeepsNonmatchingMembers(t *testing.T) {
	api, scope := editorCatTestAPI(t, "translator")
	fileA := mustEditorCatSourceFile(t, scope, "a.json")
	fileB := mustEditorCatSourceFile(t, scope, "b.json")
	first := mustEditorCatKey(t, scope, fileA, "button.save", "Save")
	second := mustEditorCatKey(t, scope, fileB, "menu.save", "Save")
	mustEditorCatTranslation(t, scope, first, "fr", "Enregistrer", "approved")
	mustEditorCatTranslation(t, scope, second, "fr", "Sauvegarder", "draft")
	mustEditorCatTranslation(t, scope, second, "de", "Speichern", "approved")
	_, err := scope.Pool.Exec(t.Context(), `update project_translation_keys set context='Menu action', max_length=20, is_hidden=true where id=$1`, second)
	require.NoError(t, err)
	_, err = scope.Pool.Exec(t.Context(), `insert into project_cat_segment_locks (organization_id, project_id, target_locale, external_string_id, locked_by_user_id) values ($1,$2,'fr',$3,$4)`, scope.OrganizationID, scope.ProjectID, second, scope.UserID)
	require.NoError(t, err)
	groups, _ := readCatGroups(t, api, scope, "sourcePath=*&queueFilter=reviewed")
	require.Len(t, groups, 1)
	group := groups[0]
	require.Equal(t, 2, group.OccurrenceCount)
	require.Equal(t, 1, group.MatchingCount)
	require.Equal(t, 2, group.TranslationVariants)
	require.Equal(t, 1, group.ApprovedCount)
	require.Equal(t, 1, group.LockedCount)
	path := editorCatPathFor(scope, "/files/detail/cat/groups/"+group.ID+"/members?sourcePath=*&targetLocale=fr&queueFilter=reviewed&limit=1&offset=1")
	rec := editorCatRequestScope(api, scope, http.MethodGet, path, "")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var body struct {
		Members    []editorCatGroupMember `json:"members"`
		Pagination editorCatPagination    `json:"pagination"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Equal(t, 2, body.Pagination.TotalCount)
	require.Len(t, body.Members, 1)
	member := body.Members[0]
	require.Equal(t, second, member.ID)
	require.False(t, member.MatchesFilter)
	require.True(t, member.IsLocked)
	require.True(t, member.IsHidden)
	require.Equal(t, "Sauvegarder", member.TargetText)
	require.Equal(t, "Menu action", *member.Context)
	require.Equal(t, 20, *member.MaxLength)
	groups, _ = readCatGroups(t, api, scope, "sourcePath=*&search="+url.QueryEscape("button.save"))
	require.Equal(t, 1, groups[0].MatchingCount)
	require.Equal(t, 2, groups[0].OccurrenceCount)
	// Reading groups must not modify translations or approval state.
	var status string
	require.NoError(t, scope.Pool.QueryRow(t.Context(), `select status from project_translations where translation_key_id=$1 and target_locale='fr'`, first).Scan(&status))
	require.Equal(t, "approved", status)
}

func TestEditorCatGroupsKeepMediaSeparateAndScopeMembers(t *testing.T) {
	api, scope := editorCatTestAPI(t, "admin")
	file := mustEditorCatSourceFile(t, scope, "a.json")
	first := mustEditorCatKey(t, scope, file, "one", "https://example.com/image.png")
	second := mustEditorCatKey(t, scope, file, "two", "https://example.com/image.png")
	_, err := scope.Pool.Exec(t.Context(), `update project_translation_keys set metadata='{"contentKind":"image_url"}'::jsonb where id=$1 or id=$2`, first, second)
	require.NoError(t, err)
	groups, _ := readCatGroups(t, api, scope, "sourcePath=*")
	require.Len(t, groups, 2)
	require.Equal(t, 1, groups[0].OccurrenceCount)
	otherAPI, other := editorCatTestAPI(t, "admin")
	rec := editorCatRequestScope(otherAPI, other, http.MethodGet, editorCatPathFor(other, "/files/detail/cat/groups/"+groups[0].ID+"/members?sourcePath=*&targetLocale=fr"), "")
	require.Equal(t, http.StatusNotFound, rec.Code)
	_, err = scope.Pool.Exec(t.Context(), `update projects set source='external_tms' where id=$1`, scope.ProjectID)
	require.NoError(t, err)
	rec = editorCatRequestScope(api, scope, http.MethodGet, editorCatPathFor(scope, "/files/detail/cat/groups?sourcePath=*&targetLocale=fr"), "")
	require.Equal(t, http.StatusNotImplemented, rec.Code)
}

func TestEditorCatGroupsKeepDetectedMediaURLsSeparate(t *testing.T) {
	api, scope := editorCatTestAPI(t, "admin")
	file := mustEditorCatSourceFile(t, scope, "a.json")
	mustEditorCatKey(t, scope, file, "one", "https://example.com/image.png")
	mustEditorCatKey(t, scope, file, "two", "https://example.com/image.png")
	groups, _ := readCatGroups(t, api, scope, "sourcePath=*")
	require.Len(t, groups, 2)
	require.Equal(t, 1, groups[0].OccurrenceCount)
	require.Equal(t, 1, groups[1].OccurrenceCount)
}

func TestEditorCatGroupMembersAcceptGroupSourceText(t *testing.T) {
	api, scope := editorCatTestAPI(t, "translator")
	fileA := mustEditorCatSourceFile(t, scope, "a.json")
	fileB := mustEditorCatSourceFile(t, scope, "b.json")
	first := mustEditorCatKey(t, scope, fileA, "button.save", "Save")
	mustEditorCatKey(t, scope, fileB, "menu.save", "Save")
	groups, _ := readCatGroups(t, api, scope, "sourcePath=*")
	require.Len(t, groups, 1)
	group := groups[0]
	path := editorCatPathFor(scope, "/files/detail/cat/groups/"+group.ID+"/members?sourcePath=*&targetLocale=fr&groupSourceText="+url.QueryEscape(group.SourceText))
	rec := editorCatRequestScope(api, scope, http.MethodGet, path, "")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var body struct {
		Members    []editorCatGroupMember `json:"members"`
		Pagination editorCatPagination    `json:"pagination"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Equal(t, 2, body.Pagination.TotalCount)
	require.Len(t, body.Members, 2)
	require.Equal(t, first, body.Members[0].ID)
}

func TestEditorCatGroupQueryRejectsDeferredFilters(t *testing.T) {
	for _, filter := range []string{"qa_issues", "machine_translated", "with_comments"} {
		r := httptest.NewRequest(http.MethodGet, "/?sourcePath=*&targetLocale=fr&queueFilter="+filter, nil)
		_, err := parseEditorCatGroupQuery(r)
		require.Error(t, err)
	}
	_, err := parseEditorCatGroupQuery(httptest.NewRequest(http.MethodGet, "/?sourcePath=*&targetLocale=fr&limit=101", nil))
	require.Error(t, err)
}
