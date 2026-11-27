package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"path"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/autumn"
	"github.com/hyperlocalise/hyperlocalise/internal/objectstore"
	"github.com/jackc/pgx/v5"
)

const (
	editorCatImageBodyLimit    = 32 << 20
	editorCatMaxImageFetchSize = 25 << 20
)

type editorCatImageRegenerateBody struct {
	SourcePath       string  `json:"sourcePath"`
	TargetLocale     string  `json:"targetLocale"`
	ExternalStringID *string `json:"externalStringId"`
	Instructions     *string `json:"instructions"`
	Force            *bool   `json:"force"`
}

func editorCatVariantBoundToOtherSourceFile(boundFileID, requestedFileID string) bool {
	bound := strings.TrimSpace(boundFileID)
	requested := strings.TrimSpace(requestedFileID)
	return bound != "" && requested != "" && bound != requested
}

func editorCatVariantBranchConflict() error {
	return editorCatFailure(http.StatusConflict, "variant_branch_conflict", "This localized file belongs to another version branch.")
}

func fileBackedCatSegmentIDs(sourceFileID, sourcePath string) []string {
	ids := []string{"binary:" + sourcePath, "image:" + sourcePath, "video:" + sourcePath}
	if sourceFileID != "" {
		ids = append([]string{sourceFileID}, ids...)
	}
	return ids
}

func (api *editorCatAPI) regenerateImage(r *http.Request, actor editorCatActor, project editorCatProject) (any, int, error) {
	if err := requireNativeEditorCat(project); err != nil {
		return nil, 0, err
	}
	if !actor.canEdit() {
		return nil, 0, editorCatFailure(403, "forbidden", "Insufficient permissions")
	}
	if err := api.ensureEditorCatImageAI(r.Context(), actor.organizationID); err != nil {
		return nil, 0, err
	}
	var body editorCatImageRegenerateBody
	if err := readEditorCatJSON(r, &body); err != nil {
		return nil, 0, err
	}
	sourcePath := trimEditorCat(body.SourcePath)
	targetLocale := trimEditorCat(body.TargetLocale)
	if sourcePath == "" || len(sourcePath) > 2048 || targetLocale == "" || len(targetLocale) > 32 {
		return nil, 0, editorCatFailure(400, "invalid_project_payload", "Invalid CAT payload")
	}
	if body.Instructions != nil && len(*body.Instructions) > 16_384 {
		return nil, 0, editorCatFailure(400, "invalid_project_payload", "Invalid CAT payload")
	}
	if err := api.rejectProtectedBranchQuery(r, project.ID); err != nil {
		return nil, 0, err
	}
	force := body.Force != nil && *body.Force
	externalID := ""
	if body.ExternalStringID != nil {
		externalID = trimEditorCat(*body.ExternalStringID)
	}
	sourceFileID, _ := api.sourceFileID(r, actor, project, sourcePath)
	if err := api.rejectIfLocked(r, actor, project, targetLocale, fileBackedCatSegmentIDs(sourceFileID, sourcePath)); err != nil {
		return nil, 0, err
	}
	kind := editorCatSourceKind(sourcePath)
	switch kind {
	case editorCatKindImage:
		return api.regenerateFileBackedImageVariant(r, actor, project, sourcePath, targetLocale, sourceFileID, body.Instructions, force)
	case editorCatKindVideo, editorCatKindOffice, editorCatKindDocument:
		return nil, 0, editorCatFailure(400, "localization_failed", "File regeneration is not supported in go-svc for this file type")
	}
	if externalID == "" {
		return nil, 0, editorCatFailure(400, "external_string_id_required", "externalStringId is required for URL-backed image regeneration")
	}
	return api.regenerateImageUrlTranslation(r, actor, project, sourcePath, targetLocale, externalID, body.Instructions, force)
}

func (api *editorCatAPI) uploadImage(r *http.Request, actor editorCatActor, project editorCatProject) (any, int, error) {
	if err := requireNativeEditorCat(project); err != nil {
		return nil, 0, err
	}
	if !actor.canEdit() {
		return nil, 0, editorCatFailure(403, "forbidden", "Insufficient permissions")
	}
	if err := api.rejectProtectedBranchQuery(r, project.ID); err != nil {
		return nil, 0, err
	}
	form, err := api.readEditorCatMultipartForm(r)
	if err != nil {
		return nil, 0, err
	}
	sourcePath := trimEditorCat(editorCatFormValue(form.Value, "sourcePath"))
	targetLocale := trimEditorCat(editorCatFormValue(form.Value, "targetLocale"))
	externalID := trimEditorCat(editorCatFormValue(form.Value, "externalStringId"))
	force := editorCatFormTruthy(editorCatFormValue(form.Value, "force"))
	if sourcePath == "" || targetLocale == "" {
		return nil, 0, editorCatFailure(400, "invalid_project_payload", "Invalid CAT payload")
	}
	sourceFileID, _ := api.sourceFileID(r, actor, project, sourcePath)
	if err := api.rejectIfLocked(r, actor, project, targetLocale, fileBackedCatSegmentIDs(sourceFileID, sourcePath)); err != nil {
		return nil, 0, err
	}
	fileHeaders := form.File["file"]
	if len(fileHeaders) == 0 {
		return nil, 0, editorCatFailure(400, "invalid_project_payload", "Invalid CAT payload")
	}
	upload, err := fileHeaders[0].Open()
	if err != nil {
		return nil, 0, err
	}
	defer func() { _ = upload.Close() }()
	content, err := io.ReadAll(io.LimitReader(upload, editorCatImageBodyLimit+1))
	if err != nil {
		return nil, 0, err
	}
	if len(content) == 0 || len(content) > editorCatImageBodyLimit {
		return nil, 0, editorCatFailure(413, "file_upload_too_large", "File upload is too large")
	}
	filename := fileHeaders[0].Filename
	contentType := fileHeaders[0].Header.Get("Content-Type")
	kind := editorCatSourceKind(sourcePath)
	if isEditorCatWholeFile(sourcePath) {
		if sourceFileID == "" {
			return nil, 0, editorCatFailure(400, "source_file_not_found", "Source file not found for the given path")
		}
		switch kind {
		case editorCatKindImage:
			if contentType == "" || !strings.HasPrefix(contentType, "image/") {
				contentType = editorCatImageContentType(filename, sourcePath)
			}
			if !strings.HasPrefix(contentType, "image/") {
				return nil, 0, editorCatFailure(415, "unsupported_image_response", "Edits must be images")
			}
			return api.replaceImageVariantBytes(r, actor, project, sourcePath, targetLocale, sourceFileID, content, contentType, filename, force)
		case editorCatKindVideo:
			if contentType == "" {
				contentType = "video/mp4"
			}
			if contentType != "video/mp4" {
				return nil, 0, editorCatFailure(400, "unsupported_video_type", "Unsupported video type")
			}
			return api.replaceVideoVariantBytes(r, actor, project, sourcePath, targetLocale, sourceFileID, content, contentType, filename, force)
		case editorCatKindOffice, editorCatKindDocument:
			if contentType == "" {
				contentType = editorCatSourceContentType(filename, sourcePath)
			}
			return api.replaceImageVariantBytes(r, actor, project, sourcePath, targetLocale, sourceFileID, content, contentType, filename, force)
		default:
			return nil, 0, editorCatFailure(400, "unsupported_image_response", "File upload failed")
		}
	}
	if contentType == "" || !strings.HasPrefix(contentType, "image/") {
		contentType = editorCatImageContentType(filename, sourcePath)
	}
	if !strings.HasPrefix(contentType, "image/") {
		return nil, 0, editorCatFailure(415, "unsupported_image_response", "Edits must be images")
	}
	if externalID == "" {
		return nil, 0, editorCatFailure(400, "external_string_id_required", "externalStringId is required for URL-backed image upload")
	}
	return api.replaceImageUrlTranslationBytes(r, actor, project, targetLocale, externalID, content, contentType, filename, force)
}

