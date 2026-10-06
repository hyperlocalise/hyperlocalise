package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/internal/objectstore"
	"github.com/hyperlocalise/hyperlocalise/internal/objectstore/memory"
	"github.com/stretchr/testify/require"
)

type recordingMemoryInterchangePublisher struct {
	messages []memoryInterchangeMessage
	err      error
}

func (p *recordingMemoryInterchangePublisher) Publish(_ context.Context, message memoryInterchangeMessage) error {
	if p.err != nil {
		return p.err
	}
	p.messages = append(p.messages, message)
	return nil
}

func (p *recordingMemoryInterchangePublisher) Ping(context.Context) error { return nil }

type signingObjectStore struct {
	*memory.Store
}

func (s signingObjectStore) PresignUpload(_ context.Context, input objectstore.Upload, ttl time.Duration) (objectstore.SignedRequest, error) {
	return objectstore.SignedRequest{
		URL:       "https://objects.test/upload/" + input.Key,
		Method:    http.MethodPut,
		ExpiresAt: time.Now().Add(ttl),
	}, nil
}

func (s signingObjectStore) PresignDownload(_ context.Context, key string, ttl time.Duration) (objectstore.SignedRequest, error) {
	return objectstore.SignedRequest{
		URL:       "https://objects.test/download/" + key,
		Method:    http.MethodGet,
		ExpiresAt: time.Now().Add(ttl),
	}, nil
}

func memoryObjectRegistry(t *testing.T) *objectstore.Registry {
	t.Helper()
	registry, err := objectstore.NewRegistry("r2-primary", map[string]objectstore.Store{
		"r2-primary": signingObjectStore{Store: memory.New()},
	})
	require.NoError(t, err)
	return registry
}

func TestCreateMemoryExportRequiresInterchange(t *testing.T) {
	api, scope := memoryTestAPI(t, "admin")
	id := scope.MustMemory(t, "", "Product TM")
	rec := memoryRequest(api, scope, "POST", scope.OrgPath("/translation-memories/"+id+"/entries/export?format=tmx"), "")
	require.Equal(t, http.StatusServiceUnavailable, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), "memory_interchange_unavailable")
}

