package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

type memoryEntryPayload struct {
	SourceLocale    *string         `json:"sourceLocale"`
	TargetLocale    *string         `json:"targetLocale"`
	SourceText      *string         `json:"sourceText"`
	TargetText      *string         `json:"targetText"`
	MatchScore      *int            `json:"matchScore"`
	ReviewStatus    *string         `json:"reviewStatus"`
	ExpectedVersion *int            `json:"expectedVersion"`
	Metadata        json.RawMessage `json:"metadata"`
}

type memoryEntryRecord struct {
	ID               string          `json:"id"`
	MemoryID         string          `json:"memoryId"`
	SourceLocale     string          `json:"sourceLocale"`
	TargetLocale     string          `json:"targetLocale"`
	SourceText       string          `json:"sourceText"`
	TargetText       string          `json:"targetText"`
	MatchScore       int             `json:"matchScore"`
	Provenance       string          `json:"provenance"`
	ReviewStatus     string          `json:"reviewStatus"`
	Version          int             `json:"version"`
	ExternalKey      *string         `json:"externalKey"`
	CreatedByUserID  *string         `json:"createdByUserId"`
	ModifiedByUserID *string         `json:"modifiedByUserId"`
	ReviewedByUserID *string         `json:"reviewedByUserId"`
	ImportBatchID    *string         `json:"importBatchId"`
	Metadata         json.RawMessage `json:"metadata"`
	CreatedAt        string          `json:"createdAt"`
	UpdatedAt        string          `json:"updatedAt"`
	ReviewedAt       *string         `json:"reviewedAt"`
}

const memoryEntryColumns = `e.id, e.memory_id, e.source_locale, e.target_locale, e.source_text, e.target_text, e.match_score, e.provenance, e.review_status, e.version, e.external_key, e.created_by_user_id, e.modified_by_user_id, e.reviewed_by_user_id, e.import_batch_id, e.metadata, e.created_at, e.updated_at, e.reviewed_at`

func scanMemoryEntry(row pgx.Row) (memoryEntryRecord, error) {
	var e memoryEntryRecord
	var created, updated time.Time
	var reviewed *time.Time
	var meta []byte
	err := row.Scan(
		&e.ID, &e.MemoryID, &e.SourceLocale, &e.TargetLocale, &e.SourceText, &e.TargetText,
		&e.MatchScore, &e.Provenance, &e.ReviewStatus, &e.Version, &e.ExternalKey,
		&e.CreatedByUserID, &e.ModifiedByUserID, &e.ReviewedByUserID, &e.ImportBatchID,
		&meta, &created, &updated, &reviewed,
	)
	if err != nil {
		return e, err
	}
	if len(meta) == 0 {
		e.Metadata = json.RawMessage(`{}`)
	} else {
		e.Metadata = json.RawMessage(meta)
	}
	e.CreatedAt = formatMemoryTime(created)
	e.UpdatedAt = formatMemoryTime(updated)
	e.ReviewedAt = formatMemoryTimePtr(reviewed)
	return e, nil
}

func (api *memoryAPI) listMemoryEntriesHandler(r *http.Request, actor memoryActor, m memoryRecord) (any, int, error) {
	return api.listMemoryEntries(r, m)
}

func (api *memoryAPI) createMemoryEntryHandler(r *http.Request, actor memoryActor, m memoryRecord) (any, int, error) {
	return api.createMemoryEntry(r, actor, m)
}

func (api *memoryAPI) exportMemoryEntriesHandler(r *http.Request, actor memoryActor, m memoryRecord) (any, int, error) {
	return api.exportMemoryEntries(r, m)
}

func (api *memoryAPI) importMemoryEntriesHandler(r *http.Request, actor memoryActor, m memoryRecord) (any, int, error) {
	return api.importMemoryEntries(r, actor, m)
}

func (api *memoryAPI) promoteMemoryFromProjectHandler(r *http.Request, actor memoryActor, m memoryRecord) (any, int, error) {
	return api.promoteMemoryFromProject(r, actor, m)
}

