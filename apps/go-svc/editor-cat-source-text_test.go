package main

import (
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
)

// mustEditorCatImportedFile is a source file whose last import came through the given surface.
func mustEditorCatImportedFile(t *testing.T, scope *testenv.Scope, sourcePath, surface string) string {
	t.Helper()
	fileID := mustEditorCatSourceFile(t, scope, sourcePath)
	storedID := "file_" + uuid.NewString()
	_, err := scope.Pool.Exec(t.Context(), `
        insert into stored_files (id, organization_id, role, source_kind, storage_provider, storage_key, storage_url, filename, content_type, byte_size, sha256)
        values ($1, $2, 'source', 'repository_file', 'test', $1, $1, $3, 'application/json', 2, 'x')`,
		storedID, scope.OrganizationID, sourcePath)
	require.NoError(t, err)
	var versionID string
	require.NoError(t, scope.Pool.QueryRow(t.Context(), `
        insert into repository_source_file_versions (organization_id, project_id, repository_source_file_id, source_path, stored_file_id, source_hash, upload_surface)
        values ($1, $2, $3, $4, $5, 'sha256:x', $6) returning id`,
		scope.OrganizationID, scope.ProjectID, fileID, sourcePath, storedID, surface).Scan(&versionID))
	_, err = scope.Pool.Exec(t.Context(), `update repository_source_files set reconciled_source_file_version_id=$2 where id=$1`, fileID, versionID)
	require.NoError(t, err)
	return fileID
}

func editorCatSourceTextBody(keyID, sourceText string, keepApproved bool) string {
	keep := "false"
	if keepApproved {
		keep = "true"
	}
	return `{"sourcePath":"a.json","externalStringId":"` + keyID + `","sourceText":"` + sourceText + `","keepApproved":` + keep + `}`
}

func TestEditorCatSetSourceTextNeedsTheSetting(t *testing.T) {
	api, scope := editorCatTestAPI(t, "admin")
	fileID := mustEditorCatImportedFile(t, scope, "a.json", "files_page")
	keyID := mustEditorCatKey(t, scope, fileID, "hello", "Hello")
	path := editorCatPathFor(scope, "/files/detail/cat/segments/"+keyID+"/source-text")

	rec := editorCatRequestScope(api, scope, http.MethodPost, path, editorCatSourceTextBody(keyID, "Hi", false))
	require.Equal(t, http.StatusConflict, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"source_text_not_editable"`)

	_, err := scope.Pool.Exec(t.Context(), `update projects set source_text_editable=true where id=$1`, scope.ProjectID)
	require.NoError(t, err)
	rec = editorCatRequestScope(api, scope, http.MethodPost, path, editorCatSourceTextBody(keyID, "Hi", false))
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"sourceText":"Hi"`)
	var sourceText, normalized string
	require.NoError(t, scope.Pool.QueryRow(t.Context(), `select source_text, normalized_source_text from project_translation_keys where id=$1`, keyID).Scan(&sourceText, &normalized))
	require.Equal(t, "Hi", sourceText)
	require.Equal(t, normalizeMemorySourceText("Hi"), normalized)

	rec = editorCatRequestScope(api, scope, http.MethodPost, path, editorCatSourceTextBody(keyID, "  ", false))
	require.Equal(t, http.StatusBadRequest, rec.Code, rec.Body.String())
}

