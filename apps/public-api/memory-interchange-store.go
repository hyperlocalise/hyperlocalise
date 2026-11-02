package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/csv"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"strconv"
	"strings"

	"github.com/google/uuid"
	editor_export "github.com/hyperlocalise/hyperlocalise/internal/i18n/editor-export"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/memoryinterchange"
	"github.com/jackc/pgx/v5"
)

// maxMemoryImportUnits matches go-svc's inline import cap.
const maxMemoryImportUnits = 10_000

var (
	errMemoryNotNative = errors.New("translation memory is managed by an external TMS")
	errMemoryArchived  = errors.New("translation memory is archived")
)

type memoryExportQuery struct {
	Format       string
	SourceLocale string
	TargetLocale string
}

// interchangeFile is a serialized download.
type interchangeFile struct {
	ContentType string
	Filename    string
	Body        []byte
}

type memoryImportInput struct {
	Format         string
	Content        string
	SourceFilename *string
}

type memoryImportIssue struct {
	Severity  string  `json:"severity"`
	Code      string  `json:"code"`
	Message   string  `json:"message"`
	UnitIndex *int    `json:"unitIndex,omitempty"`
	Tuid      *string `json:"tuid,omitempty"`
}

// memoryImportResult matches the counts go-svc's inline TMX import returns.
type memoryImportResult struct {
	ImportAttemptID string              `json:"importAttemptId"`
	ImportBatchID   string              `json:"importBatchId"`
	TotalRead       int                 `json:"totalRead"`
	Created         int                 `json:"created"`
	Updated         int                 `json:"updated"`
	Warned          int                 `json:"warned"`
	Failed          int                 `json:"failed"`
	HeaderSrclang   *string             `json:"headerSrclang"`
	Issues          []memoryImportIssue `json:"issues"`
}

// memoryExportSlug follows go-svc's glossaryExportSlug, which names memory exports too.
func memoryExportSlug(name string) string {
	var b strings.Builder
	for _, r := range strings.TrimSpace(name) {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9', r == '.', r == '-':
			b.WriteRune(r)
		default:
			b.WriteByte('-')
		}
	}
	out := strings.Trim(b.String(), "-")
	if out == "" {
		return "glossary"
	}
	return out
}

// escapeMemoryCSVFormula follows go-svc's escapeGlossaryCSVFormula, which memoryinterchange's
// CSV parser reverses on import.
func escapeMemoryCSVFormula(value string) string {
	if strings.HasPrefix(value, memoryinterchange.FormulaEscapePrefix) {
		return memoryinterchange.FormulaEscapePrefix + value
	}
	trimmed := strings.TrimLeft(value, " \t")
	if trimmed == "" {
		return value
	}
	switch trimmed[0] {
	case '=', '+', '-', '@':
		return memoryinterchange.FormulaEscapePrefix + value
	default:
		return value
	}
}

// exportMemoryEntries ports go-svc's exportMemoryEntries: TMX 1.4 keyed by external key, or
// the Hyperlocalise CSV row layout.
func (s *postgresStore) exportMemoryEntries(ctx context.Context, actor principal, memoryID string, query memoryExportQuery) (interchangeFile, error) {
	memory, err := s.getMemory(ctx, actor, memoryID)
	if err != nil {
		return interchangeFile{}, err
	}
	where := newSQLFilter("memory_id = $1", memory.ID)
	if query.SourceLocale != "" {
		where.add("source_locale = ?", query.SourceLocale)
	}
	if query.TargetLocale != "" {
		where.add("target_locale = ?", query.TargetLocale)
	}
	rows, err := s.pool.Query(ctx, `SELECT source_locale, target_locale, source_text, target_text, match_score, external_key
		FROM memory_entries WHERE `+where.sql()+` ORDER BY created_at ASC, id ASC`, where.args...)
	if err != nil {
		return interchangeFile{}, fmt.Errorf("list memory entries: %w", err)
	}
	entries, err := collectRows(rows, func(row rowScanner) (memoryinterchange.Candidate, error) {
		var item memoryinterchange.Candidate
		err := row.Scan(&item.SourceLocale, &item.TargetLocale, &item.SourceText, &item.TargetText, &item.MatchScore, &item.ExternalKey)
		return item, err
	})
	if err != nil {
		return interchangeFile{}, err
	}
	// go-svc records exports too. The export is served even if recording it fails.
	if err := insertActivity(ctx, s.pool, actor, activityEvent{
		EventType: "translation_memory_exported", TargetID: memory.ID, TargetKind: "translation_memory",
		Payload: map[string]any{"resourceId": memory.ID},
	}); err != nil {
		slog.ErrorContext(ctx, "activity_log_record_failed", "event_type", "translation_memory_exported", "error", err)
	}
	slug := memoryExportSlug(memory.Name)
	if query.SourceLocale != "" && query.TargetLocale != "" {
		slug += "-" + query.SourceLocale + "-" + query.TargetLocale
	}
	if query.Format == "csv" {
		var buf bytes.Buffer
		buf.WriteString("\ufeffsource_locale,target_locale,source_text,target_text,match_score\r\n")
		w := csv.NewWriter(&buf)
		w.UseCRLF = true
		for _, row := range entries {
			_ = w.Write([]string{
				escapeMemoryCSVFormula(row.SourceLocale),
				escapeMemoryCSVFormula(row.TargetLocale),
				escapeMemoryCSVFormula(row.SourceText),
				escapeMemoryCSVFormula(row.TargetText),
				strconv.Itoa(row.MatchScore),
			})
		}
		w.Flush()
		if err := w.Error(); err != nil {
			return interchangeFile{}, fmt.Errorf("write memory csv: %w", err)
		}
		return interchangeFile{ContentType: "text/csv; charset=utf-8", Filename: slug + ".csv", Body: buf.Bytes()}, nil
	}
	editorRows := make([]editor_export.Row, 0, len(entries))
	for i, row := range entries {
		key := strconv.Itoa(i + 1)
		if row.ExternalKey != nil && *row.ExternalKey != "" {
			key = *row.ExternalKey
		}
		editorRows = append(editorRows, editor_export.Row{
			Key: key, SourceLocale: row.SourceLocale, TargetLocale: row.TargetLocale,
			SourceText: row.SourceText, TargetText: row.TargetText,
		})
	}
	return interchangeFile{
		ContentType: "application/x-tmx+xml; charset=utf-8",
		Filename:    slug + ".tmx",
		Body:        editor_export.SerializeTMX(editorRows),
	}, nil
}

