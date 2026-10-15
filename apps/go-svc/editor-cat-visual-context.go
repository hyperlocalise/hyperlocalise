package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"image"
	"image/jpeg"
	"image/png"
	"io"
	"log/slog"
	"net/http"
	"path"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/internal/objectstore"
	"github.com/jackc/pgx/v5"
	"golang.org/x/image/webp"
)

const (
	visualContextUploadTTL      = 15 * time.Minute
	visualContextDownloadTTL    = time.Hour
	visualContextMaxBytes       = 10 * 1024 * 1024
	visualContextMaxFilenameLen = 255
	visualContextMaxNameRunes   = 256
	// Keep decoded allocation under ~100 MB (4 bytes/pixel) and within Textract's per-side cap.
	visualContextMaxImagePixels = 25_000_000
	visualContextMaxImageSide   = 10_000
	// Pending rows older than this can no longer receive an upload; they are
	// swept opportunistically because go-svc has no background scheduler.
	visualContextStaleUploadAge   = visualContextUploadTTL + 45*time.Minute
	visualContextStaleUploadBatch = 20
	visualContextMarkerEpsilon    = 1e-9
)

type editorCatVisualContextMarker struct {
	Left   float64 `json:"left"`
	Top    float64 `json:"top"`
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
}

type editorCatVisualContextLookupBody struct {
	SourcePath       string `json:"sourcePath"`
	ExternalStringID string `json:"externalStringId"`
}

type editorCatVisualContextUploadBody struct {
	Filename         string                        `json:"filename"`
	ContentType      string                        `json:"contentType"`
	ByteSize         int64                         `json:"byteSize"`
	Name             *string                       `json:"name"`
	Width            *int                          `json:"width"`
	Height           *int                          `json:"height"`
	SourcePath       *string                       `json:"sourcePath"`
	ExternalStringID *string                       `json:"externalStringId"`
	Marker           *editorCatVisualContextMarker `json:"marker"`
}

type editorCatVisualContextFinalizeBody struct {
	Name   *string                   `json:"name"`
	Width  *int                      `json:"width"`
	Height *int                      `json:"height"`
	Match  *visualContextMatchParams `json:"match"`
}

type editorCatVisualContextBindBody struct {
	SourcePath       string                        `json:"sourcePath"`
	ExternalStringID string                        `json:"externalStringId"`
	Marker           *editorCatVisualContextMarker `json:"marker"`
}

type editorCatVisualContextScreenshot struct {
	ID       string                         `json:"id"`
	Name     *string                        `json:"name"`
	ImageURL string                         `json:"imageUrl"`
	Width    *int                           `json:"width"`
	Height   *int                           `json:"height"`
	Markers  []editorCatVisualContextMarker `json:"markers"`
}

type editorCatVisualContextBinding struct {
	ID               string                        `json:"id"`
	ScreenshotID     string                        `json:"screenshotId"`
	ExternalStringID string                        `json:"externalStringId"`
	Marker           *editorCatVisualContextMarker `json:"marker"`
	Source           string                        `json:"source"`
}

func (api *editorCatAPI) loadVisualContext(r *http.Request, actor editorCatActor, project editorCatProject) (any, int, error) {
	if err := requireNativeEditorCat(project); err != nil {
		if catErr, ok := err.(*editorCatError); ok && catErr.code == "provider_cat_deferred" {
			return nil, 0, editorCatVercelDeferred(
				"visual_context_deferred",
				"Visual Context for connected TMS projects stays on the Hono route",
			)
		}
		return nil, 0, err
	}
	var body editorCatVisualContextLookupBody
	if err := readEditorCatJSON(r, &body); err != nil {
		return nil, 0, err
	}
	sourcePath := trimEditorCat(body.SourcePath)
	if sourcePath == "" || len(sourcePath) > 2048 {
		return nil, 0, editorCatFailure(400, "invalid_project_payload", "Invalid CAT payload")
	}
	keyID, err := api.requireTranslationKey(r, actor, project, sourcePath, body.ExternalStringID)
	if err != nil {
		return nil, 0, err
	}
	screenshots, err := api.listVisualContextScreenshots(r, actor, project, keyID)
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"visualContext": map[string]any{"screenshots": screenshots}}, http.StatusOK, nil
}

