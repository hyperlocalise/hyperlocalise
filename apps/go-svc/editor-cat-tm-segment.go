package main

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type editorCatTmSegmentRecord struct {
	ID       string `json:"id"`
	Locale   string `json:"locale"`
	Text     string `json:"text"`
	IsSource bool   `json:"isSource"`
	Version  int    `json:"version,omitempty"`
}

type editorCatTmSegment struct {
	Source  editorCatTmSegmentRecord   `json:"source"`
	Records []editorCatTmSegmentRecord `json:"records"`
}

type editorCatTmSegmentPatchRecord struct {
	ID              string `json:"id"`
	Text            string `json:"text"`
	ExpectedVersion int    `json:"expectedVersion"`
}

type editorCatTmSegmentPatchBody struct {
	SourceText string                          `json:"sourceText"`
	Records    []editorCatTmSegmentPatchRecord `json:"records"`
}

type editorCatTmEntryRow struct {
	memoryEntryRecord
	normalized string
}

func (api *editorCatAPI) getTmSegment(r *http.Request, actor editorCatActor, project editorCatProject) (any, int, error) {
	if err := requireNativeEditorCat(project); err != nil {
		return nil, 0, err
	}
	entryID, err := parseEditorCatUUID(r.PathValue("entryId"))
	if err != nil {
		return nil, 0, err
	}
	segment, err := api.loadEditorCatTmSegment(r.Context(), actor, project, entryID)
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"tmSegment": segment}, http.StatusOK, nil
}

func (api *editorCatAPI) patchTmSegment(r *http.Request, actor editorCatActor, project editorCatProject) (any, int, error) {
	if !actor.canEdit() {
		return nil, 0, editorCatFailure(403, "forbidden", "Insufficient permissions")
	}
	if err := requireNativeEditorCat(project); err != nil {
		return nil, 0, err
	}
	entryID, err := parseEditorCatUUID(r.PathValue("entryId"))
	if err != nil {
		return nil, 0, err
	}
	var body editorCatTmSegmentPatchBody
	if err := readEditorCatJSON(r, &body); err != nil {
		return nil, 0, err
	}
	sourceText := body.SourceText
	if strings.TrimSpace(sourceText) == "" || utf16Length(sourceText) > 100000 {
		return nil, 0, editorCatFailure(400, "invalid_project_payload", "Source text is required")
	}
	if len(body.Records) == 0 || len(body.Records) > 64 {
		return nil, 0, editorCatFailure(400, "invalid_project_payload", "Invalid CAT payload")
	}
	for _, record := range body.Records {
		if uuid.Validate(strings.TrimSpace(record.ID)) != nil || record.ExpectedVersion < 1 || utf16Length(record.Text) > 100000 {
			return nil, 0, editorCatFailure(400, "invalid_project_payload", "Invalid CAT payload")
		}
	}

	ctx := r.Context()
	tx, err := api.pool.Begin(ctx)
	if err != nil {
		return nil, 0, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	rows, err := api.loadEditorCatTmEntries(ctx, tx, actor, project, entryID)
	if err != nil {
		return nil, 0, err
	}
	byID := make(map[string]editorCatTmEntryRow, len(rows))
	for _, row := range rows {
		byID[row.ID] = row
	}
	if _, ok := byID[entryID]; !ok {
		return nil, 0, editorCatFailure(404, "tm_segment_not_found", "Translation memory segment not found")
	}

	now := time.Now().UTC()
	normalized := normalizeMemorySourceText(sourceText)
	for _, record := range body.Records {
		current, ok := byID[strings.TrimSpace(record.ID)]
		if !ok {
			return nil, 0, editorCatFailure(404, "tm_segment_not_found", "Translation memory segment not found")
		}
		if current.Version != record.ExpectedVersion {
			return nil, 0, editorCatFailure(409, "stale_memory_entry", "The translation memory entry was updated by someone else")
		}
		nextSource := sourceText
		nextTarget := record.Text
		if nextSource == current.SourceText && nextTarget == current.TargetText {
			continue
		}
		updated, err := scanMemoryEntry(tx.QueryRow(ctx, `update memory_entries as e set source_text=$3, normalized_source_text=$4, target_text=$5, modified_by_user_id=$6, version=version+1, updated_at=$7 where id=$1 and memory_id=$2 and version=$8 returning `+memoryEntryColumns, current.ID, current.MemoryID, nextSource, normalized, nextTarget, actor.userID, now, current.Version))
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, 0, editorCatFailure(409, "stale_memory_entry", "The translation memory entry was updated by someone else")
		}
		if isUniqueViolation(err) {
			return nil, 0, editorCatFailure(409, "duplicate_memory_entry", "An entry with this source text and locale pair already exists")
		}
		if err != nil {
			return nil, 0, err
		}
		if err := recordMemoryEntryUpdateEvents(ctx, tx, current.memoryEntryRecord, updated, actor.userID, memoryEntryChangedContentFields(current.memoryEntryRecord, updated), false, now); err != nil {
			return nil, 0, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, 0, err
	}
	segment, err := api.loadEditorCatTmSegment(ctx, actor, project, entryID)
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"tmSegment": segment}, http.StatusOK, nil
}

