package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/internal/objectstore"
)

const (
	glossaryInterchangeUploadTTL   = 15 * time.Minute
	glossaryInterchangeDownloadTTL = 10 * time.Minute
	glossaryInterchangeMaxBytes    = 25 * 1024 * 1024
)

type glossaryImportUploadRequest struct {
	Format         string  `json:"format"`
	SourceFilename *string `json:"sourceFilename"`
	ContentType    *string `json:"contentType"`
}

type glossaryImportFinalizeRequest struct {
	ReportID       string            `json:"reportId"`
	Mode           *string           `json:"mode"`
	PreviewForMode *string           `json:"previewForMode"`
	StrictLocale   *bool             `json:"strictLocale"`
	LocaleMapping  map[string]string `json:"localeMapping"`
}

type glossaryInterchangeDownloadResponse struct {
	URL       string    `json:"url"`
	Method    string    `json:"method"`
	ExpiresAt time.Time `json:"expiresAt"`
	Filename  *string   `json:"filename,omitempty"`
}

func normalizeGlossaryInterchangeFormat(format string) (string, error) {
	format = strings.ToLower(trimGlossaryInput(format))
	switch format {
	case "csv", "tbx", "xlsx":
		return format, nil
	default:
		return "", invalidGlossary()
	}
}

func (api *glossaryAPI) createGlossaryImportUploadHandler(r *http.Request, actor glossaryActor, g glossaryRecord) (any, int, error) {
	if err := api.requireConceptWrite(r.Context(), actor, g); err != nil {
		return nil, 0, err
	}
	if api.objects == nil {
		return nil, 0, glossaryFailure(503, "object_storage_unavailable", "Glossary object storage is unavailable")
	}
	var payload glossaryImportUploadRequest
	if err := readGlossaryBody(r, []string{"format", "sourceFilename", "contentType"}, &payload); err != nil {
		return nil, 0, err
	}
	format, err := normalizeGlossaryInterchangeFormat(payload.Format)
	if err != nil {
		return nil, 0, err
	}
	runID := uuid.NewString()
	location := api.objects.DefaultLocationID()
	key := fmt.Sprintf("glossary-interchange/%s/%s/import/%s.%s", actor.organizationID, g.ID, runID, format)
	signer, err := api.objects.Presigner(location)
	if err != nil {
		return nil, 0, glossaryFailure(503, "object_storage_signing_unavailable", "Glossary object storage signing is unavailable")
	}
	contentType := "application/octet-stream"
	if payload.ContentType != nil && strings.TrimSpace(*payload.ContentType) != "" {
		contentType = strings.TrimSpace(*payload.ContentType)
	}
	signed, err := signer.PresignUpload(r.Context(), objectstore.Upload{Key: key, ContentType: contentType, IfAbsent: true}, glossaryInterchangeUploadTTL)
	if err != nil {
		return nil, 0, err
	}
	_, err = api.pool.Exec(r.Context(), `insert into glossary_import_runs (id, organization_id, glossary_id, created_by_user_id, operation, format, mode, status, source_filename, source_object_location, source_object_key) values ($1,$2,$3,$4,'import',$5,'merge','upload_pending',$6,$7,$8)`, runID, actor.organizationID, g.ID, actor.userID, format, payload.SourceFilename, location, key)
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{
		"reportId": runID,
		"status":   "upload_pending",
		"upload": map[string]any{
			"url":       signed.URL,
			"method":    signed.Method,
			"headers":   signed.Headers,
			"expiresAt": signed.ExpiresAt,
		},
	}, http.StatusCreated, nil
}

func (api *glossaryAPI) importGlossaryConceptsAsync(r *http.Request, actor glossaryActor, g glossaryRecord) (any, int, error) {
	if err := api.requireConceptWrite(r.Context(), actor, g); err != nil {
		return nil, 0, err
	}
	var payload glossaryImportFinalizeRequest
	if err := readGlossaryBody(r, []string{"reportId", "mode", "previewForMode", "strictLocale", "localeMapping"}, &payload); err != nil {
		return nil, 0, err
	}
	if !validGlossaryID(payload.ReportID) {
		return nil, 0, invalidGlossary()
	}
	mode := "merge"
	if payload.Mode != nil && strings.TrimSpace(*payload.Mode) != "" {
		mode = strings.TrimSpace(*payload.Mode)
	}
	switch mode {
	case "preview", "create", "update", "merge", "replace":
	default:
		return nil, 0, invalidGlossary()
	}
	options, err := json.Marshal(map[string]any{
		"mode": mode, "previewForMode": payload.PreviewForMode,
		"strictLocale": payload.StrictLocale, "localeMapping": payload.LocaleMapping,
	})
	if err != nil {
		return nil, 0, err
	}
	var format, location, key string
	err = api.pool.QueryRow(r.Context(), `select format, source_object_location, source_object_key from glossary_import_runs where id=$1 and organization_id=$2 and glossary_id=$3 and created_by_user_id=$4 and operation='import' and status='upload_pending'`, payload.ReportID, actor.organizationID, g.ID, actor.userID).Scan(&format, &location, &key)
	if err != nil {
		return nil, 0, err
	}
	if api.objects == nil {
		return nil, 0, glossaryFailure(503, "object_storage_unavailable", "Glossary object storage is unavailable")
	}
	store, err := api.objects.Resolve(location)
	if err != nil {
		return nil, 0, err
	}
	info, err := store.Stat(r.Context(), key)
	if err != nil {
		return nil, 0, glossaryFailure(409, "glossary_import_upload_missing", "The glossary import upload has not completed")
	}
	if info.Size <= 0 || info.Size > glossaryInterchangeMaxBytes {
		return nil, 0, glossaryFailure(413, "glossary_import_upload_too_large", "The glossary import upload is empty or exceeds the 25 MB limit")
	}
	updated, err := api.pool.Exec(r.Context(), `update glossary_import_runs set mode=$2, options=$3::jsonb, status='queued' where id=$1 and status='upload_pending'`, payload.ReportID, mode, options)
	if err != nil {
		return nil, 0, err
	}
	if updated.RowsAffected() == 0 {
		return nil, 0, glossaryFailure(409, "glossary_import_not_queueable", "The glossary import is no longer waiting for upload")
	}
	if api.interchange == nil {
		return nil, 0, glossaryFailure(503, "glossary_interchange_unavailable", "Glossary interchange processing is unavailable")
	}
	if err := api.interchange.Publish(r.Context(), glossaryInterchangeMessage{SchemaVersion: 1, RunID: payload.ReportID, Operation: "import"}); err != nil {
		_, _ = api.pool.Exec(r.Context(), `update glossary_import_runs set status='failed', error_code='glossary_interchange_enqueue_failed', error_message=$2, completed_at=now() where id=$1`, payload.ReportID, err.Error())
		return nil, 0, err
	}
	return map[string]any{"reportId": payload.ReportID, "operation": "import", "status": "queued"}, http.StatusAccepted, nil
}