func (api *editorCatAPI) createVisualContextScreenshot(r *http.Request, actor editorCatActor, project editorCatProject) (any, int, error) {
	if err := requireNativeEditorCat(project); err != nil {
		return nil, 0, err
	}
	if !actor.canEdit() {
		return nil, 0, editorCatFailure(403, "forbidden", "Insufficient permissions")
	}
	if api.objects == nil {
		return nil, 0, editorCatFailure(503, "object_storage_unavailable", "Visual context object storage is unavailable")
	}
	var body editorCatVisualContextUploadBody
	if err := readEditorCatJSON(r, &body); err != nil {
		return nil, 0, err
	}
	filename, contentType, err := normalizeVisualContextUpload(body.Filename, body.ContentType)
	if err != nil {
		return nil, 0, err
	}
	if body.ByteSize <= 0 || body.ByteSize > visualContextMaxBytes {
		return nil, 0, editorCatFailure(413, "visual_context_upload_too_large", "Screenshots must be between 1 byte and 10 MB")
	}
	if err := validateVisualContextDimensions(body.Width, body.Height); err != nil {
		return nil, 0, err
	}
	name := optionalTrimmedVisualContextName(body.Name)
	sourcePath := optionalTrimmedVisualContext(body.SourcePath)
	externalStringID := optionalTrimmedVisualContext(body.ExternalStringID)
	if (sourcePath == "") != (externalStringID == "") {
		return nil, 0, editorCatFailure(400, "invalid_project_payload", "Screenshot string binding requires sourcePath and externalStringId")
	}
	if body.Marker != nil && sourcePath == "" {
		return nil, 0, editorCatFailure(400, "invalid_project_payload", "Screenshot markers require a string binding")
	}
	if err := validateVisualContextMarker(body.Marker); err != nil {
		return nil, 0, err
	}
	var keyID string
	if sourcePath != "" {
		keyID, err = api.requireTranslationKey(r, actor, project, sourcePath, externalStringID)
		if err != nil {
			return nil, 0, err
		}
	}
	api.sweepStaleVisualContextUploads(r, actor, project)
	location := api.objects.DefaultLocationID()
	signer, err := api.objects.Presigner(location)
	if err != nil {
		return nil, 0, editorCatFailure(503, "object_storage_signing_unavailable", "Visual context object storage signing is unavailable")
	}
	screenshotID := uuid.NewString()
	objectKey := fmt.Sprintf("visual-context/%s/%s/%s/%s", actor.organizationID, project.ID, screenshotID, filename)
	signed, err := signer.PresignUpload(r.Context(), objectstore.Upload{
		Key:           objectKey,
		ContentType:   contentType,
		ContentLength: body.ByteSize,
		IfAbsent:      true,
	}, visualContextUploadTTL)
	if err != nil {
		return nil, 0, err
	}
	tx, err := api.pool.Begin(r.Context())
	if err != nil {
		return nil, 0, err
	}
	defer func() { _ = tx.Rollback(r.Context()) }()
	_, err = tx.Exec(r.Context(), `
        insert into project_visual_context_screenshots (
            id, organization_id, project_id, name, filename, content_type,
            object_location, object_key, status, width, height, created_by_user_id
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,'upload_pending',$9,$10,$11)`,
		screenshotID, actor.organizationID, project.ID, name, filename, contentType,
		location, objectKey, body.Width, body.Height, actor.userID,
	)
	if err != nil {
		return nil, 0, err
	}
	var binding *editorCatVisualContextBinding
	if keyID != "" {
		binding, err = insertVisualContextBinding(r, tx, actor, project, screenshotID, keyID, body.Marker)
		if err != nil {
			return nil, 0, err
		}
	}
	if err = tx.Commit(r.Context()); err != nil {
		return nil, 0, err
	}
	return map[string]any{
		"screenshot": map[string]any{
			"id":     screenshotID,
			"name":   name,
			"status": "upload_pending",
		},
		"binding": binding,
		"upload": map[string]any{
			"url":       signed.URL,
			"method":    signed.Method,
			"headers":   signed.Headers,
			"expiresAt": signed.ExpiresAt,
		},
	}, http.StatusCreated, nil
}

