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
	"strings"
	"time"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/memoryinterchange"
	"github.com/hyperlocalise/hyperlocalise/internal/objectstore"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const MAX_MEMORY_INTERCHANGE_BYTES int64 = 100 * 1024 * 1024

// memoryImportReportSampleLimit bounds representative translations stored on the
// completed import report.
const memoryImportReportSampleLimit = 5

type permanentMemoryInterchangeError struct {
	cause error
}

func (e permanentMemoryInterchangeError) Error() string { return e.cause.Error() }

func (e permanentMemoryInterchangeError) Unwrap() error { return e.cause }

func permanentMemoryInterchangeFailure(err error) error {
	return permanentMemoryInterchangeError{cause: err}
}

func isPermanentMemoryInterchangeFailure(err error) bool {
	var permanent permanentMemoryInterchangeError
	return errors.As(err, &permanent)
}

func memoryImportReportSamples(candidates []memoryinterchange.Candidate, limit int) []map[string]any {
	samples := make([]map[string]any, 0, limit)
	for _, candidate := range candidates {
		if len(samples) >= limit {
			break
		}
		samples = append(samples, map[string]any{
			"sourceLocale": candidate.SourceLocale,
			"targetLocale": candidate.TargetLocale,
			"sourceText":   candidate.SourceText,
			"targetText":   candidate.TargetText,
		})
	}
	return samples
}

func processMemoryInterchangeRun(ctx context.Context, pool *pgxpool.Pool, objects *objectstore.Registry, message memoryInterchangeMessage) error {
	var operation, mode, format, location, sourceKey string
	var options []byte
	err := pool.QueryRow(ctx, `update memory_import_attempts set status='running', processing_started_at=now() where id=$1 and operation=$2 and (status='queued' or (status='running' and (processing_started_at is null or processing_started_at < now() - interval '15 minutes'))) returning operation, mode, format, coalesce(source_object_location,''), coalesce(source_object_key,''), options`, message.AttemptID, message.Operation).Scan(&operation, &mode, &format, &location, &sourceKey, &options)
	if err == pgx.ErrNoRows {
		return nil
	}
	if err != nil {
		return err
	}
	var runErr error
	if operation == "export" {
		runErr = runMemoryExport(ctx, pool, objects, message.AttemptID, format, options)
	} else {
		runErr = runMemoryImport(ctx, pool, objects, message.AttemptID, mode, format, location, sourceKey, options)
	}
	if runErr == nil {
		return nil
	}
	if ctx.Err() != nil {
		return runErr
	}
	failureCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	status := "queued"
	failureCode := "memory_interchange_retryable"
	if isPermanentMemoryInterchangeFailure(runErr) {
		status = "failed"
		failureCode = "memory_interchange_failed"
	}
	_, _ = pool.Exec(failureCtx, `update memory_import_attempts set status=$2, processing_started_at=null, failure_code=$3, failure_message=$4, completed_at=case when $2='failed' then now() else null end where id=$1 and status='running'`, message.AttemptID, status, failureCode, safeFailureMessage(runErr))
	return runErr
}

