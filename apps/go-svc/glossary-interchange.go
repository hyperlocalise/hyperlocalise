package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/sqs"
	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/internal/objectstore"
)

const glossaryInterchangeQueueURLEnv = "GLOSSARY_INTERCHANGE_QUEUE_URL"

type glossaryInterchangeQueue interface {
	SendMessage(context.Context, *sqs.SendMessageInput, ...func(*sqs.Options)) (*sqs.SendMessageOutput, error)
}

type glossaryInterchangeMessage struct {
	JobID          string `json:"jobId"`
	OrganizationID string `json:"organizationId"`
}

type glossaryArtifactPayload struct {
	Filename    string `json:"filename"`
	ContentType string `json:"contentType"`
	ByteSize    int64  `json:"byteSize"`
	SHA256      string `json:"sha256"`
}

type glossaryInterchangeJobPayload struct {
	Operation      string          `json:"operation"`
	GlossaryID     string          `json:"glossaryId"`
	Format         string          `json:"format"`
	Mode           string          `json:"mode,omitempty"`
	ArtifactFile   string          `json:"artifactFileId,omitempty"`
	ArtifactRef    objectstore.Ref `json:"artifactRef,omitempty"`
	SourceFilename string          `json:"sourceFilename,omitempty"`
	Options        map[string]any  `json:"options,omitempty"`
}

func newGlossaryInterchangeQueue(ctx context.Context) (glossaryInterchangeQueue, error) {
	if strings.TrimSpace(os.Getenv(glossaryInterchangeQueueURLEnv)) == "" {
		return nil, nil
	}
	cfg, err := awsconfig.LoadDefaultConfig(ctx, awsconfig.WithRegion(strings.TrimSpace(os.Getenv("AWS_REGION"))))
	if err != nil {
		return nil, fmt.Errorf("load AWS configuration: %w", err)
	}
	return sqs.NewFromConfig(cfg), nil
}

func (api *glossaryAPI) createGlossaryArtifactUpload(r *http.Request, actor glossaryActor, g glossaryRecord) (any, int, error) {
	if err := api.requireInterchangeWrite(actor, g); err != nil {
		return nil, 0, err
	}
	if api.objects == nil {
		return nil, 0, glossaryFailure(503, "object_storage_not_configured", "Glossary object storage is unavailable")
	}
	var payload glossaryArtifactPayload
	if err := readGlossaryBody(r, []string{"filename", "contentType", "byteSize", "sha256"}, &payload); err != nil {
		return nil, 0, err
	}
	payload.Filename = strings.TrimSpace(payload.Filename)
	payload.ContentType = strings.TrimSpace(payload.ContentType)
	if payload.Filename == "" || payload.ContentType == "" || payload.ByteSize <= 0 || len(payload.SHA256) != sha256.Size*2 {
		return nil, 0, invalidGlossary()
	}
	if _, err := hex.DecodeString(payload.SHA256); err != nil {
		return nil, 0, invalidGlossary()
	}
	fileID := uuid.NewString()
	key := "glossary-interchange/" + actor.organizationID + "/" + fileID + "/" + filepath.Base(payload.Filename)
	store, err := api.objects.Resolve(api.objects.DefaultID())
	if err != nil {
		return nil, 0, err
	}
	signer, ok := store.(objectstore.Presigner)
	if !ok {
		return nil, 0, glossaryFailure(501, "object_storage_signing_unsupported", "Glossary object storage does not support signed uploads")
	}
	signed, err := signer.PresignUpload(r.Context(), objectstore.Upload{Key: key, ContentType: payload.ContentType, IfAbsent: true}, 15*time.Minute)
	if err != nil {
		return nil, 0, err
	}
	if _, err := api.pool.Exec(r.Context(), `insert into stored_files (id, organization_id, created_by_user_id, role, source_kind, storage_provider, storage_key, storage_url, filename, content_type, byte_size, sha256) values ($1,$2,$3,'source','tms_file',$4,$5,'',$6,$7,0,$8)`, fileID, actor.organizationID, actor.userID, api.objects.DefaultID(), key, payload.Filename, payload.ContentType, strings.ToLower(payload.SHA256)); err != nil {
		return nil, 0, err
	}
	return map[string]any{
		"fileId": fileID,
		"ref":    objectstore.Ref{LocationID: api.objects.DefaultID(), Key: key},
		"upload": signed,
	}, 201, nil
}