func (api *editorCatAPI) finalizeVisualContextScreenshot(r *http.Request, actor editorCatActor, project editorCatProject) (any, int, error) {
	if err := requireNativeEditorCat(project); err != nil {
		return nil, 0, err
	}
	if !actor.canEdit() {
		return nil, 0, editorCatFailure(403, "forbidden", "Insufficient permissions")
	}
	if api.objects == nil {
		return nil, 0, editorCatFailure(503, "object_storage_unavailable", "Visual context object storage is unavailable")
	}
	screenshotID, err := parseEditorCatUUID(r.PathValue("screenshotId"))
	if err != nil {
		return nil, 0, err
	}
	var body editorCatVisualContextFinalizeBody
	if err := readEditorCatJSON(r, &body); err != nil {
		return nil, 0, err
	}
	if err := validateVisualContextDimensions(body.Width, body.Height); err != nil {
		return nil, 0, err
	}
	var match *resolvedVisualContextMatch
	if body.Match != nil {
		if api.matchPublisher == nil {
			return nil, 0, visualContextMatchingUnavailable()
		}
		resolved, resolveErr := api.resolveVisualContextMatch(r, actor, project, *body.Match)
		if resolveErr != nil {
			return nil, 0, resolveErr
		}
		match = &resolved
	}
	name := optionalTrimmedVisualContextName(body.Name)
	var location, key, filename, contentType string
	var storedName *string
	var width, height *int
	err = api.pool.QueryRow(r.Context(), `
        select object_location, object_key, filename, content_type, name, width, height
        from project_visual_context_screenshots
        where id=$1 and organization_id=$2 and project_id=$3 and status='upload_pending'`,
		screenshotID, actor.organizationID, project.ID,
	).Scan(&location, &key, &filename, &contentType, &storedName, &width, &height)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, 0, editorCatFailure(404, "visual_context_screenshot_not_found", "Visual context screenshot not found")
	}
	if err != nil {
		return nil, 0, err
	}
	store, err := api.objects.Resolve(location)
	if err != nil {
		return nil, 0, editorCatFailure(503, "object_storage_unavailable", "Visual context object storage is unavailable")
	}
	info, err := store.Stat(r.Context(), key)
	if err != nil {
		if errors.Is(err, objectstore.ErrNotFound) {
			return nil, 0, editorCatFailure(409, "visual_context_upload_missing", "The screenshot upload has not completed")
		}
		return nil, 0, err
	}
	if info.Size <= 0 || info.Size > visualContextMaxBytes {
		api.discardRejectedVisualContextUpload(r, actor, project, screenshotID, location, key)
		return nil, 0, editorCatFailure(413, "visual_context_upload_too_large", "The screenshot upload is empty or exceeds the 10 MB limit")
	}
	digest, err := hashVisualContextUpload(r, store, key, contentType)
	if errors.Is(err, errVisualContextInvalidImage) {
		api.discardRejectedVisualContextUpload(r, actor, project, screenshotID, location, key)
		return nil, 0, editorCatFailure(415, "visual_context_upload_invalid_image", "The uploaded file is not a valid PNG, JPEG, or WebP image")
	}
	if err != nil {
		if errors.Is(err, objectstore.ErrNotFound) {
			return nil, 0, editorCatFailure(409, "visual_context_upload_missing", "The screenshot upload has not completed")
		}
		return nil, 0, err
	}
	if name != nil {
		storedName = name
	}
	if body.Width != nil {
		width = body.Width
	}
	if body.Height != nil {
		height = body.Height
	}
	storedFileID := "file_" + uuid.NewString()
	storageURL := fmt.Sprintf("object://%s/%s", location, key)
	tx, err := api.pool.Begin(r.Context())
	if err != nil {
		return nil, 0, err
	}
	defer func() { _ = tx.Rollback(r.Context()) }()
	_, err = tx.Exec(r.Context(), `
        insert into stored_files (
            id, organization_id, project_id, created_by_user_id, role, source_kind,
            storage_provider, storage_key, storage_url, filename, content_type, byte_size, sha256
        ) values ($1,$2,$3,$4,'reference','editor_upload',$5,$6,$7,$8,$9,$10,$11)`,
		storedFileID, actor.organizationID, project.ID, actor.userID,
		location, key, storageURL, filename, contentType, int(info.Size), digest,
	)
	if err != nil {
		return nil, 0, err
	}
	tag, err := tx.Exec(r.Context(), `
        update project_visual_context_screenshots
        set stored_file_id=$2, name=$3, width=$4, height=$5, status='ready', updated_at=now()
        where id=$1 and status='upload_pending'`,
		screenshotID, storedFileID, storedName, width, height,
	)
	if err != nil {
		return nil, 0, err
	}
	if tag.RowsAffected() == 0 {
		return nil, 0, editorCatFailure(409, "visual_context_screenshot_not_pending", "The screenshot is no longer waiting for upload")
	}
	var process *editorCatVisualContextMatchProcess
	if match != nil {
		process, err = insertVisualContextMatchProcess(r, tx, actor, project, screenshotID, *match)
		if err != nil {
			return nil, 0, err
		}
	}
	if err = tx.Commit(r.Context()); err != nil {
		return nil, 0, err
	}
	if process != nil {
		api.enqueueVisualContextMatch(r, actor, project, process)
	}
	imageURL, err := api.signVisualContextDownload(r, location, key)
	if err != nil {
		return nil, 0, err
	}
	response := map[string]any{
		"screenshot": editorCatVisualContextScreenshot{
			ID:       screenshotID,
			Name:     storedName,
			ImageURL: imageURL,
			Width:    width,
			Height:   height,
			Markers:  []editorCatVisualContextMarker{},
		},
	}
	if process != nil {
		response["process"] = process
	}
	return response, http.StatusOK, nil
}