func (api *editorCatAPI) editImage(r *http.Request, actor editorCatActor, project editorCatProject) (any, int, error) {
	if err := requireNativeEditorCat(project); err != nil {
		return nil, 0, err
	}
	if !actor.canEdit() {
		return nil, 0, editorCatFailure(403, "forbidden", "Insufficient permissions")
	}
	if err := api.ensureEditorCatImageAI(r.Context(), actor.organizationID); err != nil {
		return nil, 0, err
	}
	if err := api.rejectProtectedBranchQuery(r, project.ID); err != nil {
		return nil, 0, err
	}
	form, err := api.readEditorCatMultipartForm(r)
	if err != nil {
		return nil, 0, err
	}
	sourcePath := trimEditorCat(editorCatFormValue(form.Value, "sourcePath"))
	targetLocale := trimEditorCat(editorCatFormValue(form.Value, "targetLocale"))
	externalID := trimEditorCat(editorCatFormValue(form.Value, "externalStringId"))
	force := editorCatFormTruthy(editorCatFormValue(form.Value, "force"))
	if sourcePath == "" || targetLocale == "" {
		return nil, 0, editorCatFailure(400, "invalid_project_payload", "Invalid CAT payload")
	}
	if editorCatSourceKind(sourcePath) != editorCatKindImage {
		return nil, 0, editorCatFailure(400, "image_edit_unsupported", "Image editing is only available for image files.")
	}
	sourceFileID, err := api.sourceFileID(r, actor, project, sourcePath)
	if err != nil || sourceFileID == "" {
		return nil, 0, editorCatFailure(400, "source_file_not_found", "Source file not found for the given path")
	}
	if err := api.rejectIfLocked(r, actor, project, targetLocale, fileBackedCatSegmentIDs(sourceFileID, sourcePath)); err != nil {
		return nil, 0, err
	}
	request := editorCatImageEditRequest{
		Kind:           trimEditorCat(editorCatFormValue(form.Value, "kind")),
		Instruction:    strings.TrimSpace(editorCatFormValue(form.Value, "instruction")),
		Notes:          editorCatFormStrings(form.Value["notes"]),
		NoteReferences: editorCatFormInts(form.Value["noteReferences"]),
	}
	if err := validateEditorCatImageEditRequest(request); err != nil {
		return nil, 0, err
	}
	imageHeaders := form.File["image"]
	if len(imageHeaders) == 0 {
		return nil, 0, editorCatFailure(400, "invalid_project_payload", "Invalid CAT payload")
	}
	imageBytes, imageType, err := editorCatReadImageUpload(imageHeaders[0])
	if err != nil {
		return nil, 0, err
	}
	var maskBytes []byte
	if editorCatImageEditUsesMask(request.Kind) {
		maskHeaders := form.File["mask"]
		if len(maskHeaders) == 0 {
			return nil, 0, editorCatFailure(400, "image_edit_mask_required", "This edit needs a mask")
		}
		maskBytes, _, err = editorCatReadImageUpload(maskHeaders[0])
		if err != nil {
			return nil, 0, err
		}
	}
	referenceHeaders := form.File["references"]
	if editorCatImageEditReferenceCount(request) != len(referenceHeaders) {
		return nil, 0, editorCatFailure(400, "invalid_project_payload", "Invalid CAT payload")
	}
	references := make([][]byte, 0, len(referenceHeaders))
	for _, header := range referenceHeaders {
		refBytes, _, readErr := editorCatReadImageUpload(header)
		if readErr != nil {
			return nil, 0, readErr
		}
		references = append(references, refBytes)
	}
	_ = externalID
	variantStatus, storedFileID, boundFileID, err := api.editorCatImageVariantState(r, actor, project, sourcePath, targetLocale)
	if err != nil {
		return nil, 0, err
	}
	if storedFileID == "" {
		return nil, 0, editorCatFailure(400, "variant_not_found", "File variant not found")
	}
	if editorCatVariantBoundToOtherSourceFile(boundFileID, sourceFileID) {
		return nil, 0, editorCatVariantBranchConflict()
	}
	if variantStatus == "approved" && !force {
		return nil, 0, editorCatFailure(400, "approved_locked", "Approved variants cannot be changed without force")
	}
	edited, usage, err := api.runEditorCatImageEdit(r, actor, project, sourcePath, targetLocale, request, imageBytes, imageType, maskBytes, references)
	if err != nil {
		return nil, 0, err
	}
	return api.storeEditorCatImageVariantOutput(r, actor, project, sourcePath, targetLocale, sourceFileID, storedFileID, edited, request.Kind, "agent", usage)
}

