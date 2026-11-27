package main

import (
	"bytes"
	"net/http"
	"net/url"
	"testing"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/hyperlocalise/hyperlocalise/internal/objectstore"
	"github.com/stretchr/testify/require"
)

func editorCatTranslationDownloadPath(scope *testenv.Scope, sourcePath, locale string) string {
	query := url.Values{}
	if sourcePath != "" {
		query.Set("sourcePath", sourcePath)
	}
	if locale != "" {
		query.Set("locale", locale)
	}
	suffix := "/files/translations/download"
	if encoded := query.Encode(); encoded != "" {
		suffix += "?" + encoded
	}
	return editorCatPathFor(scope, suffix)
}

func mustEditorCatHTMLSource(t *testing.T, api *editorCatAPI, scope *testenv.Scope, sourcePath string, html []byte) string {
	t.Helper()
	if api.objects == nil {
		api.objects = visualContextObjectRegistry(t)
	}
	fileID := mustEditorCatSourceFile(t, scope, sourcePath)
	storedFileID := "file_" + uuid.NewString()
	key := "editor-cat-html/" + storedFileID
	_, _, err := api.objects.Put(t.Context(), objectstore.PutInput{
		Key: key, Body: bytes.NewReader(html), Size: int64(len(html)), ContentType: "text/html",
	})
	require.NoError(t, err)
	_, err = scope.Pool.Exec(t.Context(), `
        insert into stored_files (
            id, organization_id, project_id, role, source_kind,
            storage_provider, storage_key, storage_url, filename, content_type, byte_size, sha256
        ) values ($1,$2,$3,'source','repository_file','r2-primary',$4,$4,$5,'text/html',$6,'deadbeef')`,
		storedFileID, scope.OrganizationID, scope.ProjectID, key, sourcePath, len(html))
	require.NoError(t, err)
	_, err = scope.Pool.Exec(t.Context(), `
        insert into repository_source_file_versions (
            repository_source_file_id, organization_id, project_id, source_path, stored_file_id
        ) values ($1,$2,$3,$4,$5)`,
		fileID, scope.OrganizationID, scope.ProjectID, sourcePath, storedFileID)
	require.NoError(t, err)
	return fileID
}

func TestEditorCatTranslationDownload(t *testing.T) {
	html := []byte("<html><body><p>Hello</p></body></html>")

	t.Run("writes translated HTML for a keyed file", func(t *testing.T) {
		api, scope := editorCatTestAPI(t, "translator")
		fileID := mustEditorCatHTMLSource(t, api, scope, "pages/home.html", html)
		keyID := mustEditorCatKey(t, scope, fileID, "html.body.p", "Hello")
		mustEditorCatTranslation(t, scope, keyID, "fr", "Bonjour", "approved")

		rec := editorCatRequestScope(api, scope, http.MethodGet, editorCatTranslationDownloadPath(scope, "pages/home.html", "fr"), "")
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		require.Equal(t, "text/html; charset=utf-8", rec.Header().Get("Content-Type"))
		require.Contains(t, rec.Header().Get("Content-Disposition"), "home.html")
		require.Contains(t, rec.Body.String(), "Bonjour")
		require.NotContains(t, rec.Body.String(), "Hello")
	})

	t.Run("lets members download generated HTML", func(t *testing.T) {
		api, scope := editorCatTestAPI(t, "member")
		fileID := mustEditorCatHTMLSource(t, api, scope, "pages/home.html", html)
		keyID := mustEditorCatKey(t, scope, fileID, "html.body.p", "Hello")
		mustEditorCatTranslation(t, scope, keyID, "fr", "Bonjour", "approved")

		rec := editorCatRequestScope(api, scope, http.MethodGet, editorCatTranslationDownloadPath(scope, "pages/home.html", "fr"), "")
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), "Bonjour")
	})

	t.Run("skips rejected translations and keeps source text", func(t *testing.T) {
		api, scope := editorCatTestAPI(t, "translator")
		fileID := mustEditorCatHTMLSource(t, api, scope, "pages/home.html", html)
		keyID := mustEditorCatKey(t, scope, fileID, "html.body.p", "Hello")
		mustEditorCatTranslation(t, scope, keyID, "fr", "Bonjour", "rejected")

		rec := editorCatRequestScope(api, scope, http.MethodGet, editorCatTranslationDownloadPath(scope, "pages/home.html", "fr"), "")
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), "Hello")
		require.NotContains(t, rec.Body.String(), "Bonjour")
	})

	t.Run("hides a file with no translation keys", func(t *testing.T) {
		api, scope := editorCatTestAPI(t, "translator")
		mustEditorCatHTMLSource(t, api, scope, "pages/home.html", html)

		rec := editorCatRequestScope(api, scope, http.MethodGet, editorCatTranslationDownloadPath(scope, "pages/home.html", "fr"), "")
		requireEditorCatError(t, rec, http.StatusNotFound, "source_file_not_found")
	})

	t.Run("rejects missing query params and unsupported sources", func(t *testing.T) {
		api, scope := editorCatTestAPI(t, "translator")
		mustEditorCatSourceFile(t, scope, "locales/en.json")

		rec := editorCatRequestScope(api, scope, http.MethodGet, editorCatTranslationDownloadPath(scope, "", "fr"), "")
		requireEditorCatError(t, rec, http.StatusBadRequest, "invalid_project_payload")

		rec = editorCatRequestScope(api, scope, http.MethodGet, editorCatTranslationDownloadPath(scope, "pages/home.html", ""), "")
		requireEditorCatError(t, rec, http.StatusBadRequest, "invalid_project_payload")

		rec = editorCatRequestScope(api, scope, http.MethodGet, editorCatTranslationDownloadPath(scope, "locales/en.json", "fr"), "")
		requireEditorCatError(t, rec, http.StatusNotFound, "source_file_not_found")

		rec = editorCatRequestScope(api, scope, http.MethodGet, editorCatTranslationDownloadPath(scope, "pages/missing.html", "fr"), "")
		requireEditorCatError(t, rec, http.StatusNotFound, "source_file_not_found")
	})

	t.Run("hides another workspace's project", func(t *testing.T) {
		api, scope := editorCatTestAPI(t, "translator")
		_, foreignScope := editorCatTestAPI(t, "translator")

		rec := editorCatRequestScope(api, scope, http.MethodGet, editorCatPathFor(foreignScope, "/files/translations/download?sourcePath=pages/home.html&locale=fr"), "")
		requireEditorCatError(t, rec, http.StatusForbidden, "organization_access_denied")

		rec = editorCatRequestScope(api, scope, http.MethodGet, "/v1/orgs/"+scope.Slug+"/projects/"+foreignScope.ProjectID+"/files/translations/download?sourcePath=pages/home.html&locale=fr", "")
		requireEditorCatError(t, rec, http.StatusNotFound, "project_not_found")
	})
}
