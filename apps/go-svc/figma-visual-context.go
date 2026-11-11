package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/internal/objectstore"
	"github.com/jackc/pgx/v5"
)

// The Figma plugin syncs a frame as CAT visual context. The web app authenticates the
// Figma connection, checks the project, then calls this route with the service token.
// One screenshot is kept per (project, Figma file, frame): a re-sync replaces it, with
// its bindings, so linguists always see the current design.

const (
	figmaVisualContextRequestTimeout = 60 * time.Second
	// A 10 MB image is about 13.4 MB as base64, plus bindings JSON.
	figmaVisualContextBodyLimit   = 15 << 20
	figmaVisualContextMaxBindings = 1000
	figmaVisualContextMaxIDLen    = 128
	figmaVisualContextMaxURLLen   = 2048
)

type figmaVisualContextBinding struct {
	TranslationKeyID string                        `json:"translationKeyId"`
	Marker           *editorCatVisualContextMarker `json:"marker"`
}

type figmaVisualContextSyncPayload struct {
	OrganizationID string                      `json:"organizationId"`
	ProjectID      string                      `json:"projectId"`
	FileKey        string                      `json:"fileKey"`
	NodeID         string                      `json:"nodeId"`
	Name           *string                     `json:"name"`
	FigmaURL       string                      `json:"figmaUrl"`
	ContentType    string                      `json:"contentType"`
	ImageBase64    string                      `json:"imageBase64"`
	Bindings       []figmaVisualContextBinding `json:"bindings"`
}

type figmaVisualContextSyncResult struct {
	ScreenshotID  string `json:"screenshotId"`
	BoundCount    int    `json:"boundCount"`
	ReplacedFrame bool   `json:"replacedFrame"`
}

func (api *editorCatAPI) registerInternal(mux *http.ServeMux) {
	mux.HandleFunc("POST /internal/figma/visual-context/sync", func(w http.ResponseWriter, r *http.Request) {
		if os.Getenv("WORKOS_COOKIE_PASSWORD") == "" {
			writeUnauthorized(w, "service authentication unavailable")
			return
		}
		if !requireServerCallToken(w, r) {
			return
		}
		api.syncFigmaVisualContext(w, r)
	})
}

func (api *editorCatAPI) syncFigmaVisualContext(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if api.pool == nil {
		writeEditorCatError(w, r, "availability", editorCatFailure(503, "editor_unavailable", "Editor service unavailable"))
		return
	}
	if api.objects == nil {
		writeEditorCatError(w, r, "availability", editorCatFailure(503, "object_storage_unavailable", "Visual context object storage is unavailable"))
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), figmaVisualContextRequestTimeout)
	defer cancel()
	r = r.WithContext(ctx)
	r.Body = http.MaxBytesReader(w, r.Body, figmaVisualContextBodyLimit)
	var payload figmaVisualContextSyncPayload
	if err := readEditorCatJSON(r, &payload); err != nil {
		writeEditorCatError(w, r, "decode", err)
		return
	}
	result, err := api.applyFigmaVisualContextSync(r, payload)
	if err != nil {
		writeEditorCatError(w, r, "handle", err)
		return
	}
	editorJSON(ctx, w, http.StatusOK, map[string]any{"visualContext": result})
}