// importMemoryEntries ports go-svc's inline importMemoryEntries: each unit updates the entry
// with the same external key (TMX tuid) or the same locale pair and normalized source text, or
// creates one, and the run is recorded as a memory import attempt.
func (s *postgresStore) importMemoryEntries(ctx context.Context, actor principal, memoryID string, input memoryImportInput) (memoryImportResult, error) {
	memory, err := s.getMemory(ctx, actor, memoryID)
	if err != nil {
		return memoryImportResult{}, err
	}
	if memory.Source != "native" {
		return memoryImportResult{}, errMemoryNotNative
	}
	if memory.Status == "archived" {
		return memoryImportResult{}, errMemoryArchived
	}
	result := memoryImportResult{ImportBatchID: uuid.NewString(), Issues: []memoryImportIssue{}}
	candidates, parseIssues, header, err := memoryinterchange.Parse(input.Format, input.Content)
	if err != nil {
		parseIssues = []memoryinterchange.Issue{{Severity: "error", Code: "invalid_format", Message: err.Error()}}
	}
	result.HeaderSrclang = header
	for _, issue := range parseIssues {
		result.Issues = append(result.Issues, memoryImportIssue{
			Severity: issue.Severity, Code: issue.Code, Message: issue.Message, UnitIndex: issue.UnitIndex, Tuid: issue.Tuid,
		})
	}
	if len(candidates) > maxMemoryImportUnits {
		candidates = candidates[:maxMemoryImportUnits]
		result.Issues = append(result.Issues, memoryImportIssue{Severity: "warning", Code: "truncated_units", Message: "Import truncated to maxUnits"})
	}
	for _, issue := range result.Issues {
		if issue.Severity == "warning" {
			result.Warned++
		} else {
			result.Failed++
		}
	}
	result.TotalRead = len(candidates)

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return memoryImportResult{}, fmt.Errorf("begin transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	for _, candidate := range candidates {
		created, err := upsertMemoryCandidate(ctx, tx, actor, memory.ID, result.ImportBatchID, candidate)
		if err != nil {
			return memoryImportResult{}, err
		}
		if created {
			result.Created++
		} else {
			result.Updated++
		}
	}
	result.ImportAttemptID, err = recordMemoryImportAttempt(ctx, tx, actor, memory.ID, input, result)
	if err != nil {
		return memoryImportResult{}, err
	}
	// The memory interchange lambda records the same event for imports with changes.
	if itemCount := result.Created + result.Updated; itemCount > 0 {
		payload := map[string]any{"batchId": result.ImportAttemptID, "itemCount": itemCount, "resourceId": memory.ID}
		if input.SourceFilename != nil {
			payload["fileName"] = *input.SourceFilename
		}
		if err := insertActivity(ctx, tx, actor, activityEvent{
			EventType: "translation_memory_imported", TargetID: memory.ID, TargetKind: "translation_memory", Payload: payload,
		}); err != nil {
			return memoryImportResult{}, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return memoryImportResult{}, fmt.Errorf("commit memory import: %w", err)
	}
	return result, nil
}

func upsertMemoryCandidate(ctx context.Context, tx pgx.Tx, actor principal, memoryID, batchID string, candidate memoryinterchange.Candidate) (bool, error) {
	normalized := memoryinterchange.NormalizeSourceText(candidate.SourceText)
	// A stable external key wins over source-text matching, so a corrected source updates the
	// same unit instead of colliding on the unique (memory_id, external_key) index.
	var existingID string
	err := tx.QueryRow(ctx, `SELECT id FROM memory_entries
		WHERE memory_id = $1 AND (
			($5::text IS NOT NULL AND external_key = $5)
			OR (source_locale = $2 AND target_locale = $3 AND normalized_source_text = $4)
		)
		ORDER BY (external_key IS NOT DISTINCT FROM $5) DESC
		LIMIT 1
		FOR UPDATE`, memoryID, candidate.SourceLocale, candidate.TargetLocale, normalized, candidate.ExternalKey).Scan(&existingID)
	if errors.Is(err, pgx.ErrNoRows) {
		if _, err := tx.Exec(ctx, `INSERT INTO memory_entries (
				memory_id, source_locale, target_locale, source_text, normalized_source_text, target_text,
				match_score, provenance, created_by_user_id, import_batch_id, external_key
			) VALUES ($1, $2, $3, $4, $5, $6, $7, 'import', $8, $9, $10)`,
			memoryID, candidate.SourceLocale, candidate.TargetLocale, candidate.SourceText, normalized,
			candidate.TargetText, candidate.MatchScore, actor.UserID, batchID, candidate.ExternalKey); err != nil {
			return false, fmt.Errorf("insert memory entry: %w", err)
		}
		return true, nil
	}
	if err != nil {
		return false, fmt.Errorf("find memory entry: %w", err)
	}
	if _, err := tx.Exec(ctx, `UPDATE memory_entries SET
			source_locale = $3, target_locale = $4, source_text = $5, normalized_source_text = $6,
			target_text = $7, match_score = $8, provenance = 'import', modified_by_user_id = $9,
			import_batch_id = $10,
			external_key = CASE WHEN EXISTS (
				SELECT 1 FROM memory_entries o WHERE o.memory_id = $2 AND o.external_key = $11 AND o.id <> $1
			) THEN external_key ELSE COALESCE($11, external_key) END,
			version = version + 1, updated_at = now()
		WHERE id = $1 AND memory_id = $2`,
		existingID, memoryID, candidate.SourceLocale, candidate.TargetLocale, candidate.SourceText, normalized,
		candidate.TargetText, candidate.MatchScore, actor.UserID, batchID, candidate.ExternalKey); err != nil {
		return false, fmt.Errorf("update memory entry: %w", err)
	}
	return false, nil
}

// recordMemoryImportAttempt mirrors go-svc's persistMemoryImportAttempt, so the run shows in the
// memory's import history.
func recordMemoryImportAttempt(ctx context.Context, tx pgx.Tx, actor principal, memoryID string, input memoryImportInput, result memoryImportResult) (string, error) {
	report := map[string]any{
		"totalRead": result.TotalRead, "created": result.Created, "updated": result.Updated, "variantCreated": 0,
		"skipped": 0, "warned": result.Warned, "failed": result.Failed, "issues": result.Issues,
		"headerSrclang": result.HeaderSrclang, "truncatedIssues": false,
	}
	counts, err := json.Marshal(report)
	if err != nil {
		return "", fmt.Errorf("encode import report: %w", err)
	}
	status := "completed"
	if result.Failed > 0 {
		status = "partially_successful"
	}
	sum := sha256.Sum256([]byte(input.Content))
	size := len(input.Content)
	var attemptID string
	if err := tx.QueryRow(ctx, `INSERT INTO memory_import_attempts (
			organization_id, memory_id, created_by_user_id, status, format, options, source_filename,
			source_byte_size, source_sha256, counts, header_srclang, completed_at
		) VALUES ($1, $2, $3, $4, $5, '{}'::jsonb, $6, $7, $8, $9::jsonb, $10, now())
		RETURNING id`,
		actor.OrganizationID, memoryID, actor.UserID, status, input.Format, input.SourceFilename, size,
		hex.EncodeToString(sum[:]), string(counts), result.HeaderSrclang,
	).Scan(&attemptID); err != nil {
		return "", fmt.Errorf("record import attempt: %w", err)
	}
	for _, issue := range result.Issues {
		if _, err := tx.Exec(ctx, `INSERT INTO memory_import_attempt_diagnostics (attempt_id, severity, code, message, unit_index, tuid)
			VALUES ($1, $2, $3, $4, $5, $6)`, attemptID, issue.Severity, issue.Code, issue.Message, issue.UnitIndex, issue.Tuid); err != nil {
			return "", fmt.Errorf("record import diagnostic: %w", err)
		}
	}
	return attemptID, nil
}