var errVisualContextInvalidImage = errors.New("visual context upload is not a supported image")

func hashVisualContextUpload(r *http.Request, store objectstore.Store, key, contentType string) (string, error) {
	body, _, err := store.Get(r.Context(), key)
	if err != nil {
		return "", err
	}
	defer func() { _ = body.Close() }()
	data, err := io.ReadAll(io.LimitReader(body, visualContextMaxBytes+1))
	if err != nil {
		return "", err
	}
	if len(data) > visualContextMaxBytes {
		return "", errVisualContextInvalidImage
	}
	if err := validateVisualContextImage(data, contentType); err != nil {
		return "", err
	}
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:]), nil
}

func validateVisualContextImage(data []byte, contentType string) error {
	cfg, err := decodeVisualContextConfig(data, contentType)
	if err != nil {
		return errVisualContextInvalidImage
	}
	return rejectVisualContextImageSize(cfg.Width, cfg.Height)
}

func decodeVisualContextConfig(data []byte, contentType string) (image.Config, error) {
	reader := bytes.NewReader(data)
	switch contentType {
	case "image/png":
		return png.DecodeConfig(reader)
	case "image/jpeg":
		return jpeg.DecodeConfig(reader)
	case "image/webp":
		return webp.DecodeConfig(reader)
	default:
		return image.Config{}, errVisualContextInvalidImage
	}
}