func (api *glossaryAPI) completeGlossaryArtifactUpload(r *http.Request, actor glossaryActor, g glossaryRecord) (any, int, error) {
	if err := api.requireInterchangeWrite(actor, g); err != nil {
		return nil, 0, err
	}
	fileID := r.PathValue("fileId")
	if !validGlossaryID(fileID) || api.objects == nil {
		return nil, 0, missingGlossary()
	}
	var payload objectstore.Ref
	if err := readGlossaryBody(r, []string{"locationId", "key"}, &payload); err != nil {
		return nil, 0, err
	}
	store, err := api.objects.Resolve(payload.LocationID)
	if err != nil {
		return nil, 0, err
	}
	info, err := store.Stat(r.Context(), payload.Key)
	if err != nil {
		return nil, 0, err
	}
	if !strings.HasPrefix(payload.Key, "glossary-interchange/"+actor.organizationID+"/"+fileID+"/") {
		return nil, 0, glossaryFailure(403, "forbidden", "Invalid glossary artifact")
	}
	tag, err := api.pool.Exec(r.Context(), `update stored_files set byte_size=$1, etag=$2, updated_at=now() where id=$3 and organization_id=$4 and storage_key=$5`, info.Size, info.ETag, fileID, actor.organizationID, payload.Key)
	if err != nil {
		return nil, 0, err
	}
	if tag.RowsAffected() != 1 {
		return nil, 0, missingGlossary()
	}
	return map[string]any{"fileId": fileID, "ref": payload, "info": info}, 200, nil
}

func (api *glossaryAPI) createGlossaryInterchangeJob(r *http.Request, actor glossaryActor, g glossaryRecord) (any, int, error) {
	if err := api.requireInterchangeWrite(actor, g); err != nil {
		return nil, 0, err
	}
	if api.interchange == nil || strings.TrimSpace(os.Getenv(glossaryInterchangeQueueURLEnv)) == "" {
		return nil, 0, glossaryFailure(503, "glossary_interchange_unavailable", "Glossary interchange queue is unavailable")
	}
	var payload glossaryInterchangeJobPayload
	if err := readGlossaryBody(r, []string{"format"}, &payload); err != nil {
		return nil, 0, err
	}
	payload.GlossaryID = g.ID
	if payload.Operation == "" {
		if strings.HasSuffix(r.URL.Path, "/export") {
			payload.Operation = "export"
		} else {
			payload.Operation = "import"
		}
	}
	if payload.Operation != "import" && payload.Operation != "export" {
		return nil, 0, invalidGlossary()
	}
	if payload.Format != "csv" && payload.Format != "tbx" && payload.Format != "xlsx" {
		return nil, 0, invalidGlossary()
	}
	if payload.Operation == "import" && (payload.ArtifactFile == "" || payload.ArtifactRef.Key == "") {
		return nil, 0, invalidGlossary()
	}
	jobID := uuid.NewString()
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, 0, err
	}
	tx, err := api.pool.Begin(r.Context())
	if err != nil {
		return nil, 0, err
	}
	defer tx.Rollback(r.Context())
	if _, err := tx.Exec(r.Context(), `insert into jobs (id, organization_id, created_by_user_id, kind, status, input_payload) values ($1,$2,$3,'asset_management','queued',$4::jsonb)`, jobID, actor.organizationID, actor.userID, body); err != nil {
		return nil, 0, err
	}
	if _, err := tx.Exec(r.Context(), `insert into asset_management_job_details (job_id, asset_type, operation, config) values ($1,'glossary',$2,$3::jsonb)`, jobID, payload.Operation, body); err != nil {
		return nil, 0, err
	}
	if err := tx.Commit(r.Context()); err != nil {
		return nil, 0, err
	}
	queueURL := strings.TrimSpace(os.Getenv(glossaryInterchangeQueueURLEnv))
	if _, err := api.interchange.SendMessage(r.Context(), &sqs.SendMessageInput{QueueUrl: aws.String(queueURL), MessageBody: aws.String(mustJSON(glossaryInterchangeMessage{JobID: jobID, OrganizationID: actor.organizationID}))}); err != nil {
		_, _ = api.pool.Exec(r.Context(), `update jobs set status='failed', last_error=$1, updated_at=now(), completed_at=now() where id=$2`, err.Error(), jobID)
		return nil, 0, err
	}
	return map[string]any{"jobId": jobID, "status": "queued"}, 202, nil
}