func (api *memoryAPI) getMemoryEntryHandler(r *http.Request, actor memoryActor, m memoryRecord) (any, int, error) {
	entryID := r.PathValue("entryId")
	if !validMemoryID(entryID) {
		return nil, 0, missingMemory()
	}
	return api.getMemoryEntry(r.Context(), m, entryID)
}

func (api *memoryAPI) patchMemoryEntryHandler(r *http.Request, actor memoryActor, m memoryRecord) (any, int, error) {
	entryID := r.PathValue("entryId")
	if !validMemoryID(entryID) {
		return nil, 0, missingMemory()
	}
	return api.patchMemoryEntry(r, actor, m, entryID)
}

func (api *memoryAPI) deleteMemoryEntryHandler(r *http.Request, actor memoryActor, m memoryRecord) (any, int, error) {
	entryID := r.PathValue("entryId")
	if !validMemoryID(entryID) {
		return nil, 0, missingMemory()
	}
	return api.deleteMemoryEntry(r.Context(), actor, m, entryID)
}

func (api *memoryAPI) listMemoryEntries(r *http.Request, m memoryRecord) (any, int, error) {
	limit, offset, err := memoryPage(r, 50, 100)
	if err != nil {
		limit, offset = 50, 0
	}
	search := trimMemoryInput(r.URL.Query().Get("search"))
	where := `e.memory_id=$1`
	args := []any{m.ID}
	if search != "" {
		args = append(args, "%"+search+"%")
		where += ` and (e.source_text ilike $2 or e.target_text ilike $2 or coalesce(e.external_key,'') ilike $2)`
	}
	limitPos := len(args) + 1
	offsetPos := len(args) + 2
	args = append(args, limit, offset)
	rows, err := api.pool.Query(r.Context(), `select `+memoryEntryColumns+` from memory_entries e where `+where+` order by e.created_at desc, e.id desc limit $`+itoa(limitPos)+` offset $`+itoa(offsetPos), args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	entries := []memoryEntryRecord{}
	for rows.Next() {
		entry, scanErr := scanMemoryEntry(rows)
		if scanErr != nil {
			return nil, 0, scanErr
		}
		entries = append(entries, entry)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	countArgs := args[:len(args)-2]
	var total int
	err = api.pool.QueryRow(r.Context(), `select count(*) from memory_entries e where `+where, countArgs...).Scan(&total)
	return map[string]any{
		"memoryEntries": entries,
		"total":         total,
		"nextCursor":    nil,
		"pagination": map[string]any{
			"limit":    limit,
			"returned": len(entries),
			"hasMore":  offset+len(entries) < total,
		},
	}, 200, err
}

func (api *memoryAPI) getMemoryEntry(ctx context.Context, m memoryRecord, entryID string) (any, int, error) {
	entry, err := scanMemoryEntry(api.pool.QueryRow(ctx, `select `+memoryEntryColumns+` from memory_entries e where e.id=$1 and e.memory_id=$2`, entryID, m.ID))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, 0, missingMemory()
	}
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"memoryEntry": entry}, 200, nil
}