func rejectVisualContextImageSize(width, height int) error {
	if width <= 0 || height <= 0 || width > visualContextMaxImageSide || height > visualContextMaxImageSide {
		return errVisualContextInvalidImage
	}
	if int64(width)*int64(height) > visualContextMaxImagePixels {
		return errVisualContextInvalidImage
	}
	return nil
}

func (api *editorCatAPI) bindVisualContextScreenshot(r *http.Request, actor editorCatActor, project editorCatProject) (any, int, error) {
	if err := requireNativeEditorCat(project); err != nil {
		return nil, 0, err
	}
	if !actor.canEdit() {
		return nil, 0, editorCatFailure(403, "forbidden", "Insufficient permissions")
	}
	screenshotID, err := parseEditorCatUUID(r.PathValue("screenshotId"))
	if err != nil {
		return nil, 0, err
	}
	var body editorCatVisualContextBindBody
	if err := readEditorCatJSON(r, &body); err != nil {
		return nil, 0, err
	}
	sourcePath := trimEditorCat(body.SourcePath)
	if sourcePath == "" || len(sourcePath) > 2048 {
		return nil, 0, editorCatFailure(400, "invalid_project_payload", "Invalid CAT payload")
	}
	if err := validateVisualContextMarker(body.Marker); err != nil {
		return nil, 0, err
	}
	if err := api.requireVisualContextScreenshot(r, actor, project, screenshotID); err != nil {
		return nil, 0, err
	}
	keyID, err := api.requireTranslationKey(r, actor, project, sourcePath, body.ExternalStringID)
	if err != nil {
		return nil, 0, err
	}
	binding, err := insertVisualContextBinding(r, api.pool, actor, project, screenshotID, keyID, body.Marker)
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"binding": binding}, http.StatusOK, nil
}

func (api *editorCatAPI) unbindVisualContextScreenshot(r *http.Request, actor editorCatActor, project editorCatProject) (any, int, error) {
	if err := requireNativeEditorCat(project); err != nil {
		return nil, 0, err
	}
	if !actor.canEdit() {
		return nil, 0, editorCatFailure(403, "forbidden", "Insufficient permissions")
	}
	screenshotID, err := parseEditorCatUUID(r.PathValue("screenshotId"))
	if err != nil {
		return nil, 0, err
	}
	bindingID, err := parseEditorCatUUID(r.PathValue("bindingId"))
	if err != nil {
		return nil, 0, err
	}
	tag, err := api.pool.Exec(r.Context(), `
        delete from project_visual_context_bindings
        where id=$1 and screenshot_id=$2 and organization_id=$3 and project_id=$4`,
		bindingID, screenshotID, actor.organizationID, project.ID,
	)
	if err != nil {
		return nil, 0, err
	}
	if tag.RowsAffected() == 0 {
		return nil, 0, editorCatFailure(404, "visual_context_binding_not_found", "Visual context binding not found")
	}
	return nil, http.StatusNoContent, nil
}

func (api *editorCatAPI) deleteVisualContextScreenshot(r *http.Request, actor editorCatActor, project editorCatProject) (any, int, error) {
	if err := requireNativeEditorCat(project); err != nil {
		return nil, 0, err
	}
	if !actor.canEdit() {
		return nil, 0, editorCatFailure(403, "forbidden", "Insufficient permissions")
	}
	screenshotID, err := parseEditorCatUUID(r.PathValue("screenshotId"))
	if err != nil {
		return nil, 0, err
	}
	var location, key string
	var storedFileID *string
	err = api.pool.QueryRow(r.Context(), `
        select object_location, object_key, stored_file_id
        from project_visual_context_screenshots
        where id=$1 and organization_id=$2 and project_id=$3`,
		screenshotID, actor.organizationID, project.ID,
	).Scan(&location, &key, &storedFileID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, 0, editorCatFailure(404, "visual_context_screenshot_not_found", "Visual context screenshot not found")
	}
	if err != nil {
		return nil, 0, err
	}
	tx, err := api.pool.Begin(r.Context())
	if err != nil {
		return nil, 0, err
	}
	defer func() { _ = tx.Rollback(r.Context()) }()
	_, err = tx.Exec(r.Context(), `
        delete from project_visual_context_screenshots
        where id=$1 and organization_id=$2 and project_id=$3`,
		screenshotID, actor.organizationID, project.ID,
	)
	if err != nil {
		return nil, 0, err
	}
	if storedFileID != nil && trimEditorCat(*storedFileID) != "" {
		_, err = tx.Exec(r.Context(), `
            delete from stored_files
            where id=$1 and organization_id=$2 and project_id=$3`,
			*storedFileID, actor.organizationID, project.ID,
		)
		if err != nil {
			return nil, 0, err
		}
	}
	if err = tx.Commit(r.Context()); err != nil {
		return nil, 0, err
	}
	api.deleteVisualContextObject(r, location, key)
	return nil, http.StatusNoContent, nil
}

