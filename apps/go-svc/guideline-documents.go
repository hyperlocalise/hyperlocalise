package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"mime"
	"mime/multipart"
	"net/http"
	"os"
	"path"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/internal/guidelines"
	"github.com/hyperlocalise/hyperlocalise/internal/guidelines/ingest"
	"github.com/hyperlocalise/hyperlocalise/internal/objectstore"
	"github.com/hyperlocalise/hyperlocalise/internal/textextract"
)

const (
	guidelineDocumentMaxBytes     = 25 << 20
	guidelineDocumentBodyLimit    = guidelineDocumentMaxBytes + 1<<20
	guidelineDocumentMaxTitle     = 200
	guidelineDocumentMaxFilename  = 255
	guidelineDocumentMaxFieldSize = 1 << 10
	guidelinePublishTimeout       = 5 * time.Second
	guidelineDocumentTimeout      = 60 * time.Second
	// Images need OCR, which only runs when the ingest worker has a vision model.
	GUIDELINE_IMAGE_UPLOADS_ENV = "GUIDELINE_IMAGE_UPLOADS_ENABLED"
)

type guidelineDocumentAPI struct {
	knowledge    *knowledgeMemoryAPI
	objects      *objectstore.Registry
	publisher    guidelineIngestPublisher
	acceptImages bool
}

func newGuidelineDocumentAPI(knowledge *knowledgeMemoryAPI, objects *objectstore.Registry, publisher guidelineIngestPublisher) *guidelineDocumentAPI {
	accept, _ := strconv.ParseBool(strings.TrimSpace(os.Getenv(GUIDELINE_IMAGE_UPLOADS_ENV)))
	return &guidelineDocumentAPI{knowledge: knowledge, objects: objects, publisher: publisher, acceptImages: accept}
}

func (api *guidelineDocumentAPI) register(mux *http.ServeMux, verifier SessionVerifier) {
	for _, base := range []string{orgRoutePrefix + "/guidelines/documents", orgRoutePrefix + "/projects/{projectId}/guidelines/documents"} {
		registerAuthenticated(mux, verifier, "GET "+base, api.knowledge.handle(false, api.list))
		registerAuthenticated(mux, verifier, "POST "+base, api.knowledge.handleWith(true, guidelineDocumentBodyLimit, guidelineDocumentTimeout, api.upload))
		registerAuthenticated(mux, verifier, "GET "+base+"/{documentId}", api.knowledge.handle(false, api.get))
		registerAuthenticated(mux, verifier, "PUT "+base+"/{documentId}", api.knowledge.handleWith(true, guidelineDocumentBodyLimit, guidelineDocumentTimeout, api.update))
		registerAuthenticated(mux, verifier, "DELETE "+base+"/{documentId}", api.knowledge.handle(true, api.remove))
	}
}

func (api *guidelineDocumentAPI) scope(ctx context.Context, r *http.Request, actor workspaceActor) (guidelineDocumentScope, error) {
	scope := guidelineDocumentScope{organizationID: actor.organizationID}
	if r.PathValue("projectId") == "" {
		return scope, nil
	}
	project, err := api.knowledge.projectScope(ctx, actor, r.PathValue("projectId"))
	if err != nil {
		return guidelineDocumentScope{}, err
	}
	scope.projectID = project.projectID
	return scope, nil
}

func guidelineDocumentNotFound() error {
	return knowledgeMemoryFailure(404, "guideline_document_not_found", "Guideline document not found")
}

func invalidGuidelineDocument(field string) error {
	return knowledgeMemoryFailureDetails(400, "invalid_guideline_document", "Guideline document is invalid", map[string]any{"field": field})
}

func parseGuidelineDocumentID(raw string) (string, error) {
	id, err := uuid.Parse(raw)
	if err != nil {
		return "", guidelineDocumentNotFound()
	}
	return id.String(), nil
}

func (api *guidelineDocumentAPI) requireWriter(actor workspaceActor) error {
	if !canUpdateKnowledgeMemory(actor.role) {
		return knowledgeMemoryFailure(403, "forbidden", "Only workspace admins can manage guideline documents")
	}
	if api.publisher == nil {
		return knowledgeMemoryFailure(503, "guideline_ingest_unavailable", "Guideline document processing is unavailable")
	}
	return nil
}

