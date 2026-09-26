package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
)

const (
	testEditorCatProjectID    = "project_native_1"
	testEditorCatSourceFileID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
	testEditorCatKeyID        = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
)

func editorCatPath(suffix string) string {
	return "/v1/orgs/acme/projects/" + testEditorCatProjectID + suffix
}

func editorCatPathFor(scope *testenv.Scope, suffix string) string {
	return scope.OrgPath("/projects/" + scope.ProjectID + suffix)
}

func editorCatTestAPI(t *testing.T, role string) (*editorCatAPI, *testenv.Scope) {
	t.Helper()
	scope := testenv.Seed(t, testenv.Options{Role: role, WithProject: true})
	if role == "member" || role == "translator" || role == "reviewer" || role == "developer" {
		scope.MustTeam(t, "default", "Default", "member")
	}
	_, err := scope.Pool.Exec(t.Context(), `update users set first_name='Ada', last_name='Lovelace' where id=$1`, scope.UserID)
	require.NoError(t, err)
	return &editorCatAPI{pool: scope.Pool, membership: scope.Membership(role)}, scope
}

func editorCatRequest(api *editorCatAPI, method, path, body string) *httptest.ResponseRecorder {
	return editorCatRequestAs(api, "user_live", method, path, body)
}

func editorCatRequestAs(api *editorCatAPI, userID, method, path, body string) *httptest.ResponseRecorder {
	mux := http.NewServeMux()
	api.register(mux, stubSessionVerifier{claims: AuthClaims{UserID: userID}})
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "session"})
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	return rec
}

func editorCatRequestScope(api *editorCatAPI, scope *testenv.Scope, method, path, body string) *httptest.ResponseRecorder {
	return editorCatRequestAs(api, scope.WorkOSUserID, method, path, body)
}

func mustEditorCatSourceFile(t *testing.T, scope *testenv.Scope, sourcePath string) string {
	t.Helper()
	id := uuid.NewString()
	_, err := scope.Pool.Exec(t.Context(), `
        insert into repository_source_files (id, organization_id, project_id, source_path)
        values ($1, $2, $3, $4)`,
		id, scope.OrganizationID, scope.ProjectID, sourcePath)
	require.NoError(t, err)
	return id
}

func mustEditorCatKey(t *testing.T, scope *testenv.Scope, fileID, key, sourceText string) string {
	t.Helper()
	id := uuid.NewString()
	_, err := scope.Pool.Exec(t.Context(), `
        insert into project_translation_keys (
            id, organization_id, project_id, repository_source_file_id, key, source_text, normalized_source_text
        ) values ($1, $2, $3, $4, $5, $6, $7)`,
		id, scope.OrganizationID, scope.ProjectID, fileID, key, sourceText, strings.ToLower(sourceText))
	require.NoError(t, err)
	return id
}

func mustEditorCatTranslation(t *testing.T, scope *testenv.Scope, keyID, locale, text, status string) string {
	t.Helper()
	id := uuid.NewString()
	_, err := scope.Pool.Exec(t.Context(), `
        insert into project_translations (
            id, organization_id, project_id, translation_key_id, target_locale, text, status
        ) values ($1, $2, $3, $4, $5, $6, $7)`,
		id, scope.OrganizationID, scope.ProjectID, keyID, locale, text, status)
	require.NoError(t, err)
	return id
}