func validateFigmaVisualContextPayload(payload *figmaVisualContextSyncPayload) ([]byte, error) {
	invalid := func(message string) error {
		return editorCatFailure(400, "invalid_figma_visual_context", message)
	}
	if _, err := uuid.Parse(payload.OrganizationID); err != nil {
		return nil, invalid("organizationId is invalid")
	}
	payload.ProjectID = normalizeDictionaryProjectID(payload.ProjectID)
	if payload.ProjectID == "" {
		return nil, invalid("projectId is required")
	}
	payload.FileKey = strings.TrimSpace(payload.FileKey)
	payload.NodeID = strings.TrimSpace(payload.NodeID)
	if payload.FileKey == "" || len(payload.FileKey) > figmaVisualContextMaxIDLen {
		return nil, invalid("fileKey is invalid")
	}
	if payload.NodeID == "" || len(payload.NodeID) > figmaVisualContextMaxIDLen {
		return nil, invalid("nodeId is invalid")
	}
	if err := validateFigmaDesignURL(payload.FigmaURL); err != nil {
		return nil, err
	}
	if payload.ContentType != "image/png" && payload.ContentType != "image/jpeg" {
		return nil, invalid("contentType must be image/png or image/jpeg")
	}
	if len(payload.Bindings) == 0 || len(payload.Bindings) > figmaVisualContextMaxBindings {
		return nil, invalid(fmt.Sprintf("bindings must contain 1 to %d keys", figmaVisualContextMaxBindings))
	}
	seen := make(map[string]struct{}, len(payload.Bindings))
	for i := range payload.Bindings {
		binding := &payload.Bindings[i]
		id, err := uuid.Parse(binding.TranslationKeyID)
		if err != nil {
			return nil, invalid("translationKeyId is invalid")
		}
		binding.TranslationKeyID = id.String()
		if _, dup := seen[binding.TranslationKeyID]; dup {
			return nil, invalid("translationKeyId is duplicated")
		}
		seen[binding.TranslationKeyID] = struct{}{}
		if err := validateVisualContextMarker(binding.Marker); err != nil {
			return nil, err
		}
	}
	data, err := base64.StdEncoding.DecodeString(payload.ImageBase64)
	if err != nil {
		return nil, invalid("imageBase64 is not valid base64")
	}
	if len(data) == 0 || len(data) > visualContextMaxBytes {
		return nil, editorCatFailure(413, "visual_context_upload_too_large", "Screenshots must be between 1 byte and 10 MB")
	}
	if err := validateVisualContextImage(data, payload.ContentType); err != nil {
		return nil, editorCatFailure(415, "visual_context_upload_invalid_image", "The frame image is not a valid PNG or JPEG within the size limits")
	}
	return data, nil
}

// validateFigmaDesignURL keeps the CAT "Open in Figma" link on figma.com.
func validateFigmaDesignURL(raw string) error {
	invalid := editorCatFailure(400, "invalid_figma_visual_context", "figmaUrl must be an https figma.com link")
	if raw == "" || len(raw) > figmaVisualContextMaxURLLen {
		return invalid
	}
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Scheme != "https" {
		return invalid
	}
	host := strings.ToLower(parsed.Hostname())
	if host != "figma.com" && !strings.HasSuffix(host, ".figma.com") {
		return invalid
	}
	return nil
}

