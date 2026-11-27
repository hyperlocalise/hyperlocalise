package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"testing"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
)

func orgEditorFilesPath(scope *testenv.Scope, fileID string) string {
	path := "/v1/orgs/" + scope.Slug + "/files"
	if fileID == "" {
		return path
	}
	return path + "/" + fileID
}

func mustUploadOrgEditorPNG(t *testing.T, api *editorCatAPI, scope *testenv.Scope, fields map[string]string) (fileID string, png []byte) {
	t.Helper()
	png = mustVisualContextPNG(t, 1, 1)
	upload := editorCatMultipartScope(t, api, scope, http.MethodPost, orgEditorFilesPath(scope, ""), fields, map[string][]byte{
		"file": png,
	}, map[string]string{"file": "hero.png"})
	require.Equal(t, http.StatusCreated, upload.Code, upload.Body.String())
	var parsed struct {
		File struct {
			ID string `json:"id"`
		} `json:"file"`
	}
	require.NoError(t, json.Unmarshal(upload.Body.Bytes(), &parsed))
	require.NotEmpty(t, parsed.File.ID)
	return parsed.File.ID, png
}

func editorCatOrgFileUploadWithType(t *testing.T, api *editorCatAPI, scope *testenv.Scope, filename, contentType string, content []byte) *httptest.ResponseRecorder {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	partHeader := make(textproto.MIMEHeader)
	partHeader.Set("Content-Disposition", fmt.Sprintf(`form-data; name="file"; filename="%s"`, filename))
	partHeader.Set("Content-Type", contentType)
	part, err := writer.CreatePart(partHeader)
	require.NoError(t, err)
	_, err = part.Write(content)
	require.NoError(t, err)
	require.NoError(t, writer.Close())

	mux := http.NewServeMux()
	api.register(mux, stubSessionVerifier{claims: AuthClaims{UserID: scope.WorkOSUserID}})
	req := httptest.NewRequest(http.MethodPost, orgEditorFilesPath(scope, ""), &body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "session"})
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	return rec
}