func (api *editorCatAPI) ensureEditorCatImageAI(ctx context.Context, organizationID string) error {
	if api.ai == nil || api.ai.provider == nil {
		return editorCatFailure(503, "provider_unavailable", "Image AI is not configured (set AI_GATEWAY_API_KEY or OPENAI_API_KEY)")
	}
	if status, code, message, ok := api.ai.ensureAIAllowed(ctx, organizationID); !ok {
		return editorCatFailure(status, code, message)
	}
	return nil
}

func (api *editorCatAPI) readEditorCatMultipartForm(r *http.Request) (*multipart.Form, error) {
	if err := r.ParseMultipartForm(editorCatImageBodyLimit); err != nil {
		if errors.Is(err, multipart.ErrMessageTooLarge) || strings.Contains(err.Error(), "too large") {
			return nil, editorCatFailure(413, "file_upload_too_large", "File upload is too large")
		}
		return nil, editorCatFailure(400, "invalid_project_payload", "Invalid CAT payload")
	}
	return r.MultipartForm, nil
}

func editorCatFormValue(values map[string][]string, key string) string {
	if values == nil {
		return ""
	}
	entries := values[key]
	if len(entries) == 0 {
		return ""
	}
	return entries[0]
}

func editorCatFormTruthy(raw string) bool {
	raw = strings.TrimSpace(strings.ToLower(raw))
	return raw == "true" || raw == "1"
}

func editorCatFormStrings(values []string) []string {
	if len(values) > editorCatMaxImageEditNotes {
		values = values[:editorCatMaxImageEditNotes]
	}
	out := make([]string, 0, len(values))
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			out = append(out, trimmed)
		}
	}
	return out
}

func editorCatFormInts(values []string) []int {
	if len(values) > editorCatMaxImageEditNotes {
		values = values[:editorCatMaxImageEditNotes]
	}
	out := make([]int, 0, len(values))
	for _, value := range values {
		var parsed int
		if _, err := fmt.Sscanf(strings.TrimSpace(value), "%d", &parsed); err == nil {
			out = append(out, editorCatClampInt(parsed, 0, editorCatMaxImageEditReferences))
		}
	}
	return out
}

func editorCatReadImageUpload(header *multipart.FileHeader) ([]byte, string, error) {
	file, err := header.Open()
	if err != nil {
		return nil, "", err
	}
	defer func() { _ = file.Close() }()
	content, err := io.ReadAll(io.LimitReader(file, editorCatImageBodyLimit+1))
	if err != nil {
		return nil, "", err
	}
	if len(content) == 0 || len(content) > editorCatImageBodyLimit {
		return nil, "", editorCatFailure(413, "file_upload_too_large", "File upload is too large")
	}
	contentType := header.Header.Get("Content-Type")
	if contentType == "" || !strings.HasPrefix(contentType, "image/") {
		contentType = editorCatImageContentType(header.Filename, "")
	}
	if !strings.HasPrefix(contentType, "image/") {
		return nil, "", editorCatFailure(415, "unsupported_image_response", "Edits must be images")
	}
	return content, contentType, nil
}

func editorCatImageContentType(filename, sourcePath string) string {
	name := filename
	if name == "" {
		name = sourcePath
	}
	switch strings.ToLower(path.Ext(name)) {
	case ".png":
		return "image/png"
	case ".webp":
		return "image/webp"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	default:
		return "image/png"
	}
}

func editorCatSourceContentType(filename, sourcePath string) string {
	name := filename
	if name == "" {
		name = sourcePath
	}
	if byType := mime.TypeByExtension(strings.ToLower(path.Ext(name))); byType != "" {
		return byType
	}
	return "application/octet-stream"
}

func (api *editorCatAPI) replaceVideoVariantBytes(
	r *http.Request,
	actor editorCatActor,
	project editorCatProject,
	sourcePath, targetLocale, sourceFileID string,
	content []byte,
	contentType, filename string,
	force bool,
) (any, int, error) {
	if api.objects == nil {
		return nil, 0, editorCatFailure(503, "object_storage_unavailable", "Object storage is unavailable")
	}
	status, _, boundFileID, err := api.editorCatVideoVariantState(r, actor, project, sourcePath, targetLocale)
	if err != nil {
		return nil, 0, err
	}
	if editorCatVariantBoundToOtherSourceFile(boundFileID, sourceFileID) {
		return nil, 0, editorCatVariantBranchConflict()
	}
	if status == "approved" && !force {
		return nil, 0, editorCatFailure(400, "approved_locked", "Approved variants cannot be changed without force")
	}
	if err := api.ensureEditorCatVideoVariant(r, actor, project, sourcePath, targetLocale, sourceFileID); err != nil {
		return nil, 0, err
	}
	storedID, _, err := api.insertEditorCatStoredOutput(r, actor, project, filename, content, contentType, map[string]any{
		"videoLocalizationManualUpload": true,
		"sourcePath":                    sourcePath,
		"targetLocale":                  targetLocale,
	})
	if err != nil {
		return nil, 0, err
	}
	return api.updateEditorCatVideoVariantStored(r, actor, project, sourcePath, targetLocale, sourceFileID, storedID, "needs_review", "manual")
}

