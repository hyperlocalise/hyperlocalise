package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/sqs"
	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/internal/objectstore"
	"github.com/jackc/pgx/v5"
)

// glossaryInterchangeQueueURLEnv is the queue go-svc sends glossary imports to.
const glossaryInterchangeQueueURLEnv = "GLOSSARY_INTERCHANGE_QUEUE_URL"

var (
	errGlossaryImportUnavailable = errors.New("glossary import processing is not configured")
	errGlossaryWriteForbidden    = errors.New("the token owner cannot edit this glossary")
	errGlossaryImportNotFound    = fmt.Errorf("%w: glossary import", errResourceNotFound)
)

type glossaryImportInput struct {
	Format         string
	Mode           string
	StrictLocale   *bool
	SourceFilename *string
	Body           []byte
}

type glossaryImportDiagnostic struct {
	Severity  string  `json:"severity"`
	Code      string  `json:"code"`
	Message   string  `json:"message"`
	ConceptID *string `json:"conceptId"`
	TermID    *string `json:"termId"`
	Field     *string `json:"field"`
}

// glossaryImportReport is a glossary_import_runs row, the record go-svc's import reports read.
type glossaryImportReport struct {
	ID           string                     `json:"id"`
	GlossaryID   string                     `json:"glossaryId"`
	Format       string                     `json:"format"`
	Mode         string                     `json:"mode"`
	Status       string                     `json:"status"`
	Counts       map[string]int             `json:"counts"`
	ErrorCode    *string                    `json:"errorCode"`
	ErrorMessage *string                    `json:"errorMessage"`
	CreatedAt    time.Time                  `json:"createdAt"`
	CompletedAt  *time.Time                 `json:"completedAt"`
	Diagnostics  []glossaryImportDiagnostic `json:"diagnostics"`
}

// glossaryImportQueue hands an import run to the glossary interchange lambda.
type glossaryImportQueue interface {
	enqueue(ctx context.Context, runID string) error
}

type sqsGlossaryImportQueue struct {
	client   *sqs.Client
	queueURL string
}

// newGlossaryImportQueue returns nil, which disables imports, when the queue is not configured.
func newGlossaryImportQueue(ctx context.Context) (glossaryImportQueue, error) {
	queueURL := strings.TrimSpace(os.Getenv(glossaryInterchangeQueueURLEnv))
	if queueURL == "" {
		return nil, nil
	}
	config, err := awsconfig.LoadDefaultConfig(ctx, awsconfig.WithRegion(strings.TrimSpace(os.Getenv("AWS_REGION"))))
	if err != nil {
		return nil, fmt.Errorf("load AWS configuration: %w", err)
	}
	return &sqsGlossaryImportQueue{client: sqs.NewFromConfig(config), queueURL: queueURL}, nil
}

// enqueue sends the message go-svc's glossaryInterchangeMessage describes.
func (q *sqsGlossaryImportQueue) enqueue(ctx context.Context, runID string) error {
	body, err := json.Marshal(map[string]any{"schemaVersion": 1, "runId": runID, "operation": "import"})
	if err != nil {
		return err
	}
	_, err = q.client.SendMessage(ctx, &sqs.SendMessageInput{QueueUrl: aws.String(q.queueURL), MessageBody: aws.String(string(body))})
	return err
}

// requireGlossaryWrite follows go-svc's requireConceptWrite: native glossaries only; admins and
// localization managers edit any, translators only team-controlled glossaries of their teams.
func requireGlossaryWrite(ctx context.Context, db queryRower, actor principal, item glossary) error {
	if item.Source != "native" {
		return errGlossaryNotNative
	}
	switch actor.Role {
	case "admin", "localization_manager":
		return nil
	case "translator":
		if item.ControlLevel != "team" || item.TeamID == nil {
			return errGlossaryWriteForbidden
		}
		var member bool
		if err := db.QueryRow(ctx, `SELECT EXISTS (
				SELECT 1 FROM team_memberships tm JOIN teams t ON t.id = tm.team_id
				WHERE tm.user_id = $1 AND t.id = $2 AND t.organization_id = $3
			)`, actor.UserID, *item.TeamID, actor.OrganizationID).Scan(&member); err != nil {
			return fmt.Errorf("check glossary team: %w", err)
		}
		if !member {
			return errGlossaryWriteForbidden
		}
		return nil
	default:
		return errGlossaryWriteForbidden
	}
}

