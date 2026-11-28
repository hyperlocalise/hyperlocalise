package main

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"strings"

	"github.com/jackc/pgx/v5"
)

// writeEditorCatImageApprovalTM writes the approved image's text pairs into the
// project's writable translation memory. It reads the source asset's text layers
// (only when they match the current source hash) and upserts each region whose
// source text and target-locale text are both non-empty. A missing source file,
// stale layers or no writable memory write nothing.
func (api *editorCatAPI) writeEditorCatImageApprovalTM(
	ctx context.Context,
	actor editorCatActor,
	project editorCatProject,
	sourceFileID, sourcePath, targetLocale, variantID string,
) (int, error) {
	sourceFileID = strings.TrimSpace(sourceFileID)
	sourceLocale := strings.ReplaceAll(strings.TrimSpace(project.SourceLocale), "_", "-")
	if sourceFileID == "" || sourceLocale == "" || targetLocale == "" {
		return 0, nil
	}
	var storedFileID string
	var sourceHash string
	var metadata []byte
	err := api.pool.QueryRow(ctx, `
        select f.id, coalesce(f.sha256, ''), coalesce(f.metadata, '{}'::jsonb)
        from repository_source_file_versions v
        join stored_files f on f.id=v.stored_file_id and f.organization_id=v.organization_id
        where v.organization_id=$1 and v.project_id=$2 and v.repository_source_file_id=$3
        order by v.created_at desc, v.id desc
        limit 1`,
		actor.organizationID, project.ID, sourceFileID,
	).Scan(&storedFileID, &sourceHash, &metadata)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	layers := readEditorCatImageTextLayers(metadata, sourceHash)
	if layers == nil {
		return 0, nil
	}
	pairs := editorCatImageApprovalPairs(layers, targetLocale)
	if len(pairs) == 0 {
		return 0, nil
	}
	var memoryID string
	err = api.pool.QueryRow(ctx, `
        select m.id
        from project_memories pm
        join memories m on m.id=pm.memory_id
        where pm.organization_id=$1 and pm.project_id=$2 and m.organization_id=$1
          and m.source='native' and m.status not in ('archived', 'draft')
        order by pm.priority, pm.created_at, m.id
        limit 1`,
		actor.organizationID, project.ID,
	).Scan(&memoryID)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	tx, err := api.pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	written := 0
	segmentID := binaryEditorCatStringID(sourceFileID, sourcePath)
	for _, pair := range pairs {
		meta, err := json.Marshal(map[string]any{
			"projectId": project.ID, "sourcePath": sourcePath, "segmentKey": sourcePath,
			"regionId": pair.regionID, "storedFileId": storedFileID, "imageVariantId": variantID,
		})
		if err != nil {
			return 0, err
		}
		ok, err := upsertApprovedMemoryEntry(ctx, tx, approvedMemoryEntry{
			memoryID: memoryID, sourceLocale: sourceLocale, targetLocale: targetLocale,
			sourceText: pair.sourceText, targetText: pair.targetText,
			externalKey: segmentID + ":" + pair.regionID + ":" + targetLocale,
			metadata:    meta,
		})
		if err != nil {
			return 0, err
		}
		if ok {
			written++
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	return written, nil
}

type editorCatImageApprovalPair struct {
	regionID, sourceText, targetText string
}

// editorCatImageApprovalPairs returns each region's trimmed source/target pair for
// the locale, skipping empty sides and repeating pairs.
func editorCatImageApprovalPairs(layers *editorCatImageTextLayers, targetLocale string) []editorCatImageApprovalPair {
	seen := map[string]bool{}
	pairs := []editorCatImageApprovalPair{}
	for _, region := range layers.Regions {
		sourceText := strings.TrimSpace(region.Text)
		translation, ok := region.Translations[targetLocale]
		if !ok || sourceText == "" {
			continue
		}
		targetText := strings.TrimSpace(translation.Text)
		if targetText == "" {
			continue
		}
		key := sourceText + "\x00" + targetText
		if seen[key] {
			continue
		}
		seen[key] = true
		pairs = append(pairs, editorCatImageApprovalPair{regionID: region.ID, sourceText: sourceText, targetText: targetText})
	}
	return pairs
}

// editorCatImageApprovalTMWritten runs the approval TM write and never fails the
// approval: a write error is logged and reported as zero entries.
func (api *editorCatAPI) editorCatImageApprovalTMWritten(
	ctx context.Context,
	actor editorCatActor,
	project editorCatProject,
	sourceFileID, sourcePath, targetLocale, variantID string,
) int {
	written, err := api.writeEditorCatImageApprovalTM(ctx, actor, project, sourceFileID, sourcePath, targetLocale, variantID)
	if err != nil {
		slog.ErrorContext(ctx, "editor_cat_image_approval_tm_failed", "project_id", project.ID, "target_locale", targetLocale, "error", err)
		return 0
	}
	return written
}
