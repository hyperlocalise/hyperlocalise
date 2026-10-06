package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/csv"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	editor_export "github.com/hyperlocalise/hyperlocalise/internal/i18n/editor-export"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/memoryinterchange"
	"github.com/jackc/pgx/v5"
)

type memoryImportPayload struct {
	Format         string  `json:"format"`
	Content        string  `json:"content"`
	AttemptID      string  `json:"attemptId"`
	DryRun         *bool   `json:"dryRun"`
	Mode           string  `json:"mode"`
	MaxUnits       *int    `json:"maxUnits"`
	SourceFilename *string `json:"sourceFilename"`
	SourceByteSize *int    `json:"sourceByteSize"`
}

type memoryPromotePayload struct {
	ProjectID    string  `json:"projectId"`
	SourceLocale string  `json:"sourceLocale"`
	TargetLocale *string `json:"targetLocale"`
	SourcePath   *string `json:"sourcePath"`
}

type memoryImportCandidate struct {
	SourceLocale string
	TargetLocale string
	SourceText   string
	TargetText   string
	MatchScore   int
	ExternalKey  *string
	UnitIndex    int
	Tuid         *string
}

type memoryImportIssue struct {
	Severity  string  `json:"severity"`
	Code      string  `json:"code"`
	Message   string  `json:"message"`
	UnitIndex *int    `json:"unitIndex,omitempty"`
	Tuid      *string `json:"tuid,omitempty"`
}

