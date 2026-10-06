package main

import (
	"context"
	"encoding/json"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/memoryinterchange"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const memoryImportLookupBatchSize = 2000

func loadExistingEntriesForImport(
	ctx context.Context,
	tx pgx.Tx,
	memoryID string,
	candidates []memoryinterchange.Candidate,
) (map[string]memoryinterchange.ExistingEntry, map[string]memoryinterchange.ExistingEntry, error) {
	existingByExternalKey := map[string]memoryinterchange.ExistingEntry{}
	externalKeys := make([]string, 0)
	seenExternal := map[string]struct{}{}
	for _, candidate := range candidates {
		if candidate.ExternalKey == nil || strings.TrimSpace(*candidate.ExternalKey) == "" {
			continue
		}
		key := strings.TrimSpace(*candidate.ExternalKey)
		if _, ok := seenExternal[key]; ok {
			continue
		}
		seenExternal[key] = struct{}{}
		externalKeys = append(externalKeys, key)
	}
	for start := 0; start < len(externalKeys); start += memoryImportLookupBatchSize {
		end := start + memoryImportLookupBatchSize
		if end > len(externalKeys) {
			end = len(externalKeys)
		}
		batch := externalKeys[start:end]
		rows, err := tx.Query(ctx, `select id::text, external_key from memory_entries where memory_id=$1 and external_key = any($2::text[])`, memoryID, batch)
		if err != nil {
			return nil, nil, err
		}
		for rows.Next() {
			var id string
			var externalKey *string
			if err := rows.Scan(&id, &externalKey); err != nil {
				rows.Close()
				return nil, nil, err
			}
			if externalKey != nil && strings.TrimSpace(*externalKey) != "" {
				existingByExternalKey[*externalKey] = memoryinterchange.ExistingEntry{ID: id, ExternalKey: externalKey}
			}
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return nil, nil, err
		}
	}

	existingBySourceKey := map[string]memoryinterchange.ExistingEntry{}
	unresolved := make([]memoryinterchange.Candidate, 0, len(candidates))
	for _, candidate := range candidates {
		if candidate.ExternalKey != nil && *candidate.ExternalKey != "" {
			if _, ok := existingByExternalKey[*candidate.ExternalKey]; ok {
				continue
			}
		}
		unresolved = append(unresolved, candidate)
	}
	for start := 0; start < len(unresolved); start += memoryImportLookupBatchSize {
		end := start + memoryImportLookupBatchSize
		if end > len(unresolved) {
			end = len(unresolved)
		}
		batch := unresolved[start:end]
		sourceLocales := make([]string, 0, len(batch))
		targetLocales := make([]string, 0, len(batch))
		normalizedTexts := make([]string, 0, len(batch))
		wanted := map[string]struct{}{}
		for _, candidate := range batch {
			sourceLocales = append(sourceLocales, candidate.SourceLocale)
			targetLocales = append(targetLocales, candidate.TargetLocale)
			normalized := memoryinterchange.NormalizeSourceText(candidate.SourceText)
			normalizedTexts = append(normalizedTexts, normalized)
			wanted[memoryinterchange.SourceLookupKey(candidate.SourceLocale, candidate.TargetLocale, candidate.SourceText)] = struct{}{}
		}
		if len(sourceLocales) == 0 {
			continue
		}
		rows, err := tx.Query(ctx, `
			select id::text, source_locale, target_locale, normalized_source_text, external_key
			from memory_entries
			where memory_id=$1
			  and source_locale = any($2::text[])
			  and target_locale = any($3::text[])
			  and normalized_source_text = any($4::text[])`,
			memoryID, sourceLocales, targetLocales, normalizedTexts,
		)
		if err != nil {
			return nil, nil, err
		}
		for rows.Next() {
			var id, sourceLocale, targetLocale, normalizedSourceText string
			var externalKey *string
			if err := rows.Scan(&id, &sourceLocale, &targetLocale, &normalizedSourceText, &externalKey); err != nil {
				rows.Close()
				return nil, nil, err
			}
			key := sourceLocale + "\x00" + targetLocale + "\x00" + normalizedSourceText
			if _, ok := wanted[key]; ok {
				existingBySourceKey[key] = memoryinterchange.ExistingEntry{ID: id, ExternalKey: externalKey}
			}
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return nil, nil, err
		}
	}

	return existingByExternalKey, existingBySourceKey, nil
}

func applyPlannedMemoryImport(
	ctx context.Context,
	tx pgx.Tx,
	memoryID string,
	attemptID string,
	userID *string,
	planned []memoryinterchange.PlannedImport,
) (created, updated, variantCreated, skipped int, err error) {
	for _, item := range planned {
		switch item.Action {
		case memoryinterchange.ImportActionSkip:
			skipped++
		case memoryinterchange.ImportActionCreate, memoryinterchange.ImportActionVariant:
			candidate := item.Candidate
			normalized := memoryinterchange.NormalizeSourceText(candidate.SourceText)
			var entryID string
			var inserted bool
			insertErr := tx.QueryRow(ctx, `
				insert into memory_entries (
					memory_id, source_locale, target_locale, source_text, normalized_source_text,
					target_text, match_score, provenance, created_by_user_id, import_batch_id, external_key
				) values ($1,$2,$3,$4,$5,$6,$7,'import',$8,$9,$10)
				on conflict (memory_id, source_locale, target_locale, normalized_source_text) do nothing
				returning id::text, true`,
				memoryID, candidate.SourceLocale, candidate.TargetLocale, candidate.SourceText, normalized,
				candidate.TargetText, candidate.MatchScore, userID, attemptID, candidate.ExternalKey,
			).Scan(&entryID, &inserted)
			if insertErr == pgx.ErrNoRows {
				skipped++
				continue
			}
			if insertErr != nil {
				return created, updated, variantCreated, skipped, insertErr
			}
			if item.Action == memoryinterchange.ImportActionVariant {
				variantCreated++
			} else {
				created++
			}
			if err := recordMemoryImportEntryEvent(ctx, tx, entryID, memoryID, userID, 1, "created"); err != nil {
				return created, updated, variantCreated, skipped, err
			}
		case memoryinterchange.ImportActionUpdate:
			if item.ExistingID == "" {
				skipped++
				continue
			}
			candidate := item.Candidate
			var version int
			if err := tx.QueryRow(ctx, `select version from memory_entries where id=$1 and memory_id=$2`, item.ExistingID, memoryID).Scan(&version); err != nil {
				if err == pgx.ErrNoRows {
					skipped++
					continue
				}
				return created, updated, variantCreated, skipped, err
			}
			nextVersion := version + 1
			tag, updateErr := tx.Exec(ctx, `
				update memory_entries
				set target_text=$3, match_score=$4, provenance='import', modified_by_user_id=$5,
				    import_batch_id=$6, external_key=coalesce($7, external_key), version=$8, updated_at=now()
				where id=$1 and memory_id=$2 and version=$9`,
				item.ExistingID, memoryID, candidate.TargetText, candidate.MatchScore, userID, attemptID, candidate.ExternalKey, nextVersion, version,
			)
			if updateErr != nil {
				return created, updated, variantCreated, skipped, updateErr
			}
			if tag.RowsAffected() == 0 {
				skipped++
				continue
			}
			updated++
			if err := recordMemoryImportEntryEvent(ctx, tx, item.ExistingID, memoryID, userID, nextVersion, "updated"); err != nil {
				return created, updated, variantCreated, skipped, err
			}
		}
	}
	return created, updated, variantCreated, skipped, nil
}

func recordMemoryImportEntryEvent(ctx context.Context, tx pgx.Tx, entryID, memoryID string, userID *string, version int, eventType string) error {
	if _, err := tx.Exec(ctx, "savepoint memory_import_entry_event"); err != nil {
		return err
	}
	attributes, _ := json.Marshal(map[string]any{"provenance": "import"})
	_, err := tx.Exec(ctx, `
		insert into memory_entry_events (
			memory_entry_id, memory_id, event_type, actor_kind, actor_user_id, version, changed_fields, attributes
		) values ($1,$2,$3,'import',$4,$5,'["sourceLocale","targetLocale","sourceText","targetText","matchScore","provenance","externalKey"]'::jsonb,$6::jsonb)`,
		entryID, memoryID, eventType, userID, version, attributes,
	)
	if err != nil {
		if _, rollbackErr := tx.Exec(ctx, "rollback to savepoint memory_import_entry_event"); rollbackErr != nil {
			return rollbackErr
		}
		return nil
	}
	_, err = tx.Exec(ctx, "release savepoint memory_import_entry_event")
	return err
}

func publishTranslationMemoryImportedActivity(ctx context.Context, pool *pgxpool.Pool, attemptID, memoryID string, itemCount int) {
	var organizationID, userID string
	err := pool.QueryRow(ctx, `
		select organization_id::text, created_by_user_id::text
		from memory_import_attempts where id=$1`, attemptID,
	).Scan(&organizationID, &userID)
	if err != nil {
		return
	}
	payload, err := json.Marshal(map[string]any{
		"batchId":    attemptID,
		"itemCount":  itemCount,
		"resourceId": memoryID,
	})
	if err != nil {
		return
	}
	publisher, err := newMemoryInterchangeActivityPublisher(ctx)
	if err != nil || publisher == nil {
		return
	}
	_ = publisher.Publish(ctx, memoryInterchangeActivityInput{
		ActorKind:      "user",
		ActorUserID:    userID,
		EventType:      "translation_memory_imported",
		OrganizationID: organizationID,
		Payload:        payload,
		TargetID:       memoryID,
		TargetKind:     "translation_memory",
	})
}