func TestCreateMemoryExportQueuesAttempt(t *testing.T) {
	api, scope := memoryTestAPI(t, "admin")
	publisher := &recordingMemoryInterchangePublisher{}
	api.interchange = publisher
	id := scope.MustMemory(t, "", "Product TM")

	rec := memoryRequest(api, scope, "POST", scope.OrgPath("/translation-memories/"+id+"/entries/export?format=csv&sourceLocale=en-US"), "")
	require.Equal(t, http.StatusAccepted, rec.Code, rec.Body.String())

	var payload struct {
		AttemptID string `json:"attemptId"`
		Operation string `json:"operation"`
		Status    string `json:"status"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &payload))
	require.Equal(t, "export", payload.Operation)
	require.Equal(t, "queued", payload.Status)
	require.NotEmpty(t, payload.AttemptID)
	require.Len(t, publisher.messages, 1)
	require.Equal(t, 1, publisher.messages[0].SchemaVersion)
	require.Equal(t, payload.AttemptID, publisher.messages[0].AttemptID)
	require.Equal(t, "export", publisher.messages[0].Operation)

	var status, format string
	var options []byte
	err := scope.Pool.QueryRow(t.Context(), `select status, format, options from memory_import_attempts where id=$1`, payload.AttemptID).Scan(&status, &format, &options)
	require.NoError(t, err)
	require.Equal(t, "queued", status)
	require.Equal(t, "csv", format)
	var stored map[string]any
	require.NoError(t, json.Unmarshal(options, &stored))
	require.Equal(t, "en-US", stored["sourceLocale"])
	require.Equal(t, "csv", stored["format"])
}

func TestCreateMemoryExportRejectsInvalidFormat(t *testing.T) {
	api, scope := memoryTestAPI(t, "admin")
	api.interchange = &recordingMemoryInterchangePublisher{}
	id := scope.MustMemory(t, "", "Product TM")
	rec := memoryRequest(api, scope, "POST", scope.OrgPath("/translation-memories/"+id+"/entries/export?format=xlsx"), "")
	require.Equal(t, http.StatusBadRequest, rec.Code, rec.Body.String())
	var count int
	require.NoError(t, scope.Pool.QueryRow(t.Context(), `select count(*) from memory_import_attempts where memory_id=$1`, id).Scan(&count))
	require.Equal(t, 0, count)
}

func TestCreateMemoryExportMarksFailedWhenPublishFails(t *testing.T) {
	api, scope := memoryTestAPI(t, "admin")
	api.interchange = &recordingMemoryInterchangePublisher{err: errors.New("sqs denied")}
	id := scope.MustMemory(t, "", "Product TM")
	rec := memoryRequest(api, scope, "POST", scope.OrgPath("/translation-memories/"+id+"/entries/export"), "")
	require.Equal(t, http.StatusInternalServerError, rec.Code, rec.Body.String())

	var status, failureCode string
	err := scope.Pool.QueryRow(t.Context(), `select status, failure_code from memory_import_attempts where memory_id=$1`, id).Scan(&status, &failureCode)
	require.NoError(t, err)
	require.Equal(t, "failed", status)
	require.Equal(t, "memory_interchange_enqueue_failed", failureCode)
}

func TestCreateMemoryExportAllowsMember(t *testing.T) {
	api, scope := memoryTestAPI(t, "member")
	api.interchange = &recordingMemoryInterchangePublisher{}
	id := scope.MustMemory(t, "", "Product TM")
	rec := memoryRequest(api, scope, "POST", scope.OrgPath("/translation-memories/"+id+"/entries/export"), "")
	require.Equal(t, http.StatusAccepted, rec.Code, rec.Body.String())
}

func TestFinalizeMemoryImportApplyRequiresPreview(t *testing.T) {
	api, scope := memoryTestAPI(t, "admin")
	api.interchange = &recordingMemoryInterchangePublisher{}
	api.objects = memoryObjectRegistry(t)
	id := scope.MustMemory(t, "", "Product TM")
	attemptID := uuid.NewString()
	_, err := scope.Pool.Exec(t.Context(), `
		insert into memory_import_attempts (
			id, organization_id, memory_id, created_by_user_id, operation, status, mode, format,
			source_object_location, source_object_key
		) values ($1,$2,$3,$4,'import','completed','preview','tmx','r2-primary','memory-interchange/done.tmx')`,
		attemptID, scope.OrganizationID, id, scope.UserID)
	require.NoError(t, err)

	body := `{"attemptId":"` + attemptID + `","mode":"apply"}`
	rec := memoryRequest(api, scope, "POST", scope.OrgPath("/translation-memories/"+id+"/entries/import"), body)
	require.Equal(t, http.StatusConflict, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), "memory_import_not_queueable")
}

func TestFinalizeMemoryImportRejectsMissingAndEmptyUploads(t *testing.T) {
	api, scope := memoryTestAPI(t, "admin")
	publisher := &recordingMemoryInterchangePublisher{}
	api.interchange = publisher
	registry := memoryObjectRegistry(t)
	api.objects = registry
	id := scope.MustMemory(t, "", "Product TM")

	missingID := uuid.NewString()
	_, err := scope.Pool.Exec(t.Context(), `
		insert into memory_import_attempts (
			id, organization_id, memory_id, created_by_user_id, operation, status, mode, format, source_object_location, source_object_key
		) values ($1,$2,$3,$4,'import','upload_pending','preview','tmx','r2-primary','memory-interchange/missing.tmx')`,
		missingID, scope.OrganizationID, id, scope.UserID)
	require.NoError(t, err)
	missing := memoryRequest(api, scope, "POST", scope.OrgPath("/translation-memories/"+id+"/entries/import"), `{"attemptId":"`+missingID+`","mode":"preview"}`)
	require.Equal(t, http.StatusConflict, missing.Code, missing.Body.String())
	require.Contains(t, missing.Body.String(), "memory_import_upload_missing")

	emptyID := uuid.NewString()
	emptyKey := "memory-interchange/empty.tmx"
	_, err = scope.Pool.Exec(t.Context(), `
		insert into memory_import_attempts (
			id, organization_id, memory_id, created_by_user_id, operation, status, mode, format, source_object_location, source_object_key
		) values ($1,$2,$3,$4,'import','upload_pending','preview','tmx','r2-primary',$5)`,
		emptyID, scope.OrganizationID, id, scope.UserID, emptyKey)
	require.NoError(t, err)
	_, _, err = registry.Put(t.Context(), objectstore.PutInput{
		Key:         emptyKey,
		Body:        strings.NewReader(""),
		Size:        0,
		ContentType: "application/xml",
	})
	require.NoError(t, err)
	empty := memoryRequest(api, scope, "POST", scope.OrgPath("/translation-memories/"+id+"/entries/import"), `{"attemptId":"`+emptyID+`","mode":"preview"}`)
	require.Equal(t, http.StatusRequestEntityTooLarge, empty.Code, empty.Body.String())
	require.Contains(t, empty.Body.String(), "memory_import_upload_too_large")
	require.Empty(t, publisher.messages)
}

func TestFinalizeMemoryImportQueuesPreviewWhenUploadExists(t *testing.T) {
	api, scope := memoryTestAPI(t, "admin")
	publisher := &recordingMemoryInterchangePublisher{}
	api.interchange = publisher
	registry := memoryObjectRegistry(t)
	api.objects = registry
	id := scope.MustMemory(t, "", "Product TM")
	attemptID := uuid.NewString()
	key := "memory-interchange/ready.tmx"
	_, err := scope.Pool.Exec(t.Context(), `
		insert into memory_import_attempts (
			id, organization_id, memory_id, created_by_user_id, operation, status, mode, format, source_object_location, source_object_key
		) values ($1,$2,$3,$4,'import','upload_pending','preview','tmx','r2-primary',$5)`,
		attemptID, scope.OrganizationID, id, scope.UserID, key)
	require.NoError(t, err)
	_, _, err = registry.Put(t.Context(), objectstore.PutInput{
		Key:         key,
		Body:        strings.NewReader("<tmx/>"),
		Size:        6,
		ContentType: "application/xml",
	})
	require.NoError(t, err)

	rec := memoryRequest(api, scope, "POST", scope.OrgPath("/translation-memories/"+id+"/entries/import"), `{"attemptId":"`+attemptID+`","mode":"preview"}`)
	require.Equal(t, http.StatusAccepted, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"status":"queued"`)
	require.Len(t, publisher.messages, 1)
	require.Equal(t, "import", publisher.messages[0].Operation)
	require.Equal(t, attemptID, publisher.messages[0].AttemptID)

	var status string
	var sourceByteSize *int32
	err = scope.Pool.QueryRow(t.Context(), `select status, source_byte_size from memory_import_attempts where id=$1`, attemptID).Scan(&status, &sourceByteSize)
	require.NoError(t, err)
	require.Equal(t, "queued", status)
	require.NotNil(t, sourceByteSize)
	require.Equal(t, int32(6), *sourceByteSize)
}