func (api *memoryAPI) exportMemoryEntries(r *http.Request, m memoryRecord) (any, int, error) {
	format := strings.ToLower(trimMemoryInput(r.URL.Query().Get("format")))
	if format == "" {
		format = "tmx"
	}
	if format != "csv" && format != "tmx" {
		return nil, 0, invalidMemory()
	}
	sourceLocale := strings.ReplaceAll(trimMemoryInput(r.URL.Query().Get("sourceLocale")), "_", "-")
	targetLocale := strings.ReplaceAll(trimMemoryInput(r.URL.Query().Get("targetLocale")), "_", "-")
	where := `memory_id=$1`
	args := []any{m.ID}
	if sourceLocale != "" {
		args = append(args, sourceLocale)
		where += ` and source_locale=$` + strconv.Itoa(len(args))
	}
	if targetLocale != "" {
		args = append(args, targetLocale)
		where += ` and target_locale=$` + strconv.Itoa(len(args))
	}
	rows, err := api.pool.Query(r.Context(), `select source_locale, target_locale, source_text, target_text, match_score, external_key from memory_entries where `+where+` order by created_at asc, id asc`, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	type exportRow struct {
		sourceLocale, targetLocale, sourceText, targetText string
		matchScore                                         int
		externalKey                                        *string
	}
	entries := []exportRow{}
	for rows.Next() {
		var row exportRow
		if err := rows.Scan(&row.sourceLocale, &row.targetLocale, &row.sourceText, &row.targetText, &row.matchScore, &row.externalKey); err != nil {
			return nil, 0, err
		}
		entries = append(entries, row)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	slug := glossaryExportSlug(m.Name)
	if sourceLocale != "" && targetLocale != "" {
		slug = slug + "-" + sourceLocale + "-" + targetLocale
	}
	if format == "csv" {
		var buf bytes.Buffer
		buf.WriteString("\ufeffsource_locale,target_locale,source_text,target_text,match_score\r\n")
		w := csv.NewWriter(&buf)
		w.UseCRLF = true
		for _, row := range entries {
			_ = w.Write([]string{
				escapeGlossaryCSVFormula(row.sourceLocale),
				escapeGlossaryCSVFormula(row.targetLocale),
				escapeGlossaryCSVFormula(row.sourceText),
				escapeGlossaryCSVFormula(row.targetText),
				strconv.Itoa(row.matchScore),
			})
		}
		w.Flush()
		return interchangeDownload{contentType: "text/csv; charset=utf-8", filename: slug + ".csv", body: buf.Bytes()}, 200, w.Error()
	}
	editorRows := make([]editor_export.Row, 0, len(entries))
	for i, row := range entries {
		key := strconv.Itoa(i + 1)
		if row.externalKey != nil && *row.externalKey != "" {
			key = *row.externalKey
		}
		editorRows = append(editorRows, editor_export.Row{
			Key: key, SourceLocale: row.sourceLocale, TargetLocale: row.targetLocale,
			SourceText: row.sourceText, TargetText: row.targetText,
		})
	}
	body := editor_export.SerializeTMX(editorRows)
	return interchangeDownload{contentType: "application/x-tmx+xml; charset=utf-8", filename: slug + ".tmx", body: body}, 200, nil
}

func (api *memoryAPI) importMemoryEntries(r *http.Request, actor memoryActor, m memoryRecord) (any, int, error) {
	if !actor.canWriteMemories() {
		return nil, 0, memoryFailure(403, "forbidden", "Insufficient permissions")
	}
	if err := requireNativeMemory(m); err != nil {
		return nil, 0, err
	}
	if m.Status == "archived" {
		return nil, 0, memoryFailure(403, "memory_action_archived", "This translation memory is archived")
	}
	var payload memoryImportPayload
	if err := readMemoryBody(r, []string{"format", "content", "attemptId", "dryRun", "mode", "maxUnits", "sourceFilename", "sourceByteSize"}, &payload); err != nil {
		return nil, 0, err
	}
	if strings.TrimSpace(payload.AttemptID) != "" {
		return api.finalizeMemoryImport(r.Context(), actor, m, payload)
	}
	format := strings.ToLower(trimMemoryInput(payload.Format))
	if format != "csv" && format != "tmx" {
		return nil, 0, invalidMemory()
	}
	dryRun := payload.DryRun != nil && *payload.DryRun
	candidates, issues, headerSrclang := parseMemoryImport(format, payload.Content)
	maxUnits := 10000
	if payload.MaxUnits != nil && *payload.MaxUnits > 0 {
		maxUnits = *payload.MaxUnits
	}
	if len(candidates) > maxUnits {
		candidates = candidates[:maxUnits]
		issues = append(issues, memoryImportIssue{Severity: "warning", Code: "truncated_units", Message: "Import truncated to maxUnits"})
	}
	preview := []map[string]any{}
	created := 0
	updated := 0
	skipped := 0
	failed := 0
	warned := 0
	for _, issue := range issues {
		if issue.Severity == "warning" {
			warned++
		} else {
			failed++
		}
	}
	ctx := r.Context()
	batchID := uuid.NewString()
	var createdEntries []memoryEntryRecord
	var tx pgx.Tx
	if !dryRun {
		begun, beginErr := api.pool.Begin(ctx)
		if beginErr != nil {
			return nil, 0, beginErr
		}
		tx = begun
		defer func() { _ = tx.Rollback(ctx) }()
	}
	db := dictionaryDB(api.pool)
	if tx != nil {
		db = tx
	}
	for _, candidate := range candidates {
		normalized := normalizeMemorySourceText(candidate.SourceText)
		var existingID string
		err := db.QueryRow(ctx, `select id from memory_entries where memory_id=$1 and source_locale=$2 and target_locale=$3 and normalized_source_text=$4`, m.ID, candidate.SourceLocale, candidate.TargetLocale, normalized).Scan(&existingID)
		action := "create"
		if err == nil {
			action = "update"
		} else if !errorsIsNoRows(err) {
			return nil, 0, err
		}
		preview = append(preview, map[string]any{
			"sourceLocale": candidate.SourceLocale, "targetLocale": candidate.TargetLocale,
			"sourceText": candidate.SourceText, "targetText": candidate.TargetText,
			"externalKey": candidate.ExternalKey, "tuid": candidate.Tuid, "action": action,
		})
		if dryRun {
			if action == "create" {
				created++
			} else {
				updated++
			}
			continue
		}
		if action == "create" {
			entry, insertErr := scanMemoryEntry(db.QueryRow(ctx, `insert into memory_entries as e (memory_id, source_locale, target_locale, source_text, normalized_source_text, target_text, match_score, provenance, created_by_user_id, import_batch_id, external_key) values ($1,$2,$3,$4,$5,$6,$7,'import',$8,$9,$10) returning `+memoryEntryColumns,
				m.ID, candidate.SourceLocale, candidate.TargetLocale, candidate.SourceText, normalized, candidate.TargetText, candidate.MatchScore, actor.userID, batchID, candidate.ExternalKey))
			if insertErr != nil {
				return nil, 0, insertErr
			}
			createdEntries = append(createdEntries, entry)
			created++
		} else {
			_, updateErr := db.Exec(ctx, `update memory_entries set target_text=$5, match_score=$6, provenance='import', modified_by_user_id=$7, import_batch_id=$8, external_key=coalesce($9,external_key), version=version+1, updated_at=now() where id=$1 and memory_id=$2`,
				existingID, m.ID, candidate.SourceLocale, candidate.TargetLocale, candidate.TargetText, candidate.MatchScore, actor.userID, batchID, candidate.ExternalKey)
			if updateErr != nil {
				return nil, 0, updateErr
			}
			updated++
		}
	}
	report := map[string]any{
		"totalRead": len(candidates), "created": created, "updated": updated, "variantCreated": 0,
		"skipped": skipped, "warned": warned, "failed": failed, "issues": issues,
		"headerSrclang": headerSrclang, "truncatedIssues": false,
	}
	var importAttemptID any
	var importBatchID any
	if !dryRun {
		importBatchID = batchID
		attemptID, persistErr := api.persistMemoryImportAttempt(ctx, db, actor, m, payload, format, report, issues, headerSrclang)
		if persistErr != nil {
			return nil, 0, persistErr
		}
		if err := tx.Commit(ctx); err != nil {
			return nil, 0, err
		}
		importAttemptID = attemptID
	}
	status := 201
	if dryRun {
		status = 200
		createdEntries = []memoryEntryRecord{}
		importBatchID = nil
		importAttemptID = nil
	}
	return map[string]any{
		"memoryEntries": createdEntries, "imported": created, "skipped": skipped,
		"importBatchId": importBatchID, "importAttemptId": importAttemptID,
		"dryRun": dryRun, "preview": preview, "report": report,
	}, status, nil
}

func parseMemoryImport(format, content string) ([]memoryImportCandidate, []memoryImportIssue, *string) {
	parsed, issues, header, err := memoryinterchange.Parse(format, content)
	if err != nil {
		return nil, []memoryImportIssue{{Severity: "error", Code: "invalid_format", Message: err.Error()}}, nil
	}
	outIssues := make([]memoryImportIssue, 0, len(issues))
	for _, issue := range issues {
		outIssues = append(outIssues, memoryImportIssue{
			Severity: issue.Severity, Code: issue.Code, Message: issue.Message,
			UnitIndex: issue.UnitIndex, Tuid: issue.Tuid,
		})
	}
	candidates := make([]memoryImportCandidate, 0, len(parsed))
	for _, row := range parsed {
		candidates = append(candidates, memoryImportCandidate{
			SourceLocale: row.SourceLocale, TargetLocale: row.TargetLocale,
			SourceText: row.SourceText, TargetText: row.TargetText, MatchScore: row.MatchScore,
			ExternalKey: row.ExternalKey, UnitIndex: row.UnitIndex, Tuid: row.Tuid,
		})
	}
	return candidates, outIssues, header
}

func (api *memoryAPI) persistMemoryImportAttempt(ctx context.Context, db dictionaryDB, actor memoryActor, m memoryRecord, payload memoryImportPayload, format string, report map[string]any, issues []memoryImportIssue, headerSrclang *string) (string, error) {
	options, _ := json.Marshal(map[string]any{"dryRun": false})
	counts, _ := json.Marshal(report)
	sum := sha256.Sum256([]byte(payload.Content))
	sha := hex.EncodeToString(sum[:])
	status := "completed"
	if failed, _ := report["failed"].(int); failed > 0 {
		status = "partially_successful"
	}
	var attemptID string
	err := db.QueryRow(ctx, `insert into memory_import_attempts (organization_id, memory_id, created_by_user_id, status, format, options, source_filename, source_byte_size, source_sha256, counts, header_srclang, completed_at) values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10::jsonb,$11,now()) returning id`,
		actor.organizationID, m.ID, actor.userID, status, format, options, payload.SourceFilename, payload.SourceByteSize, sha, counts, headerSrclang,
	).Scan(&attemptID)
	if err != nil {
		return "", err
	}
	for _, issue := range issues {
		if _, err := db.Exec(ctx, `insert into memory_import_attempt_diagnostics (attempt_id, severity, code, message, unit_index, tuid) values ($1,$2,$3,$4,$5,$6)`,
			attemptID, issue.Severity, issue.Code, issue.Message, issue.UnitIndex, issue.Tuid); err != nil {
			return "", err
		}
	}
	return attemptID, nil
}

func (api *memoryAPI) promoteMemoryFromProject(r *http.Request, actor memoryActor, m memoryRecord) (any, int, error) {
	if !actor.canWriteMemories() {
		return nil, 0, memoryFailure(403, "forbidden", "Insufficient permissions")
	}
	if err := requireNativeMemory(m); err != nil {
		return map[string]any{"promoted": 0, "skipped": 0, "reason": "memory_not_writable"}, 200, nil
	}
	if m.Status == "archived" || m.Status == "draft" {
		return map[string]any{"promoted": 0, "skipped": 0, "reason": "memory_not_writable"}, 200, nil
	}
	var payload memoryPromotePayload
	if err := readMemoryBody(r, []string{"projectId", "sourceLocale", "targetLocale", "sourcePath"}, &payload); err != nil {
		return nil, 0, err
	}
	projectID := trimMemoryInput(payload.ProjectID)
	sourceLocale := strings.ReplaceAll(trimMemoryInput(payload.SourceLocale), "_", "-")
	if projectID == "" || sourceLocale == "" {
		return nil, 0, invalidMemory()
	}
	ownedProject, err := api.ownedMemoryProject(r.Context(), actor, projectID)
	if err != nil {
		return nil, 0, err
	}
	var attached string
	err = api.pool.QueryRow(r.Context(), `select memory_id from project_memories where project_id=$1 and memory_id=$2 and organization_id=$3`, ownedProject, m.ID, actor.organizationID).Scan(&attached)
	if errorsIsNoRows(err) {
		return map[string]any{"promoted": 0, "skipped": 0, "reason": "memory_not_attached"}, 200, nil
	}
	if err != nil {
		return nil, 0, err
	}
	where := `t.organization_id=$1 and t.project_id=$2 and t.status='approved' and k.organization_id=$1 and k.project_id=$2`
	args := []any{actor.organizationID, ownedProject}
	if payload.TargetLocale != nil && trimMemoryInput(*payload.TargetLocale) != "" {
		args = append(args, strings.ReplaceAll(trimMemoryInput(*payload.TargetLocale), "_", "-"))
		where += ` and t.target_locale=$` + strconv.Itoa(len(args))
	}
	if payload.SourcePath != nil && trimMemoryInput(*payload.SourcePath) != "" {
		var sourceFileID string
		fileErr := api.pool.QueryRow(r.Context(), `select id from repository_source_files where organization_id=$1 and project_id=$2 and source_path=$3`, actor.organizationID, ownedProject, trimMemoryInput(*payload.SourcePath)).Scan(&sourceFileID)
		if errorsIsNoRows(fileErr) {
			return map[string]any{"promoted": 0, "skipped": 0, "reason": "source_file_not_found"}, 200, nil
		}
		if fileErr != nil {
			return nil, 0, fileErr
		}
		args = append(args, sourceFileID)
		where += ` and k.repository_source_file_id=$` + strconv.Itoa(len(args))
	}
	rows, err := api.pool.Query(r.Context(), `select k.key, k.source_text, t.target_locale, t.text, k.id, t.id, f.source_path from project_translations t join project_translation_keys k on t.translation_key_id=k.id left join repository_source_files f on k.repository_source_file_id=f.id where `+where, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	type promoteRow struct {
		key, sourceText, targetLocale, targetText, keyID, translationID string
		sourcePath                                                      *string
	}
	eligible := []promoteRow{}
	for rows.Next() {
		var row promoteRow
		if err := rows.Scan(&row.key, &row.sourceText, &row.targetLocale, &row.targetText, &row.keyID, &row.translationID, &row.sourcePath); err != nil {
			return nil, 0, err
		}
		if strings.TrimSpace(row.targetText) == "" {
			continue
		}
		eligible = append(eligible, row)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	if len(eligible) == 0 {
		return map[string]any{"promoted": 0, "skipped": 0, "reason": "no_approved_translations"}, 200, nil
	}
	promoted := 0
	for _, row := range eligible {
		normalized := normalizeMemorySourceText(row.sourceText)
		externalKey := row.keyID + ":" + row.targetLocale
		meta, _ := json.Marshal(map[string]any{
			"projectId": ownedProject, "sourcePath": row.sourcePath, "segmentKey": row.key,
			"translationId": row.translationID,
		})
		tag, execErr := api.pool.Exec(r.Context(), `insert into memory_entries (memory_id, source_locale, target_locale, source_text, normalized_source_text, target_text, provenance, review_status, external_key, metadata) values ($1,$2,$3,$4,$5,$6,'approved_job','approved',$7,$8::jsonb) on conflict (memory_id, source_locale, target_locale, normalized_source_text) do update set target_text=excluded.target_text, provenance=excluded.provenance, review_status=excluded.review_status, external_key=excluded.external_key, metadata=excluded.metadata, version=memory_entries.version+1, updated_at=now()`,
			m.ID, sourceLocale, row.targetLocale, row.sourceText, normalized, row.targetText, externalKey, meta)
		if execErr != nil {
			return nil, 0, execErr
		}
		if tag.RowsAffected() > 0 {
			promoted++
		}
	}
	return map[string]any{"promoted": promoted, "skipped": 0, "reason": nil}, 200, nil
}

func (api *memoryAPI) listMemoryImportAttemptsHandler(r *http.Request, actor memoryActor, m memoryRecord) (any, int, error) {
	return api.listMemoryImportAttempts(r, actor, m)
}

func (api *memoryAPI) getMemoryImportAttemptHandler(r *http.Request, actor memoryActor, m memoryRecord) (any, int, error) {
	attemptID := r.PathValue("attemptId")
	if !validMemoryID(attemptID) {
		return nil, 0, missingMemory()
	}
	return api.getMemoryImportAttempt(r.Context(), actor, m, attemptID)
}

func (api *memoryAPI) getMemoryImportAttemptReportHandler(r *http.Request, actor memoryActor, m memoryRecord) (any, int, error) {
	attemptID := r.PathValue("attemptId")
	if !validMemoryID(attemptID) {
		return nil, 0, missingMemory()
	}
	return api.getMemoryImportAttemptReport(r.Context(), actor, m, attemptID)
}

func (api *memoryAPI) listMemoryImportAttempts(r *http.Request, actor memoryActor, m memoryRecord) (any, int, error) {
	limit, _, err := memoryPage(r, 50, 100)
	if err != nil {
		return nil, 0, err
	}
	// Imports and exports share memory_import_attempts. List both so a queued export
	// remains discoverable after the user leaves its report.
	where := `a.memory_id=$1 and a.organization_id=$2`
	args := []any{m.ID, actor.organizationID}
	cursor := trimMemoryInput(r.URL.Query().Get("cursor"))
	if cursor != "" {
		createdAt, id, decodeErr := decodeGlossaryPageCursor(cursor)
		if decodeErr != nil {
			return nil, 0, memoryFailure(400, "invalid_memory_import_attempt_cursor", "Import attempt cursor is invalid")
		}
		args = append(args, createdAt, id)
		pos := len(args)
		where += ` and (a.created_at, a.id) < ($` + strconv.Itoa(pos-1) + `::timestamptz, $` + strconv.Itoa(pos) + `::uuid)`
	}
	args = append(args, limit+1)
	rows, err := api.pool.Query(r.Context(), `select a.id, a.organization_id, a.memory_id, a.created_by_user_id, a.operation, a.status, a.mode, a.format, a.options, a.source_filename, a.source_byte_size, a.source_sha256, a.counts, a.header_srclang, a.diagnostics_truncated, a.diagnostics_availability, a.diagnostics_expires_at, a.failure_code, a.failure_message, a.processing_started_at, a.result_filename, a.result_object_key, a.created_at, a.completed_at, coalesce(nullif(trim(concat(coalesce(u.first_name,''),' ',coalesce(u.last_name,''))),''), u.email) from memory_import_attempts a left join users u on u.id=a.created_by_user_id where `+where+` order by a.created_at desc, a.id desc limit $`+strconv.Itoa(len(args)), args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	attempts := []map[string]any{}
	for rows.Next() {
		attempt, scanErr := scanMemoryImportAttempt(rows)
		if scanErr != nil {
			return nil, 0, scanErr
		}
		attempts = append(attempts, attempt)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	hasMore := len(attempts) > limit
	if hasMore {
		attempts = attempts[:limit]
	}
	var total int
	err = api.pool.QueryRow(r.Context(), `select count(*) from memory_import_attempts a where a.memory_id=$1 and a.organization_id=$2`, m.ID, actor.organizationID).Scan(&total)
	if err != nil {
		return nil, 0, err
	}
	var nextCursor any
	if hasMore && len(attempts) > 0 {
		last := attempts[len(attempts)-1]
		nextCursor = encodeGlossaryPageCursor(last["createdAt"].(string), last["id"].(string))
	}
	return map[string]any{
		"memoryImportAttempts": attempts,
		"nextCursor":           nextCursor,
		"total":                total,
		"pagination":           map[string]any{"limit": limit, "returned": len(attempts), "hasMore": hasMore},
	}, 200, nil
}

func scanMemoryImportAttempt(row pgx.Row) (map[string]any, error) {
	var (
		id, orgID, memoryID, operation, status, mode, format, diagnosticsAvailability                    string
		createdBy, sourceFilename, headerSrclang, failureCode, failureMessage, resultFilename, actorName *string
		sha                                                                                              *string
		sourceByteSize                                                                                   *int
		options, counts                                                                                  []byte
		diagnosticsTruncated                                                                             bool
		diagnosticsExpiresAt                                                                             *time.Time
		processingStartedAt                                                                              *time.Time
		resultObjectKey                                                                                  *string
		createdAt                                                                                        time.Time
		completedAt                                                                                      *time.Time
	)
	err := row.Scan(&id, &orgID, &memoryID, &createdBy, &operation, &status, &mode, &format, &options, &sourceFilename, &sourceByteSize, &sha, &counts, &headerSrclang, &diagnosticsTruncated, &diagnosticsAvailability, &diagnosticsExpiresAt, &failureCode, &failureMessage, &processingStartedAt, &resultFilename, &resultObjectKey, &createdAt, &completedAt, &actorName)
	if err != nil {
		return nil, err
	}
	countsValue := any(nil)
	if len(counts) > 0 {
		countsValue = json.RawMessage(counts)
	}
	return map[string]any{
		"id": id, "organizationId": orgID, "memoryId": memoryID, "createdByUserId": createdBy,
		"actorDisplayName": actorName, "operation": operation, "status": status, "mode": mode, "importBatchId": id, "format": format,
		"options": jsonObjectOrEmpty(options), "sourceFilename": sourceFilename, "sourceByteSize": sourceByteSize,
		"sourceSha256": sha, "counts": countsValue, "headerSrclang": headerSrclang,
		"diagnosticsTruncated": diagnosticsTruncated, "diagnosticsAvailability": diagnosticsAvailability,
		"diagnosticsExpiresAt": formatMemoryTimePtr(diagnosticsExpiresAt), "retentionPolicy": "indefinite",
		"failureCode": failureCode, "failureMessage": failureMessage, "processingStartedAt": formatMemoryTimePtr(processingStartedAt),
		"resultFilename": resultFilename, "resultReady": resultObjectKey != nil && strings.TrimSpace(*resultObjectKey) != "",
		"createdAt": formatMemoryTime(createdAt), "completedAt": formatMemoryTimePtr(completedAt),
	}, nil
}

func (api *memoryAPI) getMemoryImportAttempt(ctx context.Context, actor memoryActor, m memoryRecord, attemptID string) (any, int, error) {
	attempt, diagnostics, err := api.loadMemoryImportAttempt(ctx, actor, m, attemptID)
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"memoryImportAttempt": attempt, "diagnostics": diagnostics}, 200, nil
}

func (api *memoryAPI) getMemoryImportAttemptReport(ctx context.Context, actor memoryActor, m memoryRecord, attemptID string) (any, int, error) {
	attempt, diagnostics, err := api.loadMemoryImportAttempt(ctx, actor, m, attemptID)
	if err != nil {
		return nil, 0, err
	}
	body, _ := json.MarshalIndent(map[string]any{"memoryImportAttempt": attempt, "diagnostics": diagnostics}, "", "  ")
	return interchangeDownload{
		contentType: "application/json; charset=utf-8",
		filename:    "memory-import-" + attemptID + ".json",
		body:        body,
	}, 200, nil
}

func (api *memoryAPI) loadMemoryImportAttempt(ctx context.Context, actor memoryActor, m memoryRecord, attemptID string) (map[string]any, []map[string]any, error) {
	row := api.pool.QueryRow(ctx, `select a.id, a.organization_id, a.memory_id, a.created_by_user_id, a.operation, a.status, a.mode, a.format, a.options, a.source_filename, a.source_byte_size, a.source_sha256, a.counts, a.header_srclang, a.diagnostics_truncated, a.diagnostics_availability, a.diagnostics_expires_at, a.failure_code, a.failure_message, a.processing_started_at, a.result_filename, a.result_object_key, a.created_at, a.completed_at, coalesce(nullif(trim(concat(coalesce(u.first_name,''),' ',coalesce(u.last_name,''))),''), u.email) from memory_import_attempts a left join users u on u.id=a.created_by_user_id where a.id=$1 and a.memory_id=$2 and a.organization_id=$3`, attemptID, m.ID, actor.organizationID)
	attempt, err := scanMemoryImportAttempt(row)
	if errorsIsNoRows(err) {
		return nil, nil, missingMemory()
	}
	if err != nil {
		return nil, nil, err
	}
	rows, err := api.pool.Query(ctx, `select id, severity, code, message, unit_index, tuid, created_at from memory_import_attempt_diagnostics where attempt_id=$1 order by created_at, id`, attemptID)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	diagnostics := []map[string]any{}
	for rows.Next() {
		var id, severity, code, message string
		var unitIndex *int
		var tuid *string
		var createdAt time.Time
		if err := rows.Scan(&id, &severity, &code, &message, &unitIndex, &tuid, &createdAt); err != nil {
			return nil, nil, err
		}
		diagnostics = append(diagnostics, map[string]any{
			"id": id, "severity": severity, "code": code, "message": message,
			"unitIndex": unitIndex, "tuid": tuid, "createdAt": formatMemoryTime(createdAt),
		})
	}
	return attempt, diagnostics, rows.Err()
}
