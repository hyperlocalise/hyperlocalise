package main

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/autumn"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/hyperlocalise/hyperlocalise/internal/objectstore"
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

func TestEditorCatImageUploadOnCloneDoesNotRebindMainVariant(t *testing.T) {
	api, scope := editorCatTestAPI(t, "translator")
	api.objects = visualContextObjectRegistry(t)
	mainFile := mustEditorCatSourceFile(t, scope, "hero.png")
	cloneFile := mustEditorCatSourceFileOnBranch(t, scope, "hero.png", "feature-checkout")
	mainStored := "file_" + uuid.NewString()
	_, err := scope.Pool.Exec(t.Context(), `
        insert into stored_files (
            id, organization_id, project_id, role, source_kind,
            storage_provider, storage_key, storage_url, filename, content_type, byte_size, sha256
        ) values ($1,$2,$3,'output','job_output','r2-primary',$4,$4,'hero.fr-FR.png','image/png',4,'deadbeef')`,
		mainStored, scope.OrganizationID, scope.ProjectID, "editor-cat-test/"+mainStored+".png")
	require.NoError(t, err)
	_, err = scope.Pool.Exec(t.Context(), `
        insert into project_image_variants (
            organization_id, project_id, repository_source_file_id, source_path, target_locale, status, stored_file_id
        ) values ($1,$2,$3,'hero.png','fr-FR','needs_review',$4)`,
		scope.OrganizationID, scope.ProjectID, mainFile, mainStored)
	require.NoError(t, err)

	png := mustVisualContextPNG(t, 4, 4)
	rec := editorCatMultipartScope(t, api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/images/upload")+"?branch=feature-checkout", map[string]string{
		"sourcePath": "hero.png", "targetLocale": "fr-FR",
	}, map[string][]byte{"file": png}, map[string]string{"file": "upload.png"})
	require.Equal(t, http.StatusConflict, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), "variant_branch_conflict")

	var boundFileID, storedFileID, status string
	err = scope.Pool.QueryRow(t.Context(), `
        select repository_source_file_id::text, stored_file_id, status
        from project_image_variants
        where organization_id=$1 and project_id=$2 and source_path='hero.png' and target_locale='fr-FR'`,
		scope.OrganizationID, scope.ProjectID).Scan(&boundFileID, &storedFileID, &status)
	require.NoError(t, err)
	require.Equal(t, mainFile, boundFileID)
	require.Equal(t, mainStored, storedFileID)
	require.Equal(t, "needs_review", status)
	require.NotEqual(t, mainFile, cloneFile)
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
	existingPNG := mustVisualContextPNG(t, 6, 6)
	existingStoredID := mustEditorCatRepositoryImage(t, api, scope, fileID, "hero.png", existingPNG)
	_, err := scope.Pool.Exec(t.Context(), `
        insert into project_image_variants (
            organization_id, project_id, repository_source_file_id, source_path, target_locale, status, stored_file_id
        ) values ($1,$2,$3,'hero.png','fr-FR','draft',$4)`,
		scope.OrganizationID, scope.ProjectID, fileID, existingStoredID)
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