func TestEditorCatSetSourceTextSendsApprovedTranslationsToReview(t *testing.T) {
	api, scope := editorCatTestAPI(t, "developer")
	_, err := scope.Pool.Exec(t.Context(), `
        update projects set source_text_editable=true, approved_translations_on_source_change='needs_review'
        where id=$1`, scope.ProjectID)
	require.NoError(t, err)
	fileID := mustEditorCatImportedFile(t, scope, "a.json", "files_page")
	keyID := mustEditorCatKey(t, scope, fileID, "hello", "Hello")
	approved := mustEditorCatTranslation(t, scope, keyID, "fr", "Bonjour", "approved")
	draft := mustEditorCatTranslation(t, scope, keyID, "de", "Hallo", "draft")
	path := editorCatPathFor(scope, "/files/detail/cat/segments/"+keyID+"/source-text")
	status := func(id string) string {
		var value string
		require.NoError(t, scope.Pool.QueryRow(t.Context(), `select status from project_translations where id=$1`, id).Scan(&value))
		return value
	}

	// A small fix, and a change in surrounding spaces alone, leave approval as it is.
	rec := editorCatRequestScope(api, scope, http.MethodPost, path, editorCatSourceTextBody(keyID, "Hello!", true))
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	rec = editorCatRequestScope(api, scope, http.MethodPost, path, editorCatSourceTextBody(keyID, " Hello! ", false))
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Equal(t, "approved", status(approved))

	rec = editorCatRequestScope(api, scope, http.MethodPost, path, editorCatSourceTextBody(keyID, "Hi there", false))
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Equal(t, "needs_review", status(approved))
	require.Equal(t, "draft", status(draft))
	var actorKind, actorUserID string
	require.NoError(t, scope.Pool.QueryRow(t.Context(), `
        select actor_kind, actor_user_id::text from project_translation_revisions
        where translation_id=$1 and status='needs_review'`, approved).Scan(&actorKind, &actorUserID))
	require.Equal(t, "user", actorKind)
	require.Equal(t, scope.UserID, actorUserID)
}

func TestEditorCatSetSourceTextRefusesLockedStringsAndOtherRoles(t *testing.T) {
	api, scope := editorCatTestAPI(t, "admin")
	_, err := scope.Pool.Exec(t.Context(), `update projects set source_text_editable=true where id=$1`, scope.ProjectID)
	require.NoError(t, err)
	fileID := mustEditorCatImportedFile(t, scope, "a.json", "files_page")
	keyID := mustEditorCatKey(t, scope, fileID, "hello", "Hello")
	_, err = scope.Pool.Exec(t.Context(), `
        insert into project_cat_segment_locks (organization_id, project_id, target_locale, external_string_id)
        values ($1, $2, 'fr', $3)`, scope.OrganizationID, scope.ProjectID, keyID)
	require.NoError(t, err)
	path := editorCatPathFor(scope, "/files/detail/cat/segments/"+keyID+"/source-text")

	rec := editorCatRequestScope(api, scope, http.MethodPost, path, editorCatSourceTextBody(keyID, "Hi", false))
	require.Equal(t, http.StatusConflict, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"segment_locked"`)

	for _, role := range []string{"translator", "reviewer", "member"} {
		require.False(t, editorCatActor{role: role}.canEditSourceText(), role)
	}
	for _, role := range []string{"admin", "localization_manager", "developer"} {
		require.True(t, editorCatActor{role: role}.canEditSourceText(), role)
	}
	translatorAPI, translatorScope := editorCatTestAPI(t, "translator")
	_, err = translatorScope.Pool.Exec(t.Context(), `update projects set source_text_editable=true where id=$1`, translatorScope.ProjectID)
	require.NoError(t, err)
	translatorFile := mustEditorCatImportedFile(t, translatorScope, "a.json", "files_page")
	translatorKey := mustEditorCatKey(t, translatorScope, translatorFile, "hello", "Hello")
	rec = editorCatRequestScope(translatorAPI, translatorScope, http.MethodPost,
		editorCatPathFor(translatorScope, "/files/detail/cat/segments/"+translatorKey+"/source-text"),
		editorCatSourceTextBody(translatorKey, "Hi", false))
	require.Equal(t, http.StatusForbidden, rec.Code, rec.Body.String())
}

func TestEditorCatSetSourceTextOnlyWhereItCanBeWrittenBack(t *testing.T) {
	api, scope := editorCatTestAPI(t, "admin")
	_, err := scope.Pool.Exec(t.Context(), `update projects set source_text_editable=true where id=$1`, scope.ProjectID)
	require.NoError(t, err)
	yamlFile := mustEditorCatImportedFile(t, scope, "en.yaml", "files_page")
	yamlKey := mustEditorCatKey(t, scope, yamlFile, "hello", "Hello")
	rec := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/segments/"+yamlKey+"/source-text"),
		`{"sourcePath":"en.yaml","externalStringId":"`+yamlKey+`","sourceText":"Hi","keepApproved":false}`)
	require.Equal(t, http.StatusConflict, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"source_text_not_editable"`)

	jsonFile := mustEditorCatImportedFile(t, scope, "a.json", "files_page")
	sentence := mustEditorCatKey(t, scope, jsonFile, "intro#srx.1", "Second sentence.")
	rec = editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/segments/"+sentence+"/source-text"),
		editorCatSourceTextBody(sentence, "Another sentence.", false))
	require.Equal(t, http.StatusConflict, rec.Code, rec.Body.String())

	// Text holding the internal markers that stand for inline markup is refused outright.
	plain := mustEditorCatKey(t, scope, jsonFile, "hello", "Hello")
	rec = editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/segments/"+plain+"/source-text"),
		`{"sourcePath":"a.json","externalStringId":"`+plain+`","sourceText":"Hi \u001eHLHTPH_AB_0\u001f","keepApproved":false}`)
	require.Equal(t, http.StatusBadRequest, rec.Code, rec.Body.String())

	// The first edit records the text before it as the base the next import compares with.
	rec = editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/segments/"+plain+"/source-text"),
		editorCatSourceTextBody(plain, "Hi", false))
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var imported *string
	require.NoError(t, scope.Pool.QueryRow(t.Context(), `select imported_source_text from project_translation_keys where id=$1`, plain).Scan(&imported))
	require.NotNil(t, imported)
	require.Equal(t, "Hello", *imported)

	queue := editorCatRequestScope(api, scope, http.MethodGet, editorCatPathFor(scope, "/files/detail/cat/queue?sourcePath=a.json&targetLocale=fr"), "")
	require.Equal(t, http.StatusOK, queue.Code, queue.Body.String())
	require.Contains(t, queue.Body.String(), `"key":"hello","sourceText":"Hi"`)
	require.Regexp(t, `"key":"hello"[^}]*"sourceTextEditable":true`, queue.Body.String())
	require.NotRegexp(t, `"key":"intro#srx.1"[^}]*"sourceTextEditable"`, queue.Body.String())
}