// queueGlossaryImport stores the file where go-svc's upload flow puts it and queues the same
// run, so the glossary interchange lambda parses and applies it (TBX 2 and 3, CSV, XLSX).
func (s *postgresStore) queueGlossaryImport(ctx context.Context, actor principal, glossaryID string, input glossaryImportInput) (glossaryImportReport, error) {
	if s.objects == nil || s.glossaryImports == nil {
		return glossaryImportReport{}, errGlossaryImportUnavailable
	}
	item, err := s.getGlossary(ctx, actor, glossaryID)
	if err != nil {
		return glossaryImportReport{}, err
	}
	if err := requireGlossaryWrite(ctx, s.pool, actor, item); err != nil {
		return glossaryImportReport{}, err
	}
	runID := uuid.NewString()
	location := s.objects.DefaultLocationID()
	key := fmt.Sprintf("glossary-interchange/%s/%s/import/%s.%s", actor.OrganizationID, item.ID, runID, input.Format)
	if _, _, err := s.objects.Put(ctx, objectstore.PutInput{
		Key: key, Body: bytes.NewReader(input.Body), Size: int64(len(input.Body)),
		ContentType: "application/octet-stream", IfAbsent: true,
	}); err != nil {
		return glossaryImportReport{}, fmt.Errorf("store glossary import: %w", err)
	}
	options, err := json.Marshal(map[string]any{
		"mode": input.Mode, "strictLocale": input.StrictLocale,
		"actor": map[string]string{"kind": "api_key", "credentialId": actor.TokenID},
	})
	if err != nil {
		return glossaryImportReport{}, err
	}
	sum := sha256.Sum256(input.Body)
	if _, err := s.pool.Exec(ctx, `INSERT INTO glossary_import_runs (
			id, organization_id, glossary_id, created_by_user_id, operation, format, mode, status, options,
			source_filename, source_sha256, source_object_location, source_object_key
		) VALUES ($1, $2, $3, $4, 'import', $5, $6, 'queued', $7::jsonb, $8, $9, $10, $11)`,
		runID, actor.OrganizationID, item.ID, actor.UserID, input.Format, input.Mode, string(options),
		input.SourceFilename, hex.EncodeToString(sum[:]), location, key); err != nil {
		return glossaryImportReport{}, fmt.Errorf("record glossary import: %w", err)
	}
	if err := s.glossaryImports.enqueue(ctx, runID); err != nil {
		_, _ = s.pool.Exec(context.WithoutCancel(ctx), `UPDATE glossary_import_runs SET status = 'failed',
			error_code = 'glossary_interchange_enqueue_failed', error_message = $2, completed_at = now() WHERE id = $1`, runID, err.Error())
		return glossaryImportReport{}, fmt.Errorf("queue glossary import: %w", err)
	}
	return s.getGlossaryImportReport(ctx, actor, item.ID, runID)
}

func (s *postgresStore) getGlossaryImportReport(ctx context.Context, actor principal, glossaryID, reportID string) (glossaryImportReport, error) {
	item, err := s.getGlossary(ctx, actor, glossaryID)
	if err != nil {
		return glossaryImportReport{}, err
	}
	if _, err := uuid.Parse(reportID); err != nil {
		return glossaryImportReport{}, errGlossaryImportNotFound
	}
	var report glossaryImportReport
	var counts []byte
	err = s.pool.QueryRow(ctx, `SELECT id, glossary_id, format, mode, status, counts, error_code, error_message, created_at, completed_at
		FROM glossary_import_runs
		WHERE id = $1 AND glossary_id = $2 AND organization_id = $3 AND operation = 'import'`,
		reportID, item.ID, actor.OrganizationID).Scan(&report.ID, &report.GlossaryID, &report.Format, &report.Mode, &report.Status,
		&counts, &report.ErrorCode, &report.ErrorMessage, &report.CreatedAt, &report.CompletedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return glossaryImportReport{}, errGlossaryImportNotFound
	}
	if err != nil {
		return glossaryImportReport{}, fmt.Errorf("load glossary import: %w", err)
	}
	report.Counts = map[string]int{}
	if err := json.Unmarshal(counts, &report.Counts); err != nil {
		return glossaryImportReport{}, fmt.Errorf("decode glossary import counts: %w", err)
	}
	rows, err := s.pool.Query(ctx, `SELECT severity, code, message, concept_id, term_id, field
		FROM glossary_import_report_entries WHERE run_id = $1 ORDER BY created_at, id LIMIT 500`, report.ID)
	if err != nil {
		return glossaryImportReport{}, fmt.Errorf("list glossary import diagnostics: %w", err)
	}
	report.Diagnostics, err = collectRows(rows, func(row rowScanner) (glossaryImportDiagnostic, error) {
		var d glossaryImportDiagnostic
		err := row.Scan(&d.Severity, &d.Code, &d.Message, &d.ConceptID, &d.TermID, &d.Field)
		return d, err
	})
	return report, err
}
