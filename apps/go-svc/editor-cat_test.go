package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"
	"github.com/workos/workos-go/v10"
)

const (
	testEditorCatProjectID     = "project_native_1"
	testEditorCatSourceFileID  = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
	testEditorCatKeyID         = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
	testEditorCatTranslationID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
	testEditorCatCommentID     = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
)

func editorCatPath(suffix string) string {
	return "/api/go-svc/v1/orgs/acme/projects/" + testEditorCatProjectID + suffix
}

func editorCatQueueContextSteps() []dictionaryDBStep {
	return []dictionaryDBStep{
		{kind: "query", sql: "from project_cat_segment_locks", values: [][]any{}},
		{kind: "query", sql: "from project_glossaries pg", values: [][]any{}},
		{kind: "query", sql: "from team_memberships m", values: [][]any{}},
	}
}

func editorCatTextKeySteps() []dictionaryDBStep {
	return []dictionaryDBStep{
		dictionaryRowStep("from repository_source_files", testEditorCatSourceFileID),
		dictionaryRowStep("select k.id from project_translation_keys k", testEditorCatKeyID),
	}
}

func editorCatAuthStep() dictionaryDBStep {
	return dictionaryAuthStep()
}

func editorCatProjectStep(source string) dictionaryDBStep {
	var teamID, teamName, teamSlug *string
	step := dictionaryRowStep("from projects p", testEditorCatProjectID, source, "en", teamID, teamName, teamSlug)
	return step
}

func editorCatTestAPI(t *testing.T, role string, steps ...dictionaryDBStep) *editorCatAPI {
	t.Helper()
	db := newDictionaryTestDB(t, append([]dictionaryDBStep{editorCatAuthStep()}, steps...)...)
	return &editorCatAPI{pool: db, membership: func(_ context.Context, id string) (*workos.UserOrganizationMembership, error) {
		require.Equal(t, "om_live", id)
		return &workos.UserOrganizationMembership{
			ID: id, UserID: "user_live", OrganizationID: "org_live", Status: "active", Role: &workos.SlimRole{Slug: role},
		}, nil
	}}
}

func editorCatRequest(api *editorCatAPI, method, path, body string) *httptest.ResponseRecorder {
	mux := http.NewServeMux()
	api.register(mux, stubSessionVerifier{claims: AuthClaims{UserID: "user_live"}})
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "session"})
	rec := httptest.NewRecorder()
	withOptionalPrefix(publicPathPrefix, mux).ServeHTTP(rec, req)
	return rec
}

func editorCatActivityStep() dictionaryDBStep {
	return dictionaryDBStep{kind: "exec", sql: "insert into organization_activity_events"}
}

func TestEditorCatSkipsVercelRoutes(t *testing.T) {
	routes := []struct {
		method, path, code string
	}{
		{http.MethodPost, editorCatPath("/files/detail/cat/images/regenerate"), "image_regenerate_deferred"},
		{http.MethodPost, editorCatPath("/files/detail/cat/images/upload"), "image_upload_deferred"},
		{http.MethodPost, editorCatPath("/files/detail/cat/recommendation"), "ai_recommendation_deferred"},
		{http.MethodPost, editorCatPath("/files/detail/cat/visual-context"), "visual_context_deferred"},
	}
	for _, route := range routes {
		t.Run(route.code, func(t *testing.T) {
			api := editorCatTestAPI(t, "admin", editorCatProjectStep("native"))
			rec := editorCatRequest(api, route.method, route.path, `{"sourcePath":"a.json","targetLocale":"fr","sourceText":"Hello","key":"k"}`)
			require.Equal(t, http.StatusNotImplemented, rec.Code)
			require.Contains(t, rec.Body.String(), route.code)
		})
	}
}

