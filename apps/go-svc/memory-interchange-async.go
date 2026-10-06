package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/internal/objectstore"
)

const (
	MEMORY_INTERCHANGE_UPLOAD_TTL   = 15 * time.Minute
	MEMORY_INTERCHANGE_DOWNLOAD_TTL = 10 * time.Minute
	MEMORY_INTERCHANGE_MAX_BYTES    = 100 * 1024 * 1024
)

type memoryImportUploadRequest struct {
	Format         string  `json:"format"`
	SourceFilename *string `json:"sourceFilename"`
	ContentType    *string `json:"contentType"`
}

type memoryInterchangeDownloadResponse struct {
	URL       string    `json:"url"`
	Method    string    `json:"method"`
	ExpiresAt time.Time `json:"expiresAt"`
	Filename  *string   `json:"filename,omitempty"`
}

func (api *memoryAPI) createMemoryImportUploadHandler(r *http.Request, actor memoryActor, m memoryRecord) (any, int, error) {
	if !actor.canWriteMemories() {
		return nil, 0, memoryFailure(403, "forbidden", "Insufficient permissions")
	}
	if err := requireNativeMemory(m); err != nil {
		return nil, 0, err
	}
	if m.Status == "archived" {
		return nil, 0, memoryFailure(403, "memory_action_archived", "This translation memory is archived")
	}
	if api.objects == nil {
		return nil, 0, memoryFailure(503, "object_storage_unavailable", "Memory object storage is unavailable")
	}
	var payload memoryImportUploadRequest
	if err := readMemoryBody(r, []string{"format", "sourceFilename", "contentType"}, &payload); err != nil {
		return nil, 0, err
	}
	format := strings.ToLower(trimMemoryInput(payload.Format))
	if format != "csv" && format != "tmx" {
		return nil, 0, invalidMemory()
	}
	attemptID := uuid.NewString()
	location := api.objects.DefaultLocationID()
	key := fmt.Sprintf("memory-interchange/%s/%s/import/%s.%s", actor.organizationID, m.ID, attemptID, format)
	signer, err := api.objects.Presigner(location)
	if err != nil {
		return nil, 0, memoryFailure(503, "object_storage_signing_unavailable", "Memory object storage signing is unavailable")
	}
	contentType := "application/octet-stream"
	if payload.ContentType != nil && strings.TrimSpace(*payload.ContentType) != "" {
		contentType = strings.TrimSpace(*payload.ContentType)
	}
	_, err = api.pool.Exec(r.Context(), `insert into memory_import_attempts (id, organization_id, memory_id, created_by_user_id, operation, status, mode, format, source_filename, source_object_location, source_object_key) values ($1,$2,$3,$4,'import','upload_pending','apply',$5,$6,$7,$8)`, attemptID, actor.organizationID, m.ID, actor.userID, format, payload.SourceFilename, location, key)
	if err != nil {
		return nil, 0, err
	}
	signed, err := signer.PresignUpload(r.Context(), objectstore.Upload{Key: key, ContentType: contentType, IfAbsent: true}, MEMORY_INTERCHANGE_UPLOAD_TTL)
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{
		"attemptId": attemptID,
		"operation": "import",
		"status":    "upload_pending",
		"upload":    map[string]any{"url": signed.URL, "method": signed.Method, "headers": signed.Headers, "expiresAt": signed.ExpiresAt},
	}, http.StatusCreated, nil
}

