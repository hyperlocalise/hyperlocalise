package main

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/hyperlocalise/hyperlocalise/internal/objectstore"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func editorCatMultipartScope(t *testing.T, api *editorCatAPI, scope *testenv.Scope, method, path string, fields map[string]string, files map[string][]byte, fileNames map[string]string) *httptest.ResponseRecorder {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	for key, value := range fields {
		require.NoError(t, writer.WriteField(key, value))
	}
	for field, content := range files {
		name := fileNames[field]
		if name == "" {
			name = field + ".png"
		}
		part, err := writer.CreateFormFile(field, name)
		require.NoError(t, err)
		_, err = part.Write(content)
		require.NoError(t, err)
	}
	require.NoError(t, writer.Close())

	mux := http.NewServeMux()
	api.register(mux, stubSessionVerifier{claims: AuthClaims{UserID: scope.WorkOSUserID}})
	req := httptest.NewRequest(method, path, &body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "session"})
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	return rec
}

func mustEditorCatRepositoryImage(t *testing.T, api *editorCatAPI, scope *testenv.Scope, fileID, sourcePath string, png []byte) string {
	t.Helper()
	require.NotNil(t, api.objects)
	storedFileID := "file_" + uuid.NewString()
	key := "editor-cat-test/" + storedFileID + ".png"
	_, _, err := api.objects.Put(t.Context(), objectstore.PutInput{
		Key: key, Body: bytes.NewReader(png), Size: int64(len(png)), ContentType: "image/png",
	})
	require.NoError(t, err)
	_, err = scope.Pool.Exec(t.Context(), `
        insert into stored_files (
            id, organization_id, project_id, role, source_kind,
            storage_provider, storage_key, storage_url, filename, content_type, byte_size, sha256
        ) values ($1,$2,$3,'source','repository_file','r2-primary',$4,$4,$5,'image/png',$6,'deadbeef')`,
		storedFileID, scope.OrganizationID, scope.ProjectID, key, sourcePath, len(png))
	require.NoError(t, err)
	_, err = scope.Pool.Exec(t.Context(), `
        insert into repository_source_file_versions (
            repository_source_file_id, organization_id, project_id, source_path, stored_file_id
        ) values ($1,$2,$3,$4,$5)`,
		fileID, scope.OrganizationID, scope.ProjectID, sourcePath, storedFileID)
	require.NoError(t, err)
	return storedFileID
}

func TestEditorCatImageEditPromptMarkup(t *testing.T) {
	prompt := editorCatImageEditPrompt(editorCatImageEditRequest{
		Kind: editorCatImageEditKindMarkup, Instruction: "Brighten the badge",
	})
	require.Contains(t, prompt, editorCatImageEditMarkColor)
	require.Contains(t, prompt, "Brighten the badge")
}

func TestEditorCatImageUpload(t *testing.T) {
	api, scope := editorCatTestAPI(t, "translator")
	api.objects = visualContextObjectRegistry(t)
	fileID := mustEditorCatSourceFile(t, scope, "hero.png")
	png := mustVisualContextPNG(t, 4, 4)

	rec := editorCatMultipartScope(t, api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/images/upload"), map[string]string{
		"sourcePath": "hero.png", "targetLocale": "fr-FR",
	}, map[string][]byte{"file": png}, map[string]string{"file": "upload.png"})
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var body struct {
		ImageVariant struct {
			Status         string `json:"status"`
			StoredFileID   string `json:"storedFileId"`
			TargetAssetURL string `json:"targetAssetUrl"`
		} `json:"imageVariant"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Equal(t, "needs_review", body.ImageVariant.Status)
	require.NotEmpty(t, body.ImageVariant.StoredFileID)
	require.Contains(t, body.ImageVariant.TargetAssetURL, body.ImageVariant.StoredFileID)

	var stored string
	err := scope.Pool.QueryRow(t.Context(), `
        select stored_file_id from project_image_variants
        where organization_id=$1 and project_id=$2 and source_path='hero.png' and target_locale='fr-FR'`,
		scope.OrganizationID, scope.ProjectID).Scan(&stored)
	require.NoError(t, err)
	require.Equal(t, body.ImageVariant.StoredFileID, stored)
	_ = fileID
}

func TestEditorCatImageRegenerate(t *testing.T) {
	api, scope := editorCatTestAPI(t, "translator")
	provider := &stubIrisProvider{outputs: []irisProviderOutput{{
		Bytes: []byte("localized-png"), Filename: "hero-fr.png", ContentType: "image/png",
	}}}
	api.ai = &irisGenerationAPI{provider: provider, meter: &stubIrisMeter{features: true, tokens: true}}
	api.objects = visualContextObjectRegistry(t)
	fileID := mustEditorCatSourceFile(t, scope, "hero.png")
	png := mustVisualContextPNG(t, 8, 8)
	mustEditorCatRepositoryImage(t, api, scope, fileID, "hero.png", png)

	rec := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/images/regenerate"),
		`{"sourcePath":"hero.png","targetLocale":"fr-FR"}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Equal(t, 1, provider.calls)
	require.Equal(t, "image-localise", provider.last.Model.ID)
	require.Contains(t, rec.Body.String(), `"status":"needs_review"`)
}

func TestEditorCatImageEditMarkup(t *testing.T) {
	api, scope := editorCatTestAPI(t, "translator")
	provider := &stubIrisProvider{outputs: []irisProviderOutput{{
		Bytes: []byte("edited-png"), Filename: "hero-fr.png", ContentType: "image/png",
	}}}
	api.ai = &irisGenerationAPI{provider: provider, meter: &stubIrisMeter{features: true, tokens: true}}
	api.objects = visualContextObjectRegistry(t)
	fileID := mustEditorCatSourceFile(t, scope, "hero.png")
	_, err := scope.Pool.Exec(t.Context(), `
        insert into project_image_variants (
            organization_id, project_id, repository_source_file_id, source_path, target_locale, status, stored_file_id
        ) values ($1,$2,$3,'hero.png','fr-FR','draft',$4)`,
		scope.OrganizationID, scope.ProjectID, fileID, "file_existing_variant")
	require.NoError(t, err)
	image := mustVisualContextPNG(t, 6, 6)

	rec := editorCatMultipartScope(t, api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/images/edit"), map[string]string{
		"sourcePath": "hero.png", "targetLocale": "fr-FR", "kind": "markup", "instruction": "Brighten the headline",
	}, map[string][]byte{"image": image}, nil)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Equal(t, 1, provider.calls)
	require.Equal(t, "image-edit", provider.last.Model.ID)
	require.Contains(t, provider.last.Prompt, "Brighten the headline")
	require.Contains(t, rec.Body.String(), `"storedFileId"`)
}