func (api *editorCatAPI) discardRejectedVisualContextUpload(r *http.Request, actor editorCatActor, project editorCatProject, screenshotID, location, key string) {
	_, _ = api.pool.Exec(r.Context(), `
        delete from project_visual_context_screenshots
        where id=$1 and organization_id=$2 and project_id=$3 and status='upload_pending'`,
		screenshotID, actor.organizationID, project.ID,
	)
	api.deleteVisualContextObject(r, location, key)
}

func (api *editorCatAPI) sweepStaleVisualContextUploads(r *http.Request, actor editorCatActor, project editorCatProject) {
	rows, err := api.pool.Query(r.Context(), `
        delete from project_visual_context_screenshots
        where id in (
            select id from project_visual_context_screenshots
            where organization_id=$1 and project_id=$2 and status='upload_pending'
              and created_at < now() - make_interval(secs => $3)
            order by created_at
            limit $4
        )
        returning object_location, object_key`,
		actor.organizationID, project.ID, visualContextStaleUploadAge.Seconds(), visualContextStaleUploadBatch,
	)
	if err != nil {
		slog.WarnContext(r.Context(), "visual_context_stale_upload_sweep_failed", "project_id", project.ID, "error", err)
		return
	}
	type staleObject struct{ location, key string }
	stale := make([]staleObject, 0)
	for rows.Next() {
		var object staleObject
		if err := rows.Scan(&object.location, &object.key); err != nil {
			rows.Close()
			slog.WarnContext(r.Context(), "visual_context_stale_upload_sweep_failed", "project_id", project.ID, "error", err)
			return
		}
		stale = append(stale, object)
	}
	rows.Close()
	for _, object := range stale {
		api.deleteVisualContextObject(r, object.location, object.key)
	}
}

func (api *editorCatAPI) deleteVisualContextObject(r *http.Request, location, key string) {
	if api.objects == nil {
		return
	}
	store, err := api.objects.Resolve(location)
	if err == nil {
		err = store.Delete(r.Context(), key)
	}
	if err != nil {
		slog.WarnContext(r.Context(), "visual_context_object_delete_failed", "object_location", location, "error", err)
	}
}