func (api *memoryAPI) finalizeMemoryImport(ctx context.Context, actor memoryActor, m memoryRecord, payload memoryImportPayload) (any, int, error) {
	if !actor.canWriteMemories() {
		return nil, 0, memoryFailure(403, "forbidden", "Insufficient permissions")
	}
	if err := requireNativeMemory(m); err != nil {
		return nil, 0, err
	}
	if m.Status == "archived" {
		return nil, 0, memoryFailure(403, "memory_action_archived", "This translation memory is archived")
	}
	if payload.DryRun != nil && *payload.DryRun {
		return nil, 0, memoryFailure(400, "memory_import_dry_run_unsupported", "Translation memory import dry-run is no longer supported. Upload the file and queue a preview instead.")
	}
	mode := strings.TrimSpace(payload.Mode)
	if mode == "" {
		mode = "apply"
	}
	if mode != "apply" && mode != "preview" && mode != "cancel" {
		return nil, 0, invalidMemory()
	}
	var format, location, key, status, currentMode string
	err := api.pool.QueryRow(ctx, `select format, source_object_location, source_object_key, status, mode from memory_import_attempts where id=$1 and organization_id=$2 and memory_id=$3 and created_by_user_id=$4 and operation='import'`, payload.AttemptID, actor.organizationID, m.ID, actor.userID).Scan(&format, &location, &key, &status, &currentMode)
	if err != nil {
		return nil, 0, err
	}
	if mode == "cancel" {
		// Abandoned upload sessions (browser PUT or queueing failed) are failed
		// explicitly without requiring object storage or the interchange queue.
		cancelled, err := api.pool.Exec(ctx, `update memory_import_attempts set status='failed', failure_code='memory_import_cancelled', completed_at=now() where id=$1 and status='upload_pending'`, payload.AttemptID)
		if err != nil {
			return nil, 0, err
		}
		if cancelled.RowsAffected() == 0 {
			return nil, 0, memoryFailure(409, "memory_import_not_cancellable", "The memory import cannot be cancelled")
		}
		return map[string]any{"attemptId": payload.AttemptID, "operation": "import", "mode": mode, "status": "failed"}, http.StatusOK, nil
	}
	if api.interchange == nil {
		return nil, 0, memoryFailure(503, "memory_interchange_unavailable", "Memory interchange processing is unavailable")
	}
	if api.objects == nil {
		return nil, 0, memoryFailure(503, "object_storage_unavailable", "Memory object storage is unavailable")
	}
	var sourceByteSize *int32
	queueFromUpload := status == "upload_pending" && (mode == "preview" || mode == "apply")
	queueFromPreview := mode == "apply" && status == "preview_completed"
	if mode == "preview" && status != "upload_pending" {
		return nil, 0, memoryFailure(409, "memory_import_not_queueable", "The memory import is not ready to preview")
	}
	if mode == "apply" && !queueFromUpload && !queueFromPreview {
		return nil, 0, memoryFailure(409, "memory_import_not_queueable", "The memory import is not ready to apply")
	}
	if queueFromUpload {
		store, resolveErr := api.objects.Resolve(location)
		if resolveErr != nil {
			return nil, 0, resolveErr
		}
		info, statErr := store.Stat(ctx, key)
		if statErr != nil {
			return nil, 0, memoryFailure(409, "memory_import_upload_missing", "The memory import upload has not completed")
		}
		if info.Size <= 0 || info.Size > MEMORY_INTERCHANGE_MAX_BYTES {
			return nil, 0, memoryFailure(413, "memory_import_upload_too_large", "The memory import upload is empty or exceeds the 100 MB limit")
		}
		// Persist the trusted object-store size so the report shows the file
		// size. The upload path no longer sends a client-provided size.
		size := int32(info.Size)
		sourceByteSize = &size
	}
	options, _ := json.Marshal(map[string]any{"maxUnits": payload.MaxUnits, "mode": mode})
	var rowsAffected int64
	if queueFromPreview {
		tag, execErr := api.pool.Exec(ctx, `update memory_import_attempts set mode=$2, options=$3::jsonb, status='queued', completed_at=null, failure_code=null, failure_message=null where id=$1 and status='preview_completed'`, payload.AttemptID, mode, options)
		if execErr != nil {
			return nil, 0, execErr
		}
		rowsAffected = tag.RowsAffected()
	} else {
		tag, execErr := api.pool.Exec(ctx, `update memory_import_attempts set mode=$2, options=$3::jsonb, status='queued', source_byte_size=coalesce($4, source_byte_size) where id=$1 and status='upload_pending'`, payload.AttemptID, mode, options, sourceByteSize)
		if execErr != nil {
			return nil, 0, execErr
		}
		rowsAffected = tag.RowsAffected()
	}
	if rowsAffected == 0 {
		return nil, 0, memoryFailure(409, "memory_import_not_queueable", "The memory import is already queued or complete")
	}
	if err := api.interchange.Publish(ctx, memoryInterchangeMessage{SchemaVersion: 1, AttemptID: payload.AttemptID, Operation: "import"}); err != nil {
		_, _ = api.pool.Exec(context.Background(), `update memory_import_attempts set status='failed', failure_code='memory_interchange_enqueue_failed', completed_at=now() where id=$1`, payload.AttemptID)
		return nil, 0, err
	}
	return map[string]any{"attemptId": payload.AttemptID, "operation": "import", "mode": mode, "status": "queued", "format": format, "previousMode": currentMode}, http.StatusAccepted, nil
}

