package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"reflect"
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

func scanMemoryEntry(row pgx.Row, extra ...any) (memoryEntryRecord, error) {
	var e memoryEntryRecord
	var created, updated time.Time
	var reviewed *time.Time
	var meta []byte
	dest := []any{
		&e.ID, &e.MemoryID, &e.SourceLocale, &e.TargetLocale, &e.SourceText, &e.TargetText,
		&e.MatchScore, &e.Provenance, &e.ReviewStatus, &e.Version, &e.ExternalKey,
		&e.CreatedByUserID, &e.ModifiedByUserID, &e.ReviewedByUserID, &e.ImportBatchID,
		&meta, &created, &updated, &reviewed,
	}
	err := row.Scan(append(dest, extra...)...)
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
	value, status, err := api.exportMemoryEntries(r, m)
	if err == nil {
		api.publishActivity(r.Context(), activityLogEventInput{
			ActorUserID:    actor.userID,
			EventType:      "translation_memory_exported",
			OrganizationID: actor.organizationID,
			Payload:        map[string]any{"resourceId": m.ID},
			TargetID:       m.ID,
			TargetKind:     "translation_memory",
		})
	}
	return value, status, err
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

func (api *memoryAPI) getMemoryEntry(ctx context.Context, m memoryRecord, entryID string) (any, int, error) {
	return api.memoryEntryDetail(ctx, m, entryID)
}

func (api *memoryAPI) createMemoryEntry(r *http.Request, actor memoryActor, m memoryRecord) (any, int, error) {
	if denied, err := api.denyMemoryAction(r.Context(), actor, m, "edit", true, true); denied {
		return nil, 0, err
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
		return nil, 0, api.rejectMemoryAction(r.Context(), actor, m, "edit", "read_only", err)
	}
	if m.Status == "archived" {
		return nil, 0, api.rejectMemoryAction(r.Context(), actor, m, "edit", "archived", memoryFailure(403, "memory_action_archived", "This translation memory is archived"))
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
	tx, err := api.pool.Begin(ctx)
	if err != nil {
		return nil, 0, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var currentNormalized string
	current, err := scanMemoryEntry(tx.QueryRow(ctx, `select `+memoryEntryColumns+`, e.normalized_source_text from memory_entries e where e.id=$1 and e.memory_id=$2 for update`, entryID, m.ID), &currentNormalized)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, 0, missingMemory()
	}
	if err != nil {
		return nil, 0, err
	}
	if current.Version != *payload.ExpectedVersion {
		return nil, 0, memoryFailureDetails(409, "stale_memory_entry", "The translation memory entry was updated by someone else", map[string]any{"memoryEntry": current})
	}
	next := current
	if payload.SourceLocale != nil {
		next.SourceLocale = strings.ReplaceAll(trimMemoryInput(*payload.SourceLocale), "_", "-")
	}
	if payload.TargetLocale != nil {
		next.TargetLocale = strings.ReplaceAll(trimMemoryInput(*payload.TargetLocale), "_", "-")
	}
	if payload.SourceText != nil {
		next.SourceText = *payload.SourceText
	}
	if payload.TargetText != nil {
		next.TargetText = *payload.TargetText
	}
	if next.SourceLocale == "" || next.TargetLocale == "" || trimMemoryInput(next.SourceText) == "" || utf16Length(next.SourceText) > 100000 || utf16Length(next.TargetText) > 100000 {
		return nil, 0, invalidMemory()
	}
	if payload.MatchScore != nil {
		if *payload.MatchScore < 0 || *payload.MatchScore > 100 {
			return nil, 0, invalidMemory()
		}
		next.MatchScore = *payload.MatchScore
	}
	if payload.ReviewStatus != nil {
		if *payload.ReviewStatus != "approved" && *payload.ReviewStatus != "pending" && *payload.ReviewStatus != "rejected" {
			return nil, 0, invalidMemory()
		}
		next.ReviewStatus = *payload.ReviewStatus
	}
	if payload.Metadata != nil {
		next.Metadata = payload.Metadata
	}
	contentFields := memoryEntryChangedContentFields(current, next)
	reviewStatusChanged := next.ReviewStatus != current.ReviewStatus
	if len(contentFields) == 0 && !reviewStatusChanged {
		return api.commitMemoryEntryDetail(ctx, tx, m, current.ID)
	}
	normalized := normalizeMemorySourceText(next.SourceText)
	if normalized != currentNormalized || next.SourceLocale != current.SourceLocale || next.TargetLocale != current.TargetLocale {
		var duplicate string
		err := tx.QueryRow(ctx, `select id from memory_entries where memory_id=$1 and source_locale=$2 and target_locale=$3 and normalized_source_text=$4 and id<>$5 limit 1`, m.ID, next.SourceLocale, next.TargetLocale, normalized, current.ID).Scan(&duplicate)
		if err == nil {
			return nil, 0, duplicateMemoryEntry()
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return nil, 0, err
		}
	}
	now := time.Now().UTC()
	updated, err := scanMemoryEntry(tx.QueryRow(ctx, `update memory_entries as e set source_locale=$3, target_locale=$4, source_text=$5, normalized_source_text=$6, target_text=$7, match_score=$8, review_status=$9, metadata=$10::jsonb, modified_by_user_id=$11, reviewed_by_user_id=case when $12::boolean then $11 else reviewed_by_user_id end, reviewed_at=case when $12::boolean then $13::timestamptz else reviewed_at end, version=version+1, updated_at=$13::timestamptz where id=$1 and memory_id=$2 and version=$14 returning `+memoryEntryColumns, current.ID, m.ID, next.SourceLocale, next.TargetLocale, next.SourceText, normalized, next.TargetText, next.MatchScore, next.ReviewStatus, []byte(next.Metadata), actor.userID, reviewStatusChanged, now, current.Version))
	if isUniqueViolation(err) {
		return nil, 0, duplicateMemoryEntry()
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, 0, memoryFailureDetails(409, "stale_memory_entry", "The translation memory entry was updated by someone else", map[string]any{"memoryEntry": current})
	}
	if err != nil {
		return nil, 0, err
	}
	if err := recordMemoryEntryUpdateEvents(ctx, tx, current, updated, actor.userID, contentFields, reviewStatusChanged, now); err != nil {
		return nil, 0, err
	}
	return api.commitMemoryEntryDetail(ctx, tx, m, updated.ID)
}

// The detail is read inside the transaction so a failed read rolls back the
// update instead of returning a body that does not match the detail contract.
func (api *memoryAPI) commitMemoryEntryDetail(ctx context.Context, tx pgx.Tx, m memoryRecord, entryID string) (any, int, error) {
	detail, status, err := memoryEntryDetailFrom(ctx, tx, m, entryID)
	if err != nil {
		return nil, 0, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, 0, err
	}
	return detail, status, nil
}

func duplicateMemoryEntry() error {
	return memoryFailure(409, "duplicate_memory_entry", "An entry with this source text and locale pair already exists")
}

func memoryEntryChangedContentFields(current, next memoryEntryRecord) []string {
	fields := []string{}
	if next.SourceLocale != current.SourceLocale {
		fields = append(fields, "sourceLocale")
	}
	if next.TargetLocale != current.TargetLocale {
		fields = append(fields, "targetLocale")
	}
	if next.SourceText != current.SourceText {
		fields = append(fields, "sourceText")
	}
	if next.TargetText != current.TargetText {
		fields = append(fields, "targetText")
	}
	if next.MatchScore != current.MatchScore {
		fields = append(fields, "matchScore")
	}
	if !memoryEntryMetadataEqual(current.Metadata, next.Metadata) {
		fields = append(fields, "metadata")
	}
	return fields
}

func memoryEntryMetadataEqual(a, b json.RawMessage) bool {
	var left, right any
	if json.Unmarshal(a, &left) != nil || json.Unmarshal(b, &right) != nil {
		return string(a) == string(b)
	}
	return reflect.DeepEqual(left, right)
}

func recordMemoryEntryUpdateEvents(ctx context.Context, tx pgx.Tx, current, updated memoryEntryRecord, actorUserID string, contentFields []string, reviewStatusChanged bool, now time.Time) error {
	var hasCreation bool
	if err := tx.QueryRow(ctx, `select exists(select 1 from memory_entry_events where memory_entry_id=$1 and event_type in ('created','imported','synced'))`, current.ID).Scan(&hasCreation); err != nil {
		return err
	}
	if !hasCreation {
		created := synthesizeMemoryEntryCreationEvent(current)
		attributes := map[string]any{"provenance": current.Provenance, "reviewStatus": current.ReviewStatus}
		if current.ImportBatchID != nil {
			attributes["importBatchId"] = *current.ImportBatchID
		}
		if _, err := tx.Exec(ctx, `insert into memory_entry_events (memory_entry_id, memory_id, event_type, actor_kind, actor_user_id, version, changed_fields, attributes, occurred_at) values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::text::timestamptz)`, current.ID, current.MemoryID, created.EventType, created.ActorKind, current.CreatedByUserID, current.Version, mustMemoryEventJSON(created.ChangedFields), mustMemoryEventJSON(attributes), current.CreatedAt); err != nil {
			return err
		}
	}
	if len(contentFields) > 0 {
		if _, err := tx.Exec(ctx, `insert into memory_entry_events (memory_entry_id, memory_id, event_type, actor_kind, actor_user_id, version, changed_fields, attributes, occurred_at) values ($1,$2,'updated','user',$3,$4,$5::jsonb,$6::jsonb,$7)`, updated.ID, updated.MemoryID, actorUserID, updated.Version, mustMemoryEventJSON(contentFields), mustMemoryEventJSON(map[string]any{"provenance": updated.Provenance}), now); err != nil {
			return err
		}
	}
	if reviewStatusChanged {
		// Offset by 1ms so the review sorts after the content update.
		if _, err := tx.Exec(ctx, `insert into memory_entry_events (memory_entry_id, memory_id, event_type, actor_kind, actor_user_id, version, changed_fields, attributes, occurred_at) values ($1,$2,'reviewed','user',$3,$4,'["reviewStatus"]'::jsonb,$5::jsonb,$6)`, updated.ID, updated.MemoryID, actorUserID, updated.Version, mustMemoryEventJSON(map[string]any{"reviewStatus": updated.ReviewStatus}), now.Add(time.Millisecond)); err != nil {
			return err
		}
	}
	return nil
}

func mustMemoryEventJSON(value any) string {
	raw, err := json.Marshal(value)
	if err != nil {
		return "{}"
	}
	return string(raw)
}

func (api *memoryAPI) deleteMemoryEntry(ctx context.Context, actor memoryActor, m memoryRecord, entryID string) (any, int, error) {
	if denied, err := api.denyMemoryAction(ctx, actor, m, "edit", true, true); denied {
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
