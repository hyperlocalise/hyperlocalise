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

func editorCatGoSvcAssetPath(scope *testenv.Scope, fileID string) string {
	return editorCatPathFor(scope, "/assets/"+url.PathEscape(fileID))
}

func mustEditorCatProjectAsset(t *testing.T, api *editorCatAPI, scope *testenv.Scope, projectID, filename, contentType string, body []byte) string {
	t.Helper()
	if api.objects == nil {
		api.objects = visualContextObjectRegistry(t)
	}
	storedFileID := "file_" + uuid.NewString()
	key := "editor-cat-assets/" + storedFileID
	_, _, err := api.objects.Put(t.Context(), objectstore.PutInput{
		Key: key, Body: bytes.NewReader(body), Size: int64(len(body)), ContentType: contentType,
	})
	require.NoError(t, err)
	_, err = scope.Pool.Exec(t.Context(), `
        insert into stored_files (
            id, organization_id, project_id, role, source_kind,
            storage_provider, storage_key, storage_url, filename, content_type, byte_size, sha256
        ) values ($1,$2,$3,'source','repository_file','r2-primary',$4,$4,$5,$6,$7,'deadbeef')`,
		storedFileID, scope.OrganizationID, projectID, key, filename, contentType, len(body))
	require.NoError(t, err)
	return storedFileID
}

func attachEditorCatAssetObject(t *testing.T, api *editorCatAPI, scope *testenv.Scope, storedFileID, filename, contentType string, body []byte) {
	t.Helper()
	if api.objects == nil {
		api.objects = visualContextObjectRegistry(t)
	}
	key := "editor-cat-assets/" + storedFileID
	_, _, err := api.objects.Put(t.Context(), objectstore.PutInput{
		Key: key, Body: bytes.NewReader(body), Size: int64(len(body)), ContentType: contentType,
	})
	require.NoError(t, err)
	_, err = scope.Pool.Exec(t.Context(), `
        update stored_files
           set storage_provider='r2-primary', storage_key=$1, storage_url=$1,
               filename=$2, content_type=$3, byte_size=$4
         where id=$5`,
		key, filename, contentType, len(body), storedFileID)
	require.NoError(t, err)
}

func TestEditorCatProjectAsset(t *testing.T) {
	t.Run("returns the stored bytes with download headers", func(t *testing.T) {
		api, scope := editorCatTestAPI(t, "translator")
		png := []byte("png-bytes")
		fileID := mustEditorCatProjectAsset(t, api, scope, scope.ProjectID, "hero.png", "image/png", png)

		rec := editorCatRequestScope(api, scope, http.MethodGet, editorCatGoSvcAssetPath(scope, fileID), "")
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		require.Equal(t, png, rec.Body.Bytes())
		require.Equal(t, "image/png", rec.Header().Get("Content-Type"))
		require.Equal(t, "default-src 'none'; sandbox;", rec.Header().Get("Content-Security-Policy"))
		require.Equal(t, "nosniff", rec.Header().Get("X-Content-Type-Options"))
		require.Equal(t, "private, max-age=60", rec.Header().Get("Cache-Control"))
		require.Contains(t, rec.Header().Get("Content-Disposition"), "inline;")
		require.Contains(t, rec.Header().Get("Content-Disposition"), "hero.png")
	})

	t.Run("lets members read CAT assets", func(t *testing.T) {
		api, scope := editorCatTestAPI(t, "member")
		fileID := mustEditorCatProjectAsset(t, api, scope, scope.ProjectID, "brief.pdf", "application/pdf", []byte("%PDF"))

		rec := editorCatRequestScope(api, scope, http.MethodGet, editorCatGoSvcAssetPath(scope, fileID), "")
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		require.Equal(t, "application/pdf", rec.Header().Get("Content-Type"))
	})

	t.Run("hides a file bound to another project in the same workspace", func(t *testing.T) {
		api, scope := editorCatTestAPI(t, "translator")
		owned := scope.ProjectID
		other := scope.MustProject(t, "project_alt_"+uuid.NewString()[:8], "Other")
		scope.ProjectID = owned
		fileID := mustEditorCatProjectAsset(t, api, scope, other, "secret.png", "image/png", []byte("secret"))

		rec := editorCatRequestScope(api, scope, http.MethodGet, editorCatGoSvcAssetPath(scope, fileID), "")
		require.Equal(t, http.StatusNotFound, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), "file_not_found")
	})

	t.Run("hides a file from another workspace", func(t *testing.T) {
		api, scope := editorCatTestAPI(t, "translator")
		foreign, foreignScope := editorCatTestAPI(t, "translator")
		fileID := mustEditorCatProjectAsset(t, foreign, foreignScope, foreignScope.ProjectID, "foreign.png", "image/png", []byte("foreign"))

		rec := editorCatRequestScope(api, scope, http.MethodGet, editorCatGoSvcAssetPath(scope, fileID), "")
		require.Equal(t, http.StatusNotFound, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), "file_not_found")
	})

	t.Run("maps a missing file and missing object store", func(t *testing.T) {
		api, scope := editorCatTestAPI(t, "translator")
		rec := editorCatRequestScope(api, scope, http.MethodGet, editorCatGoSvcAssetPath(scope, "file_"+uuid.NewString()), "")
		require.Equal(t, http.StatusNotFound, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), "file_not_found")

		fileID := mustEditorCatProjectAsset(t, api, scope, scope.ProjectID, "hero.png", "image/png", []byte("png"))
		api.objects = nil
		rec = editorCatRequestScope(api, scope, http.MethodGet, editorCatGoSvcAssetPath(scope, fileID), "")
		require.Equal(t, http.StatusServiceUnavailable, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), "object_storage_unavailable")
	})
}

func TestEditorCatVendorProjectAsset(t *testing.T) {
	png := []byte("vendor-png")

	t.Run("serves a file the vendor has an open task on", func(t *testing.T) {
		f := newTaskFixture(t, vendorRole)
		attachEditorCatAssetObject(t, f.editor, f.scope, f.storedFileID, "app.png", "image/png", png)
		_ = f.mustTask(t, taskSeed{})

		rec := editorCatRequestScope(f.editor, f.scope, http.MethodGet, editorCatGoSvcAssetPath(f.scope, f.storedFileID), "")
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		require.Equal(t, png, rec.Body.Bytes())
	})

	t.Run("hides a file that is not on an open task", func(t *testing.T) {
		f := newTaskFixture(t, vendorRole)
		attachEditorCatAssetObject(t, f.editor, f.scope, f.storedFileID, "app.png", "image/png", png)
		_ = f.mustTask(t, taskSeed{})
		attachEditorCatAssetObject(t, f.editor, f.scope, f.otherStoredFile, "other.png", "image/png", []byte("other"))

		rec := editorCatRequestScope(f.editor, f.scope, http.MethodGet, editorCatGoSvcAssetPath(f.scope, f.otherStoredFile), "")
		require.Equal(t, http.StatusForbidden, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), "forbidden")
	})

	t.Run("hides every file when the vendor has no open task", func(t *testing.T) {
		f := newTaskFixture(t, vendorRole)
		attachEditorCatAssetObject(t, f.editor, f.scope, f.storedFileID, "app.png", "image/png", png)

		rec := editorCatRequestScope(f.editor, f.scope, http.MethodGet, editorCatGoSvcAssetPath(f.scope, f.storedFileID), "")
		require.Equal(t, http.StatusNotFound, rec.Code, rec.Body.String())
		require.Contains(t, rec.Body.String(), "task_not_open")
	})
}