func (api *editorCatAPI) regenerateFileBackedImageVariant(
	r *http.Request,
	actor editorCatActor,
	project editorCatProject,
	sourcePath, targetLocale, sourceFileID string,
	instructions *string,
	force bool,
) (any, int, error) {
	if sourceFileID == "" {
		return nil, 0, editorCatFailure(400, "source_file_not_found", "Source file not found for the given path")
	}
	status, _, boundFileID, err := api.editorCatImageVariantState(r, actor, project, sourcePath, targetLocale)
	if err != nil {
		return nil, 0, err
	}
	if editorCatVariantBoundToOtherSourceFile(boundFileID, sourceFileID) {
		return nil, 0, editorCatVariantBranchConflict()
	}
	if status == "approved" && !force {
		return nil, 0, editorCatFailure(400, "approved_locked", "Approved variants cannot be changed without force")
	}
	sourceBytes, sourceType, sourceName, err := api.loadEditorCatRepositoryImageBytes(r, actor, project, sourceFileID)
	if err != nil {
		return nil, 0, err
	}
	promptExtra := ""
	if instructions != nil {
		promptExtra = strings.TrimSpace(*instructions)
	}
	output, usage, err := api.runEditorCatImageLocalise(r, actor, project, sourcePath, targetLocale, sourceBytes, sourceType, promptExtra)
	if err != nil {
		return nil, 0, err
	}
	filename := editorCatLocalizedImageFilename(sourceName, targetLocale, output.contentType)
	return api.persistEditorCatImageVariant(r, actor, project, sourcePath, targetLocale, sourceFileID, filename, output.bytes, output.contentType, "agent", usage)
}

func (api *editorCatAPI) regenerateImageUrlTranslation(
	r *http.Request,
	actor editorCatActor,
	project editorCatProject,
	_, targetLocale, translationKeyID string,
	instructions *string,
	force bool,
) (any, int, error) {
	var sourceText string
	var metadata []byte
	err := api.pool.QueryRow(r.Context(), `
        select source_text, metadata from project_translation_keys
        where id=$1 and organization_id=$2 and project_id=$3`,
		translationKeyID, actor.organizationID, project.ID,
	).Scan(&sourceText, &metadata)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, 0, editorCatFailure(400, "translation_key_not_found", "Translation key not found")
	}
	if err != nil {
		return nil, 0, err
	}
	var existingStatus string
	err = api.pool.QueryRow(r.Context(), `
        select status from project_translations
        where translation_key_id=$1 and target_locale=$2 limit 1`,
		translationKeyID, targetLocale,
	).Scan(&existingStatus)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return nil, 0, err
	}
	if existingStatus == "approved" && !force {
		return nil, 0, editorCatFailure(400, "approved_locked", "Approved variants cannot be changed without force")
	}
	imageBytes, contentType, filename, err := editorCatFetchImageURL(r.Context(), strings.TrimSpace(sourceText))
	if err != nil {
		return nil, 0, err
	}
	promptExtra := ""
	if instructions != nil {
		promptExtra = strings.TrimSpace(*instructions)
	}
	output, usage, err := api.runEditorCatImageLocalise(r, actor, project, translationKeyID, targetLocale, imageBytes, contentType, promptExtra)
	if err != nil {
		return nil, 0, err
	}
	outputFilename := editorCatLocalizedImageFilename(filename, targetLocale, output.contentType)
	storedID, assetURL, err := api.insertEditorCatStoredOutput(r, actor, project, outputFilename, output.bytes, output.contentType, map[string]any{
		"imageLocalizationOutput": true,
		"contentKind":             "image_url",
		"translationKeyId":        translationKeyID,
		"sourceUrl":               strings.TrimSpace(sourceText),
		"targetLocale":            targetLocale,
	})
	if err != nil {
		return nil, 0, err
	}
	api.chargeEditorCatImageVariant(r, actor, project, targetLocale, "project_image_url_translation", usage, map[string]any{
		"channel": "project", "project_id": project.ID, "target_locale": targetLocale,
	})
	translationID, status, err := api.upsertImageUrlTranslation(r, actor, project, translationKeyID, targetLocale, assetURL, storedID, metadata)
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{
		"translation": map[string]any{
			"text":                  assetURL,
			"externalTranslationId": translationID,
			"isApproved":            status == "approved",
			"contentKind":           "image_url",
			"targetAssetUrl":        assetURL,
			"status":                status,
		},
	}, http.StatusOK, nil
}

func (api *editorCatAPI) replaceImageVariantBytes(
	r *http.Request,
	actor editorCatActor,
	project editorCatProject,
	sourcePath, targetLocale, sourceFileID string,
	content []byte,
	contentType, filename string,
	force bool,
) (any, int, error) {
	if api.objects == nil {
		return nil, 0, editorCatFailure(503, "object_storage_unavailable", "Object storage is unavailable")
	}
	status, _, boundFileID, err := api.editorCatImageVariantState(r, actor, project, sourcePath, targetLocale)
	if err != nil {
		return nil, 0, err
	}
	if editorCatVariantBoundToOtherSourceFile(boundFileID, sourceFileID) {
		return nil, 0, editorCatVariantBranchConflict()
	}
	if status == "approved" && !force {
		return nil, 0, editorCatFailure(400, "approved_locked", "Approved variants cannot be changed without force")
	}
	if err := api.ensureEditorCatImageVariant(r, actor, project, sourcePath, targetLocale, sourceFileID); err != nil {
		return nil, 0, err
	}
	storedID, _, err := api.insertEditorCatStoredOutput(r, actor, project, filename, content, contentType, map[string]any{
		"imageLocalizationManualUpload": true,
		"sourcePath":                    sourcePath,
		"targetLocale":                  targetLocale,
	})
	if err != nil {
		return nil, 0, err
	}
	return api.updateEditorCatImageVariantStored(r, actor, project, sourcePath, targetLocale, sourceFileID, storedID, "needs_review", "manual")
}