func (api *guidelineDocumentAPI) list(_ http.ResponseWriter, r *http.Request, actor workspaceActor) (int, any, error) {
	scope, err := api.scope(r.Context(), r, actor)
	if err != nil {
		return 0, nil, err
	}
	records, err := listGuidelineDocuments(r.Context(), api.knowledge.workspace.pool, scope)
	if err != nil {
		return 0, nil, err
	}
	return http.StatusOK, map[string]any{"guidelineDocuments": records}, nil
}

func (api *guidelineDocumentAPI) get(_ http.ResponseWriter, r *http.Request, actor workspaceActor) (int, any, error) {
	id, err := parseGuidelineDocumentID(r.PathValue("documentId"))
	if err != nil {
		return 0, nil, err
	}
	scope, err := api.scope(r.Context(), r, actor)
	if err != nil {
		return 0, nil, err
	}
	record, found, err := loadGuidelineDocument(r.Context(), api.knowledge.workspace.pool, scope, id, true)
	if err != nil {
		return 0, nil, err
	}
	if !found {
		return 0, nil, guidelineDocumentNotFound()
	}
	return http.StatusOK, map[string]any{"guidelineDocument": record}, nil
}

type guidelineDocumentUpload struct {
	data        []byte
	filename    string
	contentType string
	metadata    guidelineDocumentMetadata
}

func (api *guidelineDocumentAPI) upload(_ http.ResponseWriter, r *http.Request, actor workspaceActor) (int, any, error) {
	if err := api.requireWriter(actor); err != nil {
		return 0, nil, err
	}
	if api.objects == nil {
		return 0, nil, knowledgeMemoryFailure(503, "object_storage_unavailable", "Guideline document storage is unavailable")
	}
	scope, err := api.scope(r.Context(), r, actor)
	if err != nil {
		return 0, nil, err
	}
	upload, err := api.readUpload(r)
	if err != nil {
		return 0, nil, err
	}
	id, revisionID := uuid.NewString(), uuid.NewString()
	ref, err := api.storeFile(r.Context(), scope, id, revisionID, upload)
	if err != nil {
		return 0, nil, err
	}
	title := upload.metadata.title
	if title == nil {
		title = stringPointer(defaultGuidelineTitle(upload.filename))
	}
	record, err := insertGuidelineDocument(r.Context(), api.knowledge.workspace.pool, scope, guidelineDocumentInsert{
		id: id, revisionID: revisionID, title: *title, filename: upload.filename, contentType: upload.contentType,
		storageLocationID: ref.LocationID, storageKey: ref.Key, userID: actor.userID,
		locale: upload.metadata.locale, byteSize: int64(len(upload.data)), mandatory: upload.metadata.mandatory != nil && *upload.metadata.mandatory,
	})
	if err != nil {
		api.deleteObject(r.Context(), ref.LocationID, ref.Key)
		return 0, nil, err
	}
	record = api.publishExtract(r.Context(), record)
	return http.StatusAccepted, map[string]any{"guidelineDocument": record}, nil
}

func (api *guidelineDocumentAPI) update(_ http.ResponseWriter, r *http.Request, actor workspaceActor) (int, any, error) {
	if err := api.requireWriter(actor); err != nil {
		return 0, nil, err
	}
	id, err := parseGuidelineDocumentID(r.PathValue("documentId"))
	if err != nil {
		return 0, nil, err
	}
	scope, err := api.scope(r.Context(), r, actor)
	if err != nil {
		return 0, nil, err
	}
	pool := api.knowledge.workspace.pool
	revisionID := uuid.NewString()
	if isMultipartRequest(r) {
		if api.objects == nil {
			return 0, nil, knowledgeMemoryFailure(503, "object_storage_unavailable", "Guideline document storage is unavailable")
		}
		upload, err := api.readUpload(r)
		if err != nil {
			return 0, nil, err
		}
		if _, found, err := loadGuidelineDocument(r.Context(), pool, scope, id, false); err != nil || !found {
			if err == nil {
				err = guidelineDocumentNotFound()
			}
			return 0, nil, err
		}
		ref, err := api.storeFile(r.Context(), scope, id, revisionID, upload)
		if err != nil {
			return 0, nil, err
		}
		record, previous, found, err := replaceGuidelineDocumentFile(r.Context(), pool, scope, id, guidelineDocumentFile{
			revisionID: revisionID, filename: upload.filename, contentType: upload.contentType,
			storageLocationID: ref.LocationID, storageKey: ref.Key, byteSize: int64(len(upload.data)),
		}, upload.metadata)
		if err != nil || !found {
			api.deleteObject(r.Context(), ref.LocationID, ref.Key)
			if err == nil {
				err = guidelineDocumentNotFound()
			}
			return 0, nil, err
		}
		api.deleteObject(r.Context(), previous.storageLocationID, previous.storageKey)
		return http.StatusAccepted, map[string]any{"guidelineDocument": api.publishExtract(r.Context(), record)}, nil
	}

	change, err := decodeGuidelineDocumentMetadata(r)
	if err != nil {
		return 0, nil, err
	}
	record, found, err := updateGuidelineDocumentMetadata(r.Context(), pool, scope, id, revisionID, change)
	if err != nil {
		return 0, nil, err
	}
	if !found {
		return 0, nil, guidelineDocumentNotFound()
	}
	if record.Status == "failed" {
		return http.StatusOK, map[string]any{"guidelineDocument": record}, nil
	}
	return http.StatusAccepted, map[string]any{"guidelineDocument": api.publishExtract(r.Context(), record)}, nil
}