func TestEditorCatProviderProjectDeferred(t *testing.T) {
	api := editorCatTestAPI(t, "admin", editorCatProjectStep("crowdin"))
	rec := editorCatRequest(api, http.MethodGet, editorCatPath("/files/detail/cat/queue?sourcePath=locales/en.json&targetLocale=fr"), "")
	require.Equal(t, http.StatusNotImplemented, rec.Code)
	require.Contains(t, rec.Body.String(), "provider_cat_deferred")
}

func TestEditorCatQueueNative(t *testing.T) {
	steps := []dictionaryDBStep{
		editorCatProjectStep("native"),
		dictionaryRowStep("from repository_source_files", testEditorCatSourceFileID),
		dictionaryRowStep("select count(*) from project_translation_keys", 1),
		{kind: "query", sql: "from project_translation_keys k", values: [][]any{{
			testEditorCatKeyID, "hello", "Hello", (*string)(nil), (*string)(nil), (*int)(nil), []byte(`{}`), false,
		}}},
	}
	steps = append(steps, editorCatQueueContextSteps()...)
	api := editorCatTestAPI(t, "translator", steps...)
	rec := editorCatRequest(api, http.MethodGet, editorCatPath("/files/detail/cat/queue?sourcePath=locales/en.json&targetLocale=fr"), "")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var body struct {
		ContentEditorQueue editorCatQueueFile `json:"contentEditorQueue"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Equal(t, "locales/en.json", body.ContentEditorQueue.SourcePath)
	require.True(t, body.ContentEditorQueue.CanEditTranslations)
	require.Len(t, body.ContentEditorQueue.Segments, 1)
	require.Equal(t, "hello", body.ContentEditorQueue.Segments[0].Key)
	require.Equal(t, testEditorCatKeyID, body.ContentEditorQueue.Segments[0].ExternalStringID)
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
			api := editorCatTestAPI(t, "member", editorCatProjectStep("native"))
			rec := editorCatRequest(api, route.method, editorCatPath(route.path), route.body)
			require.Equal(t, http.StatusForbidden, rec.Code)
		})
	}
}

func TestEditorCatCachedStringContext(t *testing.T) {
	summary := "Looks up the repository key."
	api := editorCatTestAPI(t, "translator",
		editorCatProjectStep("native"),
		dictionaryRowStep("from project_file_string_repository_contexts", &summary),
	)
	rec := editorCatRequest(api, http.MethodPost, editorCatPath("/files/string-context"), `{"sourcePath":"a.json","key":"hello","text":"Hello","context":null,"cachedOnly":true}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), "Looks up the repository key.")
}

func TestEditorCatCachedStringContextMiss(t *testing.T) {
	api := editorCatTestAPI(t, "translator",
		editorCatProjectStep("native"),
		dictionaryDBStep{kind: "row", sql: "from project_file_string_repository_contexts", err: pgx.ErrNoRows},
	)
	rec := editorCatRequest(api, http.MethodPost, editorCatPath("/files/string-context"), `{"sourcePath":"a.json","key":"hello","text":"Hello","context":null,"cachedOnly":true}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"summary":null`)
}

func TestEditorCatCachedStringContextQueryError(t *testing.T) {
	api := editorCatTestAPI(t, "translator",
		editorCatProjectStep("native"),
		dictionaryDBStep{kind: "row", sql: "from project_file_string_repository_contexts", err: context.DeadlineExceeded},
	)
	rec := editorCatRequest(api, http.MethodPost, editorCatPath("/files/string-context"), `{"sourcePath":"a.json","key":"hello","text":"Hello","cachedOnly":true}`)
	require.Equal(t, http.StatusInternalServerError, rec.Code)
}

func TestEditorCatFreshStringContextDeferred(t *testing.T) {
	api := editorCatTestAPI(t, "translator", editorCatProjectStep("native"))
	rec := editorCatRequest(api, http.MethodPost, editorCatPath("/files/string-context"), `{"sourcePath":"a.json","key":"hello","text":"Hello"}`)
	require.Equal(t, http.StatusNotImplemented, rec.Code)
	require.Contains(t, rec.Body.String(), "string_context_deferred")
}