func (api *editorCatAPI) listVisualContextScreenshots(r *http.Request, actor editorCatActor, project editorCatProject, keyID string) ([]editorCatVisualContextScreenshot, error) {
	rows, err := api.pool.Query(r.Context(), `
        select s.id, s.name, s.object_location, s.object_key, s.width, s.height,
               b.marker_left, b.marker_top, b.marker_width, b.marker_height
        from project_visual_context_bindings b
        join project_visual_context_screenshots s on s.id = b.screenshot_id
        where b.organization_id=$1 and b.project_id=$2 and b.translation_key_id=$3
          and s.status='ready'
        order by s.created_at desc, s.id`,
		actor.organizationID, project.ID, keyID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	type pendingShot struct {
		id, location, key string
		name              *string
		width, height     *int
		marker            *editorCatVisualContextMarker
	}
	pending := make([]pendingShot, 0)
	for rows.Next() {
		var shot pendingShot
		var left, top, width, height *float64
		if err = rows.Scan(&shot.id, &shot.name, &shot.location, &shot.key, &shot.width, &shot.height, &left, &top, &width, &height); err != nil {
			return nil, err
		}
		shot.marker = visualContextMarkerFromColumns(left, top, width, height)
		pending = append(pending, shot)
	}
	if err = rows.Err(); err != nil {
		return nil, err
	}
	screenshots := make([]editorCatVisualContextScreenshot, 0, len(pending))
	for _, shot := range pending {
		imageURL, signErr := api.signVisualContextDownload(r, shot.location, shot.key)
		if signErr != nil {
			return nil, signErr
		}
		markers := []editorCatVisualContextMarker{}
		if shot.marker != nil {
			markers = []editorCatVisualContextMarker{*shot.marker}
		}
		screenshots = append(screenshots, editorCatVisualContextScreenshot{
			ID:       shot.id,
			Name:     shot.name,
			ImageURL: imageURL,
			Width:    shot.width,
			Height:   shot.height,
			Markers:  markers,
		})
	}
	return screenshots, nil
}

func visualContextMarkerFromColumns(left, top, width, height *float64) *editorCatVisualContextMarker {
	if left == nil || top == nil || width == nil || height == nil {
		return nil
	}
	return &editorCatVisualContextMarker{Left: *left, Top: *top, Width: *width, Height: *height}
}

func (api *editorCatAPI) requireVisualContextScreenshot(r *http.Request, actor editorCatActor, project editorCatProject, screenshotID string) error {
	var id string
	err := api.pool.QueryRow(r.Context(), `
        select id from project_visual_context_screenshots
        where id=$1 and organization_id=$2 and project_id=$3`,
		screenshotID, actor.organizationID, project.ID,
	).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return editorCatFailure(404, "visual_context_screenshot_not_found", "Visual context screenshot not found")
	}
	return err
}

func (api *editorCatAPI) signVisualContextDownload(r *http.Request, location, key string) (string, error) {
	if api.objects == nil {
		return "", editorCatFailure(503, "object_storage_unavailable", "Visual context object storage is unavailable")
	}
	signer, err := api.objects.Presigner(location)
	if err != nil {
		return "", editorCatFailure(503, "object_storage_signing_unavailable", "Visual context object storage signing is unavailable")
	}
	signed, err := signer.PresignDownload(r.Context(), key, visualContextDownloadTTL)
	if err != nil {
		return "", err
	}
	return signed.URL, nil
}

func insertVisualContextBinding(r *http.Request, db dictionaryDB, actor editorCatActor, project editorCatProject, screenshotID, keyID string, marker *editorCatVisualContextMarker) (*editorCatVisualContextBinding, error) {
	var left, top, width, height *float64
	if marker != nil {
		left, top, width, height = &marker.Left, &marker.Top, &marker.Width, &marker.Height
	}
	var bindingID string
	err := db.QueryRow(r.Context(), `
        insert into project_visual_context_bindings (
            organization_id, project_id, screenshot_id, translation_key_id,
            marker_left, marker_top, marker_width, marker_height, source, created_by_user_id
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,'manual',$9)
        on conflict (screenshot_id, translation_key_id) do update set
            marker_left=excluded.marker_left,
            marker_top=excluded.marker_top,
            marker_width=excluded.marker_width,
            marker_height=excluded.marker_height,
            source='manual',
            match_process_id=null,
            updated_at=now()
        returning id`,
		actor.organizationID, project.ID, screenshotID, keyID, left, top, width, height, actor.userID,
	).Scan(&bindingID)
	if err != nil {
		return nil, err
	}
	return &editorCatVisualContextBinding{
		ID:               bindingID,
		ScreenshotID:     screenshotID,
		ExternalStringID: keyID,
		Marker:           marker,
		Source:           "manual",
	}, nil
}

