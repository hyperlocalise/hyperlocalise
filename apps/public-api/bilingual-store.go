package main

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"
	"unicode/utf8"

	editor_export "github.com/hyperlocalise/hyperlocalise/internal/i18n/editor-export"
	"github.com/jackc/pgx/v5"
)

var errTooManyBilingualRows = errors.New("too many strings for one bilingual file")

type bilingualExportQuery struct {
	Locale        string
	FilePath      *string
	IncludeHidden bool
}

type bilingualImportInput struct {
	Locale   string
	FilePath *string
	Rows     []editor_export.Row
}

// bilingualImportCounts matches the web app's Content Editor bilingual import result.
type bilingualImportCounts struct {
	Matched  int `json:"matched"`
	Imported int `json:"imported"`
	Skipped  int `json:"skipped"`
	Files    int `json:"files"`
}

// bilingualEntry is one target text for the string with Key in the file at Path. An empty Path
// targets strings that belong to no file.
type bilingualEntry struct {
	Path string
	Key  string
	Text string
}

// groupBilingualImportRows follows groupCatBilingualImportEntries in the web app: rows without a
// key or target text, or for another locale, are skipped. With filePath, rows naming another file
// are skipped and rows naming none belong to filePath. A later row for the same key wins.
func groupBilingualImportRows(rows []editor_export.Row, locale string, filePath *string) ([]bilingualEntry, int) {
	skipped := 0
	index := map[[2]string]int{}
	entries := make([]bilingualEntry, 0, len(rows))
	for _, row := range rows {
		key := strings.TrimSpace(row.Key)
		if key == "" || strings.TrimSpace(row.TargetText) == "" {
			skipped++
			continue
		}
		if rowLocale := strings.TrimSpace(row.TargetLocale); rowLocale != "" && !strings.EqualFold(rowLocale, strings.TrimSpace(locale)) {
			skipped++
			continue
		}
		path := strings.TrimSpace(row.SourcePath)
		if filePath != nil {
			if path == "" {
				path = *filePath
			}
			if path != *filePath {
				skipped++
				continue
			}
		}
		id := [2]string{path, key}
		if at, ok := index[id]; ok {
			// The earlier row is replaced, so it counts as skipped.
			entries[at].Text = row.TargetText
			skipped++
			continue
		}
		index[id] = len(entries)
		entries = append(entries, bilingualEntry{Path: path, Key: key, Text: row.TargetText})
	}
	return entries, skipped
}

func countBilingualFiles(entries []bilingualEntry) int {
	paths := map[string]struct{}{}
	for _, entry := range entries {
		paths[entry.Path] = struct{}{}
	}
	return len(paths)
}

func (s *postgresStore) exportBilingualRows(ctx context.Context, actor principal, projectID string, query bilingualExportQuery) ([]editor_export.Row, error) {
	scope, err := loadProjectScope(ctx, s.pool, actor, projectID)
	if err != nil {
		return nil, err
	}
	if !slices.Contains(scope.TargetLocales, query.Locale) {
		return nil, errLocaleNotInProject
	}
	where := newSQLFilter("k.organization_id = $1 AND k.project_id = $2", actor.OrganizationID, scope.ID)
	where.args = append(where.args, query.Locale)
	if !query.IncludeHidden {
		where.conditions = append(where.conditions, "NOT k.is_hidden")
	}
	if query.FilePath != nil {
		where.add("f.source_path = ?", *query.FilePath)
	}
	where.args = append(where.args, editor_export.MaxRows+1)
	rows, err := s.pool.Query(ctx, fmt.Sprintf(`SELECT k.key, k.source_text, COALESCE(t.text, ''), COALESCE(f.source_path, '')
		%s
		LEFT JOIN project_translations t ON t.translation_key_id = k.id AND t.target_locale = $3
		WHERE %s
		ORDER BY f.source_path ASC NULLS FIRST, k.key ASC, k.id ASC
		LIMIT $%d`, stringFrom, where.sql(), len(where.args)), where.args...)
	if err != nil {
		return nil, fmt.Errorf("list bilingual rows: %w", err)
	}
	sourceLocale := ""
	if scope.SourceLocale != nil {
		sourceLocale = *scope.SourceLocale
	}
	items, err := collectRows(rows, func(row rowScanner) (editor_export.Row, error) {
		item := editor_export.Row{SourceLocale: sourceLocale, TargetLocale: query.Locale}
		err := row.Scan(&item.Key, &item.SourceText, &item.TargetText, &item.SourcePath)
		return item, err
	})
	if err != nil {
		return nil, err
	}
	if len(items) > editor_export.MaxRows {
		return nil, errTooManyBilingualRows
	}
	return items, nil
}