func TestEditorCatLockedSaveConflict(t *testing.T) {
	api := editorCatTestAPI(t, "translator",
		editorCatProjectStep("native"),
		dictionaryRowStep("from project_cat_segment_locks", 1),
	)
	rec := editorCatRequest(api, http.MethodPost, editorCatPath("/files/detail/cat/translations"), `{"sourcePath":"a.json","targetLocale":"fr","externalStringId":"`+testEditorCatKeyID+`","text":"Bonjour"}`)
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
	api := editorCatTestAPI(t, "guest")
	rec := editorCatRequest(api, http.MethodGet, editorCatPath("/files/detail/cat/queue?sourcePath=a.json&targetLocale=fr"), "")
	require.Equal(t, http.StatusForbidden, rec.Code)
}

func TestEditorCatProjectNotFound(t *testing.T) {
	step := dictionaryRowStep("from projects p")
	step.err = pgx.ErrNoRows
	api := editorCatTestAPI(t, "admin", step)
	rec := editorCatRequest(api, http.MethodGet, editorCatPath("/files/detail/cat/queue?sourcePath=a.json&targetLocale=fr"), "")
	require.Equal(t, http.StatusNotFound, rec.Code)
	require.Contains(t, rec.Body.String(), "project_not_found")
}

func TestEditorCatQueueMissingTargetLocale(t *testing.T) {
	api := editorCatTestAPI(t, "translator", editorCatProjectStep("native"))
	rec := editorCatRequest(api, http.MethodGet, editorCatPath("/files/detail/cat/queue?sourcePath=locales/en.json"), "")
	require.Equal(t, http.StatusBadRequest, rec.Code)
	require.Contains(t, rec.Body.String(), "invalid_project_payload")
}