func (api *glossaryAPI) getGlossaryInterchangeJob(r *http.Request, actor glossaryActor, g glossaryRecord) (any, int, error) {
	var id, status string
	var input, outcome []byte
	var lastError *string
	var createdAt, updatedAt time.Time
	err := api.pool.QueryRow(r.Context(), `select id,status,input_payload,outcome_payload,last_error,created_at,updated_at from jobs where id=$1 and organization_id=$2 and kind='asset_management'`, r.PathValue("jobId"), actor.organizationID).Scan(&id, &status, &input, &outcome, &lastError, &createdAt, &updatedAt)
	if err != nil {
		return nil, 0, missingGlossary()
	}
	var p glossaryInterchangeJobPayload
	if json.Unmarshal(input, &p) != nil || p.GlossaryID != g.ID {
		return nil, 0, missingGlossary()
	}
	return map[string]any{"id": id, "status": status, "inputPayload": json.RawMessage(input), "outcomePayload": nullableJSON(outcome), "lastError": lastError, "createdAt": formatGlossaryTime(createdAt), "updatedAt": formatGlossaryTime(updatedAt)}, 200, nil
}

func (api *glossaryAPI) downloadGlossaryInterchangeJob(r *http.Request, actor glossaryActor, g glossaryRecord) (any, int, error) {
	var outputFileID *string
	var input []byte
	var status string
	if err := api.pool.QueryRow(r.Context(), `select status,input_payload,outcome_payload->>'outputFileId' from jobs where id=$1 and organization_id=$2 and kind='asset_management'`, r.PathValue("jobId"), actor.organizationID).Scan(&status, &input, &outputFileID); err != nil {
		return nil, 0, missingGlossary()
	}
	var payload glossaryInterchangeJobPayload
	if json.Unmarshal(input, &payload) != nil || payload.GlossaryID != g.ID || status != "succeeded" || outputFileID == nil {
		return nil, 0, glossaryFailure(404, "glossary_interchange_output_not_ready", "Glossary export output is not ready")
	}
	if api.objects == nil {
		return nil, 0, glossaryFailure(503, "object_storage_not_configured", "Glossary object storage is unavailable")
	}
	var locationID, key string
	if err := api.pool.QueryRow(r.Context(), `select storage_provider,storage_key from stored_files where id=$1 and organization_id=$2`, *outputFileID, actor.organizationID).Scan(&locationID, &key); err != nil {
		return nil, 0, missingGlossary()
	}
	store, err := api.objects.Resolve(locationID)
	if err != nil {
		return nil, 0, err
	}
	signer, ok := store.(objectstore.Presigner)
	if !ok {
		return nil, 0, glossaryFailure(501, "object_storage_signing_unsupported", "Glossary object storage does not support signed downloads")
	}
	signed, err := signer.PresignDownload(r.Context(), key, 15*time.Minute)
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"download": signed}, 200, nil
}

func nullableJSON(value []byte) any {
	if len(value) == 0 {
		return nil
	}
	return json.RawMessage(value)
}

func mustJSON(value any) string { body, _ := json.Marshal(value); return string(body) }

func (api *glossaryAPI) requireInterchangeWrite(actor glossaryActor, g glossaryRecord) error {
	if g.Source != "native" || !actor.canManageGlossaries() {
		return glossaryFailure(403, "forbidden", "Insufficient permissions")
	}
	return nil
}