func (api *guidelineDocumentAPI) remove(_ http.ResponseWriter, r *http.Request, actor workspaceActor) (int, any, error) {
	if err := api.requireWriter(actor); err != nil {
		return 0, nil, err
	}
	id, err := parseGuidelineDocumentID(r.PathValue("documentId"))
	if err != nil {
		return 0, nil, err
	}
	scope, err := api.scope(r.Context(), r, actor)
	if err != nil {
		return 0, nil, err
	}
	record, found, err := deleteGuidelineDocument(r.Context(), api.knowledge.workspace.pool, scope, id)
	if err != nil {
		return 0, nil, err
	}
	if !found {
		return 0, nil, guidelineDocumentNotFound()
	}
	publishCtx, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), guidelinePublishTimeout)
	defer cancel()
	// The row is gone, so retrieval already ignores stale passages; a lost
	// delete message only leaves unreachable vectors behind.
	if err := api.publisher.Publish(publishCtx, ingest.Message{
		Operation: ingest.OperationDelete, OrganizationID: scope.organizationID, ProjectID: scope.projectID, DocumentID: record.ID, Version: record.Version,
	}); err != nil {
		slog.WarnContext(r.Context(), "guideline_ingest_delete_enqueue_failed", "organization_id", scope.organizationID, "document_id", record.ID, "error", err)
	}
	api.deleteObject(r.Context(), record.storageLocationID, record.storageKey)
	return http.StatusNoContent, nil, nil
}

const (
	guidelineSweepGracePeriod = 15 * time.Minute
	guidelineSweepLimit       = 100
)

// sweep republishes documents whose ingest message was lost between the row
// write and the queue publish, or whose index lags the current revision.
func (api *guidelineDocumentAPI) sweep(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if api.publisher == nil || api.knowledge == nil || api.knowledge.workspace == nil || api.knowledge.workspace.pool == nil {
		writeKnowledgeMemoryError(w, r, knowledgeMemoryFailure(503, "guideline_ingest_unavailable", "Guideline document processing is unavailable"))
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	pool := api.knowledge.workspace.pool
	records, err := listGuidelineDocumentsToSweep(ctx, pool, guidelineSweepGracePeriod, guidelineSweepLimit)
	if err != nil {
		writeKnowledgeMemoryError(w, r, err)
		return
	}
	republished, failed := 0, 0
	for _, record := range records {
		projectID := ""
		if record.ProjectID != nil {
			projectID = *record.ProjectID
		}
		err := api.publisher.Publish(ctx, ingest.Message{
			Operation: ingest.OperationExtractIndex, OrganizationID: record.organizationID, ProjectID: projectID, DocumentID: record.ID, RevisionID: record.RevisionID,
		})
		if err == nil {
			err = touchGuidelineDocumentEnqueued(ctx, pool, record.ID, record.RevisionID)
		}
		if err != nil {
			failed++
			slog.WarnContext(ctx, "guideline_ingest_sweep_publish_failed", "organization_id", record.organizationID, "document_id", record.ID, "error", err)
			continue
		}
		republished++
	}
	writeKnowledgeMemoryJSON(w, http.StatusOK, map[string]int{"scanned": len(records), "republished": republished, "failed": failed})
}

// publishExtract marks the row failed when the message cannot be queued so the
// UI does not show a document stuck in processing.
func (api *guidelineDocumentAPI) publishExtract(ctx context.Context, record guidelineDocumentRecord) guidelineDocumentRecord {
	publishCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), guidelinePublishTimeout)
	defer cancel()
	projectID := ""
	if record.ProjectID != nil {
		projectID = *record.ProjectID
	}
	err := api.publisher.Publish(publishCtx, ingest.Message{
		Operation: ingest.OperationExtractIndex, OrganizationID: record.organizationID, ProjectID: projectID, DocumentID: record.ID, RevisionID: record.RevisionID,
	})
	if err == nil {
		return record
	}
	slog.WarnContext(ctx, "guideline_ingest_enqueue_failed", "organization_id", record.organizationID, "document_id", record.ID, "error", err)
	if record.Status != "processing" {
		return record
	}
	if markErr := markGuidelineDocumentEnqueueFailed(publishCtx, api.knowledge.workspace.pool, record.ID, record.RevisionID); markErr != nil {
		slog.WarnContext(ctx, "guideline_ingest_enqueue_mark_failed", "organization_id", record.organizationID, "document_id", record.ID, "error", markErr)
		return record
	}
	record.Status = "failed"
	record.ErrorCode = stringPointer("guideline_ingest_enqueue_failed")
	return record
}

