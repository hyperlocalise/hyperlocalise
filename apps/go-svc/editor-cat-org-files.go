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
	"mime/multipart"
	"net/http"
	"net/url"
	"path"
	"strings"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/internal/objectstore"
	"github.com/jackc/pgx/v5"
)

const (
	orgEditorImageUploadMaxBytes   = 10 << 20
	orgEditorImageUploadMaxRequest = orgEditorImageUploadMaxBytes + (64 << 10)
)

var orgEditorImageContentTypes = map[string]struct{}{
	"image/png":  {},
	"image/jpeg": {},
	"image/webp": {},
}

// Editor images embedded in markdown documents (web and Iris).
func (api *editorCatAPI) registerOrgEditorFiles(mux *http.ServeMux, verifier SessionVerifier) {
	postPattern := "POST " + orgRoutePrefix + "/files"
	getPattern := "GET " + orgRoutePrefix + "/files/{fileId}"
	registerAuthenticated(mux, verifier, postPattern, http.HandlerFunc(api.postOrgEditorFile))
	registerAuthenticated(mux, verifier, getPattern, http.HandlerFunc(api.serveOrgEditorFile))
}

func orgEditorFilePath(organizationSlug, fileID string) string {
	return "/api/orgs/" + url.PathEscape(organizationSlug) + "/files/" + url.PathEscape(fileID)
}

func (api *editorCatAPI) postOrgEditorFile(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if denyBrowserMutation(r) {
		writeEditorCatError(w, r, "origin_guard", editorCatFailure(403, "forbidden", "Cross-origin request denied"))
		return
	}
	if api.pool == nil || api.objects == nil {
		writeEditorCatError(w, r, "availability", editorCatFailure(503, "editor_unavailable", "Editor service unavailable"))
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), editorCatRequestTimeout)
	defer cancel()
	r = r.WithContext(ctx)

	claims, ok := ctx.Value(authContextKey{}).(AuthClaims)
	if !ok {
		writeEditorCatError(w, r, "auth", editorCatFailure(401, "unauthorized", "Authentication required"))
		return
	}

	slug := r.PathValue("organizationSlug")
	actor, err := api.actorFor(ctx, claims, slug, false)
	if err != nil {
		writeEditorCatError(w, r, "resolve_actor", err)
		return
	}
	if !actor.canRead() {
		writeEditorCatError(w, r, "forbidden", editorCatFailure(403, "forbidden", "Insufficient permissions"))
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, orgEditorImageUploadMaxRequest)
	if err := r.ParseMultipartForm(orgEditorImageUploadMaxRequest); err != nil {
		if errors.Is(err, multipart.ErrMessageTooLarge) || strings.Contains(err.Error(), "too large") {
			writeEditorCatError(w, r, "size", editorCatFailure(413, "file_upload_too_large", "File upload is too large"))
			return
		}
		writeEditorCatError(w, r, "multipart", editorCatFailure(400, "invalid_upload_payload", "Invalid upload payload"))
		return
	}

	fileHeaders := r.MultipartForm.File["file"]
	if len(fileHeaders) == 0 {
		writeEditorCatError(w, r, "file", editorCatFailure(400, "file_required", "An image file is required."))
		return
	}
	content, filename, contentType, err := readOrgEditorImageUpload(fileHeaders[0])
	if err != nil {
		writeEditorCatError(w, r, "upload", err)
		return
	}

	var projectID *string
	if raw := strings.TrimSpace(editorCatFormValue(r.MultipartForm.Value, "projectId")); raw != "" {
		project, err := api.ownedProject(ctx, actor, raw)
		if err != nil {
			writeEditorCatError(w, r, "project", err)
			return
		}
		projectID = &project.ID
	}

	storedID, _, err := api.insertOrgEditorStoredFile(ctx, actor, projectID, filename, content, contentType)
	if err != nil {
		writeEditorCatError(w, r, "store", err)
		return
	}

	editorJSON(ctx, w, http.StatusCreated, map[string]any{
		"file": map[string]any{
			"id":          storedID,
			"url":         orgEditorFilePath(actor.organizationSlug, storedID),
			"filename":    filename,
			"contentType": contentType,
			"byteSize":    len(content),
		},
	})
}

func readOrgEditorImageUpload(header *multipart.FileHeader) (content []byte, filename, contentType string, err error) {
	file, err := header.Open()
	if err != nil {
		return nil, "", "", err
	}
	defer func() { _ = file.Close() }()
	content, err = io.ReadAll(io.LimitReader(file, orgEditorImageUploadMaxBytes+1))
	if err != nil {
		return nil, "", "", err
	}
	if len(content) == 0 || len(content) > orgEditorImageUploadMaxBytes {
		return nil, "", "", editorCatFailure(413, "file_upload_too_large", "File upload is too large")
	}
	filename = strings.TrimSpace(header.Filename)
	if filename == "" {
		filename = "image.png"
	}
	contentType = strings.ToLower(strings.TrimSpace(strings.Split(header.Header.Get("Content-Type"), ";")[0]))
	if contentType == "" {
		contentType = editorCatImageContentType(filename, "")
	}
	if _, ok := orgEditorImageContentTypes[contentType]; !ok {
		return nil, "", "", editorCatFailure(415, "unsupported_image_type", "Only PNG, JPEG, and WebP images are supported.")
	}
	return content, filename, contentType, nil
}

