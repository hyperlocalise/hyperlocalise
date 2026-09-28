package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"log/slog"
	"os"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	awssecretsmanager "github.com/aws/aws-sdk-go-v2/service/secretsmanager"
	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/internal/objectstore"
	"github.com/hyperlocalise/hyperlocalise/internal/secretsmanager"
	"github.com/jackc/pgx/v5/pgxpool"
)

type glossaryInterchangeWorker struct {
	api  *glossaryAPI
	pool *pgxpool.Pool
}

type glossaryInterchangeBatchResponse struct {
	BatchItemFailures []struct {
		ItemIdentifier string `json:"itemIdentifier"`
	} `json:"batchItemFailures"`
}

func runGlossaryInterchangeLambda() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	ctx := context.Background()
	awsCfg, err := awsconfig.LoadDefaultConfig(ctx)
	if err != nil {
		log.Fatalf("configure AWS: %v", err)
	}
	secretConfig, err := secretsmanager.ConfigFromEnv()
	if err != nil {
		log.Fatalf("configure database secret: %v", err)
	}
	loader, err := secretsmanager.NewLoader(awssecretsmanager.NewFromConfig(awsCfg), secretConfig)
	if err != nil {
		log.Fatalf("configure database secret loader: %v", err)
	}
	databaseURL, err := loader.Load(ctx)
	if err != nil {
		log.Fatalf("load database URL: %v", err)
	}
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		log.Fatalf("connect database: %v", err)
	}
	objects, err := configureObjectStorage(ctx)
	if err != nil {
		log.Fatalf("configure object storage: %v", err)
	}
	worker := &glossaryInterchangeWorker{pool: pool, api: &glossaryAPI{pool: pool, objects: objects}}
	logger.Info("glossary_interchange_lambda_started")
	lambda.Start(worker.Handle)
}

func (w *glossaryInterchangeWorker) Handle(ctx context.Context, event events.SQSEvent) (glossaryInterchangeBatchResponse, error) {
	response := glossaryInterchangeBatchResponse{}
	for _, record := range event.Records {
		if err := w.handleRecord(ctx, record.Body); err != nil {
			response.BatchItemFailures = append(response.BatchItemFailures, struct {
				ItemIdentifier string `json:"itemIdentifier"`
			}{ItemIdentifier: record.MessageId})
		}
	}
	return response, nil
}

func (w *glossaryInterchangeWorker) handleRecord(ctx context.Context, body string) error {
	var message glossaryInterchangeMessage
	if err := json.Unmarshal([]byte(body), &message); err != nil {
		return fmt.Errorf("decode interchange message: %w", err)
	}
	var status string
	var input []byte
	var userID *string
	if err := w.pool.QueryRow(ctx, `update jobs set status='running', updated_at=now() where id=$1 and organization_id=$2 and status='queued' returning status,input_payload,created_by_user_id`, message.JobID, message.OrganizationID).Scan(&status, &input, &userID); err != nil {
		return fmt.Errorf("claim interchange job: %w", err)
	}
	var payload glossaryInterchangeJobPayload
	if err := json.Unmarshal(input, &payload); err != nil {
		return w.fail(ctx, message.JobID, fmt.Errorf("decode job payload: %w", err))
	}
	g, err := scanGlossary(w.pool.QueryRow(ctx, `select `+glossaryColumns+` from glossaries g where g.id=$1 and g.organization_id=$2`, payload.GlossaryID, message.OrganizationID))
	if err != nil {
		return w.fail(ctx, message.JobID, fmt.Errorf("load glossary: %w", err))
	}
	actor := glossaryActor{organizationID: message.OrganizationID}
	if userID != nil {
		actor.userID = *userID
	}
	if payload.Operation == "import" {
		if err := w.runImport(ctx, actor, g, payload); err != nil {
			return w.fail(ctx, message.JobID, err)
		}
	} else if payload.Operation == "export" {
		if err := w.runExport(ctx, actor, g, message.JobID, payload); err != nil {
			return w.fail(ctx, message.JobID, err)
		}
	} else {
		return w.fail(ctx, message.JobID, fmt.Errorf("unsupported glossary operation %q", payload.Operation))
	}
	_, err = w.pool.Exec(ctx, `update jobs set status='succeeded', updated_at=now(), completed_at=now() where id=$1`, message.JobID)
	return err
}