func (api *editorCatAPI) deleteTmSegmentRecord(r *http.Request, actor editorCatActor, project editorCatProject) (any, int, error) {
	if !actor.canEdit() {
		return nil, 0, editorCatFailure(403, "forbidden", "Insufficient permissions")
	}
	if err := requireNativeEditorCat(project); err != nil {
		return nil, 0, err
	}
	entryID, err := parseEditorCatUUID(r.PathValue("entryId"))
	if err != nil {
		return nil, 0, err
	}
	recordID, err := parseEditorCatUUID(r.PathValue("recordId"))
	if err != nil {
		return nil, 0, err
	}

	rows, err := api.loadEditorCatTmEntries(r.Context(), api.pool, actor, project, entryID)
	if err != nil {
		return nil, 0, err
	}
	var target *editorCatTmEntryRow
	for i := range rows {
		if rows[i].ID == recordID {
			target = &rows[i]
			break
		}
	}
	if target == nil {
		return nil, 0, editorCatFailure(404, "tm_segment_not_found", "Translation memory segment not found")
	}
	if sameEditorCatLocale(target.SourceLocale, target.TargetLocale) {
		return nil, 0, editorCatFailure(400, "invalid_project_payload", "The source locale cannot be deleted")
	}

	tag, err := api.pool.Exec(r.Context(), `
        delete from memory_entries e
        using memories m, project_memories pm
        where e.id=$1 and e.memory_id=m.id and m.id=pm.memory_id
          and m.organization_id=$2 and m.source='native' and m.status<>'archived'
          and pm.project_id=$3`,
		recordID, actor.organizationID, project.ID)
	if err != nil {
		return nil, 0, err
	}
	if tag.RowsAffected() == 0 {
		return nil, 0, editorCatFailure(404, "tm_segment_not_found", "Translation memory segment not found")
	}
	return nil, http.StatusNoContent, nil
}

func (api *editorCatAPI) loadEditorCatTmSegment(ctx context.Context, actor editorCatActor, project editorCatProject, entryID string) (editorCatTmSegment, error) {
	rows, err := api.loadEditorCatTmEntries(ctx, api.pool, actor, project, entryID)
	if err != nil {
		return editorCatTmSegment{}, err
	}
	var opened *editorCatTmEntryRow
	for i := range rows {
		if rows[i].ID == entryID {
			opened = &rows[i]
			break
		}
	}
	if opened == nil {
		return editorCatTmSegment{}, editorCatFailure(404, "tm_segment_not_found", "Translation memory segment not found")
	}

	source := editorCatTmSegmentRecord{
		ID:       opened.ID,
		Locale:   opened.SourceLocale,
		Text:     opened.SourceText,
		IsSource: true,
		Version:  opened.Version,
	}
	records := []editorCatTmSegmentRecord{source}
	seen := map[string]bool{opened.ID + ":" + opened.SourceLocale: true}
	for _, row := range rows {
		key := row.ID + ":" + row.TargetLocale
		if seen[key] || sameEditorCatLocale(row.SourceLocale, row.TargetLocale) {
			continue
		}
		seen[key] = true
		records = append(records, editorCatTmSegmentRecord{
			ID:       row.ID,
			Locale:   row.TargetLocale,
			Text:     row.TargetText,
			IsSource: false,
			Version:  row.Version,
		})
	}
	return editorCatTmSegment{Source: source, Records: records}, nil
}

func (api *editorCatAPI) loadEditorCatTmEntries(ctx context.Context, db dictionaryDB, actor editorCatActor, project editorCatProject, entryID string) ([]editorCatTmEntryRow, error) {
	var memoryID, sourceLocale, normalized, variantGroupID, context string
	err := db.QueryRow(ctx, `
        select e.memory_id::text, e.source_locale, e.normalized_source_text,
               coalesce(e.metadata->>'variantGroupId', ''), coalesce(e.metadata->>'context', '')
        from memory_entries e
        join memories m on m.id = e.memory_id
        join project_memories pm on pm.memory_id = m.id
        where e.id=$1 and m.organization_id=$2 and m.source='native' and m.status<>'archived'
          and pm.project_id=$3`,
		entryID, actor.organizationID, project.ID,
	).Scan(&memoryID, &sourceLocale, &normalized, &variantGroupID, &context)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, editorCatFailure(404, "tm_segment_not_found", "Translation memory segment not found")
	}
	if err != nil {
		return nil, err
	}

	rows, err := db.Query(ctx, `
        select `+memoryEntryColumns+`, e.normalized_source_text
        from memory_entries e
        where e.memory_id=$1 and (
            (e.source_locale=$2 and e.normalized_source_text=$3)
            or ($4 <> '' and e.metadata->>'variantGroupId' = $4)
            or ($5 <> '' and e.normalized_source_text=$3 and e.metadata->>'context' = $5)
        )
        order by e.target_locale, e.id`,
		memoryID, sourceLocale, normalized, variantGroupID, context)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	entries := make([]editorCatTmEntryRow, 0)
	for rows.Next() {
		var normalizedText string
		entry, err := scanMemoryEntry(rows, &normalizedText)
		if err != nil {
			return nil, err
		}
		entries = append(entries, editorCatTmEntryRow{memoryEntryRecord: entry, normalized: normalizedText})
	}
	return entries, rows.Err()
}

func sameEditorCatLocale(left, right string) bool {
	return strings.EqualFold(strings.ReplaceAll(left, "_", "-"), strings.ReplaceAll(right, "_", "-"))
}