func (api *glossaryAPI) createGlossaryExportHandler(r *http.Request, actor glossaryActor, g glossaryRecord) (any, int, error) {
	if err := api.requireConceptWrite(r.Context(), actor, g); err != nil {
		return nil, 0, err
	}
	if g.Source != "native" {
		return nil, 0, glossaryFailure(400, "glossary_export_unsupported", "Live provider glossaries cannot be exported")
	}
	rawFormat := r.URL.Query().Get("format")
	if rawFormat == "" {
		rawFormat = "tbx"
	}
	format, err := normalizeGlossaryInterchangeFormat(rawFormat)
	if err != nil {
		return nil, 0, err
	}
	options := map[string]any{}
	for key, values := range r.URL.Query() {
		if key == "locales" {
			options[key] = values
		} else if len(values) == 1 {
			options[key] = values[0]
		} else {
			options[key] = values
		}
	}
	optionsJSON, err := json.Marshal(options)
	if err != nil {
		return nil, 0, err
	}
	runID := uuid.NewString()
	_, err = api.pool.Exec(r.Context(), `insert into glossary_import_runs (id, organization_id, glossary_id, created_by_user_id, operation, format, mode, status, options) values ($1,$2,$3,$4,'export',$5,'export','queued',$6::jsonb)`, runID, actor.organizationID, g.ID, actor.userID, format, optionsJSON)
	if err != nil {
		return nil, 0, err
	}
	if api.interchange == nil {
		return nil, 0, glossaryFailure(503, "glossary_interchange_unavailable", "Glossary interchange processing is unavailable")
	}
	if err := api.interchange.Publish(r.Context(), glossaryInterchangeMessage{SchemaVersion: 1, RunID: runID, Operation: "export"}); err != nil {
		_, _ = api.pool.Exec(r.Context(), `update glossary_import_runs set status='failed', error_code='glossary_interchange_enqueue_failed', error_message=$2, completed_at=now() where id=$1`, runID, err.Error())
		return nil, 0, err
	}
	return map[string]any{"reportId": runID, "operation": "export", "status": "queued"}, http.StatusAccepted, nil
}

func (api *glossaryAPI) getGlossaryInterchangeDownloadHandler(r *http.Request, actor glossaryActor, g glossaryRecord) (any, int, error) {
	if api.objects == nil {
		return nil, 0, glossaryFailure(503, "object_storage_unavailable", "Glossary object storage is unavailable")
	}
	var operation, status, location, key string
	var filename *string
	err := api.pool.QueryRow(r.Context(), `select operation, status, result_object_location, result_object_key, result_filename from glossary_import_runs where id=$1 and glossary_id=$2 and organization_id=$3`, r.PathValue("reportId"), g.ID, actor.organizationID).Scan(&operation, &status, &location, &key, &filename)
	if err != nil {
		return nil, 0, err
	}
	if status != "completed" || key == "" {
		return nil, 0, glossaryFailure(409, "glossary_interchange_not_ready", "The glossary interchange result is not ready")
	}
	if operation != "export" {
		return nil, 0, glossaryFailure(400, "glossary_download_unsupported", "This run has no export result")
	}
	signer, err := api.objects.Presigner(location)
	if err != nil {
		return nil, 0, err
	}
	signed, err := signer.PresignDownload(r.Context(), key, glossaryInterchangeDownloadTTL)
	if err != nil {
		return nil, 0, err
	}
	return glossaryInterchangeDownloadResponse{URL: signed.URL, Method: signed.Method, ExpiresAt: signed.ExpiresAt, Filename: filename}, http.StatusOK, nil
}