func (w *glossaryInterchangeWorker) runImport(ctx context.Context, actor glossaryActor, g glossaryRecord, payload glossaryInterchangeJobPayload) error {
	store, err := w.api.objects.Resolve(payload.ArtifactRef.LocationID)
	if err != nil {
		return err
	}
	body, _, err := store.Get(ctx, payload.ArtifactRef.Key)
	if err != nil {
		return err
	}
	defer body.Close()
	content, err := io.ReadAll(io.LimitReader(body, 32<<20))
	if err != nil {
		return err
	}
	importPayload := glossaryImportPayload{Format: payload.Format, Content: string(content), Mode: &payload.Mode, SourceFilename: &payload.SourceFilename}
	if importPayload.Mode == nil || *importPayload.Mode == "" {
		mode := "merge"
		importPayload.Mode = &mode
	}
	concepts, diagnostics := parseGlossaryImport(payload.Format, importPayload.Content)
	concepts, diagnostics = applyGlossaryImportLocaleOptions(g, importPayload, concepts, diagnostics)
	_, _, _, _, err = w.api.applyGlossaryImport(ctx, actor, g, importPayload, *importPayload.Mode, concepts, diagnostics)
	return err
}

func (w *glossaryInterchangeWorker) runExport(ctx context.Context, actor glossaryActor, g glossaryRecord, jobID string, payload glossaryInterchangeJobPayload) error {
	concepts, err := w.api.loadGlossaryExportDocument(ctx, g)
	if err != nil {
		return err
	}
	var data []byte
	contentType := ""
	extension := payload.Format
	switch payload.Format {
	case "csv":
		data, err = serializeGlossaryCSV(concepts)
		contentType = "text/csv; charset=utf-8"
	case "tbx":
		data, err = serializeGlossaryTBX(g, concepts)
		contentType = "application/xml; charset=utf-8"
	case "xlsx":
		data, err = serializeGlossaryXLSX(concepts)
		contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
	default:
		return fmt.Errorf("unsupported export format %q", payload.Format)
	}
	if err != nil {
		return err
	}
	fileID := uuid.NewString()
	key := "glossary-interchange/" + actor.organizationID + "/" + jobID + "/" + glossaryExportSlug(g.Name) + "." + extension
	store, err := w.api.objects.Resolve(w.api.objects.DefaultID())
	if err != nil {
		return err
	}
	_, err = store.Put(ctx, objectstore.PutInput{Key: key, Body: bytes.NewReader(data), Size: int64(len(data)), ContentType: contentType, IfAbsent: true})
	if err != nil {
		return err
	}
	if _, err = w.pool.Exec(ctx, `insert into stored_files (id, organization_id, created_by_user_id, source_job_id, role, source_kind, storage_provider, storage_key, storage_url, filename, content_type, byte_size, sha256) values ($1,$2,$3,$4,'output','job_output',$5,$6,'',$7,$8,$9,$10)`, fileID, actor.organizationID, actor.userID, jobID, w.api.objects.DefaultID(), key, glossaryExportSlug(g.Name)+"."+extension, contentType, len(data), sha256Bytes(data)); err != nil {
		return err
	}
	_, err = w.pool.Exec(ctx, `update jobs set outcome_payload=$1::jsonb where id=$2`, mustJSON(map[string]any{"outputFileId": fileID, "filename": glossaryExportSlug(g.Name) + "." + extension}), jobID)
	return err
}

func sha256Bytes(value []byte) string { sum := sha256.Sum256(value); return hex.EncodeToString(sum[:]) }

func (w *glossaryInterchangeWorker) fail(ctx context.Context, jobID string, err error) error {
	_, updateErr := w.pool.Exec(ctx, `update jobs set status='failed', last_error=$1, updated_at=now(), completed_at=now() where id=$2`, err.Error(), jobID)
	if updateErr != nil {
		return fmt.Errorf("%v; update failed job: %w", err, updateErr)
	}
	return err
}