func requireEditorCatError(t *testing.T, rec *httptest.ResponseRecorder, status int, code string) {
	t.Helper()
	require.Equal(t, status, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"`+code+`"`)
}

func mustProtectEditorCatMain(t *testing.T, scope *testenv.Scope) {
	t.Helper()
	tag, err := scope.Pool.Exec(t.Context(), `
        update project_branches set is_protected = true
        where project_id = $1 and name = 'main' and status = 'active'`,
		scope.ProjectID)
	require.NoError(t, err)
	require.Equal(t, int64(1), tag.RowsAffected())
}

func mustEditorCatImageVariant(t *testing.T, scope *testenv.Scope, fileID, sourcePath, locale, status, storedFileID string) {
	t.Helper()
	_, err := scope.Pool.Exec(t.Context(), `
        insert into project_image_variants (
            organization_id, project_id, repository_source_file_id, source_path, target_locale, status, stored_file_id
        ) values ($1,$2,$3,$4,$5,$6,$7)`,
		scope.OrganizationID, scope.ProjectID, fileID, sourcePath, locale, status, storedFileID)
	require.NoError(t, err)
}

func TestEditorCatImageMutationsForbidMember(t *testing.T) {
	api, scope := editorCatTestAPI(t, "member")
	png := mustVisualContextPNG(t, 4, 4)

	rec := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/images/regenerate"),
		`{"sourcePath":"hero.png","targetLocale":"fr-FR"}`)
	requireEditorCatError(t, rec, http.StatusForbidden, "forbidden")

	rec = editorCatMultipartScope(t, api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/images/upload"), map[string]string{
		"sourcePath": "hero.png", "targetLocale": "fr-FR",
	}, map[string][]byte{"file": png}, nil)
	requireEditorCatError(t, rec, http.StatusForbidden, "forbidden")

	rec = editorCatMultipartScope(t, api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/images/edit"), map[string]string{
		"sourcePath": "hero.png", "targetLocale": "fr-FR", "kind": "markup", "instruction": "Brighten",
	}, map[string][]byte{"image": png}, nil)
	requireEditorCatError(t, rec, http.StatusForbidden, "forbidden")
}

func TestEditorCatImageMutationsRejectProtectedBranch(t *testing.T) {
	api, scope := editorCatTestAPI(t, "translator")
	api.ai = &irisGenerationAPI{provider: &stubIrisProvider{outputs: []irisProviderOutput{{Bytes: []byte("png")}}}, meter: &stubIrisMeter{features: true, tokens: true}}
	mustProtectEditorCatMain(t, scope)
	png := mustVisualContextPNG(t, 4, 4)

	rec := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/images/regenerate"),
		`{"sourcePath":"hero.png","targetLocale":"fr-FR"}`)
	requireEditorCatError(t, rec, http.StatusConflict, "protected_branch")

	rec = editorCatMultipartScope(t, api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/images/upload"), map[string]string{
		"sourcePath": "hero.png", "targetLocale": "fr-FR",
	}, map[string][]byte{"file": png}, nil)
	requireEditorCatError(t, rec, http.StatusConflict, "protected_branch")

	rec = editorCatMultipartScope(t, api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/images/edit"), map[string]string{
		"sourcePath": "hero.png", "targetLocale": "fr-FR", "kind": "markup", "instruction": "Brighten",
	}, map[string][]byte{"image": png}, nil)
	requireEditorCatError(t, rec, http.StatusConflict, "protected_branch")
}

func TestEditorCatImageMutationsRejectApprovedWithoutForce(t *testing.T) {
	api, scope := editorCatTestAPI(t, "translator")
	provider := &stubIrisProvider{outputs: []irisProviderOutput{{Bytes: []byte("png"), ContentType: "image/png"}}}
	api.ai = &irisGenerationAPI{provider: provider, meter: &stubIrisMeter{features: true, tokens: true}}
	api.objects = visualContextObjectRegistry(t)
	fileID := mustEditorCatSourceFile(t, scope, "hero.png")
	png := mustVisualContextPNG(t, 6, 6)
	storedID := mustEditorCatRepositoryImage(t, api, scope, fileID, "hero.png", png)
	mustEditorCatImageVariant(t, scope, fileID, "hero.png", "fr-FR", "approved", storedID)

	rec := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/images/regenerate"),
		`{"sourcePath":"hero.png","targetLocale":"fr-FR"}`)
	requireEditorCatError(t, rec, http.StatusBadRequest, "approved_locked")
	require.Equal(t, 0, provider.calls)

	rec = editorCatMultipartScope(t, api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/images/upload"), map[string]string{
		"sourcePath": "hero.png", "targetLocale": "fr-FR",
	}, map[string][]byte{"file": png}, nil)
	requireEditorCatError(t, rec, http.StatusBadRequest, "approved_locked")

	rec = editorCatMultipartScope(t, api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/images/edit"), map[string]string{
		"sourcePath": "hero.png", "targetLocale": "fr-FR", "kind": "markup", "instruction": "Brighten",
	}, map[string][]byte{"image": png}, nil)
	requireEditorCatError(t, rec, http.StatusBadRequest, "approved_locked")
	require.Equal(t, 0, provider.calls)
}

func TestEditorCatImageRegenerateRejectsLockedSegment(t *testing.T) {
	api, scope := editorCatTestAPI(t, "translator")
	api.ai = &irisGenerationAPI{provider: &stubIrisProvider{outputs: []irisProviderOutput{{Bytes: []byte("png")}}}, meter: &stubIrisMeter{features: true, tokens: true}}
	fileID := mustEditorCatSourceFile(t, scope, "hero.png")
	_, err := scope.Pool.Exec(t.Context(), `
        insert into project_cat_segment_locks (organization_id, project_id, target_locale, external_string_id, locked_by_user_id)
        values ($1, $2, 'fr-FR', $3, $4)`,
		scope.OrganizationID, scope.ProjectID, fileID, scope.UserID)
	require.NoError(t, err)

	rec := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/images/regenerate"),
		`{"sourcePath":"hero.png","targetLocale":"fr-FR"}`)
	requireEditorCatError(t, rec, http.StatusConflict, "cat_segment_locked")
}

func TestEditorCatImageRegenerateAIGateAndBilling(t *testing.T) {
	t.Run("unavailable provider", func(t *testing.T) {
		api, scope := editorCatTestAPI(t, "translator")
		rec := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/images/regenerate"),
			`{"sourcePath":"hero.png","targetLocale":"fr-FR"}`)
		requireEditorCatError(t, rec, http.StatusServiceUnavailable, "provider_unavailable")
	})

	t.Run("requires AI features and credit", func(t *testing.T) {
		api, scope := editorCatTestAPI(t, "translator")
		api.ai = &irisGenerationAPI{provider: &stubIrisProvider{}, meter: &stubIrisMeter{features: false, tokens: true}}
		rec := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/images/regenerate"),
			`{"sourcePath":"hero.png","targetLocale":"fr-FR"}`)
		requireEditorCatError(t, rec, http.StatusForbidden, "ai_features_required")

		api.ai = &irisGenerationAPI{provider: &stubIrisProvider{}, meter: &stubIrisMeter{features: true, tokens: false}}
		rec = editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/images/regenerate"),
			`{"sourcePath":"hero.png","targetLocale":"fr-FR"}`)
		requireEditorCatError(t, rec, http.StatusPaymentRequired, "ai_credit_exhausted")
	})

	t.Run("charges tokens for a file-backed regenerate", func(t *testing.T) {
		api, scope := editorCatTestAPI(t, "translator")
		meter := &stubIrisMeter{features: true, tokens: true}
		api.ai = &irisGenerationAPI{
			provider: &stubIrisProvider{outputs: []irisProviderOutput{{
				Bytes: []byte("localized-png"), Filename: "hero-fr.png", ContentType: "image/png",
				Usage: []irisTokenUsage{{Model: "image-localise", InputTokens: 10, OutputTokens: 5}},
			}}},
			meter: meter,
			pool:  api.pool,
		}
		api.objects = visualContextObjectRegistry(t)
		fileID := mustEditorCatSourceFile(t, scope, "hero.png")
		mustEditorCatRepositoryImage(t, api, scope, fileID, "hero.png", mustVisualContextPNG(t, 8, 8))

		rec := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/images/regenerate"),
			`{"sourcePath":"hero.png","targetLocale":"fr-FR"}`)
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		require.Len(t, meter.tokenTracks, 1)
		track := meter.tokenTracks[0]
		require.Equal(t, scope.OrganizationID, track.CustomerID)
		require.Equal(t, autumn.AITokens, track.FeatureID)
		require.Equal(t, "image-localise", track.ModelID)
		require.Equal(t, 10, track.InputTokens)
		require.Equal(t, 5, track.OutputTokens)
		require.Equal(t, "project_image_variant", track.Properties["feature"])
		require.Equal(t, scope.UserID, track.Properties["user_id"])
		require.Equal(t, scope.ProjectID, track.Properties["project_id"])

		var source, operationKey, actor string
		var quantity int
		require.NoError(t, scope.Pool.QueryRow(t.Context(), `
            select source, operation_key, actor_user_id::text, quantity
              from usage_events
             where organization_id = $1 and source = 'project_image_variant'
             order by created_at desc
             limit 1`, scope.OrganizationID).Scan(&source, &operationKey, &actor, &quantity))
		require.Equal(t, "project_image_variant", source)
		require.Contains(t, operationKey, "editor-cat-image:")
		require.Equal(t, scope.UserID, actor)
		require.Equal(t, 15, quantity)
	})
}

func TestEditorCatImageEditValidationHTTP(t *testing.T) {
	api, scope := editorCatTestAPI(t, "translator")
	api.ai = &irisGenerationAPI{provider: &stubIrisProvider{outputs: []irisProviderOutput{{Bytes: []byte("png")}}}, meter: &stubIrisMeter{features: true, tokens: true}}
	api.objects = visualContextObjectRegistry(t)
	fileID := mustEditorCatSourceFile(t, scope, "hero.png")
	png := mustVisualContextPNG(t, 6, 6)
	storedID := mustEditorCatRepositoryImage(t, api, scope, fileID, "hero.png", png)
	mustEditorCatImageVariant(t, scope, fileID, "hero.png", "fr-FR", "draft", storedID)

	rec := editorCatMultipartScope(t, api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/images/edit"), map[string]string{
		"sourcePath": "hero.png", "targetLocale": "fr-FR", "kind": "markup",
	}, map[string][]byte{"image": png}, nil)
	requireEditorCatError(t, rec, http.StatusBadRequest, "invalid_project_payload")

	rec = editorCatMultipartScope(t, api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/images/edit"), map[string]string{
		"sourcePath": "hero.png", "targetLocale": "fr-FR", "kind": "erase",
	}, map[string][]byte{"image": png}, nil)
	requireEditorCatError(t, rec, http.StatusBadRequest, "image_edit_mask_required")

	rec = editorCatMultipartScope(t, api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/images/edit"), map[string]string{
		"sourcePath": "hero.png", "targetLocale": "fr-FR", "kind": "comment", "notes": "localise this", "noteReferences": "1",
	}, map[string][]byte{"image": png}, nil)
	requireEditorCatError(t, rec, http.StatusBadRequest, "invalid_project_payload")

	rec = editorCatMultipartScope(t, api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/images/edit"), map[string]string{
		"sourcePath": "hero.md", "targetLocale": "fr-FR", "kind": "markup", "instruction": "Brighten",
	}, map[string][]byte{"image": png}, nil)
	requireEditorCatError(t, rec, http.StatusBadRequest, "image_edit_unsupported")
}

func TestEditorCatImageRegenerateRejectsUnsupportedKindsAndMissingFiles(t *testing.T) {
	api, scope := editorCatTestAPI(t, "translator")
	meter := &stubIrisMeter{features: true, tokens: true}
	api.ai = &irisGenerationAPI{provider: &stubIrisProvider{}, meter: meter}

	rec := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/images/regenerate"),
		`{"sourcePath":"","targetLocale":"fr-FR"}`)
	requireEditorCatError(t, rec, http.StatusBadRequest, "invalid_project_payload")
	require.Empty(t, meter.tokenTracks)

	rec = editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/images/regenerate"),
		`{"sourcePath":"clip.mp4","targetLocale":"fr-FR"}`)
	requireEditorCatError(t, rec, http.StatusBadRequest, "localization_failed")
	require.Empty(t, meter.tokenTracks)

	rec = editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/images/regenerate"),
		`{"sourcePath":"hero.png","targetLocale":"fr-FR"}`)
	requireEditorCatError(t, rec, http.StatusBadRequest, "source_file_not_found")
	require.Empty(t, meter.tokenTracks)

	rec = editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/images/regenerate"),
		`{"sourcePath":"locales/en.json","targetLocale":"fr-FR"}`)
	requireEditorCatError(t, rec, http.StatusBadRequest, "external_string_id_required")
	require.Empty(t, meter.tokenTracks)

	missingKey := uuid.NewString()
	rec = editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/images/regenerate"),
		`{"sourcePath":"locales/en.json","targetLocale":"fr-FR","externalStringId":"`+missingKey+`"}`)
	requireEditorCatError(t, rec, http.StatusBadRequest, "translation_key_not_found")
	require.Empty(t, meter.tokenTracks)
}

func TestEditorCatImageUploadValidation(t *testing.T) {
	api, scope := editorCatTestAPI(t, "translator")
	api.objects = visualContextObjectRegistry(t)
	png := mustVisualContextPNG(t, 4, 4)

	rec := editorCatMultipartScope(t, api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/images/upload"), map[string]string{
		"sourcePath": "hero.png", "targetLocale": "fr-FR",
	}, nil, nil)
	requireEditorCatError(t, rec, http.StatusBadRequest, "invalid_project_payload")

	rec = editorCatMultipartScope(t, api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/images/upload"), map[string]string{
		"sourcePath": "hero.png", "targetLocale": "fr-FR",
	}, map[string][]byte{"file": {}}, nil)
	requireEditorCatError(t, rec, http.StatusRequestEntityTooLarge, "file_upload_too_large")

	rec = editorCatMultipartScope(t, api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/images/upload"), map[string]string{
		"sourcePath": "hero.png", "targetLocale": "fr-FR",
	}, map[string][]byte{"file": png}, nil)
	requireEditorCatError(t, rec, http.StatusBadRequest, "source_file_not_found")

	rec = editorCatMultipartScope(t, api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/images/upload"), map[string]string{
		"sourcePath": "locales/en.json", "targetLocale": "fr-FR",
	}, map[string][]byte{"file": png}, nil)
	requireEditorCatError(t, rec, http.StatusBadRequest, "external_string_id_required")
}

func TestEditorCatImageUrlTranslationRegenerateFetchAndApprovedLock(t *testing.T) {
	api, scope := editorCatTestAPI(t, "translator")
	meter := &stubIrisMeter{features: true, tokens: true}
	api.ai = &irisGenerationAPI{provider: &stubIrisProvider{outputs: []irisProviderOutput{{Bytes: []byte("png")}}}, meter: meter}
	fileID := mustEditorCatSourceFile(t, scope, "locales/en.json")

	notFound := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	t.Cleanup(notFound.Close)
	missing := mustEditorCatKey(t, scope, fileID, "banner", notFound.URL+"/hero.png")
	rec := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/images/regenerate"),
		`{"sourcePath":"locales/en.json","targetLocale":"fr-FR","externalStringId":"`+missing+`"}`)
	requireEditorCatError(t, rec, http.StatusBadRequest, "fetch_failed")
	require.Empty(t, meter.tokenTracks)

	okServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "image/png")
		_, _ = w.Write([]byte("remote-png"))
	}))
	t.Cleanup(okServer.Close)
	approved := mustEditorCatKey(t, scope, fileID, "hero", okServer.URL+"/hero.png")
	mustEditorCatTranslation(t, scope, approved, "fr-FR", "https://cdn.example/old.png", "approved")
	rec = editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/images/regenerate"),
		`{"sourcePath":"locales/en.json","targetLocale":"fr-FR","externalStringId":"`+approved+`"}`)
	requireEditorCatError(t, rec, http.StatusBadRequest, "approved_locked")
	require.Empty(t, meter.tokenTracks)
}

func TestEditorCatFetchImageURL(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	// httptest servers listen on loopback, which the production client refuses,
	// so response-handling cases use a plain client.
	client := &http.Client{}

	_, _, _, err := editorCatFetchImageURLWithClient(ctx, client, "not-a-url")
	require.ErrorContains(t, err, "fetch_failed")

	_, _, _, err = editorCatFetchImageURLWithClient(ctx, client, "https://example.com/readme.txt")
	require.ErrorContains(t, err, "fetch_failed")

	missing := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	t.Cleanup(missing.Close)
	_, _, _, err = editorCatFetchImageURLWithClient(ctx, client, missing.URL+"/hero.png")
	require.ErrorContains(t, err, "fetch_failed")

	plain := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		_, _ = w.Write([]byte("nope"))
	}))
	t.Cleanup(plain.Close)
	_, _, _, err = editorCatFetchImageURLWithClient(ctx, client, plain.URL+"/hero.png")
	require.ErrorContains(t, err, "unsupported_image_response")

	empty := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "image/png")
	}))
	t.Cleanup(empty.Close)
	_, _, _, err = editorCatFetchImageURLWithClient(ctx, client, empty.URL+"/hero.png")
	require.ErrorContains(t, err, "unsupported_image_response")

	ok := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "image/png")
		_, _ = io.WriteString(w, "png-bytes")
	}))
	t.Cleanup(ok.Close)
	raw, contentType, filename, err := editorCatFetchImageURLWithClient(ctx, client, ok.URL+"/folder/hero.png")
	require.NoError(t, err)
	require.Equal(t, []byte("png-bytes"), raw)
	require.Equal(t, "image/png", contentType)
	require.Equal(t, "hero.png", filename)
}

func TestEditorCatFetchImageURLRefusesNonPublicTargets(t *testing.T) {
	t.Parallel()
	ctx := context.Background()

	var hits atomic.Int32
	internal := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		hits.Add(1)
		w.Header().Set("Content-Type", "image/png")
		_, _ = io.WriteString(w, "internal-bytes")
	}))
	t.Cleanup(internal.Close)
	port := internal.URL[strings.LastIndex(internal.URL, ":")+1:]

	for _, target := range []string{
		internal.URL + "/hero.png",
		"http://127.0.0.1:" + port + "/hero.png",
		"http://localhost:" + port + "/hero.png",
		"http://[::1]:" + port + "/hero.png",
		"http://169.254.169.254/latest/meta-data/hero.png",
		"http://10.0.0.1/hero.png",
	} {
		_, _, _, err := editorCatFetchImageURL(ctx, target)
		require.ErrorContains(t, err, "fetch_failed", target)
	}
	require.Zero(t, hits.Load(), "loopback server must never be reached")
}

func TestEditorCatFetchImageURLRefusesRedirectToNonPublicTargets(t *testing.T) {
	t.Parallel()
	ctx := context.Background()

	var internalHits atomic.Int32
	internal := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		internalHits.Add(1)
		w.Header().Set("Content-Type", "image/png")
		_, _ = io.WriteString(w, "internal-bytes")
	}))
	t.Cleanup(internal.Close)

	for _, location := range []string{
		"http://169.254.169.254/latest/meta-data/iam/security-credentials/",
		internal.URL + "/hero.png",
		"file:///etc/passwd",
	} {
		redirector := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			http.Redirect(w, r, location, http.StatusFound)
		}))
		t.Cleanup(redirector.Close)

		// Keep the production redirect policy but allow dialing the loopback
		// redirector, standing in for a public host that 302s internally.
		client := editorCatPublicImageFetchClient()
		client.Transport = &http.Transport{}
		_, _, _, err := editorCatFetchImageURLWithClient(ctx, client, redirector.URL+"/hero.png")
		require.ErrorContains(t, err, "fetch_failed", location)
	}
	require.Zero(t, internalHits.Load(), "redirect target must never be reached")
}

func TestEditorCatPublicImageFetchClientRedirectPolicy(t *testing.T) {
	t.Parallel()
	client := editorCatPublicImageFetchClient()
	mustReq := func(raw string) *http.Request {
		req, err := http.NewRequest(http.MethodGet, raw, nil)
		require.NoError(t, err)
		return req
	}
	require.NoError(t, client.CheckRedirect(mustReq("https://cdn.example.com/hero.png"), nil))
	require.NoError(t, client.CheckRedirect(mustReq("http://cdn.example.com/hero.png"), nil))
	require.Error(t, client.CheckRedirect(mustReq("http://169.254.169.254/latest/meta-data/"), nil))
	require.Error(t, client.CheckRedirect(mustReq("http://127.0.0.1/hero.png"), nil))
	require.Error(t, client.CheckRedirect(mustReq("http://localhost/hero.png"), nil))
	require.Error(t, client.CheckRedirect(mustReq("http://user:pass@cdn.example.com/hero.png"), nil))
	via := []*http.Request{{}, {}, {}}
	require.Error(t, client.CheckRedirect(mustReq("https://cdn.example.com/hero.png"), via))
}

func TestEditorCatLocalizedImageFilename(t *testing.T) {
	t.Parallel()
	require.Equal(t, "hero-fr--.png", editorCatLocalizedImageFilename("hero.png", "fr-FR", "image/png"))
	require.Equal(t, "image-ja.webp", editorCatLocalizedImageFilename("", "ja", "image/webp"))
	require.Equal(t, "banner-localized.jpg", editorCatLocalizedImageFilename("banner", "", "image/jpeg"))
}

func TestFileBackedCatSegmentIDs(t *testing.T) {
	t.Parallel()
	require.Equal(t, []string{
		"file-1", "binary:hero.png", "image:hero.png", "video:hero.png",
	}, fileBackedCatSegmentIDs("file-1", "hero.png"))
	require.Equal(t, []string{
		"binary:hero.png", "image:hero.png", "video:hero.png",
	}, fileBackedCatSegmentIDs("", "hero.png"))
}