func (api *editorCatAPI) replaceImageUrlTranslationBytes(
	r *http.Request,
	actor editorCatActor,
	project editorCatProject,
	targetLocale, translationKeyID string,
	content []byte,
	contentType, filename string,
	force bool,
) (any, int, error) {
	if api.objects == nil {
		return nil, 0, editorCatFailure(503, "object_storage_unavailable", "Object storage is unavailable")
	}
	var metadata []byte
	err := api.pool.QueryRow(r.Context(), `
        select metadata from project_translation_keys
        where id=$1 and organization_id=$2 and project_id=$3`,
		translationKeyID, actor.organizationID, project.ID,
	).Scan(&metadata)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, 0, editorCatFailure(400, "translation_key_not_found", "Translation key not found")
	}
	if err != nil {
		return nil, 0, err
	}
	var existingStatus string
	err = api.pool.QueryRow(r.Context(), `
        select status from project_translations
        where translation_key_id=$1 and target_locale=$2 limit 1`,
		translationKeyID, targetLocale,
	).Scan(&existingStatus)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return nil, 0, err
	}
	if existingStatus == "approved" && !force {
		return nil, 0, editorCatFailure(400, "approved_locked", "Approved variants cannot be changed without force")
	}
	storedID, assetURL, err := api.insertEditorCatStoredOutput(r, actor, project, filename, content, contentType, map[string]any{
		"imageLocalizationManualUpload": true,
		"contentKind":                   "image_url",
		"translationKeyId":              translationKeyID,
		"targetLocale":                  targetLocale,
	})
	if err != nil {
		return nil, 0, err
	}
	translationID, status, err := api.upsertImageUrlTranslation(r, actor, project, translationKeyID, targetLocale, assetURL, storedID, metadata)
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{
		"translation": map[string]any{
			"text":                  assetURL,
			"externalTranslationId": translationID,
			"isApproved":            status == "approved",
			"contentKind":           "image_url",
			"targetAssetUrl":        assetURL,
			"status":                status,
		},
	}, http.StatusOK, nil
}

type editorCatImageOutput struct {
	bytes       []byte
	contentType string
}

func (api *editorCatAPI) runEditorCatImageLocalise(
	r *http.Request,
	actor editorCatActor,
	project editorCatProject,
	sourcePath, targetLocale string,
	sourceBytes []byte,
	sourceType, instructions string,
) (editorCatImageOutput, []irisTokenUsage, error) {
	model, ok := irisModelByID("image-localise")
	if !ok {
		return editorCatImageOutput{}, nil, editorCatFailure(503, "provider_unavailable", "Image AI is not configured")
	}
	fields := irisGenerateRequest{"targetLocale": targetLocale}
	outputs, err := api.ai.provider.Generate(r.Context(), irisProviderRequest{
		Model:  model,
		Prompt: instructions,
		Inputs: []irisProviderInput{{Role: "image", Bytes: sourceBytes, ContentType: sourceType}},
		Fields: fields,
	})
	if err != nil {
		return editorCatImageOutput{}, nil, editorCatFailure(400, "localization_failed", "Image regeneration failed")
	}
	if len(outputs) == 0 || len(outputs[0].Bytes) == 0 {
		return editorCatImageOutput{}, nil, editorCatFailure(400, "localization_failed", "Image regeneration failed")
	}
	out := outputs[0]
	contentType := out.ContentType
	if contentType == "" {
		contentType = "image/png"
	}
	usage := out.Usage
	api.chargeEditorCatImageVariant(r, actor, project, targetLocale, "project_image_variant", usage, map[string]any{
		"channel": "project", "project_id": project.ID, "target_locale": targetLocale, "source_path": sourcePath,
	})
	return editorCatImageOutput{bytes: out.Bytes, contentType: contentType}, usage, nil
}

func (api *editorCatAPI) runEditorCatImageEdit(
	r *http.Request,
	actor editorCatActor,
	project editorCatProject,
	sourcePath, targetLocale string,
	request editorCatImageEditRequest,
	imageBytes []byte,
	imageType string,
	maskBytes []byte,
	references [][]byte,
) (editorCatImageOutput, []irisTokenUsage, error) {
	model, ok := irisModelByID("image-edit")
	if !ok {
		return editorCatImageOutput{}, nil, editorCatFailure(503, "provider_unavailable", "Image AI is not configured")
	}
	inputs := []irisProviderInput{{Role: "image", Bytes: imageBytes, ContentType: imageType}}
	if len(maskBytes) > 0 {
		inputs = append(inputs, irisProviderInput{Role: "mask", Bytes: maskBytes, ContentType: "image/png"})
	}
	for _, ref := range references {
		inputs = append(inputs, irisProviderInput{Role: "image", Bytes: ref, ContentType: "image/png"})
	}
	outputs, err := api.ai.provider.Generate(r.Context(), irisProviderRequest{
		Model:  model,
		Prompt: editorCatImageEditPrompt(request),
		Inputs: inputs,
	})
	if err != nil {
		return editorCatImageOutput{}, nil, editorCatFailure(400, "localization_failed", "Image edit failed")
	}
	if len(outputs) == 0 || len(outputs[0].Bytes) == 0 {
		return editorCatImageOutput{}, nil, editorCatFailure(400, "localization_failed", "Image edit failed")
	}
	out := outputs[0]
	contentType := out.ContentType
	if contentType == "" {
		contentType = "image/png"
	}
	usage := out.Usage
	api.chargeEditorCatImageVariant(r, actor, project, targetLocale, "project_image_variant", usage, map[string]any{
		"channel": "project", "project_id": project.ID, "target_locale": targetLocale,
		"source_path": sourcePath, "image_edit_kind": request.Kind,
	})
	return editorCatImageOutput{bytes: out.Bytes, contentType: contentType}, usage, nil
}

func (api *editorCatAPI) persistEditorCatImageVariant(
	r *http.Request,
	actor editorCatActor,
	project editorCatProject,
	sourcePath, targetLocale, sourceFileID, filename string,
	content []byte,
	contentType, provenance string,
	_ []irisTokenUsage,
) (any, int, error) {
	if err := api.ensureEditorCatImageVariant(r, actor, project, sourcePath, targetLocale, sourceFileID); err != nil {
		return nil, 0, err
	}
	storedID, _, err := api.insertEditorCatStoredOutput(r, actor, project, filename, content, contentType, map[string]any{
		"imageLocalizationOutput": true,
		"sourcePath":              sourcePath,
		"targetLocale":            targetLocale,
	})
	if err != nil {
		return nil, 0, err
	}
	return api.updateEditorCatImageVariantStored(r, actor, project, sourcePath, targetLocale, sourceFileID, storedID, "needs_review", provenance)
}