func mustEditorCatComment(t *testing.T, scope *testenv.Scope, keyID, locale, commentType, status, text string) string {
	t.Helper()
	id := uuid.NewString()
	_, err := scope.Pool.Exec(t.Context(), `
        insert into project_translation_comments (
            id, organization_id, project_id, translation_key_id, target_locale, type, status, text, author_user_id
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
		id, scope.OrganizationID, scope.ProjectID, keyID, locale, commentType, status, text, scope.UserID)
	require.NoError(t, err)
	return id
}

func TestEditorCatSkipsVercelRoutes(t *testing.T) {
	routes := []struct {
		method, suffix, code string
	}{
		{http.MethodPost, "/files/detail/cat/images/regenerate", "image_regenerate_deferred"},
		{http.MethodPost, "/files/detail/cat/images/upload", "image_upload_deferred"},
		{http.MethodPost, "/files/detail/cat/recommendation", "ai_recommendation_deferred"},
		{http.MethodPost, "/files/detail/cat/visual-context", "visual_context_deferred"},
	}
	for _, route := range routes {
		t.Run(route.code, func(t *testing.T) {
			api, scope := editorCatTestAPI(t, "admin")
			rec := editorCatRequestScope(api, scope, route.method, editorCatPathFor(scope, route.suffix), `{"sourcePath":"a.json","targetLocale":"fr","sourceText":"Hello","key":"k"}`)
			require.Equal(t, http.StatusNotImplemented, rec.Code)
			require.Contains(t, rec.Body.String(), route.code)
		})
	}
}

func TestEditorCatProviderProjectDeferred(t *testing.T) {
	api, scope := editorCatTestAPI(t, "admin")
	_, err := scope.Pool.Exec(t.Context(), `update projects set source='external_tms' where id=$1`, scope.ProjectID)
	require.NoError(t, err)
	rec := editorCatRequestScope(api, scope, http.MethodGet, editorCatPathFor(scope, "/files/detail/cat/queue?sourcePath=locales/en.json&targetLocale=fr"), "")
	require.Equal(t, http.StatusNotImplemented, rec.Code)
	require.Contains(t, rec.Body.String(), "provider_cat_deferred")
}

func TestEditorCatQueueNative(t *testing.T) {
	api, scope := editorCatTestAPI(t, "translator")
	fileID := mustEditorCatSourceFile(t, scope, "locales/en.json")
	keyID := mustEditorCatKey(t, scope, fileID, "hello", "Hello")
	rec := editorCatRequestScope(api, scope, http.MethodGet, editorCatPathFor(scope, "/files/detail/cat/queue?sourcePath=locales/en.json&targetLocale=fr"), "")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var body struct {
		ContentEditorQueue editorCatQueueFile `json:"contentEditorQueue"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Equal(t, "locales/en.json", body.ContentEditorQueue.SourcePath)
	require.True(t, body.ContentEditorQueue.CanEditTranslations)
	require.Len(t, body.ContentEditorQueue.Segments, 1)
	require.Equal(t, "hello", body.ContentEditorQueue.Segments[0].Key)
	require.Equal(t, keyID, body.ContentEditorQueue.Segments[0].ExternalStringID)
}

func TestEditorCatMemberCannotMutate(t *testing.T) {
	routes := []struct {
		name, method, path, body string
	}{
		{"save", http.MethodPost, "/files/detail/cat/translations", `{"sourcePath":"a.json","targetLocale":"fr","externalStringId":"` + testEditorCatKeyID + `","text":"Bonjour"}`},
		{"status", http.MethodPatch, "/files/detail/cat/translations/status", `{"sourcePath":"a.json","targetLocale":"fr","externalStringId":"` + testEditorCatKeyID + `","status":"approved"}`},
		{"comment", http.MethodPost, "/files/detail/cat/comments", `{"sourcePath":"a.json","targetLocale":"fr","externalStringId":"` + testEditorCatKeyID + `","text":"Note"}`},
		{"hidden", http.MethodPost, "/files/detail/cat/strings/hidden", `{"sourcePath":"a.json","externalStringIds":["` + testEditorCatKeyID + `"],"isHidden":true}`},
		{"locked", http.MethodPost, "/files/detail/cat/strings/locked", `{"sourcePath":"a.json","targetLocale":"fr","externalStringIds":["` + testEditorCatKeyID + `"],"isLocked":true}`},
		{"image-status", http.MethodPatch, "/files/detail/cat/images/status", `{"sourcePath":"hero.png","targetLocale":"fr","status":"approved"}`},
	}
	for _, route := range routes {
		t.Run(route.name, func(t *testing.T) {
			api, scope := editorCatTestAPI(t, "member")
			rec := editorCatRequestScope(api, scope, route.method, editorCatPathFor(scope, route.path), route.body)
			require.Equal(t, http.StatusForbidden, rec.Code)
		})
	}
}

func TestEditorCatCachedStringContext(t *testing.T) {
	api, scope := editorCatTestAPI(t, "translator")
	_, err := scope.Pool.Exec(t.Context(), `
        insert into project_file_string_repository_contexts (
            organization_id, project_id, source_path, string_key, repository_full_name, source_text_hash, summary
        ) values ($1, $2, 'a.json', 'hello', 'acme/app', $3, 'Looks up the repository key.')`,
		scope.OrganizationID, scope.ProjectID, projectFileStringSourceTextHash("Hello"))
	require.NoError(t, err)
	rec := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/string-context"), `{"sourcePath":"a.json","key":"hello","text":"Hello","context":null,"cachedOnly":true}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), "Looks up the repository key.")
}

func TestEditorCatCachedStringContextRejectsStaleHash(t *testing.T) {
	api, scope := editorCatTestAPI(t, "translator")
	_, err := scope.Pool.Exec(t.Context(), `
        insert into project_file_string_repository_contexts (
            organization_id, project_id, source_path, string_key, repository_full_name, source_text_hash, summary
        ) values ($1, $2, 'a.json', 'hello', 'acme/app', $3, 'Looks up the repository key.')`,
		scope.OrganizationID, scope.ProjectID, projectFileStringSourceTextHash("Hello"))
	require.NoError(t, err)
	rec := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/string-context"), `{"sourcePath":"a.json","key":"hello","text":"Hello world","context":null,"cachedOnly":true}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"summary":null`)
}

func TestEditorCatCachedStringContextMiss(t *testing.T) {
	api, scope := editorCatTestAPI(t, "translator")
	rec := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/string-context"), `{"sourcePath":"a.json","key":"hello","text":"Hello","context":null,"cachedOnly":true}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"summary":null`)
}

func TestEditorCatFreshStringContextDeferred(t *testing.T) {
	api, scope := editorCatTestAPI(t, "translator")
	rec := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/string-context"), `{"sourcePath":"a.json","key":"hello","text":"Hello"}`)
	require.Equal(t, http.StatusNotImplemented, rec.Code)
	require.Contains(t, rec.Body.String(), "string_context_deferred")
}

func TestEditorCatLockedSaveConflict(t *testing.T) {
	api, scope := editorCatTestAPI(t, "translator")
	fileID := mustEditorCatSourceFile(t, scope, "a.json")
	keyID := mustEditorCatKey(t, scope, fileID, "hello", "Hello")
	_, err := scope.Pool.Exec(t.Context(), `
        insert into project_cat_segment_locks (organization_id, project_id, target_locale, external_string_id, locked_by_user_id)
        values ($1, $2, 'fr', $3, $4)`,
		scope.OrganizationID, scope.ProjectID, keyID, scope.UserID)
	require.NoError(t, err)
	rec := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/translations"), `{"sourcePath":"a.json","targetLocale":"fr","externalStringId":"`+keyID+`","text":"Bonjour"}`)
	require.Equal(t, http.StatusConflict, rec.Code)
	require.Contains(t, rec.Body.String(), "cat_segment_locked")
}

func TestParseEditorCatQueueQuery(t *testing.T) {
	query, err := parseEditorCatQueueQuery(map[string][]string{
		"sourcePath":   {"locales/en.json"},
		"targetLocale": {"fr-FR"},
		"limit":        {"25"},
		"queueFilter":  {"untranslated"},
		"sourcePaths":  {"a.json, b.json, a.json"},
	})
	require.NoError(t, err)
	require.Equal(t, 25, query.limit)
	require.Equal(t, "untranslated", query.queueFilter)
	require.Equal(t, []string{"a.json", "b.json"}, query.sourcePaths)
	_, err = parseEditorCatQueueQuery(map[string][]string{"sourcePath": {"a.json"}})
	require.Error(t, err)
	_, err = parseEditorCatQueueQuery(map[string][]string{
		"sourcePath": {"a.json"}, "targetLocale": {"fr"}, "queueFilter": {"nope"},
	})
	require.Error(t, err)
	_, err = parseEditorCatQueueQuery(map[string][]string{
		"sourcePath": {"a.json"}, "targetLocale": {"fr"}, "queueSort": {"alpha"},
	})
	require.Error(t, err)
	_, err = parseEditorCatQueueQuery(map[string][]string{
		"sourcePath": {"a.json"}, "targetLocale": {"fr"}, "search": {strings.Repeat("x", editorCatMaxSearchLen+1)},
	})
	require.Error(t, err)
}

func TestEditorCatRoles(t *testing.T) {
	require.False(t, editorCatActor{role: "member"}.canEdit())
	require.True(t, editorCatActor{role: "translator"}.canEdit())
	require.True(t, editorCatActor{role: "developer"}.canEdit())
	require.True(t, editorCatActor{role: "reviewer"}.canReviewApprove())
	require.False(t, editorCatActor{role: "translator"}.canReviewApprove())
	require.False(t, editorCatActor{role: "guest"}.canRead())
	require.True(t, editorCatActor{role: "member"}.canRead())
	require.False(t, editorCatActor{role: "translator"}.canWriteProjectTeam())
	require.True(t, editorCatActor{role: "localization_manager"}.canManageGlossaries())
}

func TestEditorCatWholeFileKind(t *testing.T) {
	require.Equal(t, editorCatKindImage, editorCatSourceKind("hero.png"))
	require.Equal(t, editorCatKindVideo, editorCatSourceKind("clip.mp4"))
	require.Equal(t, editorCatKindOffice, editorCatSourceKind("brief.docx"))
	require.Equal(t, editorCatKindDocument, editorCatSourceKind("readme.md"))
	require.Equal(t, editorCatKindText, editorCatSourceKind("locales/en.json"))
	require.True(t, looksLikeEditorCatImageURL("https://cdn.example.com/a.png"))
	require.False(t, looksLikeEditorCatImageURL("not a url"))
	require.True(t, looksLikeEditorCatVideoURL("https://cdn.example.com/a.mp4"))
	require.True(t, isEditorCatAllFiles("*"))
	require.True(t, isEditorCatWholeFile("hero.png"))
	require.Equal(t, testEditorCatSourceFileID, binaryEditorCatStringID(testEditorCatSourceFileID, "hero.png"))
	require.Equal(t, "binary:hero.png", binaryEditorCatStringID("", "hero.png"))
	require.Equal(t, "en.json", filenameFromSourcePath("locales/en.json"))
	require.Equal(t, `\%\_\\\\`, escapeEditorCatIlike(`%_\\`))
	require.Equal(t, "image_url", editorCatMetadataContentKind([]byte(`{"contentKind":"image_url"}`)))
	require.Equal(t, "", editorCatMetadataContentKind([]byte(`{"contentKind":"text"}`)))
}

func TestEditorCatUnavailableWithoutPool(t *testing.T) {
	rec := editorCatRequest(&editorCatAPI{}, http.MethodGet, editorCatPath("/files/detail/cat/queue?sourcePath=a.json&targetLocale=fr"), "")
	require.Equal(t, http.StatusServiceUnavailable, rec.Code)
	require.Contains(t, rec.Body.String(), "editor_unavailable")
}

func TestEditorCatGuestCannotRead(t *testing.T) {
	api, scope := editorCatTestAPI(t, "guest")
	rec := editorCatRequestScope(api, scope, http.MethodGet, editorCatPathFor(scope, "/files/detail/cat/queue?sourcePath=a.json&targetLocale=fr"), "")
	require.Equal(t, http.StatusForbidden, rec.Code)
}

func TestEditorCatProjectNotFound(t *testing.T) {
	api, scope := editorCatTestAPI(t, "admin")
	rec := editorCatRequestScope(api, scope, http.MethodGet, scope.OrgPath("/projects/missing-project/files/detail/cat/queue?sourcePath=a.json&targetLocale=fr"), "")
	require.Equal(t, http.StatusNotFound, rec.Code)
	require.Contains(t, rec.Body.String(), "project_not_found")
}

func TestEditorCatQueueMissingTargetLocale(t *testing.T) {
	api, scope := editorCatTestAPI(t, "translator")
	rec := editorCatRequestScope(api, scope, http.MethodGet, editorCatPathFor(scope, "/files/detail/cat/queue?sourcePath=locales/en.json"), "")
	require.Equal(t, http.StatusBadRequest, rec.Code)
	require.Contains(t, rec.Body.String(), "invalid_project_payload")
}

func TestEditorCatFileNative(t *testing.T) {
	api, scope := editorCatTestAPI(t, "member")
	fileID := mustEditorCatSourceFile(t, scope, "locales/en.json")
	mustEditorCatKey(t, scope, fileID, "hello", "Hello")
	rec := editorCatRequestScope(api, scope, http.MethodGet, editorCatPathFor(scope, "/files/detail/cat?sourcePath=locales/en.json&targetLocale=fr"), "")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var body struct {
		ContentEditorFile editorCatQueueFile `json:"contentEditorFile"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.False(t, body.ContentEditorFile.CanEditTranslations)
	require.Equal(t, "hello", body.ContentEditorFile.Segments[0].Key)
}

func TestEditorCatQueueAllFiles(t *testing.T) {
	api, scope := editorCatTestAPI(t, "translator")
	fileID := mustEditorCatSourceFile(t, scope, "locales/en.json")
	mustEditorCatKey(t, scope, fileID, "hello", "Hello")
	rec := editorCatRequestScope(api, scope, http.MethodGet, editorCatPathFor(scope, "/files/detail/cat/queue?sourcePath=*&targetLocale=fr"), "")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var body struct {
		ContentEditorQueue editorCatQueueFile `json:"contentEditorQueue"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Equal(t, "*", body.ContentEditorQueue.SourcePath)
	require.Equal(t, "All Files", body.ContentEditorQueue.Filename)
	require.NotNil(t, body.ContentEditorQueue.Segments[0].SourcePath)
	require.Equal(t, "locales/en.json", *body.ContentEditorQueue.Segments[0].SourcePath)
}

func TestEditorCatQueueWholeFile(t *testing.T) {
	api, scope := editorCatTestAPI(t, "translator")
	fileID := mustEditorCatSourceFile(t, scope, "hero.png")
	rec := editorCatRequestScope(api, scope, http.MethodGet, editorCatPathFor(scope, "/files/detail/cat/queue?sourcePath=hero.png&targetLocale=fr"), "")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var body struct {
		ContentEditorQueue editorCatQueueFile `json:"contentEditorQueue"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Equal(t, "hero.png", body.ContentEditorQueue.SourcePath)
	require.Equal(t, fileID, body.ContentEditorQueue.Segments[0].ExternalStringID)
	require.Equal(t, "image_file", *body.ContentEditorQueue.Segments[0].ContentKind)
}

func TestEditorCatSegmentTarget(t *testing.T) {
	api, scope := editorCatTestAPI(t, "translator")
	fileID := mustEditorCatSourceFile(t, scope, "a.json")
	keyID := mustEditorCatKey(t, scope, fileID, "hello", "Hello")
	mustEditorCatTranslation(t, scope, keyID, "fr", "Bonjour", "draft")
	rec := editorCatRequestScope(api, scope, http.MethodGet, editorCatPathFor(scope, "/files/detail/cat/segments/"+keyID+"/target?sourcePath=a.json&targetLocale=fr"), "")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var body struct {
		Target *editorCatTranslation `json:"target"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Equal(t, "Bonjour", body.Target.Text)
	require.False(t, body.Target.IsApproved)
}

func TestEditorCatSegmentTargetMissing(t *testing.T) {
	api, scope := editorCatTestAPI(t, "translator")
	fileID := mustEditorCatSourceFile(t, scope, "a.json")
	keyID := mustEditorCatKey(t, scope, fileID, "hello", "Hello")
	rec := editorCatRequestScope(api, scope, http.MethodGet, editorCatPathFor(scope, "/files/detail/cat/segments/"+keyID+"/target?sourcePath=a.json&targetLocale=fr"), "")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"target":null`)
}

func TestEditorCatSegmentComments(t *testing.T) {
	api, scope := editorCatTestAPI(t, "translator")
	fileID := mustEditorCatSourceFile(t, scope, "a.json")
	keyID := mustEditorCatKey(t, scope, fileID, "hello", "Hello")
	mustEditorCatComment(t, scope, keyID, "fr", "comment", "unresolved", "Please check")
	rec := editorCatRequestScope(api, scope, http.MethodGet, editorCatPathFor(scope, "/files/detail/cat/segments/"+keyID+"/comments?sourcePath=a.json&targetLocale=fr"), "")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var body struct {
		Comments []editorCatComment `json:"comments"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Len(t, body.Comments, 1)
	require.Equal(t, "Please check", body.Comments[0].Text)
	require.Equal(t, "Ada Lovelace", *body.Comments[0].Author)
}

func TestEditorCatSaveTranslation(t *testing.T) {
	api, scope := editorCatTestAPI(t, "translator")
	fileID := mustEditorCatSourceFile(t, scope, "a.json")
	keyID := mustEditorCatKey(t, scope, fileID, "hello", "Hello")
	rec := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/translations"), `{"sourcePath":"a.json","targetLocale":"fr","externalStringId":"`+keyID+`","text":"Bonjour"}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var body struct {
		Translation editorCatTranslation `json:"translation"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Equal(t, "Bonjour", body.Translation.Text)
	require.Equal(t, "draft", body.Translation.Status)
}

func TestEditorCatUpdateTranslationStatus(t *testing.T) {
	api, scope := editorCatTestAPI(t, "reviewer")
	fileID := mustEditorCatSourceFile(t, scope, "a.json")
	keyID := mustEditorCatKey(t, scope, fileID, "hello", "Hello")
	mustEditorCatTranslation(t, scope, keyID, "fr", "Bonjour", "draft")
	rec := editorCatRequestScope(api, scope, http.MethodPatch, editorCatPathFor(scope, "/files/detail/cat/translations/status"), `{"sourcePath":"a.json","targetLocale":"fr","externalStringId":"`+keyID+`","status":"approved"}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"isApproved":true`)
}

func TestEditorCatUpdateTranslationStatusPost(t *testing.T) {
	api, scope := editorCatTestAPI(t, "translator")
	fileID := mustEditorCatSourceFile(t, scope, "a.json")
	keyID := mustEditorCatKey(t, scope, fileID, "hello", "Hello")
	mustEditorCatTranslation(t, scope, keyID, "fr", "Bonjour", "draft")
	rec := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/translations/status"), `{"sourcePath":"a.json","targetLocale":"fr","externalStringId":"`+keyID+`","status":"needs_review"}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"status":"needs_review"`)
}

func TestEditorCatUpdateTranslationStatusInvalid(t *testing.T) {
	api, scope := editorCatTestAPI(t, "translator")
	rec := editorCatRequestScope(api, scope, http.MethodPatch, editorCatPathFor(scope, "/files/detail/cat/translations/status"), `{"sourcePath":"a.json","targetLocale":"fr","externalStringId":"`+testEditorCatKeyID+`","status":"draft"}`)
	require.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestEditorCatSaveComment(t *testing.T) {
	api, scope := editorCatTestAPI(t, "translator")
	fileID := mustEditorCatSourceFile(t, scope, "a.json")
	keyID := mustEditorCatKey(t, scope, fileID, "hello", "Hello")
	rec := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/comments"), `{"sourcePath":"a.json","targetLocale":"fr","externalStringId":"`+keyID+`","text":"Looks good"}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var body struct {
		Comment editorCatComment `json:"comment"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Equal(t, "Looks good", body.Comment.Text)
	require.Equal(t, "Ada Lovelace", *body.Comment.Author)
}

func TestEditorCatSaveIssueCommentRejected(t *testing.T) {
	api, scope := editorCatTestAPI(t, "translator")
	rec := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/comments"), `{"sourcePath":"a.json","targetLocale":"fr","externalStringId":"`+testEditorCatKeyID+`","text":"Broken","type":"issue"}`)
	require.Equal(t, http.StatusBadRequest, rec.Code)
	require.Contains(t, rec.Body.String(), "native_cat_issue_unsupported")
}

func TestEditorCatResolveComment(t *testing.T) {
	api, scope := editorCatTestAPI(t, "translator")
	fileID := mustEditorCatSourceFile(t, scope, "a.json")
	keyID := mustEditorCatKey(t, scope, fileID, "hello", "Hello")
	commentID := mustEditorCatComment(t, scope, keyID, "fr", "issue", "unresolved", "Broken")
	rec := editorCatRequestScope(api, scope, http.MethodPatch, editorCatPathFor(scope, "/files/detail/cat/comments/"+commentID+"/resolve"), "")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"status":"resolved"`)
}

func TestEditorCatConcordance(t *testing.T) {
	api, scope := editorCatTestAPI(t, "translator")
	glossaryID := scope.MustGlossary(t, "", "Product terms", "en")
	mustAttachGlossary(t, scope, scope.ProjectID, glossaryID)
	conceptID := mustGlossaryConcept(t, scope, glossaryID, "Save", "", "")
	mustGlossaryTerm(t, scope, glossaryID, conceptID, "en", "Save")
	mustGlossaryTerm(t, scope, glossaryID, conceptID, "fr", "Enregistrer")
	memoryID := scope.MustMemory(t, "", "Product TM")
	mustAttachMemory(t, scope, scope.ProjectID, memoryID)
	entryID := mustMemoryEntry(t, scope, memoryID, "en", "fr", "Click Save to continue", "Cliquez sur Enregistrer pour continuer")
	_, err := scope.Pool.Exec(t.Context(), `update memory_entries set match_score=90 where id=$1`, entryID)
	require.NoError(t, err)
	rec := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/concordance"), `{"sourceLocale":"en","targetLocale":"fr","sourceText":"Click Save to continue"}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var body struct {
		Concordance struct {
			GlossaryTerms            []editorCatGlossaryTerm `json:"glossaryTerms"`
			TranslationMemoryMatches []editorCatMemoryMatch  `json:"translationMemoryMatches"`
		} `json:"concordance"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Equal(t, "Enregistrer", body.Concordance.GlossaryTerms[0].Target)
	require.True(t, body.Concordance.GlossaryTerms[0].Approved)
	require.Equal(t, 90, body.Concordance.TranslationMemoryMatches[0].MatchPercent)
}

func TestEditorCatSetHidden(t *testing.T) {
	api, scope := editorCatTestAPI(t, "translator")
	fileID := mustEditorCatSourceFile(t, scope, "a.json")
	keyID := mustEditorCatKey(t, scope, fileID, "hello", "Hello")
	rec := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/strings/hidden"), `{"sourcePath":"a.json","externalStringIds":["`+keyID+`"],"isHidden":true}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"updatedCount":1`)
	require.Contains(t, rec.Body.String(), `"isHidden":true`)
}

func TestEditorCatSetLocked(t *testing.T) {
	api, scope := editorCatTestAPI(t, "translator")
	rec := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/strings/locked"), `{"sourcePath":"a.json","targetLocale":"fr","externalStringIds":["`+testEditorCatKeyID+`"],"isLocked":true}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"isLocked":true`)
}

func TestEditorCatUnlock(t *testing.T) {
	api, scope := editorCatTestAPI(t, "translator")
	_, err := scope.Pool.Exec(t.Context(), `
        insert into project_cat_segment_locks (organization_id, project_id, target_locale, external_string_id, locked_by_user_id)
        values ($1, $2, 'fr', $3, $4)`,
		scope.OrganizationID, scope.ProjectID, testEditorCatKeyID, scope.UserID)
	require.NoError(t, err)
	rec := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/strings/locked"), `{"sourcePath":"a.json","targetLocale":"fr","externalStringIds":["`+testEditorCatKeyID+`"],"isLocked":false}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"isLocked":false`)
}

func TestEditorCatSetMaxLength(t *testing.T) {
	api, scope := editorCatTestAPI(t, "translator")
	fileID := mustEditorCatSourceFile(t, scope, "a.json")
	keyID := mustEditorCatKey(t, scope, fileID, "hello", "Hello")
	rec := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/segments/"+keyID+"/max-length"), `{"sourcePath":"a.json","externalStringId":"`+keyID+`","maxLength":80}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"maxLength":80`)
}

func TestEditorCatTreatAsImage(t *testing.T) {
	api, scope := editorCatTestAPI(t, "translator")
	fileID := mustEditorCatSourceFile(t, scope, "a.json")
	keyID := mustEditorCatKey(t, scope, fileID, "hero", "https://cdn.example.com/a.png")
	rec := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/segments/"+keyID+"/treat-as-image"), `{"sourcePath":"a.json","externalStringId":"`+keyID+`","treatAsImage":true}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"contentKind":"image_url"`)
}

func TestEditorCatUpdateImageStatus(t *testing.T) {
	api, scope := editorCatTestAPI(t, "translator")
	fileID := mustEditorCatSourceFile(t, scope, "hero.png")
	_, err := scope.Pool.Exec(t.Context(), `
        insert into project_image_variants (
            organization_id, project_id, repository_source_file_id, source_path, target_locale, status
        ) values ($1, $2, $3, 'hero.png', 'fr', 'draft')`,
		scope.OrganizationID, scope.ProjectID, fileID)
	require.NoError(t, err)
	rec := editorCatRequestScope(api, scope, http.MethodPatch, editorCatPathFor(scope, "/files/detail/cat/images/status"), `{"sourcePath":"hero.png","targetLocale":"fr","status":"approved"}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"status":"approved"`)
}

func TestEditorCatActivityLogs(t *testing.T) {
	api, scope := editorCatTestAPI(t, "translator")
	created := time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)
	payload := []byte(`{"fileName":"a.json","name":"a.json","projectId":"` + scope.ProjectID + `","sourcePath":"a.json"}`)
	mustActivityEvent(t, scope, "user", "string_segment_commented", "file", uuid.NewString(), payload, created, &scope.UserID)
	rec := editorCatRequestScope(api, scope, http.MethodGet, editorCatPathFor(scope, "/files/detail/cat/activity-logs?sourcePath=a.json"), "")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var body struct {
		ActivityLogs []activityLogListItem `json:"activityLogs"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Len(t, body.ActivityLogs, 1)
	require.Equal(t, "string_segment_commented", body.ActivityLogs[0].EventType)
	require.Equal(t, "Ada Lovelace", body.ActivityLogs[0].Actor.DisplayName)
	require.NotNil(t, body.ActivityLogs[0].Target.DisplayName)
	require.Equal(t, "a.json", *body.ActivityLogs[0].Target.DisplayName)
	require.NotNil(t, body.ActivityLogs[0].Target.Href)
	require.Contains(t, *body.ActivityLogs[0].Target.Href, "/files/content-editor?sourcePath=")
}

func TestEditorCatActivityLogsInvalidCursor(t *testing.T) {
	api, scope := editorCatTestAPI(t, "translator")
	rec := editorCatRequestScope(api, scope, http.MethodGet, editorCatPathFor(scope, "/files/detail/cat/activity-logs?sourcePath=a.json&cursor=%25%25%25"), "")
	require.Equal(t, http.StatusBadRequest, rec.Code)
	require.Contains(t, rec.Body.String(), "invalid_activity_log_cursor")
}

func TestFormatEditorCatAuthor(t *testing.T) {
	first := "Ada"
	last := "Lovelace"
	email := "ada@example.com"
	require.Equal(t, "Ada Lovelace", *formatEditorCatAuthor(&first, &last, &email))
	require.Equal(t, "Ada", *formatEditorCatAuthor(&first, nil, &email))
	require.Equal(t, "ada@example.com", *formatEditorCatAuthor(nil, nil, &email))
	require.Nil(t, formatEditorCatAuthor(nil, nil, nil))
}

func TestUniqueEditorCatIDs(t *testing.T) {
	require.Equal(t, []string{"a", "b"}, uniqueEditorCatIDs([]string{" a ", "", "a", "b", "c"}, 2))
}

func TestEditorCatQueueFilterSQL(t *testing.T) {
	const orgN, projectN, localeN = 1, 2, 4

	require.Empty(t, editorCatQueueFilterSQL("all", orgN, projectN, localeN))
	require.Empty(t, editorCatQueueFilterSQL("qa_issues", orgN, projectN, localeN))
	require.Empty(t, editorCatQueueFilterSQL("machine_translated", orgN, projectN, localeN))
	require.Empty(t, editorCatQueueFilterSQL("with_comments", orgN, projectN, localeN))
	require.Empty(t, editorCatQueueFilterSQL("unknown", orgN, projectN, localeN))

	untranslated := editorCatQueueFilterSQL("untranslated", orgN, projectN, localeN)
	require.Contains(t, untranslated, "not exists (select 1 from project_translations t where")
	require.Contains(t, untranslated, "t.target_locale=$4")
	require.Contains(t, untranslated, "trim(t.text) != ''")

	reviewed := editorCatQueueFilterSQL("reviewed", orgN, projectN, localeN)
	require.Contains(t, reviewed, "exists (select 1 from project_translations t where")
	require.Contains(t, reviewed, "t.status='approved'")

	needsReview := editorCatQueueFilterSQL("needs_review", orgN, projectN, localeN)
	require.Contains(t, needsReview, "trim(t.text) != '' and t.status != 'approved'")

	hasIssues := editorCatQueueFilterSQL("has_issues", orgN, projectN, localeN)
	require.Contains(t, hasIssues, "from issue_sheet_issues i")
	require.Contains(t, hasIssues, "i.status in ('open', 'in_progress')")
	require.Contains(t, hasIssues, "from project_translation_comments c")
	require.Contains(t, hasIssues, "c.type='issue' and c.status='unresolved'")
	require.Contains(t, hasIssues, "not exists (select 1 from issue_sheet_issues i where i.linked_comment_id = c.id)")
	require.Contains(t, hasIssues, "i.organization_id=$1")
	require.Contains(t, hasIssues, "i.project_id=$2")
	require.Contains(t, hasIssues, "i.target_locale=$4")

	require.Equal(t, " and k.is_hidden = true", editorCatQueueFilterSQL("hidden", orgN, projectN, localeN))
	require.True(t, editorCatQueueFilterBindsLocale("untranslated"))
	require.True(t, editorCatQueueFilterBindsLocale("has_issues"))
	require.False(t, editorCatQueueFilterBindsLocale("all"))
	require.False(t, editorCatQueueFilterBindsLocale("hidden"))
	require.False(t, editorCatQueueFilterBindsLocale("qa_issues"))
}

func TestEditorCatQueueDefaultFilter(t *testing.T) {
	api, scope := editorCatTestAPI(t, "translator")
	fileID := mustEditorCatSourceFile(t, scope, "lang/en-US.json")
	mustEditorCatKey(t, scope, fileID, "hello", "Hello")
	rec := editorCatRequestScope(api, scope, http.MethodGet, editorCatPathFor(scope, "/files/detail/cat/queue?sourcePath=lang%2Fen-US.json&targetLocale=de-DE&search=&queueFilter=all&queueSort=file_order&limit=20&offset=0"), "")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var body struct {
		ContentEditorQueue editorCatQueueFile `json:"contentEditorQueue"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Equal(t, "lang/en-US.json", body.ContentEditorQueue.SourcePath)
	require.Len(t, body.ContentEditorQueue.Segments, 1)
	require.NotContains(t, rec.Body.String(), "initialTargets")
}

func TestEditorCatQueueUntranslatedFirstBindsLocale(t *testing.T) {
	api, scope := editorCatTestAPI(t, "translator")
	fileID := mustEditorCatSourceFile(t, scope, "lang/en-US.json")
	mustEditorCatKey(t, scope, fileID, "hello", "Hello")
	rec := editorCatRequestScope(api, scope, http.MethodGet, editorCatPathFor(scope, "/files/detail/cat/queue?sourcePath=lang/en-US.json&targetLocale=de-DE&queueFilter=untranslated&queueSort=untranslated_first"), "")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var body struct {
		ContentEditorQueue editorCatQueueFile `json:"contentEditorQueue"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Len(t, body.ContentEditorQueue.Segments, 1)
}