func (api *editorCatAPI) applyFigmaVisualContextSync(r *http.Request, payload figmaVisualContextSyncPayload) (*figmaVisualContextSyncResult, error) {
	data, err := validateFigmaVisualContextPayload(&payload)
	if err != nil {
		return nil, err
	}
	ctx := r.Context()
	var source string
	err = api.pool.QueryRow(ctx, `select source from projects where id=$1 and organization_id=$2`,
		payload.ProjectID, payload.OrganizationID).Scan(&source)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, missingEditorCatProject()
	}
	if err != nil {
		return nil, err
	}
	if source != "native" {
		return nil, editorCatProviderDeferred()
	}
	keyIDs := make([]string, 0, len(payload.Bindings))
	for _, binding := range payload.Bindings {
		keyIDs = append(keyIDs, binding.TranslationKeyID)
	}
	var found int
	err = api.pool.QueryRow(ctx, `
        select count(*) from project_translation_keys
        where organization_id=$1 and project_id=$2 and id = any($3::uuid[])`,
		payload.OrganizationID, payload.ProjectID, keyIDs,
	).Scan(&found)
	if err != nil {
		return nil, err
	}
	if found != len(keyIDs) {
		return nil, editorCatFailure(404, "translation_key_not_found", "One or more keys are not in this project")
	}

	screenshotID := uuid.NewString()
	filename := "figma-frame.png"
	if payload.ContentType == "image/jpeg" {
		filename = "figma-frame.jpg"
	}
	objectKey := fmt.Sprintf("visual-context/%s/%s/%s/%s", payload.OrganizationID, payload.ProjectID, screenshotID, filename)
	ref, _, err := api.objects.Put(ctx, objectstore.PutInput{
		Key:         objectKey,
		Body:        bytes.NewReader(data),
		Size:        int64(len(data)),
		ContentType: payload.ContentType,
		IfAbsent:    true,
	})
	if err != nil {
		return nil, err
	}
	committed := false
	defer func() {
		if !committed {
			api.deleteVisualContextObject(r, ref.LocationID, ref.Key)
		}
	}()

	sum := sha256.Sum256(data)
	cfg, _ := decodeVisualContextConfig(data, payload.ContentType)
	name := optionalTrimmedVisualContextName(payload.Name)

	tx, err := api.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var previous struct {
		location, key string
		storedFileID  *string
	}
	replaced := true
	err = tx.QueryRow(ctx, `
        delete from project_visual_context_screenshots
        where organization_id=$1 and project_id=$2 and figma_file_key=$3 and figma_node_id=$4
        returning object_location, object_key, stored_file_id`,
		payload.OrganizationID, payload.ProjectID, payload.FileKey, payload.NodeID,
	).Scan(&previous.location, &previous.key, &previous.storedFileID)
	if errors.Is(err, pgx.ErrNoRows) {
		replaced = false
	} else if err != nil {
		return nil, err
	}
	if replaced && previous.storedFileID != nil && trimEditorCat(*previous.storedFileID) != "" {
		if _, err = tx.Exec(ctx, `delete from stored_files where id=$1 and organization_id=$2 and project_id=$3`,
			*previous.storedFileID, payload.OrganizationID, payload.ProjectID); err != nil {
			return nil, err
		}
	}

	storedFileID := "file_" + uuid.NewString()
	if _, err = tx.Exec(ctx, `
        insert into stored_files (
            id, organization_id, project_id, created_by_user_id, role, source_kind,
            storage_provider, storage_key, storage_url, filename, content_type, byte_size, sha256
        ) values ($1,$2,$3,null,'reference','editor_upload',$4,$5,$6,$7,$8,$9,$10)`,
		storedFileID, payload.OrganizationID, payload.ProjectID,
		ref.LocationID, ref.Key, fmt.Sprintf("object://%s/%s", ref.LocationID, ref.Key),
		filename, payload.ContentType, len(data), hex.EncodeToString(sum[:]),
	); err != nil {
		return nil, err
	}
	if _, err = tx.Exec(ctx, `
        insert into project_visual_context_screenshots (
            id, organization_id, project_id, stored_file_id, name, filename, content_type,
            object_location, object_key, status, width, height,
            figma_file_key, figma_node_id, figma_url
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'ready',$10,$11,$12,$13,$14)`,
		screenshotID, payload.OrganizationID, payload.ProjectID, storedFileID, name, filename,
		payload.ContentType, ref.LocationID, ref.Key, cfg.Width, cfg.Height,
		payload.FileKey, payload.NodeID, payload.FigmaURL,
	); err != nil {
		return nil, err
	}
	for _, binding := range payload.Bindings {
		var left, top, width, height *float64
		if binding.Marker != nil {
			left, top, width, height = &binding.Marker.Left, &binding.Marker.Top, &binding.Marker.Width, &binding.Marker.Height
		}
		if _, err = tx.Exec(ctx, `
            insert into project_visual_context_bindings (
                organization_id, project_id, screenshot_id, translation_key_id,
                marker_left, marker_top, marker_width, marker_height, source
            ) values ($1,$2,$3,$4,$5,$6,$7,$8,'manual')`,
			payload.OrganizationID, payload.ProjectID, screenshotID, binding.TranslationKeyID,
			left, top, width, height,
		); err != nil {
			return nil, err
		}
	}
	// Keep each key's design link on the frame it appears in, without overwriting a
	// link someone set to another tool.
	if _, err = tx.Exec(ctx, `
        update project_translation_keys
        set design_url=$4, updated_at=now()
        where organization_id=$1 and project_id=$2 and id = any($3::uuid[])
          and (design_url is null or design_url = '' or design_url ~* '^https://([a-z0-9-]+\.)?figma\.com/')
          and design_url is distinct from $4`,
		payload.OrganizationID, payload.ProjectID, keyIDs, payload.FigmaURL,
	); err != nil {
		return nil, err
	}
	if err = tx.Commit(ctx); err != nil {
		return nil, err
	}
	committed = true
	if replaced {
		api.deleteVisualContextObject(r, previous.location, previous.key)
	}
	slog.InfoContext(ctx, "figma_visual_context_synced",
		"project_id", payload.ProjectID, "screenshot_id", screenshotID,
		"bound_count", len(payload.Bindings), "replaced", replaced)
	return &figmaVisualContextSyncResult{
		ScreenshotID:  screenshotID,
		BoundCount:    len(payload.Bindings),
		ReplacedFrame: replaced,
	}, nil
}