func TestEditorCatSetSourceTextLeavesIntegrationAndUnknownFilesAlone(t *testing.T) {
	api, scope := editorCatTestAPI(t, "admin")
	_, err := scope.Pool.Exec(t.Context(), `update projects set source_text_editable=true where id=$1`, scope.ProjectID)
	require.NoError(t, err)
	for _, fileID := range []string{
		mustEditorCatImportedFile(t, scope, "braze/emails.json", "braze_automation"),
		// No recorded import: an integration may have brought it in.
		mustEditorCatSourceFile(t, scope, "old.json"),
	} {
		keyID := mustEditorCatKey(t, scope, fileID, "hello", "Hello")
		rec := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/segments/"+keyID+"/source-text"),
			`{"sourcePath":"*","externalStringId":"`+keyID+`","sourceText":"Hi","keepApproved":false}`)
		require.Equal(t, http.StatusConflict, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), `"source_text_not_editable"`)
	}

	// A key hidden, or locked in any language, gets no control in the queue.
	fileID := mustEditorCatImportedFile(t, scope, "a.json", "files_page")
	hidden := mustEditorCatKey(t, scope, fileID, "hidden", "Hidden")
	locked := mustEditorCatKey(t, scope, fileID, "locked", "Locked")
	_, err = scope.Pool.Exec(t.Context(), `update project_translation_keys set is_hidden=true where id=$1`, hidden)
	require.NoError(t, err)
	_, err = scope.Pool.Exec(t.Context(), `
        insert into project_cat_segment_locks (organization_id, project_id, target_locale, external_string_id)
        values ($1, $2, 'de', $3)`, scope.OrganizationID, scope.ProjectID, locked)
	require.NoError(t, err)
	mustEditorCatKey(t, scope, fileID, "open", "Open")
	queue := editorCatRequestScope(api, scope, http.MethodGet, editorCatPathFor(scope, "/files/detail/cat/queue?sourcePath=a.json&targetLocale=fr&queueFilter=all"), "")
	require.Equal(t, http.StatusOK, queue.Code, queue.Body.String())
	require.Regexp(t, `"key":"open"[^}]*"sourceTextEditable":true`, queue.Body.String())
	require.Contains(t, queue.Body.String(), `"key":"locked"`)
	require.NotRegexp(t, `"key":"locked"[^}]*"sourceTextEditable"`, queue.Body.String())
	rec := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/segments/"+hidden+"/source-text"),
		editorCatSourceTextBody(hidden, "Shown", false))
	require.Equal(t, http.StatusConflict, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"source_text_not_editable"`)
}