func (api *guidelineDocumentAPI) storeFile(ctx context.Context, scope guidelineDocumentScope, id, revisionID string, upload guidelineDocumentUpload) (objectstore.Ref, error) {
	key := fmt.Sprintf("guidelines/%s/%s/%s", scope.organizationID, id, revisionID)
	ref, _, err := api.objects.Put(ctx, objectstore.PutInput{
		Key: key, Body: bytes.NewReader(upload.data), Size: int64(len(upload.data)), ContentType: upload.contentType, IfAbsent: true,
	})
	if err != nil {
		return objectstore.Ref{}, fmt.Errorf("store guideline document: %w", err)
	}
	return ref, nil
}

func (api *guidelineDocumentAPI) deleteObject(ctx context.Context, locationID, key string) {
	if api.objects == nil || key == "" {
		return
	}
	store, err := api.objects.Resolve(locationID)
	if err == nil {
		err = store.Delete(context.WithoutCancel(ctx), key)
	}
	if err != nil {
		slog.WarnContext(ctx, "guideline_document_object_delete_failed", "location_id", locationID, "error", err)
	}
}

func isMultipartRequest(r *http.Request) bool {
	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	return err == nil && mediaType == "multipart/form-data"
}

// readUpload reads the multipart body without temp files. Metadata fields are
// optional; the file is required.
func (api *guidelineDocumentAPI) readUpload(r *http.Request) (guidelineDocumentUpload, error) {
	if !isMultipartRequest(r) {
		return guidelineDocumentUpload{}, invalidGuidelineDocument("file")
	}
	reader, err := r.MultipartReader()
	if err != nil {
		return guidelineDocumentUpload{}, invalidGuidelineDocument("file")
	}
	var upload guidelineDocumentUpload
	seenFile := false
	for {
		part, err := reader.NextPart()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return guidelineDocumentUpload{}, uploadReadError(err)
		}
		if err := api.readUploadPart(part, &upload, &seenFile); err != nil {
			_ = part.Close()
			return guidelineDocumentUpload{}, err
		}
		_ = part.Close()
	}
	if !seenFile {
		return guidelineDocumentUpload{}, invalidGuidelineDocument("file")
	}
	return upload, nil
}