func (api *editorCatAPI) storeEditorCatImageVariantOutput(
	r *http.Request,
	actor editorCatActor,
	project editorCatProject,
	sourcePath, targetLocale, sourceFileID, previousStoredID string,
	edited editorCatImageOutput,
	editKind, provenance string,
	_ []irisTokenUsage,
) (any, int, error) {
	filename := editorCatLocalizedImageFilename(path.Base(sourcePath), targetLocale, edited.contentType)
	storedID, _, err := api.insertEditorCatStoredOutput(r, actor, project, filename, edited.bytes, edited.contentType, map[string]any{
		"imageLocalizationOutput": true,
		"imageEdit":               editKind,
		"previousStoredFileId":    previousStoredID,
		"sourcePath":              sourcePath,
		"targetLocale":            targetLocale,
	})
	if err != nil {
		return nil, 0, err
	}
	return api.updateEditorCatImageVariantStored(r, actor, project, sourcePath, targetLocale, sourceFileID, storedID, "needs_review", provenance)
}

func (api *editorCatAPI) updateEditorCatImageVariantStored(
	r *http.Request,
	actor editorCatActor,
	project editorCatProject,
	sourcePath, targetLocale, sourceFileID, storedFileID, status, provenance string,
) (any, int, error) {
	var id, variantStatus string
	err := api.pool.QueryRow(r.Context(), `
        update project_image_variants
        set stored_file_id=$5, status=$6, provenance=$7, reviewed_at=null, reviewed_by_user_id=null, updated_at=now()
        where organization_id=$1 and project_id=$2 and source_path=$3 and target_locale=$4
          and (
            $8 = ''
            or repository_source_file_id is null
            or repository_source_file_id = nullif($8, '')::uuid
          )
        returning id, status`,
		actor.organizationID, project.ID, sourcePath, targetLocale, storedFileID, status, provenance, strings.TrimSpace(sourceFileID),
	).Scan(&id, &variantStatus)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, 0, editorCatFailure(400, "variant_not_found", "File variant not found")
	}
	if err != nil {
		return nil, 0, err
	}
	return editorCatImageVariantResponse(actor, project, id, variantStatus, storedFileID), http.StatusOK, nil
}

func editorCatImageVariantResponse(actor editorCatActor, project editorCatProject, id, status, storedFileID string) map[string]any {
	asset := editorCatAssetPath(actor.organizationSlug, project.ID, storedFileID)
	return map[string]any{
		"imageVariant": map[string]any{
			"id":             id,
			"status":         status,
			"targetAssetUrl": asset,
			"storedFileId":   storedFileID,
		},
	}
}

func (api *editorCatAPI) editorCatImageVariantState(
	r *http.Request,
	actor editorCatActor,
	project editorCatProject,
	sourcePath, targetLocale string,
) (status string, storedFileID string, boundSourceFileID string, err error) {
	var stored, bound *string
	err = api.pool.QueryRow(r.Context(), `
        select status, stored_file_id, repository_source_file_id::text from project_image_variants
        where organization_id=$1 and project_id=$2 and source_path=$3 and target_locale=$4`,
		actor.organizationID, project.ID, sourcePath, targetLocale,
	).Scan(&status, &stored, &bound)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", "", "", nil
	}
	if err != nil {
		return "", "", "", err
	}
	if stored != nil {
		storedFileID = *stored
	}
	if bound != nil {
		boundSourceFileID = *bound
	}
	return status, storedFileID, boundSourceFileID, nil
}

func (api *editorCatAPI) updateEditorCatVideoVariantStored(
	r *http.Request,
	actor editorCatActor,
	project editorCatProject,
	sourcePath, targetLocale, sourceFileID, storedFileID, status, provenance string,
) (any, int, error) {
	var id, variantStatus string
	err := api.pool.QueryRow(r.Context(), `
        update project_video_variants
        set stored_file_id=$5, status=$6, provenance=$7, reviewed_at=null, reviewed_by_user_id=null, updated_at=now()
        where organization_id=$1 and project_id=$2 and source_path=$3 and target_locale=$4
          and (
            $8 = ''
            or repository_source_file_id is null
            or repository_source_file_id = nullif($8, '')::uuid
          )
        returning id, status`,
		actor.organizationID, project.ID, sourcePath, targetLocale, storedFileID, status, provenance, strings.TrimSpace(sourceFileID),
	).Scan(&id, &variantStatus)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, 0, editorCatFailure(400, "variant_not_found", "File variant not found")
	}
	if err != nil {
		return nil, 0, err
	}
	return editorCatVideoVariantResponse(actor, project, id, variantStatus, storedFileID), http.StatusOK, nil
}

func editorCatVideoVariantResponse(actor editorCatActor, project editorCatProject, id, status, storedFileID string) map[string]any {
	asset := editorCatAssetPath(actor.organizationSlug, project.ID, storedFileID)
	return map[string]any{
		"imageVariant": map[string]any{
			"id":             id,
			"status":         status,
			"targetAssetUrl": asset,
			"storedFileId":   storedFileID,
		},
	}
}

func (api *editorCatAPI) editorCatVideoVariantState(
	r *http.Request,
	actor editorCatActor,
	project editorCatProject,
	sourcePath, targetLocale string,
) (status, storedFileID, boundSourceFileID string, err error) {
	var statusValue, stored, bound *string
	err = api.pool.QueryRow(r.Context(), `
        select status, stored_file_id, repository_source_file_id::text
        from project_video_variants
        where organization_id=$1 and project_id=$2 and source_path=$3 and target_locale=$4
        limit 1`, actor.organizationID, project.ID, sourcePath, targetLocale,
	).Scan(&statusValue, &stored, &bound)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", "", "", nil
	}
	if err != nil {
		return "", "", "", err
	}
	if statusValue != nil {
		status = *statusValue
	}
	if stored != nil {
		storedFileID = *stored
	}
	if bound != nil {
		boundSourceFileID = *bound
	}
	return status, storedFileID, boundSourceFileID, nil
}