func (api *editorCatAPI) insertOrgEditorStoredFile(
	ctx context.Context,
	actor editorCatActor,
	projectID *string,
	filename string,
	content []byte,
	contentType string,
) (string, string, error) {
	storedID := "file_" + uuid.NewString()
	objectKey := fmt.Sprintf(
		"editor-uploads/%s/%s/%s",
		actor.organizationID,
		storedID,
		path.Base(filename),
	)
	ref, _, err := api.objects.Put(ctx, objectstore.PutInput{
		Key:         objectKey,
		Body:        bytes.NewReader(content),
		Size:        int64(len(content)),
		ContentType: contentType,
	})
	if err != nil {
		return "", "", err
	}
	sum := sha256.Sum256(content)
	metaJSON, _ := json.Marshal(map[string]any{"uploadSurface": "markdown_editor"})
	storageURL := fmt.Sprintf("object://%s/%s", ref.LocationID, ref.Key)
	var projectValue any
	if projectID != nil {
		projectValue = *projectID
	}
	_, err = api.pool.Exec(ctx, `
        insert into stored_files (
            id, organization_id, project_id, created_by_user_id, role, source_kind,
            storage_provider, storage_key, storage_url, filename, content_type, byte_size, sha256, metadata
        ) values ($1,$2,$3,$4,'asset','editor_upload',$5,$6,$7,$8,$9,$10,$11,$12::jsonb)`,
		storedID, actor.organizationID, projectValue, actor.userID,
		ref.LocationID, ref.Key, storageURL, filename, contentType, len(content), hex.EncodeToString(sum[:]), string(metaJSON),
	)
	if err != nil {
		return "", "", err
	}
	return storedID, storageURL, nil
}

func (api *editorCatAPI) serveOrgEditorFile(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if api.pool == nil {
		writeEditorCatError(w, r, "availability", editorCatFailure(503, "editor_unavailable", "Editor service unavailable"))
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), editorCatRequestTimeout)
	defer cancel()
	r = r.WithContext(ctx)

	claims, ok := ctx.Value(authContextKey{}).(AuthClaims)
	if !ok {
		writeEditorCatError(w, r, "auth", editorCatFailure(401, "unauthorized", "Authentication required"))
		return
	}

	fileID := strings.TrimSpace(r.PathValue("fileId"))
	if fileID == "" {
		writeEditorCatError(w, r, "param", editorCatFailure(404, "file_not_found", "File not found"))
		return
	}

	slug := r.PathValue("organizationSlug")
	actor, err := api.actorFor(ctx, claims, slug, false)
	if err != nil {
		writeEditorCatError(w, r, "resolve_actor", err)
		return
	}

	ok, err = api.mayReadOrgEditorFile(ctx, actor, fileID)
	if err != nil {
		writeEditorCatError(w, r, "access", err)
		return
	}
	if !ok {
		writeEditorCatError(w, r, "missing", editorCatFailure(404, "file_not_found", "File not found"))
		return
	}

	body, contentType, filename, err := api.readEditorCatStoredFile(ctx, actor.organizationID, fileID)
	if err != nil {
		writeEditorCatError(w, r, "read", err)
		return
	}

	isImage := strings.HasPrefix(strings.ToLower(contentType), "image/")
	w.Header().Set("Content-Type", contentType)
	disposition := "attachment"
	if isImage {
		disposition = "inline"
	}
	w.Header().Set("Content-Disposition", disposition+`; filename*=UTF-8''`+url.PathEscape(filename))
	w.Header().Set("Content-Security-Policy", "default-src 'none'; sandbox;")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	if !isImage {
		w.Header().Set("X-Download-Options", "noopen")
	}
	if isImage {
		w.Header().Set("Cache-Control", "private, max-age=60")
	} else {
		w.Header().Set("Cache-Control", "no-store")
	}
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
}

func (api *editorCatAPI) mayReadOrgEditorFile(ctx context.Context, actor editorCatActor, fileID string) (bool, error) {
	var createdBy *string
	var projectID *string
	var role string
	err := api.pool.QueryRow(ctx, `
        select created_by_user_id, project_id, role
        from stored_files
        where id=$1 and organization_id=$2
        limit 1`, fileID, actor.organizationID,
	).Scan(&createdBy, &projectID, &role)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if role != "asset" {
		return false, nil
	}
	if !actor.canRead() {
		return false, nil
	}
	if createdBy != nil && *createdBy == actor.userID {
		return true, nil
	}
	if projectID == nil || strings.TrimSpace(*projectID) == "" {
		return actor.canRead(), nil
	}
	_, err = api.ownedProject(ctx, actor, *projectID)
	if err != nil {
		var failure *editorCatError
		if errors.As(err, &failure) && failure.status == http.StatusNotFound {
			return false, nil
		}
		return false, err
	}
	return true, nil
}