func (api *guidelineDocumentAPI) readUploadPart(part *multipart.Part, upload *guidelineDocumentUpload, seenFile *bool) error {
	switch part.FormName() {
	case "file":
		if *seenFile {
			return invalidGuidelineDocument("file")
		}
		*seenFile = true
		data, err := io.ReadAll(io.LimitReader(part, guidelineDocumentMaxBytes+1))
		if err != nil {
			return uploadReadError(err)
		}
		if len(data) == 0 {
			return invalidGuidelineDocument("file")
		}
		if len(data) > guidelineDocumentMaxBytes {
			return knowledgeMemoryFailure(413, "guideline_document_too_large", "Guideline documents must be 25 MB or smaller")
		}
		filename := sanitizeGuidelineFilename(part.FileName())
		format, mediaType, err := textextract.Detect(filename, part.Header.Get("Content-Type"), data)
		if err != nil || (format == textextract.FormatImage && (!api.acceptImages || (mediaType != "image/png" && mediaType != "image/jpeg"))) {
			return knowledgeMemoryFailure(415, "unsupported_guideline_format", "Upload a PDF, DOCX, Markdown, or plain text file")
		}
		upload.data, upload.filename, upload.contentType = data, filename, mediaType
	case "title", "locale", "mandatory":
		raw, err := io.ReadAll(io.LimitReader(part, guidelineDocumentMaxFieldSize+1))
		if err != nil {
			return uploadReadError(err)
		}
		if len(raw) > guidelineDocumentMaxFieldSize {
			return invalidGuidelineDocument(part.FormName())
		}
		return applyGuidelineDocumentField(&upload.metadata, part.FormName(), string(raw))
	default:
		return invalidGuidelineDocument(part.FormName())
	}
	return nil
}

func uploadReadError(err error) error {
	if isRequestBodyTooLarge(err) {
		return knowledgeMemoryFailure(413, "guideline_document_too_large", "Guideline documents must be 25 MB or smaller")
	}
	return invalidGuidelineDocument("file")
}

func applyGuidelineDocumentField(change *guidelineDocumentMetadata, name, value string) error {
	switch name {
	case "title":
		title := javascriptTrim(value)
		if title == "" || utf8.RuneCountInString(title) > guidelineDocumentMaxTitle {
			return invalidGuidelineDocument("title")
		}
		change.title = &title
	case "locale":
		locale, err := guidelines.NormalizeLocale(value)
		if err != nil {
			return invalidGuidelineDocument("locale")
		}
		change.setLocale = true
		if locale != "" {
			change.locale = &locale
		}
	case "mandatory":
		mandatory, err := strconv.ParseBool(strings.TrimSpace(value))
		if err != nil {
			return invalidGuidelineDocument("mandatory")
		}
		change.mandatory = &mandatory
	}
	return nil
}

func decodeGuidelineDocumentMetadata(r *http.Request) (guidelineDocumentMetadata, error) {
	var fields map[string]json.RawMessage
	if err := decodeSingleJSON(r.Body, &fields); err != nil || fields == nil {
		return guidelineDocumentMetadata{}, invalidGuidelineDocument("body")
	}
	var change guidelineDocumentMetadata
	for name, raw := range fields {
		switch name {
		case "title":
			var title string
			if err := json.Unmarshal(raw, &title); err != nil {
				return change, invalidGuidelineDocument(name)
			}
			if err := applyGuidelineDocumentField(&change, name, title); err != nil {
				return change, err
			}
		case "locale":
			if string(raw) == "null" {
				change.setLocale = true
				continue
			}
			var locale string
			if err := json.Unmarshal(raw, &locale); err != nil {
				return change, invalidGuidelineDocument(name)
			}
			if err := applyGuidelineDocumentField(&change, name, locale); err != nil {
				return change, err
			}
		case "mandatory":
			var mandatory bool
			if err := json.Unmarshal(raw, &mandatory); err != nil {
				return change, invalidGuidelineDocument(name)
			}
			change.mandatory = &mandatory
		default:
			return change, invalidGuidelineDocument(name)
		}
	}
	if change.title == nil && !change.setLocale && change.mandatory == nil {
		return change, invalidGuidelineDocument("body")
	}
	return change, nil
}

func sanitizeGuidelineFilename(raw string) string {
	name := javascriptTrim(path.Base(strings.ReplaceAll(raw, "\\", "/")))
	if name == "" || name == "." || name == "/" {
		name = "document"
	}
	if utf8.RuneCountInString(name) > guidelineDocumentMaxFilename {
		name = string([]rune(name)[:guidelineDocumentMaxFilename])
	}
	return name
}

func defaultGuidelineTitle(filename string) string {
	title := javascriptTrim(strings.TrimSuffix(filename, path.Ext(filename)))
	if title == "" {
		title = filename
	}
	if utf8.RuneCountInString(title) > guidelineDocumentMaxTitle {
		title = string([]rune(title)[:guidelineDocumentMaxTitle])
	}
	return title
}