type bilingualKey struct {
	id        string
	path      string
	key       string
	maxLength *int
}

// importBilingualRows saves the file's target texts as approved, imported translations, as the
// web app's Content Editor import does. Locked segments and texts over the string's max length
// are skipped.
func (s *postgresStore) importBilingualRows(ctx context.Context, actor principal, projectID string, input bilingualImportInput) (bilingualImportCounts, error) {
	if len(input.Rows) > editor_export.MaxRows {
		return bilingualImportCounts{}, errTooManyBilingualRows
	}
	entries, skipped := groupBilingualImportRows(input.Rows, input.Locale, input.FilePath)
	counts := bilingualImportCounts{Skipped: skipped, Files: countBilingualFiles(entries)}
	err := s.withNativeProject(ctx, actor, projectID, func(tx pgx.Tx, scope projectScope) error {
		if !slices.Contains(scope.TargetLocales, input.Locale) {
			return errLocaleNotInProject
		}
		if input.FilePath != nil {
			var exists bool
			if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM repository_source_files
				WHERE organization_id = $1 AND project_id = $2 AND source_path = $3)`,
				actor.OrganizationID, scope.ID, *input.FilePath).Scan(&exists); err != nil {
				return fmt.Errorf("check source file: %w", err)
			}
			if !exists {
				return errSourceFileNotFound
			}
		}
		if len(entries) == 0 {
			return nil
		}
		keys, err := lockBilingualKeys(ctx, tx, actor, scope, entries)
		if err != nil {
			return err
		}
		texts := make(map[[2]string]string, len(entries))
		for _, entry := range entries {
			texts[[2]string{entry.Path, entry.Key}] = entry.Text
		}
		counts.Matched = len(keys)
		matchedEntries := map[[2]string]struct{}{}
		for _, key := range keys {
			matchedEntries[[2]string{key.path, key.key}] = struct{}{}
		}
		counts.Skipped += len(entries) - len(matchedEntries)
		locked, err := lockedBilingualKeys(ctx, tx, actor, scope, input.Locale, keys)
		if err != nil {
			return err
		}
		before, err := lockBilingualTranslations(ctx, tx, actor, input.Locale, keys)
		if err != nil {
			return err
		}
		write := bilingualWrite{}
		importedByPath := map[string]int{}
		for _, key := range keys {
			text := texts[[2]string{key.path, key.key}]
			if _, ok := locked[key.id]; ok || (key.maxLength != nil && *key.maxLength > 0 && utf8.RuneCountInString(text) > *key.maxLength) {
				counts.Skipped++
				continue
			}
			counts.Imported++
			importedByPath[key.path]++
			snapshot, existed := before[key.id]
			if existed && snapshot.text == text && snapshot.status == "approved" {
				continue
			}
			write.keyIDs = append(write.keyIDs, key.id)
			write.texts = append(write.texts, text)
			if existed {
				write.before = append(write.before, snapshot)
			}
		}
		if err := saveBilingualTranslations(ctx, tx, actor, scope, input.Locale, write); err != nil {
			return err
		}
		return recordBilingualImportActivity(ctx, tx, actor, scope.ID, input.Locale, importedByPath)
	})
	if err != nil {
		return bilingualImportCounts{}, err
	}
	return counts, nil
}

func lockBilingualKeys(ctx context.Context, tx pgx.Tx, actor principal, scope projectScope, entries []bilingualEntry) ([]bilingualKey, error) {
	paths := make([]string, len(entries))
	names := make([]string, len(entries))
	for i, entry := range entries {
		paths[i], names[i] = entry.Path, entry.Key
	}
	// Same key row lock as lockString, taken in id order so concurrent imports cannot deadlock.
	rows, err := tx.Query(ctx, `SELECT k.id, COALESCE(f.source_path, ''), k.key, k.max_length
		FROM project_translation_keys k
		LEFT JOIN repository_source_files f ON f.id = k.repository_source_file_id
		JOIN unnest($3::text[], $4::text[]) AS e(path, key) ON e.key = k.key AND e.path = COALESCE(f.source_path, '')
		WHERE k.organization_id = $1 AND k.project_id = $2
		ORDER BY k.id
		FOR NO KEY UPDATE OF k`,
		actor.OrganizationID, scope.ID, paths, names)
	if err != nil {
		return nil, fmt.Errorf("lock bilingual strings: %w", err)
	}
	return collectRows(rows, func(row rowScanner) (bilingualKey, error) {
		var key bilingualKey
		err := row.Scan(&key.id, &key.path, &key.key, &key.maxLength)
		return key, err
	})
}

func bilingualKeyIDs(keys []bilingualKey) []string {
	ids := make([]string, len(keys))
	for i, key := range keys {
		ids[i] = key.id
	}
	return ids
}

func lockedBilingualKeys(ctx context.Context, tx pgx.Tx, actor principal, scope projectScope, locale string, keys []bilingualKey) (map[string]struct{}, error) {
	rows, err := tx.Query(ctx, `SELECT DISTINCT external_string_id FROM project_cat_segment_locks
		WHERE organization_id = $1 AND project_id = $2 AND target_locale = $3 AND external_string_id = ANY($4::text[])`,
		actor.OrganizationID, scope.ID, locale, bilingualKeyIDs(keys))
	if err != nil {
		return nil, fmt.Errorf("check segment locks: %w", err)
	}
	ids, err := collectRows(rows, func(row rowScanner) (string, error) {
		var id string
		err := row.Scan(&id)
		return id, err
	})
	if err != nil {
		return nil, err
	}
	locked := make(map[string]struct{}, len(ids))
	for _, id := range ids {
		locked[id] = struct{}{}
	}
	return locked, nil
}

type bilingualSnapshot struct {
	translationSnapshot
	keyID string
}

func lockBilingualTranslations(ctx context.Context, tx pgx.Tx, actor principal, locale string, keys []bilingualKey) (map[string]bilingualSnapshot, error) {
	rows, err := tx.Query(ctx, `SELECT id, translation_key_id, text, status::text, provenance::text, source_job_id, updated_at
		FROM project_translations
		WHERE organization_id = $1 AND target_locale = $2 AND translation_key_id = ANY($3::uuid[])
		ORDER BY id
		FOR UPDATE`, actor.OrganizationID, locale, bilingualKeyIDs(keys))
	if err != nil {
		return nil, fmt.Errorf("lock translations: %w", err)
	}
	snapshots, err := collectRows(rows, func(row rowScanner) (bilingualSnapshot, error) {
		var item bilingualSnapshot
		err := row.Scan(&item.id, &item.keyID, &item.text, &item.status, &item.provenance, &item.sourceJobID, &item.updatedAt)
		return item, err
	})
	if err != nil {
		return nil, err
	}
	byKey := make(map[string]bilingualSnapshot, len(snapshots))
	for _, item := range snapshots {
		byKey[item.keyID] = item
	}
	return byKey, nil
}

type bilingualWrite struct {
	keyIDs []string
	texts  []string
	before []bilingualSnapshot
}

// saveBilingualTranslations upserts the changed translations and records their revisions the
// way recordTranslationRevision does for one translation.
func saveBilingualTranslations(ctx context.Context, tx pgx.Tx, actor principal, scope projectScope, locale string, write bilingualWrite) error {
	if len(write.keyIDs) == 0 {
		return nil
	}
	if len(write.before) > 0 {
		ids := make([]string, len(write.before))
		texts := make([]string, len(write.before))
		statuses := make([]string, len(write.before))
		provenances := make([]string, len(write.before))
		jobIDs := make([]*string, len(write.before))
		updatedAts := make([]time.Time, len(write.before))
		for i, item := range write.before {
			ids[i], texts[i], statuses[i], provenances[i] = item.id, item.text, item.status, item.provenance
			jobIDs[i], updatedAts[i] = item.sourceJobID, item.updatedAt
		}
		if _, err := tx.Exec(ctx, `INSERT INTO project_translation_revisions (
				organization_id, project_id, translation_id, translation_key_id, target_locale, text, status,
				provenance, source_job_id, actor_kind, created_at
			)
			SELECT t.organization_id, t.project_id, t.id, t.translation_key_id, t.target_locale, b.text,
				b.status::project_translation_status, b.provenance::project_translation_provenance, b.source_job_id,
				CASE b.provenance WHEN 'agent' THEN 'agent' WHEN 'manual' THEN 'user' ELSE 'system' END,
				b.updated_at
			FROM unnest($2::uuid[], $3::text[], $4::text[], $5::text[], $6::text[], $7::timestamptz[])
				AS b(id, text, status, provenance, source_job_id, updated_at)
			JOIN project_translations t ON t.id = b.id AND t.organization_id = $1
			WHERE NOT EXISTS (SELECT 1 FROM project_translation_revisions r WHERE r.translation_id = b.id)`,
			actor.OrganizationID, ids, texts, statuses, provenances, jobIDs, updatedAts,
		); err != nil {
			return fmt.Errorf("record baseline revisions: %w", err)
		}
	}
	reviewedAt := time.Now().UTC()
	rows, err := tx.Query(ctx, `INSERT INTO project_translations (
			organization_id, project_id, translation_key_id, target_locale, text, status, provenance,
			reviewed_by_user_id, reviewed_at
		)
		SELECT $1, $2, w.key_id, $3, w.text, 'approved', 'import', $6::uuid, $7::timestamptz
		FROM unnest($4::uuid[], $5::text[]) AS w(key_id, text)
		ON CONFLICT (translation_key_id, target_locale) DO UPDATE SET
			text = excluded.text,
			status = excluded.status,
			provenance = excluded.provenance,
			source_job_id = NULL,
			reviewed_by_user_id = excluded.reviewed_by_user_id,
			reviewed_at = excluded.reviewed_at,
			updated_at = now()
		RETURNING id`,
		actor.OrganizationID, scope.ID, locale, write.keyIDs, write.texts, actor.UserID, reviewedAt)
	if err != nil {
		return fmt.Errorf("save translations: %w", err)
	}
	ids, err := collectRows(rows, func(row rowScanner) (string, error) {
		var id string
		err := row.Scan(&id)
		return id, err
	})
	if err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO project_translation_revisions (
			organization_id, project_id, translation_id, translation_key_id, target_locale, text, status,
			provenance, source_job_id, actor_kind, actor_user_id, created_at
		)
		SELECT t.organization_id, t.project_id, t.id, t.translation_key_id, t.target_locale, t.text, t.status,
			t.provenance, t.source_job_id, 'api_key', $3::uuid, clock_timestamp()
		FROM project_translations t
		WHERE t.id = ANY($1::uuid[]) AND t.organization_id = $2`,
		ids, actor.OrganizationID, actor.UserID,
	); err != nil {
		return fmt.Errorf("record revisions: %w", err)
	}
	return nil
}

// recordBilingualImportActivity records file_translations_imported for each file that received
// translations, as the web app's importCatBilingualRows does. Strings outside any file, which only
// the public API creates, have no file to target and record no event.
func recordBilingualImportActivity(ctx context.Context, tx pgx.Tx, actor principal, projectID, locale string, importedByPath map[string]int) error {
	paths := make([]string, 0, len(importedByPath))
	for path, imported := range importedByPath {
		if path != "" && imported > 0 {
			paths = append(paths, path)
		}
	}
	slices.Sort(paths)
	for _, path := range paths {
		event, err := fileActivityEvent("file_translations_imported", projectID, path, map[string]any{"targetLocale": locale})
		if err != nil {
			return err
		}
		if err := insertActivity(ctx, tx, actor, event); err != nil {
			return err
		}
	}
	return nil
}
