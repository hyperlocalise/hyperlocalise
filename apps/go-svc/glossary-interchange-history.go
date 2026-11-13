package main

import (
	"net/http"
	"strconv"
	"strings"
	"time"
)

type glossaryInterchangeHistoryRow struct {
	ID                  string
	Operation           string
	Format              string
	Mode                string
	Status              string
	SourceFilename      *string
	ResultFilename      *string
	Counts              []byte
	ErrorCode           *string
	ErrorMessage        *string
	CreatedAt           time.Time
	CompletedAt         *time.Time
	ProcessingStartedAt *time.Time
	ResultObjectKey     *string
	BackupObjectKey     *string
}

func (api *glossaryAPI) listGlossaryInterchangeRunsHandler(r *http.Request, _ glossaryActor, g glossaryRecord) (any, int, error) {
	limit, _, err := glossaryPage(r, 20, 100)
	if err != nil {
		return nil, 0, err
	}

	where := []string{"glossary_id=$1"}
	args := []any{g.ID}
	if operation := strings.TrimSpace(r.URL.Query().Get("operation")); operation != "" {
		if operation != "import" && operation != "export" {
			return nil, 0, glossaryFailure(400, "invalid_glossary_interchange_operation", "Glossary interchange operation is invalid")
		}
		args = append(args, operation)
		where = append(where, "$"+strconv.Itoa(len(args))+" = operation")
	}
	if status := strings.TrimSpace(r.URL.Query().Get("status")); status != "" {
		if len(status) > 64 {
			return nil, 0, glossaryFailure(400, "invalid_glossary_interchange_status", "Glossary interchange status is invalid")
		}
		args = append(args, status)
		where = append(where, "$"+strconv.Itoa(len(args))+" = status")
	}
	if cursor := strings.TrimSpace(r.URL.Query().Get("cursor")); cursor != "" {
		createdAt, id, decodeErr := decodeGlossaryPageCursor(cursor)
		if decodeErr != nil || !isValidGlossaryInterchangeCursorTime(createdAt) {
			return nil, 0, glossaryFailure(400, "invalid_glossary_interchange_cursor", "Glossary interchange cursor is invalid")
		}
		args = append(args, createdAt, id)
		createdAtPos := len(args) - 1
		idPos := len(args)
		where = append(where, "(created_at, id) < ($"+strconv.Itoa(createdAtPos)+"::timestamptz, $"+strconv.Itoa(idPos)+"::uuid)")
	}

	args = append(args, limit+1)
	limitPos := len(args)
	rows, err := api.pool.Query(r.Context(), `select id, operation, format, mode, status, source_filename, result_filename, counts, error_code, error_message, created_at, completed_at, processing_started_at, result_object_key, backup_object_key from glossary_import_runs where `+strings.Join(where, " and ")+` order by created_at desc, id desc limit $`+strconv.Itoa(limitPos), args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	runs := []map[string]any{}
	for rows.Next() {
		var row glossaryInterchangeHistoryRow
		if err := rows.Scan(&row.ID, &row.Operation, &row.Format, &row.Mode, &row.Status, &row.SourceFilename, &row.ResultFilename, &row.Counts, &row.ErrorCode, &row.ErrorMessage, &row.CreatedAt, &row.CompletedAt, &row.ProcessingStartedAt, &row.ResultObjectKey, &row.BackupObjectKey); err != nil {
			return nil, 0, err
		}
		runs = append(runs, map[string]any{
			"id":                  row.ID,
			"operation":           row.Operation,
			"format":              row.Format,
			"mode":                row.Mode,
			"status":              row.Status,
			"sourceFilename":      row.SourceFilename,
			"resultFilename":      row.ResultFilename,
			"counts":              jsonObjectOrEmpty(row.Counts),
			"errorCode":           row.ErrorCode,
			"errorMessage":        row.ErrorMessage,
			"createdAt":           formatGlossaryTime(row.CreatedAt),
			"processingStartedAt": formatGlossaryTimePtr(row.ProcessingStartedAt),
			"completedAt":         formatGlossaryTimePtr(row.CompletedAt),
			"resultReady":         row.ResultObjectKey != nil && strings.TrimSpace(*row.ResultObjectKey) != "",
			"backupReady":         row.BackupObjectKey != nil && strings.TrimSpace(*row.BackupObjectKey) != "",
		})
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}

	hasMore := len(runs) > limit
	if hasMore {
		runs = runs[:limit]
	}
	var nextCursor any
	if hasMore && len(runs) > 0 {
		last := runs[len(runs)-1]
		nextCursor = encodeGlossaryPageCursor(last["createdAt"].(string), last["id"].(string))
	}
	return map[string]any{
		"runs":       runs,
		"nextCursor": nextCursor,
		"pagination": map[string]any{"limit": limit, "returned": len(runs), "hasMore": hasMore},
	}, http.StatusOK, nil
}

func isValidGlossaryInterchangeCursorTime(value string) bool {
	_, err := time.Parse(time.RFC3339Nano, value)
	return err == nil
}