func TestEditorCatFileNative(t *testing.T) {
	steps := []dictionaryDBStep{
		editorCatProjectStep("native"),
		dictionaryRowStep("from repository_source_files", testEditorCatSourceFileID),
		dictionaryRowStep("select count(*) from project_translation_keys", 1),
		{kind: "query", sql: "from project_translation_keys k", values: [][]any{{
			testEditorCatKeyID, "hello", "Hello", (*string)(nil), (*string)(nil), (*int)(nil), []byte(`{}`), false,
		}}},
	}
	steps = append(steps, editorCatQueueContextSteps()...)
	api := editorCatTestAPI(t, "member", steps...)
	rec := editorCatRequest(api, http.MethodGet, editorCatPath("/files/detail/cat?sourcePath=locales/en.json&targetLocale=fr"), "")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var body struct {
		ContentEditorFile editorCatQueueFile `json:"contentEditorFile"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.False(t, body.ContentEditorFile.CanEditTranslations)
	require.Equal(t, "hello", body.ContentEditorFile.Segments[0].Key)
}

func TestEditorCatQueueAllFiles(t *testing.T) {
	sourcePath := "locales/en.json"
	steps := []dictionaryDBStep{
		editorCatProjectStep("native"),
		dictionaryRowStep("select count(*) from project_translation_keys", 1),
		{kind: "query", sql: "from project_translation_keys k", values: [][]any{{
			testEditorCatKeyID, "hello", "Hello", (*string)(nil), (*string)(nil), (*int)(nil), []byte(`{}`), false, &sourcePath,
		}}},
	}
	steps = append(steps, editorCatQueueContextSteps()...)
	api := editorCatTestAPI(t, "translator", steps...)
	rec := editorCatRequest(api, http.MethodGet, editorCatPath("/files/detail/cat/queue?sourcePath=*&targetLocale=fr"), "")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var body struct {
		ContentEditorQueue editorCatQueueFile `json:"contentEditorQueue"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Equal(t, "*", body.ContentEditorQueue.SourcePath)
	require.Equal(t, "All Files", body.ContentEditorQueue.Filename)
	require.Equal(t, &sourcePath, body.ContentEditorQueue.Segments[0].SourcePath)
}

func TestEditorCatQueueWholeFile(t *testing.T) {
	steps := []dictionaryDBStep{
		editorCatProjectStep("native"),
		dictionaryRowStep("from repository_source_files", testEditorCatSourceFileID),
		{kind: "row", sql: "from repository_source_file_versions", err: pgx.ErrNoRows},
		{kind: "row", sql: "from project_image_variants", err: pgx.ErrNoRows},
	}
	steps = append(steps, editorCatQueueContextSteps()...)
	api := editorCatTestAPI(t, "translator", steps...)
	rec := editorCatRequest(api, http.MethodGet, editorCatPath("/files/detail/cat/queue?sourcePath=hero.png&targetLocale=fr"), "")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var body struct {
		ContentEditorQueue editorCatQueueFile `json:"contentEditorQueue"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Equal(t, "hero.png", body.ContentEditorQueue.SourcePath)
	require.Equal(t, testEditorCatSourceFileID, body.ContentEditorQueue.Segments[0].ExternalStringID)
	require.Equal(t, "image_file", *body.ContentEditorQueue.Segments[0].ContentKind)
}

func TestEditorCatSegmentTarget(t *testing.T) {
	steps := []dictionaryDBStep{editorCatProjectStep("native")}
	steps = append(steps, editorCatTextKeySteps()...)
	steps = append(steps, dictionaryRowStep("from project_translations", testEditorCatTranslationID, "Bonjour", "draft"))
	api := editorCatTestAPI(t, "translator", steps...)
	rec := editorCatRequest(api, http.MethodGet, editorCatPath("/files/detail/cat/segments/"+testEditorCatKeyID+"/target?sourcePath=a.json&targetLocale=fr"), "")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var body struct {
		Target *editorCatTranslation `json:"target"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Equal(t, "Bonjour", body.Target.Text)
	require.False(t, body.Target.IsApproved)
}

func TestEditorCatSegmentTargetMissing(t *testing.T) {
	steps := []dictionaryDBStep{editorCatProjectStep("native")}
	steps = append(steps, editorCatTextKeySteps()...)
	steps = append(steps, dictionaryDBStep{kind: "row", sql: "from project_translations", err: pgx.ErrNoRows})
	api := editorCatTestAPI(t, "translator", steps...)
	rec := editorCatRequest(api, http.MethodGet, editorCatPath("/files/detail/cat/segments/"+testEditorCatKeyID+"/target?sourcePath=a.json&targetLocale=fr"), "")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"target":null`)
}

func TestEditorCatSegmentComments(t *testing.T) {
	created := time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)
	status := "unresolved"
	first := "Ada"
	last := "Lovelace"
	email := "ada@example.com"
	steps := []dictionaryDBStep{editorCatProjectStep("native")}
	steps = append(steps, editorCatTextKeySteps()...)
	steps = append(steps, dictionaryDBStep{
		kind: "query",
		sql:  "from project_translation_comments c",
		values: [][]any{{
			testEditorCatCommentID, testEditorCatKeyID, "comment", &status, "Please check", created, "fr", &first, &last, &email,
		}},
	})
	api := editorCatTestAPI(t, "translator", steps...)
	rec := editorCatRequest(api, http.MethodGet, editorCatPath("/files/detail/cat/segments/"+testEditorCatKeyID+"/comments?sourcePath=a.json&targetLocale=fr"), "")
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
	steps := []dictionaryDBStep{
		editorCatProjectStep("native"),
		dictionaryRowStep("from project_cat_segment_locks", 0),
	}
	steps = append(steps, editorCatTextKeySteps()...)
	steps = append(steps, dictionaryRowStep("insert into project_translations", testEditorCatTranslationID, "Bonjour", "draft"))
	api := editorCatTestAPI(t, "translator", steps...)
	rec := editorCatRequest(api, http.MethodPost, editorCatPath("/files/detail/cat/translations"), `{"sourcePath":"a.json","targetLocale":"fr","externalStringId":"`+testEditorCatKeyID+`","text":"Bonjour"}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var body struct {
		Translation editorCatTranslation `json:"translation"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Equal(t, "Bonjour", body.Translation.Text)
	require.Equal(t, "draft", body.Translation.Status)
}

func TestEditorCatUpdateTranslationStatus(t *testing.T) {
	steps := []dictionaryDBStep{
		editorCatProjectStep("native"),
		dictionaryRowStep("from project_cat_segment_locks", 0),
	}
	steps = append(steps, editorCatTextKeySteps()...)
	steps = append(steps, dictionaryRowStep("update project_translations", testEditorCatTranslationID, "Bonjour", "approved"))
	steps = append(steps, editorCatActivityStep())
	api := editorCatTestAPI(t, "reviewer", steps...)
	rec := editorCatRequest(api, http.MethodPatch, editorCatPath("/files/detail/cat/translations/status"), `{"sourcePath":"a.json","targetLocale":"fr","externalStringId":"`+testEditorCatKeyID+`","status":"approved"}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"isApproved":true`)
}

func TestEditorCatUpdateTranslationStatusPost(t *testing.T) {
	steps := []dictionaryDBStep{
		editorCatProjectStep("native"),
		dictionaryRowStep("from project_cat_segment_locks", 0),
	}
	steps = append(steps, editorCatTextKeySteps()...)
	steps = append(steps, dictionaryRowStep("update project_translations", testEditorCatTranslationID, "Bonjour", "needs_review"))
	steps = append(steps, editorCatActivityStep())
	api := editorCatTestAPI(t, "translator", steps...)
	rec := editorCatRequest(api, http.MethodPost, editorCatPath("/files/detail/cat/translations/status"), `{"sourcePath":"a.json","targetLocale":"fr","externalStringId":"`+testEditorCatKeyID+`","status":"needs_review"}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"status":"needs_review"`)
}

func TestEditorCatUpdateTranslationStatusInvalid(t *testing.T) {
	api := editorCatTestAPI(t, "translator", editorCatProjectStep("native"))
	rec := editorCatRequest(api, http.MethodPatch, editorCatPath("/files/detail/cat/translations/status"), `{"sourcePath":"a.json","targetLocale":"fr","externalStringId":"`+testEditorCatKeyID+`","status":"draft"}`)
	require.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestEditorCatSaveComment(t *testing.T) {
	created := time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)
	first := "Ada"
	steps := []dictionaryDBStep{editorCatProjectStep("native")}
	steps = append(steps, editorCatTextKeySteps()...)
	steps = append(steps, dictionaryRowStep("insert into project_translation_comments", testEditorCatCommentID, "comment", (*string)(nil), "Looks good", created, "fr"))
	steps = append(steps, dictionaryRowStep("from users where id=$1", &first, (*string)(nil), (*string)(nil)))
	steps = append(steps, editorCatActivityStep())
	api := editorCatTestAPI(t, "translator", steps...)
	rec := editorCatRequest(api, http.MethodPost, editorCatPath("/files/detail/cat/comments"), `{"sourcePath":"a.json","targetLocale":"fr","externalStringId":"`+testEditorCatKeyID+`","text":"Looks good"}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var body struct {
		Comment editorCatComment `json:"comment"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Equal(t, "Looks good", body.Comment.Text)
	require.Equal(t, "Ada", *body.Comment.Author)
}

func TestEditorCatSaveIssueCommentRejected(t *testing.T) {
	api := editorCatTestAPI(t, "translator", editorCatProjectStep("native"))
	rec := editorCatRequest(api, http.MethodPost, editorCatPath("/files/detail/cat/comments"), `{"sourcePath":"a.json","targetLocale":"fr","externalStringId":"`+testEditorCatKeyID+`","text":"Broken","type":"issue"}`)
	require.Equal(t, http.StatusBadRequest, rec.Code)
	require.Contains(t, rec.Body.String(), "native_cat_issue_unsupported")
}

func TestEditorCatResolveComment(t *testing.T) {
	created := time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)
	authorID := testDictionaryUserID
	status := "resolved"
	first := "Ada"
	api := editorCatTestAPI(t, "translator",
		editorCatProjectStep("native"),
		dictionaryRowStep("from project_translation_comments", "issue", "unresolved", &authorID),
		dictionaryRowStep("update project_translation_comments", testEditorCatCommentID, "issue", &status, "Broken", created, "fr"),
		dictionaryRowStep("left join users u", &first, (*string)(nil), (*string)(nil)),
	)
	rec := editorCatRequest(api, http.MethodPatch, editorCatPath("/files/detail/cat/comments/"+testEditorCatCommentID+"/resolve"), "")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"status":"resolved"`)
}

func TestEditorCatConcordance(t *testing.T) {
	api := editorCatTestAPI(t, "translator",
		editorCatProjectStep("native"),
		dictionaryDBStep{
			kind: "query",
			sql:  "st.review_status='approved'",
			args: []any{testDictionaryOrgID, testEditorCatProjectID, "en", "fr", "Click Save to continue"},
			values: [][]any{{
				"term-1", "Save", "Enregistrer", false,
			}},
		},
		dictionaryDBStep{
			kind: "query",
			sql:  "e.review_status='approved'",
			args: []any{testDictionaryOrgID, testEditorCatProjectID, "en", "fr", "%Click Save to continue%"},
			values: [][]any{{
				"mem-1", "Click Save to continue", "Cliquez sur Enregistrer pour continuer", 90,
			}},
		},
	)
	rec := editorCatRequest(api, http.MethodPost, editorCatPath("/files/detail/cat/concordance"), `{"sourceLocale":"en","targetLocale":"fr","sourceText":"Click Save to continue"}`)
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
	api := editorCatTestAPI(t, "translator",
		editorCatProjectStep("native"),
		dictionaryRowStep("from repository_source_files", testEditorCatSourceFileID),
		dictionaryDBStep{kind: "exec", sql: "update project_translation_keys set is_hidden", affected: 1},
		editorCatActivityStep(),
	)
	rec := editorCatRequest(api, http.MethodPost, editorCatPath("/files/detail/cat/strings/hidden"), `{"sourcePath":"a.json","externalStringIds":["`+testEditorCatKeyID+`"],"isHidden":true}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"updatedCount":1`)
	require.Contains(t, rec.Body.String(), `"isHidden":true`)
}

func TestEditorCatSetLocked(t *testing.T) {
	api := editorCatTestAPI(t, "translator",
		editorCatProjectStep("native"),
		dictionaryDBStep{kind: "exec", sql: "insert into project_cat_segment_locks", affected: 1},
		editorCatActivityStep(),
	)
	rec := editorCatRequest(api, http.MethodPost, editorCatPath("/files/detail/cat/strings/locked"), `{"sourcePath":"a.json","targetLocale":"fr","externalStringIds":["`+testEditorCatKeyID+`"],"isLocked":true}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"isLocked":true`)
}

func TestEditorCatUnlock(t *testing.T) {
	api := editorCatTestAPI(t, "translator",
		editorCatProjectStep("native"),
		dictionaryDBStep{kind: "exec", sql: "delete from project_cat_segment_locks", affected: 1},
		editorCatActivityStep(),
	)
	rec := editorCatRequest(api, http.MethodPost, editorCatPath("/files/detail/cat/strings/locked"), `{"sourcePath":"a.json","targetLocale":"fr","externalStringIds":["`+testEditorCatKeyID+`"],"isLocked":false}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"isLocked":false`)
}

func TestEditorCatSetMaxLength(t *testing.T) {
	maxLength := 80
	steps := []dictionaryDBStep{editorCatProjectStep("native")}
	steps = append(steps, editorCatTextKeySteps()...)
	steps = append(steps, dictionaryRowStep("update project_translation_keys set max_length", &maxLength))
	api := editorCatTestAPI(t, "translator", steps...)
	rec := editorCatRequest(api, http.MethodPost, editorCatPath("/files/detail/cat/segments/"+testEditorCatKeyID+"/max-length"), `{"sourcePath":"a.json","externalStringId":"`+testEditorCatKeyID+`","maxLength":80}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"maxLength":80`)
}

func TestEditorCatTreatAsImage(t *testing.T) {
	steps := []dictionaryDBStep{editorCatProjectStep("native")}
	steps = append(steps, editorCatTextKeySteps()...)
	steps = append(steps, dictionaryRowStep("select key, source_text, metadata", "hero", "https://cdn.example.com/a.png", []byte(`{}`)))
	steps = append(steps, dictionaryDBStep{kind: "exec", sql: "update project_translation_keys set metadata", affected: 1})
	api := editorCatTestAPI(t, "translator", steps...)
	rec := editorCatRequest(api, http.MethodPost, editorCatPath("/files/detail/cat/segments/"+testEditorCatKeyID+"/treat-as-image"), `{"sourcePath":"a.json","externalStringId":"`+testEditorCatKeyID+`","treatAsImage":true}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"contentKind":"image_url"`)
}

func TestEditorCatUpdateImageStatus(t *testing.T) {
	stored := "file-1"
	api := editorCatTestAPI(t, "translator",
		editorCatProjectStep("native"),
		dictionaryRowStep("from repository_source_files", testEditorCatSourceFileID),
		dictionaryRowStep("from project_cat_segment_locks", 0),
		dictionaryRowStep("update project_image_variants", "variant-1", "approved", &stored),
	)
	rec := editorCatRequest(api, http.MethodPatch, editorCatPath("/files/detail/cat/images/status"), `{"sourcePath":"hero.png","targetLocale":"fr","status":"approved"}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"status":"approved"`)
	require.Contains(t, rec.Body.String(), "/api/orgs/acme/projects/"+testEditorCatProjectID+"/assets/file-1")
}

func TestEditorCatActivityLogs(t *testing.T) {
	created := time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC)
	actorUserID := testDictionaryUserID
	first := "Ada"
	last := "Lovelace"
	payload := []byte(`{"sourcePath":"a.json"}`)
	api := editorCatTestAPI(t, "translator",
		editorCatProjectStep("native"),
		dictionaryDBStep{
			kind: "query",
			sql:  "from organization_activity_events e",
			values: [][]any{{
				nil, "user", &actorUserID, created, "string_segment_commented", testEditorCatCommentID,
				payload, testEditorCatProjectID, "project", &first, &last,
			}},
		},
	)
	rec := editorCatRequest(api, http.MethodGet, editorCatPath("/files/detail/cat/activity-logs?sourcePath=a.json"), "")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var body struct {
		ActivityLogs []activityLogListItem `json:"activityLogs"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Len(t, body.ActivityLogs, 1)
	require.Equal(t, "string_segment_commented", body.ActivityLogs[0].EventType)
	require.Equal(t, "Ada Lovelace", body.ActivityLogs[0].Actor.DisplayName)
}

func TestEditorCatActivityLogsInvalidCursor(t *testing.T) {
	api := editorCatTestAPI(t, "translator", editorCatProjectStep("native"))
	rec := editorCatRequest(api, http.MethodGet, editorCatPath("/files/detail/cat/activity-logs?sourcePath=a.json&cursor=%25%25%25"), "")
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
}