func normalizeVisualContextUpload(filename, contentType string) (string, string, error) {
	sanitized, err := sanitizeVisualContextFilename(filename)
	if err != nil {
		return "", "", err
	}
	normalizedType, err := normalizeVisualContextContentType(contentType, sanitized)
	if err != nil {
		return "", "", err
	}
	return sanitized, normalizedType, nil
}

func sanitizeVisualContextFilename(name string) (string, error) {
	cleaned := path.Base(strings.ReplaceAll(strings.TrimSpace(name), "\\", "/"))
	if cleaned == "" || cleaned == "." || cleaned == "/" {
		return "", editorCatFailure(400, "invalid_project_payload", "Invalid screenshot filename")
	}
	var builder strings.Builder
	for _, r := range cleaned {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '.' || r == '_' || r == '-' {
			builder.WriteRune(r)
			continue
		}
		builder.WriteByte('_')
	}
	out := strings.Trim(builder.String(), ".")
	if out == "" || !strings.Contains(out, ".") || len(out) > visualContextMaxFilenameLen {
		return "", editorCatFailure(400, "invalid_project_payload", "Invalid screenshot filename")
	}
	return out, nil
}

func normalizeVisualContextContentType(contentType, filename string) (string, error) {
	normalized := strings.ToLower(trimEditorCat(contentType))
	if normalized == "image/jpg" {
		normalized = "image/jpeg"
	}
	ext := strings.ToLower(path.Ext(filename))
	expected := ""
	switch ext {
	case ".png":
		expected = "image/png"
	case ".jpg", ".jpeg":
		expected = "image/jpeg"
	case ".webp":
		expected = "image/webp"
	default:
		return "", editorCatFailure(400, "invalid_project_payload", "Screenshots must be PNG, JPEG, or WebP")
	}
	if normalized != "" && normalized != expected {
		return "", editorCatFailure(400, "invalid_project_payload", "Screenshot content type does not match the filename")
	}
	return expected, nil
}

func validateVisualContextDimensions(width, height *int) error {
	if width != nil && *width <= 0 {
		return editorCatFailure(400, "invalid_project_payload", "Invalid screenshot width")
	}
	if height != nil && *height <= 0 {
		return editorCatFailure(400, "invalid_project_payload", "Invalid screenshot height")
	}
	if width != nil && *width > visualContextMaxImageSide {
		return editorCatFailure(400, "invalid_project_payload", "Invalid screenshot width")
	}
	if height != nil && *height > visualContextMaxImageSide {
		return editorCatFailure(400, "invalid_project_payload", "Invalid screenshot height")
	}
	if width != nil && height != nil && rejectVisualContextImageSize(*width, *height) != nil {
		return editorCatFailure(400, "invalid_project_payload", "Screenshot dimensions exceed the supported limit")
	}
	return nil
}

func validateVisualContextMarker(marker *editorCatVisualContextMarker) error {
	if marker == nil {
		return nil
	}
	if marker.Left < 0 || marker.Left > 100 || marker.Top < 0 || marker.Top > 100 ||
		marker.Width <= 0 || marker.Width > 100 || marker.Height <= 0 || marker.Height > 100 ||
		marker.Left+marker.Width > 100+visualContextMarkerEpsilon ||
		marker.Top+marker.Height > 100+visualContextMarkerEpsilon {
		return editorCatFailure(400, "invalid_project_payload", "Invalid screenshot marker")
	}
	return nil
}

func optionalTrimmedVisualContext(value *string) string {
	if value == nil {
		return ""
	}
	return trimEditorCat(*value)
}

func optionalTrimmedVisualContextName(value *string) *string {
	trimmed := truncateVisualContextRunes(optionalTrimmedVisualContext(value), visualContextMaxNameRunes)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func truncateVisualContextRunes(value string, limit int) string {
	if utf8.RuneCountInString(value) <= limit {
		return value
	}
	runes := []rune(value)
	return strings.TrimSpace(string(runes[:limit]))
}