func runMemoryImport(ctx context.Context, pool *pgxpool.Pool, objects *objectstore.Registry, attemptID, mode, format, location, key string, options []byte) error {
	store, err := objects.Resolve(location)
	if err != nil {
		return err
	}
	info, err := store.Stat(ctx, key)
	if err != nil {
		return err
	}
	if info.Size <= 0 || info.Size > MAX_MEMORY_INTERCHANGE_BYTES {
		return permanentMemoryInterchangeFailure(fmt.Errorf("memory import object exceeds the 100 MB limit"))
	}
	body, _, err := store.Get(ctx, key)
	if err != nil {
		return err
	}
	defer func() { _ = body.Close() }()
	data, err := io.ReadAll(io.LimitReader(body, MAX_MEMORY_INTERCHANGE_BYTES+1))
	if err != nil {
		return err
	}
	if int64(len(data)) > MAX_MEMORY_INTERCHANGE_BYTES {
		return permanentMemoryInterchangeFailure(fmt.Errorf("memory import object exceeds the 100 MB limit"))
	}
	maxUnits := 1_000_000
	var parsedOptions struct {
		MaxUnits *int `json:"maxUnits"`
	}
	if err := json.Unmarshal(options, &parsedOptions); err == nil && parsedOptions.MaxUnits != nil && *parsedOptions.MaxUnits > 0 {
		maxUnits = *parsedOptions.MaxUnits
	}
	candidates, issues, header, err := memoryinterchange.Parse(format, string(data))
	if err != nil {
		return permanentMemoryInterchangeFailure(err)
	}
	if len(candidates) > maxUnits {
		candidates = candidates[:maxUnits]
		issues = append(issues, memoryinterchange.Issue{Severity: "warning", Code: "truncated_units", Message: "Import truncated to maxUnits"})
	}
	warned := 0
	failed := 0
	for _, issue := range issues {
		if issue.Severity == "warning" {
			warned++
		} else {
			failed++
		}
	}
	if err := persistMemoryDiagnostics(ctx, pool, attemptID, issues); err != nil {
		return err
	}
	hash := sha256.Sum256(data)
	hashHex := hex.EncodeToString(hash[:])
	headerValue := any(nil)
	if header != nil {
		headerValue = *header
	}

	var userID *string
	var memoryID, memoryStatus, organizationID string
	if err := pool.QueryRow(ctx, `select a.created_by_user_id::text, a.memory_id::text, m.status, a.organization_id::text from memory_import_attempts a join memories m on m.id=a.memory_id where a.id=$1`, attemptID).Scan(&userID, &memoryID, &memoryStatus, &organizationID); err != nil {
		return err
	}
	if memoryStatus == "archived" {
		return permanentMemoryInterchangeFailure(fmt.Errorf("translation memory is archived"))
	}
	if mode != "apply" && mode != "preview" {
		return permanentMemoryInterchangeFailure(fmt.Errorf("memory import mode %q is not supported", mode))
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	existingByExternalKey, existingBySourceKey, err := loadExistingEntriesForImport(ctx, tx, memoryID, candidates)
	if err != nil {
		return err
	}
	planned := memoryinterchange.PlanImportActions(candidates, existingByExternalKey, existingBySourceKey)
	created, updated, variantCreated, skipped := memoryinterchange.CountPlannedImportActions(planned)

	counts := map[string]any{
		"totalRead": len(candidates), "created": created, "updated": updated,
		"variantCreated": variantCreated, "skipped": skipped, "warned": warned, "failed": failed,
		"samples": memoryImportReportSamples(candidates, memoryImportReportSampleLimit),
	}

	if mode == "preview" {
		countsJSON, marshalErr := json.Marshal(counts)
		if marshalErr != nil {
			return marshalErr
		}
		if _, err = tx.Exec(ctx, `update memory_import_attempts set status=$2, processing_started_at=null, source_sha256=$3, counts=$4::jsonb, header_srclang=$5, completed_at=now() where id=$1 and status='running'`, attemptID, "preview_completed", hashHex, countsJSON, headerValue); err != nil {
			return err
		}
		return tx.Commit(ctx)
	}

	created, updated, variantCreated, skipped, err = applyPlannedMemoryImport(ctx, tx, memoryID, attemptID, userID, planned)
	if err != nil {
		return err
	}
	counts["created"] = created
	counts["updated"] = updated
	counts["variantCreated"] = variantCreated
	counts["skipped"] = skipped
	countsJSON, err := json.Marshal(counts)
	if err != nil {
		return err
	}
	actorUserID := ""
	if userID != nil {
		actorUserID = *userID
	}
	if err := insertTranslationMemoryImportedActivity(ctx, tx, organizationID, actorUserID, memoryID, attemptID, created+variantCreated); err != nil {
		return err
	}
	status := "completed"
	if failed > 0 {
		status = "partially_successful"
	}
	if _, err = tx.Exec(ctx, `update memory_import_attempts set status=$2, processing_started_at=null, source_sha256=$3, counts=$4::jsonb, header_srclang=$5, completed_at=now() where id=$1 and status='running'`, attemptID, status, hashHex, countsJSON, headerValue); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func runMemoryExport(ctx context.Context, pool *pgxpool.Pool, objects *objectstore.Registry, attemptID, format string, options []byte) error {
	var memoryID, memoryName string
	if err := pool.QueryRow(ctx, `select a.memory_id, m.name from memory_import_attempts a join memories m on m.id=a.memory_id where a.id=$1`, attemptID).Scan(&memoryID, &memoryName); err != nil {
		return err
	}
	location := objects.DefaultLocationID()
	var filters map[string]any
	if err := json.Unmarshal(options, &filters); err != nil {
		return err
	}
	where := `memory_id=$1`
	args := []any{memoryID}
	if source, ok := filters["sourceLocale"].(string); ok && strings.TrimSpace(source) != "" {
		args = append(args, strings.ReplaceAll(strings.TrimSpace(source), "_", "-"))
		where += fmt.Sprintf(" and source_locale=$%d", len(args))
	}
	if target, ok := filters["targetLocale"].(string); ok && strings.TrimSpace(target) != "" {
		args = append(args, strings.ReplaceAll(strings.TrimSpace(target), "_", "-"))
		where += fmt.Sprintf(" and target_locale=$%d", len(args))
	}
	rows, err := pool.Query(ctx, `select source_locale, target_locale, source_text, target_text, match_score, external_key from memory_entries where `+where+` order by created_at asc, id asc`, args...)
	if err != nil {
		return err
	}
	defer rows.Close()
	entries := []memoryinterchange.Candidate{}
	for rows.Next() {
		var row memoryinterchange.Candidate
		if err := rows.Scan(&row.SourceLocale, &row.TargetLocale, &row.SourceText, &row.TargetText, &row.MatchScore, &row.ExternalKey); err != nil {
			return err
		}
		entries = append(entries, row)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	format = strings.ToLower(strings.TrimSpace(format))
	if format == "" {
		format = "tmx"
	}
	var body []byte
	contentType := "application/x-tmx+xml; charset=utf-8"
	ext := "tmx"
	if format == "csv" {
		body, err = memoryinterchange.SerializeCSV(entries)
		contentType, ext = "text/csv; charset=utf-8", "csv"
	} else {
		body = memoryinterchange.SerializeTMX(entries)
	}
	if err != nil {
		return err
	}
	key := fmt.Sprintf("memory-interchange/%s/%s/export/%s.%s", location, memoryID, attemptID, ext)
	if _, _, err := objects.Put(ctx, objectstore.PutInput{Key: key, Body: bytes.NewReader(body), Size: int64(len(body)), ContentType: contentType}); err != nil {
		return err
	}
	filename := fmt.Sprintf("%s.%s", exportSlug(memoryName), ext)
	counts, _ := json.Marshal(map[string]int{"entries": len(entries)})
	_, err = pool.Exec(ctx, `update memory_import_attempts set status='completed', processing_started_at=null, result_object_location=$2, result_object_key=$3, result_filename=$4, result_content_type=$5, counts=$6::jsonb, completed_at=now() where id=$1`, attemptID, location, key, filename, contentType, counts)
	return err
}

func persistMemoryDiagnostics(ctx context.Context, pool *pgxpool.Pool, attemptID string, issues []memoryinterchange.Issue) error {
	if _, err := pool.Exec(ctx, `delete from memory_import_attempt_diagnostics where attempt_id=$1`, attemptID); err != nil {
		return err
	}
	for _, issue := range issues {
		if _, err := pool.Exec(ctx, `insert into memory_import_attempt_diagnostics (attempt_id, severity, code, message, unit_index, tuid) values ($1,$2,$3,$4,$5,$6)`, attemptID, issue.Severity, issue.Code, issue.Message, issue.UnitIndex, issue.Tuid); err != nil {
			return err
		}
	}
	return nil
}

func exportSlug(name string) string {
	value := strings.TrimSpace(name)
	var builder strings.Builder
	for _, char := range value {
		if (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || (char >= '0' && char <= '9') || char == '-' || char == '_' {
			builder.WriteRune(char)
		} else {
			builder.WriteByte('-')
		}
	}
	result := strings.Trim(builder.String(), "-")
	if result == "" {
		return "translation-memory"
	}
	return result
}

func safeFailureMessage(err error) string {
	message := strings.TrimSpace(err.Error())
	if len(message) > 500 {
		message = message[:500]
	}
	return message
}