func (api *memoryAPI) createMemoryEntry(r *http.Request, actor memoryActor, m memoryRecord) (any, int, error) {
	if !actor.canWriteMemories() {
		return nil, 0, memoryFailure(403, "forbidden", "Insufficient permissions")
	}
	if err := requireNativeMemory(m); err != nil {
		return nil, 0, err
	}
	if m.Status == "archived" {
		return nil, 0, memoryFailure(403, "memory_action_archived", "This translation memory is archived")
	}
	var payload memoryEntryPayload
	if err := readMemoryBody(r, []string{"sourceLocale", "targetLocale", "sourceText", "targetText", "matchScore"}, &payload); err != nil {
		return nil, 0, err
	}
	if payload.SourceLocale == nil || payload.TargetLocale == nil || payload.SourceText == nil || payload.TargetText == nil {
		return nil, 0, invalidMemory()
	}
	sourceLocale := strings.ReplaceAll(trimMemoryInput(*payload.SourceLocale), "_", "-")
	targetLocale := strings.ReplaceAll(trimMemoryInput(*payload.TargetLocale), "_", "-")
	sourceText := *payload.SourceText
	targetText := *payload.TargetText
	if sourceLocale == "" || targetLocale == "" || trimMemoryInput(sourceText) == "" || utf16Length(sourceText) > 100000 || utf16Length(targetText) > 100000 {
		return nil, 0, invalidMemory()
	}
	matchScore := 100
	if payload.MatchScore != nil {
		if *payload.MatchScore < 0 || *payload.MatchScore > 100 {
			return nil, 0, invalidMemory()
		}
		matchScore = *payload.MatchScore
	}
	normalized := normalizeMemorySourceText(sourceText)
	ctx := r.Context()
	tx, err := api.pool.Begin(ctx)
	if err != nil {
		return nil, 0, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var existing string
	err = tx.QueryRow(ctx, `select id from memory_entries where memory_id=$1 and source_locale=$2 and target_locale=$3 and normalized_source_text=$4`, m.ID, sourceLocale, targetLocale, normalized).Scan(&existing)
	if err == nil {
		return nil, 0, memoryFailure(409, "duplicate_memory_entry", "An entry with this source text and locale pair already exists")
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, 0, err
	}
	entry, err := scanMemoryEntry(tx.QueryRow(ctx, `insert into memory_entries as e (memory_id, source_locale, target_locale, source_text, normalized_source_text, target_text, match_score, provenance, created_by_user_id) values ($1,$2,$3,$4,$5,$6,$7,'manual',$8) returning `+memoryEntryColumns, m.ID, sourceLocale, targetLocale, sourceText, normalized, targetText, matchScore, actor.userID))
	if err != nil {
		return nil, 0, err
	}
	// Audit is best-effort. A failed statement aborts the transaction, so roll
	// back to a savepoint when the events table is missing in older databases.
	if _, err := tx.Exec(ctx, "savepoint memory_entry_created_event"); err != nil {
		return nil, 0, err
	}
	_, eventErr := tx.Exec(ctx, `insert into memory_entry_events (memory_entry_id, memory_id, event_type, actor_kind, actor_user_id, version, changed_fields, attributes) values ($1,$2,'created','user',$3,$4,'["sourceLocale","targetLocale","sourceText","targetText"]'::jsonb, jsonb_build_object('provenance','manual','reviewStatus',$5))`, entry.ID, m.ID, actor.userID, entry.Version, entry.ReviewStatus)
	if eventErr != nil {
		if _, err := tx.Exec(ctx, "rollback to savepoint memory_entry_created_event"); err != nil {
			return nil, 0, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, 0, err
	}
	return map[string]any{"memoryEntry": entry}, 201, nil
}

func (api *memoryAPI) patchMemoryEntry(r *http.Request, actor memoryActor, m memoryRecord, entryID string) (any, int, error) {
	if err := requireNativeMemory(m); err != nil {
		return nil, 0, err
	}
	if m.Status == "archived" {
		return nil, 0, memoryFailure(403, "memory_action_archived", "This translation memory is archived")
	}
	var payload memoryEntryPayload
	if err := readMemoryBody(r, []string{"sourceLocale", "targetLocale", "sourceText", "targetText", "matchScore", "reviewStatus", "expectedVersion", "metadata"}, &payload); err != nil {
		return nil, 0, err
	}
	if payload.ExpectedVersion == nil || *payload.ExpectedVersion < 1 {
		return nil, 0, invalidMemory()
	}
	reviewOnly := payload.SourceLocale == nil && payload.TargetLocale == nil && payload.SourceText == nil && payload.TargetText == nil && payload.MatchScore == nil && payload.Metadata == nil && payload.ReviewStatus != nil
	if reviewOnly {
		if !actor.canReviewMemories() {
			return nil, 0, memoryFailure(403, "forbidden", "Insufficient permissions")
		}
	} else if !actor.canWriteMemories() {
		return nil, 0, memoryFailure(403, "forbidden", "Insufficient permissions")
	}
	ctx := r.Context()
	current, err := scanMemoryEntry(api.pool.QueryRow(ctx, `select `+memoryEntryColumns+` from memory_entries e where e.id=$1 and e.memory_id=$2`, entryID, m.ID))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, 0, missingMemory()
	}
	if err != nil {
		return nil, 0, err
	}
	if current.Version != *payload.ExpectedVersion {
		return nil, 0, memoryFailureDetails(409, "stale_memory_entry", "The translation memory entry was updated by someone else", map[string]any{"memoryEntry": current})
	}
	sourceLocale, targetLocale, sourceText, targetText := current.SourceLocale, current.TargetLocale, current.SourceText, current.TargetText
	if payload.SourceLocale != nil {
		sourceLocale = strings.ReplaceAll(trimMemoryInput(*payload.SourceLocale), "_", "-")
	}
	if payload.TargetLocale != nil {
		targetLocale = strings.ReplaceAll(trimMemoryInput(*payload.TargetLocale), "_", "-")
	}
	if payload.SourceText != nil {
		sourceText = *payload.SourceText
	}
	if payload.TargetText != nil {
		targetText = *payload.TargetText
	}
	if sourceLocale == "" || targetLocale == "" || trimMemoryInput(sourceText) == "" || utf16Length(sourceText) > 100000 || utf16Length(targetText) > 100000 {
		return nil, 0, invalidMemory()
	}
	matchScore := current.MatchScore
	if payload.MatchScore != nil {
		if *payload.MatchScore < 0 || *payload.MatchScore > 100 {
			return nil, 0, invalidMemory()
		}
		matchScore = *payload.MatchScore
	}
	reviewStatus := current.ReviewStatus
	var reviewedBy *string
	var reviewedAt any
	if payload.ReviewStatus != nil {
		if *payload.ReviewStatus != "approved" && *payload.ReviewStatus != "pending" && *payload.ReviewStatus != "rejected" {
			return nil, 0, invalidMemory()
		}
		reviewStatus = *payload.ReviewStatus
		reviewedBy = &actor.userID
		reviewedAt = time.Now().UTC()
	}
	metadata := []byte(current.Metadata)
	if payload.Metadata != nil {
		metadata = []byte(payload.Metadata)
	}
	normalized := normalizeMemorySourceText(sourceText)
	updated, err := scanMemoryEntry(api.pool.QueryRow(ctx, `update memory_entries as e set source_locale=$3, target_locale=$4, source_text=$5, normalized_source_text=$6, target_text=$7, match_score=$8, review_status=$9, metadata=$10::jsonb, modified_by_user_id=$11, reviewed_by_user_id=coalesce($12,reviewed_by_user_id), reviewed_at=coalesce($13,reviewed_at), version=version+1, updated_at=now() where id=$1 and memory_id=$2 and version=$14 returning `+memoryEntryColumns, entryID, m.ID, sourceLocale, targetLocale, sourceText, normalized, targetText, matchScore, reviewStatus, metadata, actor.userID, reviewedBy, reviewedAt, *payload.ExpectedVersion))
	if errors.Is(err, pgx.ErrNoRows) {
		latest, latestErr := scanMemoryEntry(api.pool.QueryRow(ctx, `select `+memoryEntryColumns+` from memory_entries e where e.id=$1 and e.memory_id=$2`, entryID, m.ID))
		if latestErr == nil {
			return nil, 0, memoryFailureDetails(409, "stale_memory_entry", "The translation memory entry was updated by someone else", map[string]any{"memoryEntry": latest})
		}
		return nil, 0, missingMemory()
	}
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"memoryEntry": updated}, 200, nil
}

func (api *memoryAPI) deleteMemoryEntry(ctx context.Context, actor memoryActor, m memoryRecord, entryID string) (any, int, error) {
	if !actor.canWriteMemories() {
		return nil, 0, memoryFailure(403, "forbidden", "Insufficient permissions")
	}
	if err := requireNativeMemory(m); err != nil {
		return nil, 0, err
	}
	tag, err := api.pool.Exec(ctx, `delete from memory_entries where id=$1 and memory_id=$2`, entryID, m.ID)
	if err != nil {
		return nil, 0, err
	}
	if tag.RowsAffected() == 0 {
		return nil, 0, missingMemory()
	}
	return nil, 204, nil
}