func (api *editorCatAPI) ensureEditorCatVideoVariant(
	r *http.Request,
	actor editorCatActor,
	project editorCatProject,
	sourcePath, targetLocale, sourceFileID string,
) error {
	_, err := api.pool.Exec(r.Context(), `
        insert into project_video_variants (
            organization_id, project_id, repository_source_file_id, source_path, target_locale, status, provenance
        ) values ($1,$2,$3,$4,$5,'draft','manual')
        on conflict (project_id, source_path, target_locale) do update
        set repository_source_file_id=coalesce(project_video_variants.repository_source_file_id, excluded.repository_source_file_id),
            updated_at=now()`,
		actor.organizationID, project.ID, sourceFileID, sourcePath, targetLocale,
	)
	return err
}

func (api *editorCatAPI) ensureEditorCatImageVariant(
	r *http.Request,
	actor editorCatActor,
	project editorCatProject,
	sourcePath, targetLocale, sourceFileID string,
) error {
	_, err := api.pool.Exec(r.Context(), `
        insert into project_image_variants (
            organization_id, project_id, repository_source_file_id, source_path, target_locale, status, provenance
        ) values ($1,$2,$3,$4,$5,'draft','manual')
        on conflict (project_id, source_path, target_locale) do update
        set repository_source_file_id=coalesce(project_image_variants.repository_source_file_id, excluded.repository_source_file_id),
            updated_at=now()`,
		actor.organizationID, project.ID, sourceFileID, sourcePath, targetLocale,
	)
	return err
}

func (api *editorCatAPI) loadEditorCatRepositoryImageBytes(
	r *http.Request,
	actor editorCatActor,
	project editorCatProject,
	sourceFileID string,
) ([]byte, string, string, error) {
	var storedFileID string
	err := api.pool.QueryRow(r.Context(), `
        select v.stored_file_id
        from repository_source_file_versions v
        where v.organization_id=$1 and v.project_id=$2 and v.repository_source_file_id=$3
        order by v.created_at desc, v.id desc limit 1`,
		actor.organizationID, project.ID, sourceFileID,
	).Scan(&storedFileID)
	if errors.Is(err, pgx.ErrNoRows) || strings.TrimSpace(storedFileID) == "" {
		return nil, "", "", editorCatFailure(400, "source_bytes_missing", "Source image bytes are missing")
	}
	if err != nil {
		return nil, "", "", err
	}
	return api.readEditorCatStoredFile(r.Context(), actor.organizationID, storedFileID)
}

func (api *editorCatAPI) readEditorCatStoredFile(ctx context.Context, organizationID, storedFileID string) ([]byte, string, string, error) {
	var location, key, filename, contentType string
	err := api.pool.QueryRow(ctx, `
        select storage_provider, storage_key, filename, content_type
        from stored_files where id=$1 and organization_id=$2`,
		storedFileID, organizationID,
	).Scan(&location, &key, &filename, &contentType)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, "", "", editorCatFailure(400, "source_bytes_missing", "Source image bytes are missing")
		}
		return nil, "", "", err
	}
	if api.objects == nil {
		return nil, "", "", editorCatFailure(503, "object_storage_unavailable", "Object storage is unavailable")
	}
	store, err := api.objects.Resolve(location)
	if err != nil {
		return nil, "", "", err
	}
	body, _, err := store.Get(ctx, key)
	if err != nil {
		return nil, "", "", editorCatFailure(400, "source_bytes_missing", "Source image bytes are missing")
	}
	defer func() { _ = body.Close() }()
	bytes, err := io.ReadAll(io.LimitReader(body, editorCatImageBodyLimit+1))
	if err != nil {
		return nil, "", "", err
	}
	if len(bytes) == 0 {
		return nil, "", "", editorCatFailure(400, "source_bytes_missing", "Source image bytes are missing")
	}
	if contentType == "" {
		contentType = editorCatImageContentType(filename, "")
	}
	return bytes, contentType, filename, nil
}

func (api *editorCatAPI) insertEditorCatStoredOutput(
	r *http.Request,
	actor editorCatActor,
	project editorCatProject,
	filename string,
	content []byte,
	contentType string,
	metadata map[string]any,
) (string, string, error) {
	if api.objects == nil {
		return "", "", editorCatFailure(503, "object_storage_unavailable", "Object storage is unavailable")
	}
	if contentType == "" {
		contentType = "image/png"
	}
	if filename == "" {
		filename = "image.png"
	}
	storedID := "file_" + uuid.NewString()
	location := api.objects.DefaultLocationID()
	objectKey := fmt.Sprintf("editor-cat-images/%s/%s/%s/%s", actor.organizationID, project.ID, storedID, path.Base(filename))
	ref, _, err := api.objects.Put(r.Context(), objectstore.PutInput{
		Key:         objectKey,
		Body:        bytes.NewReader(content),
		Size:        int64(len(content)),
		ContentType: contentType,
	})
	if err != nil {
		return "", "", err
	}
	sum := sha256.Sum256(content)
	metaJSON, _ := json.Marshal(metadata)
	storageURL := fmt.Sprintf("object://%s/%s", ref.LocationID, ref.Key)
	_, err = api.pool.Exec(r.Context(), `
        insert into stored_files (
            id, organization_id, project_id, created_by_user_id, role, source_kind,
            storage_provider, storage_key, storage_url, filename, content_type, byte_size, sha256, metadata
        ) values ($1,$2,$3,$4,'output','job_output',$5,$6,$7,$8,$9,$10,$11,$12::jsonb)`,
		storedID, actor.organizationID, project.ID, actor.userID,
		ref.LocationID, ref.Key, storageURL, filename, contentType, len(content), hex.EncodeToString(sum[:]), string(metaJSON),
	)
	if err != nil {
		return "", "", err
	}
	assetURL := editorCatAssetPath(actor.organizationSlug, project.ID, storedID)
	_ = location
	return storedID, assetURL, nil
}