func TestFinalizeMemoryImportQueuesApplyFromPreview(t *testing.T) {
	api, scope := memoryTestAPI(t, "admin")
	publisher := &recordingMemoryInterchangePublisher{}
	api.interchange = publisher
	api.objects = memoryObjectRegistry(t)
	id := scope.MustMemory(t, "", "Product TM")
	attemptID := uuid.NewString()
	_, err := scope.Pool.Exec(t.Context(), `
		insert into memory_import_attempts (
			id, organization_id, memory_id, created_by_user_id, operation, status, mode, format,
			source_object_location, source_object_key, source_byte_size
		) values ($1,$2,$3,$4,'import','preview_completed','preview','tmx','r2-primary','memory-interchange/apply-ready.tmx', 6)`,
		attemptID, scope.OrganizationID, id, scope.UserID)
	require.NoError(t, err)

	rec := memoryRequest(api, scope, "POST", scope.OrgPath("/translation-memories/"+id+"/entries/import"), `{"attemptId":"`+attemptID+`","mode":"apply"}`)
	require.Equal(t, http.StatusAccepted, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"status":"queued"`)
	require.Contains(t, rec.Body.String(), `"mode":"apply"`)
	require.Len(t, publisher.messages, 1)
	require.Equal(t, "import", publisher.messages[0].Operation)
	require.Equal(t, attemptID, publisher.messages[0].AttemptID)

	var status, mode string
	var sourceByteSize *int32
	err = scope.Pool.QueryRow(t.Context(), `select status, mode, source_byte_size from memory_import_attempts where id=$1`, attemptID).Scan(&status, &mode, &sourceByteSize)
	require.NoError(t, err)
	require.Equal(t, "queued", status)
	require.Equal(t, "apply", mode)
	require.NotNil(t, sourceByteSize)
	require.Equal(t, int32(6), *sourceByteSize)
}

func TestMemoryInterchangeDownloadGuards(t *testing.T) {
	api, scope := memoryTestAPI(t, "admin")
	api.objects = memoryObjectRegistry(t)
	id := scope.MustMemory(t, "", "Product TM")

	importID := uuid.NewString()
	_, err := scope.Pool.Exec(t.Context(), `
		insert into memory_import_attempts (
			id, organization_id, memory_id, created_by_user_id, operation, status, mode, format
		) values ($1,$2,$3,$4,'import','completed','preview','tmx')`,
		importID, scope.OrganizationID, id, scope.UserID)
	require.NoError(t, err)
	importRec := memoryRequest(api, scope, "GET", scope.OrgPath("/translation-memories/"+id+"/import-attempts/"+importID+"/download"), "")
	require.Equal(t, http.StatusBadRequest, importRec.Code, importRec.Body.String())
	require.Contains(t, importRec.Body.String(), "memory_download_unsupported")

	queuedID := uuid.NewString()
	_, err = scope.Pool.Exec(t.Context(), `
		insert into memory_import_attempts (
			id, organization_id, memory_id, created_by_user_id, operation, status, mode, format
		) values ($1,$2,$3,$4,'export','queued','export','tmx')`,
		queuedID, scope.OrganizationID, id, scope.UserID)
	require.NoError(t, err)
	queued := memoryRequest(api, scope, "GET", scope.OrgPath("/translation-memories/"+id+"/import-attempts/"+queuedID+"/download"), "")
	require.Equal(t, http.StatusConflict, queued.Code, queued.Body.String())
	require.Contains(t, queued.Body.String(), "memory_interchange_not_ready")

	readyID := uuid.NewString()
	_, err = scope.Pool.Exec(t.Context(), `
		insert into memory_import_attempts (
			id, organization_id, memory_id, created_by_user_id, operation, status, mode, format,
			result_object_location, result_object_key, result_filename
		) values ($1,$2,$3,$4,'export','completed','export','tmx','r2-primary','exports/ready.tmx','product.tmx')`,
		readyID, scope.OrganizationID, id, scope.UserID)
	require.NoError(t, err)
	ready := memoryRequest(api, scope, "GET", scope.OrgPath("/translation-memories/"+id+"/import-attempts/"+readyID+"/download"), "")
	require.Equal(t, http.StatusOK, ready.Code, ready.Body.String())
	require.Contains(t, ready.Body.String(), "https://objects.test/download/exports/ready.tmx")
	require.Contains(t, ready.Body.String(), `"filename":"product.tmx"`)
}

func TestCreateMemoryImportUploadSignsObject(t *testing.T) {
	api, scope := memoryTestAPI(t, "admin")
	api.objects = memoryObjectRegistry(t)
	id := scope.MustMemory(t, "", "Product TM")
	rec := memoryRequest(api, scope, "POST", scope.OrgPath("/translation-memories/"+id+"/entries/import/uploads"), `{"format":"tmx","sourceFilename":"folder/memory.tmx"}`)
	require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"status":"upload_pending"`)
	require.Contains(t, rec.Body.String(), "https://objects.test/upload/")
	require.Contains(t, rec.Body.String(), `"attemptId"`)
}