func (api *memoryAPI) createMemoryExportHandler(r *http.Request, actor memoryActor, m memoryRecord) (any, int, error) {
	if api.interchange == nil {
		return nil, 0, memoryFailure(503, "memory_interchange_unavailable", "Memory interchange processing is unavailable")
	}
	options := map[string]any{}
	format := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("format")))
	if format == "" {
		format = "tmx"
	}
	for key, values := range r.URL.Query() {
		if len(values) == 1 {
			options[key] = values[0]
		} else {
			options[key] = values
		}
	}
	optionsJSON, err := json.Marshal(options)
	if err != nil {
		return nil, 0, err
	}
	attemptID := uuid.NewString()
	if format != "csv" && format != "tmx" {
		return nil, 0, invalidMemory()
	}
	if _, err := api.pool.Exec(r.Context(), `insert into memory_import_attempts (id, organization_id, memory_id, created_by_user_id, operation, status, mode, format, options) values ($1,$2,$3,$4,'export','queued','export',$5,$6::jsonb)`, attemptID, actor.organizationID, m.ID, actor.userID, format, optionsJSON); err != nil {
		return nil, 0, err
	}
	if err := api.interchange.Publish(r.Context(), memoryInterchangeMessage{SchemaVersion: 1, AttemptID: attemptID, Operation: "export"}); err != nil {
		_, _ = api.pool.Exec(context.Background(), `update memory_import_attempts set status='failed', failure_code='memory_interchange_enqueue_failed', completed_at=now() where id=$1`, attemptID)
		return nil, 0, err
	}
	return map[string]any{"attemptId": attemptID, "operation": "export", "status": "queued"}, http.StatusAccepted, nil
}

func (api *memoryAPI) getMemoryInterchangeDownloadHandler(r *http.Request, actor memoryActor, m memoryRecord) (any, int, error) {
	if api.objects == nil {
		return nil, 0, memoryFailure(503, "object_storage_unavailable", "Memory object storage is unavailable")
	}
	var operation, status string
	var location, key *string
	var filename *string
	err := api.pool.QueryRow(r.Context(), `select operation, status, result_object_location, result_object_key, result_filename from memory_import_attempts where id=$1 and memory_id=$2 and organization_id=$3`, r.PathValue("attemptId"), m.ID, actor.organizationID).Scan(&operation, &status, &location, &key, &filename)
	if err != nil {
		return nil, 0, err
	}
	if operation != "export" {
		return nil, 0, memoryFailure(400, "memory_download_unsupported", "This run has no export result")
	}
	if status != "completed" || location == nil || key == nil || *location == "" || *key == "" {
		return nil, 0, memoryFailure(409, "memory_interchange_not_ready", "The memory interchange result is not ready")
	}
	signer, err := api.objects.Presigner(*location)
	if err != nil {
		return nil, 0, err
	}
	signed, err := signer.PresignDownload(r.Context(), *key, MEMORY_INTERCHANGE_DOWNLOAD_TTL)
	if err != nil {
		return nil, 0, err
	}
	return memoryInterchangeDownloadResponse{URL: signed.URL, Method: signed.Method, ExpiresAt: signed.ExpiresAt, Filename: filename}, http.StatusOK, nil
}