func (api *editorCatAPI) upsertImageUrlTranslation(
	r *http.Request,
	actor editorCatActor,
	project editorCatProject,
	translationKeyID, targetLocale, assetURL, storedFileID string,
	keyMetadata []byte,
) (translationID, status string, err error) {
	metadata := map[string]any{}
	_ = json.Unmarshal(keyMetadata, &metadata)
	metadata["contentKind"] = "image_url"
	keyMetaJSON, _ := json.Marshal(metadata)
	_, err = api.pool.Exec(r.Context(), `
        update project_translation_keys set metadata=$4::jsonb, updated_at=now()
        where id=$1 and organization_id=$2 and project_id=$3`,
		translationKeyID, actor.organizationID, project.ID, string(keyMetaJSON),
	)
	if err != nil {
		return "", "", err
	}
	translationMeta, _ := json.Marshal(map[string]any{
		"contentKind":  "image_url",
		"storedFileId": storedFileID,
	})
	err = api.pool.QueryRow(r.Context(), `
        insert into project_translations (
            organization_id, project_id, translation_key_id, target_locale, text, status, provenance, origin, metadata
        ) values ($1,$2,$3,$4,$5,'needs_review','manual','human',$6::jsonb)
        on conflict (translation_key_id, target_locale) do update
        set text=excluded.text, status='needs_review', provenance='manual', origin='human',
            reviewed_at=null, reviewed_by_user_id=null, metadata=excluded.metadata, updated_at=now()
        returning id, status`,
		actor.organizationID, project.ID, translationKeyID, targetLocale, assetURL, string(translationMeta),
	).Scan(&translationID, &status)
	return translationID, status, err
}

const (
	editorCatImageFetchTimeout      = 30 * time.Second
	editorCatImageFetchMaxRedirects = 3
)

// editorCatImageFetchClient fetches user-supplied image URLs. Source strings are
// editable by org members, so every hop must resolve to a public address:
// CheckRedirect re-validates each redirect target and dialPublicAddress pins the
// connection to a routable IP (blocks loopback, link-local metadata, and VPC).
var editorCatImageFetchClient = editorCatPublicImageFetchClient()

func editorCatPublicImageFetchClient() *http.Client {
	return &http.Client{
		Timeout: editorCatImageFetchTimeout,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= editorCatImageFetchMaxRedirects {
				return fmt.Errorf("too many redirects")
			}
			return validatePublicHTTPURL(req.URL)
		},
		Transport: &http.Transport{
			Proxy:       nil,
			DialContext: dialPublicAddress,
		},
	}
}

func editorCatFetchImageURL(ctx context.Context, raw string) ([]byte, string, string, error) {
	return editorCatFetchImageURLWithClient(ctx, editorCatImageFetchClient, raw)
}

func editorCatFetchImageURLWithClient(ctx context.Context, client *http.Client, raw string) ([]byte, string, string, error) {
	raw = strings.TrimSpace(raw)
	if !looksLikeEditorCatImageURL(raw) {
		return nil, "", "", editorCatFailure(400, "fetch_failed", "image fetch failed")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, raw, nil)
	if err != nil {
		return nil, "", "", editorCatFailure(400, "fetch_failed", "image fetch failed")
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, "", "", editorCatFailure(400, "fetch_failed", "image fetch failed")
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode >= 400 {
		return nil, "", "", editorCatFailure(400, "fetch_failed", "image fetch failed")
	}
	content, err := io.ReadAll(io.LimitReader(resp.Body, editorCatMaxImageFetchSize+1))
	if err != nil || len(content) == 0 || len(content) > editorCatMaxImageFetchSize {
		return nil, "", "", editorCatFailure(400, "unsupported_image_response", "Edits must be images")
	}
	contentType := resp.Header.Get("Content-Type")
	if contentType == "" || !strings.HasPrefix(contentType, "image/") {
		return nil, "", "", editorCatFailure(400, "unsupported_image_response", "Edits must be images")
	}
	filename := path.Base(raw)
	if filename == "." || filename == "/" {
		filename = "image.png"
	}
	return content, contentType, filename, nil
}

var editorCatLocaleFilenamePattern = regexp.MustCompile(`[^a-z0-9._-]+`)

func editorCatLocalizedImageFilename(filename, targetLocale, contentType string) string {
	suffix := "-localized"
	if trimmed := strings.TrimSpace(targetLocale); trimmed != "" {
		suffix = "-" + strings.ToLower(editorCatLocaleFilenamePattern.ReplaceAllString(trimmed, "-"))
	}
	ext := editorCatImageOutputExt(contentType)
	if filename == "" {
		return "image" + suffix + "." + ext
	}
	dot := strings.LastIndex(filename, ".")
	if dot <= 0 {
		return filename + suffix + "." + ext
	}
	return filename[:dot] + suffix + "." + ext
}

func editorCatImageOutputExt(contentType string) string {
	switch {
	case strings.Contains(contentType, "webp"):
		return "webp"
	case strings.Contains(contentType, "jpeg"), strings.Contains(contentType, "jpg"):
		return "jpg"
	default:
		return "png"
	}
}

func (api *editorCatAPI) chargeEditorCatImageVariant(
	r *http.Request,
	actor editorCatActor,
	project editorCatProject,
	targetLocale, source string,
	usage []irisTokenUsage,
	dimensions map[string]any,
) {
	if api.ai == nil || api.ai.meter == nil {
		return
	}
	scope := irisOrgScope{OrganizationID: actor.organizationID, UserID: actor.userID, Role: actor.role}
	if len(usage) > 0 {
		for i, entry := range usage {
			api.ai.charge(r.Context(), scope, irisCharge{
				OperationKey: irisOperationKey("editor-cat-image") + fmt.Sprintf(":%d", i),
				Source:       source,
				Track: autumn.TrackTokensRequest{
					ModelID:      entry.Model,
					InputTokens:  entry.InputTokens,
					OutputTokens: entry.OutputTokens,
					Properties:   map[string]any{"feature": source, "user_id": actor.userID, "project_id": project.ID, "target_locale": targetLocale},
				},
				Dimensions: dimensions,
			})
		}
		return
	}
	model, ok := irisModelByID("image-localise")
	if !ok {
		return
	}
	credits := api.ai.creditModels()
	tokens, ok := irisSyntheticCredit(irisJobRecord{Model: model.ID, OrgID: actor.organizationID}, credits)
	if !ok {
		return
	}
	api.ai.charge(r.Context(), scope, irisCharge{
		OperationKey: irisOperationKey("editor-cat-image"),
		Source:       source,
		Track:        tokens,
		Units:        true,
		Dimensions:   dimensions,
	})
}