func TestEditorCatOrgFiles(t *testing.T) {
	t.Run("uploads and serves a markdown editor image", func(t *testing.T) {
		api, scope := editorCatTestAPI(t, "member")
		api.objects = visualContextObjectRegistry(t)
		fileID, png := mustUploadOrgEditorPNG(t, api, scope, nil)

		download := editorCatRequestScope(api, scope, http.MethodGet, orgEditorFilesPath(scope, fileID), "")
		require.Equal(t, http.StatusOK, download.Code, download.Body.String())
		require.Equal(t, png, download.Body.Bytes())
		require.Equal(t, "image/png", download.Header().Get("Content-Type"))
		require.Equal(t, "default-src 'none'; sandbox;", download.Header().Get("Content-Security-Policy"))
		require.Equal(t, "nosniff", download.Header().Get("X-Content-Type-Options"))
		require.Equal(t, "private, max-age=60", download.Header().Get("Cache-Control"))
		require.Contains(t, download.Header().Get("Content-Disposition"), "inline;")
		require.Contains(t, download.Header().Get("Content-Disposition"), "hero.png")
	})

	t.Run("binds an upload to an owned project", func(t *testing.T) {
		api, scope := editorCatTestAPI(t, "translator")
		api.objects = visualContextObjectRegistry(t)
		fileID, png := mustUploadOrgEditorPNG(t, api, scope, map[string]string{"projectId": scope.ProjectID})

		var projectID string
		require.NoError(t, scope.Pool.QueryRow(t.Context(), `
            select coalesce(project_id::text, '') from stored_files where id=$1`, fileID).Scan(&projectID))
		require.Equal(t, scope.ProjectID, projectID)

		download := editorCatRequestScope(api, scope, http.MethodGet, orgEditorFilesPath(scope, fileID), "")
		require.Equal(t, http.StatusOK, download.Code, download.Body.String())
		require.Equal(t, png, download.Body.Bytes())
	})

	t.Run("hides a file from another workspace", func(t *testing.T) {
		api, scope := editorCatTestAPI(t, "translator")
		api.objects = visualContextObjectRegistry(t)
		fileID, _ := mustUploadOrgEditorPNG(t, api, scope, nil)

		other, otherScope := editorCatTestAPI(t, "translator")
		other.objects = api.objects
		rec := editorCatRequestScope(other, otherScope, http.MethodGet, orgEditorFilesPath(otherScope, fileID), "")
		requireEditorCatError(t, rec, http.StatusNotFound, "file_not_found")
	})

	t.Run("hides a non-asset stored file in the same workspace", func(t *testing.T) {
		api, scope := editorCatTestAPI(t, "translator")
		fileID := mustEditorCatProjectAsset(t, api, scope, scope.ProjectID, "source.json", "application/json", []byte(`{"hello":"world"}`))

		rec := editorCatRequestScope(api, scope, http.MethodGet, orgEditorFilesPath(scope, fileID), "")
		requireEditorCatError(t, rec, http.StatusNotFound, "file_not_found")
	})

	t.Run("hides a project-bound file the member cannot access", func(t *testing.T) {
		api, scope := editorCatTestAPI(t, "translator")
		secretTeam := scope.MustTeam(t, "secret", "Secret", "")
		secretProject := "project_secret_" + uuid.NewString()[:8]
		scope.MustProject(t, secretProject, "Secret")
		_, err := scope.Pool.Exec(t.Context(), `update projects set team_id=$1 where id=$2`, secretTeam, secretProject)
		require.NoError(t, err)

		fileID := "file_" + uuid.NewString()
		_, err = scope.Pool.Exec(t.Context(), `
            insert into stored_files (
                id, organization_id, project_id, role, source_kind,
                storage_provider, storage_key, storage_url, filename, content_type, byte_size, sha256
            ) values ($1,$2,$3,'asset','editor_upload','r2-primary',$1,$1,'secret.png','image/png',4,'deadbeef')`,
			fileID, scope.OrganizationID, secretProject)
		require.NoError(t, err)

		rec := editorCatRequestScope(api, scope, http.MethodGet, orgEditorFilesPath(scope, fileID), "")
		requireEditorCatError(t, rec, http.StatusNotFound, "file_not_found")
	})

	t.Run("refuses a vendor even with an open task", func(t *testing.T) {
		f := newTaskFixture(t, vendorRole)
		f.editor.objects = visualContextObjectRegistry(t)
		_ = f.mustTask(t, taskSeed{})
		png := mustVisualContextPNG(t, 1, 1)

		upload := editorCatMultipartScope(t, f.editor, f.scope, http.MethodPost, orgEditorFilesPath(f.scope, ""), nil, map[string][]byte{
			"file": png,
		}, map[string]string{"file": "hero.png"})
		requireEditorCatError(t, upload, http.StatusForbidden, "organization_access_denied")

		rec := editorCatRequestScope(f.editor, f.scope, http.MethodGet, orgEditorFilesPath(f.scope, f.storedFileID), "")
		requireEditorCatError(t, rec, http.StatusForbidden, "organization_access_denied")
	})

	t.Run("rejects invalid uploads before storing bytes", func(t *testing.T) {
		api, scope := editorCatTestAPI(t, "translator")
		api.objects = visualContextObjectRegistry(t)
		png := mustVisualContextPNG(t, 1, 1)

		missing := editorCatMultipartScope(t, api, scope, http.MethodPost, orgEditorFilesPath(scope, ""), nil, nil, nil)
		requireEditorCatError(t, missing, http.StatusBadRequest, "file_required")

		empty := editorCatMultipartScope(t, api, scope, http.MethodPost, orgEditorFilesPath(scope, ""), nil, map[string][]byte{
			"file": {},
		}, map[string]string{"file": "hero.png"})
		requireEditorCatError(t, empty, http.StatusRequestEntityTooLarge, "file_upload_too_large")

		gif := editorCatOrgFileUploadWithType(t, api, scope, "hero.gif", "image/gif", png)
		requireEditorCatError(t, gif, http.StatusUnsupportedMediaType, "unsupported_image_type")

		foreign := editorCatMultipartScope(t, api, scope, http.MethodPost, orgEditorFilesPath(scope, ""), map[string]string{
			"projectId": "project_missing",
		}, map[string][]byte{"file": png}, map[string]string{"file": "hero.png"})
		requireEditorCatError(t, foreign, http.StatusNotFound, "project_not_found")
	})

	t.Run("maps missing files and missing object storage", func(t *testing.T) {
		api, scope := editorCatTestAPI(t, "translator")
		rec := editorCatRequestScope(api, scope, http.MethodGet, orgEditorFilesPath(scope, "file_"+uuid.NewString()), "")
		requireEditorCatError(t, rec, http.StatusNotFound, "file_not_found")

		api.objects = nil
		png := mustVisualContextPNG(t, 1, 1)
		upload := editorCatMultipartScope(t, api, scope, http.MethodPost, orgEditorFilesPath(scope, ""), nil, map[string][]byte{
			"file": png,
		}, map[string]string{"file": "hero.png"})
		requireEditorCatError(t, upload, http.StatusServiceUnavailable, "editor_unavailable")

		api.objects = visualContextObjectRegistry(t)
		fileID, _ := mustUploadOrgEditorPNG(t, api, scope, nil)
		api.objects = nil
		download := editorCatRequestScope(api, scope, http.MethodGet, orgEditorFilesPath(scope, fileID), "")
		requireEditorCatError(t, download, http.StatusServiceUnavailable, "object_storage_unavailable")
	})
}
