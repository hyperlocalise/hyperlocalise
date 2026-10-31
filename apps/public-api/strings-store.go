package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"golang.org/x/text/unicode/norm"
)

var (
	errProjectNotFound     = fmt.Errorf("%w: project", errResourceNotFound)
	errStringNotFound      = fmt.Errorf("%w: string", errResourceNotFound)
	errTranslationNotFound = fmt.Errorf("%w: translation", errResourceNotFound)
	errSourceFileNotFound  = errors.New("source file not found")
	errProjectNotNative    = errors.New("project strings are managed by an external TMS")
	errStringKeyConflict   = errors.New("string key already exists")
	errLocaleNotInProject  = errors.New("locale is not a project target locale")
	errSegmentLocked       = errors.New("segment is locked")
	errTranslationTooLong  = errors.New("translation exceeds the string max length")
)

type translationString struct {
	ID         string    `json:"id"`
	Key        string    `json:"key"`
	SourceText string    `json:"sourceText"`
	Context    *string   `json:"context"`
	Type       *string   `json:"type"`
	MaxLength  *int      `json:"maxLength"`
	Hidden     bool      `json:"hidden"`
	FilePath   *string   `json:"filePath"`
	CreatedAt  time.Time `json:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt"`
}

type translationRecord struct {
	ID               string     `json:"id"`
	StringID         string     `json:"stringId"`
	Key              string     `json:"key"`
	Locale           string     `json:"locale"`
	Text             string     `json:"text"`
	Status           string     `json:"status"`
	Provenance       string     `json:"provenance"`
	ReviewedByUserID *string    `json:"reviewedByUserId"`
	ReviewedAt       *time.Time `json:"reviewedAt"`
	CreatedAt        time.Time  `json:"createdAt"`
	UpdatedAt        time.Time  `json:"updatedAt"`
}

type localeProgress struct {
	Locale              string `json:"locale"`
	TotalStrings        int    `json:"totalStrings"`
	TranslatedStrings   int    `json:"translatedStrings"`
	ApprovedStrings     int    `json:"approvedStrings"`
	NeedsReviewStrings  int    `json:"needsReviewStrings"`
	TranslationProgress int    `json:"translationProgress"`
	ApprovalProgress    int    `json:"approvalProgress"`
}

type projectLocales struct {
	SourceLocale *string          `json:"sourceLocale"`
	Locales      []localeProgress `json:"locales"`
}

type stringFilters struct {
	Search        string
	FilePath      string
	IncludeHidden bool
	Limit         int
	Offset        int
}

type translationFilters struct {
	Locale string
	Status string
	Limit  int
	Offset int
}

type stringCreate struct {
	Key        string
	SourceText string
	Context    *string
	Type       *string
	MaxLength  *int
	Hidden     bool
	FilePath   *string
}

type stringPatch struct {
	SourceText *string
	Context    optionalString
	MaxLength  optionalInt
	Hidden     *bool
}

type translationWrite struct {
	Text   string
	Status string
}

// projectScope is the accessible project a nested string or translation request targets.
type projectScope struct {
	ID            string
	Source        string
	SourceLocale  *string
	TargetLocales []string
}

type queryRower interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}

func loadProjectScope(ctx context.Context, db queryRower, actor principal, projectID string) (projectScope, error) {
	var scope projectScope
	var targetLocales []byte
	err := db.QueryRow(ctx, `SELECT p.id, p.source, p.source_locale, p.target_locales
		FROM projects p
		WHERE `+accessibleProjectPredicate+` AND p.id = $3`,
		actor.OrganizationID, actor.UserID, projectID,
	).Scan(&scope.ID, &scope.Source, &scope.SourceLocale, &targetLocales)
	if errors.Is(err, pgx.ErrNoRows) {
		return projectScope{}, errProjectNotFound
	}
	if err != nil {
		return projectScope{}, fmt.Errorf("load project scope: %w", err)
	}
	if err := json.Unmarshal(targetLocales, &scope.TargetLocales); err != nil {
		return projectScope{}, fmt.Errorf("decode project target locales: %w", err)
	}
	if scope.TargetLocales == nil {
		scope.TargetLocales = []string{}
	}
	return scope, nil
}

func (scope projectScope) requireNative() error {
	if scope.Source != "native" {
		return errProjectNotNative
	}
	return nil
}

// normalizeSourceText matches normalizeTranslationMemorySourceText in the web app.
func normalizeSourceText(sourceText string) string {
	return strings.ToLower(strings.Join(strings.Fields(norm.NFKC.String(sourceText)), " "))
}

func (s *postgresStore) getProjectLocales(ctx context.Context, actor principal, projectID string) (projectLocales, error) {
	scope, err := loadProjectScope(ctx, s.pool, actor, projectID)
	if err != nil {
		return projectLocales{}, err
	}
	var total int
	if err := s.pool.QueryRow(ctx, `SELECT count(*)
		FROM project_translation_keys k
		WHERE k.organization_id = $1 AND k.project_id = $2 AND NOT k.is_hidden`,
		actor.OrganizationID, scope.ID).Scan(&total); err != nil {
		return projectLocales{}, fmt.Errorf("count project strings: %w", err)
	}
	rows, err := s.pool.Query(ctx, `SELECT t.target_locale,
			count(*) FILTER (WHERE t.text <> '' AND t.status <> 'rejected'),
			count(*) FILTER (WHERE t.status = 'approved'),
			count(*) FILTER (WHERE t.status = 'needs_review')
		FROM project_translations t
		JOIN project_translation_keys k ON k.id = t.translation_key_id AND NOT k.is_hidden
		WHERE t.organization_id = $1 AND t.project_id = $2
		GROUP BY t.target_locale`, actor.OrganizationID, scope.ID)
	if err != nil {
		return projectLocales{}, fmt.Errorf("count project translations: %w", err)
	}
	defer rows.Close()
	counts := map[string]localeProgress{}
	for rows.Next() {
		var item localeProgress
		if err := rows.Scan(&item.Locale, &item.TranslatedStrings, &item.ApprovedStrings, &item.NeedsReviewStrings); err != nil {
			return projectLocales{}, fmt.Errorf("scan locale progress: %w", err)
		}
		counts[item.Locale] = item
	}
	if err := rows.Err(); err != nil {
		return projectLocales{}, fmt.Errorf("iterate locale progress: %w", err)
	}
	locales := make([]localeProgress, 0, len(scope.TargetLocales))
	for _, locale := range scope.TargetLocales {
		item := counts[locale]
		item.Locale = locale
		item.TotalStrings = total
		item.TranslationProgress = percentage(item.TranslatedStrings, total)
		item.ApprovalProgress = percentage(item.ApprovedStrings, total)
		locales = append(locales, item)
	}
	return projectLocales{SourceLocale: scope.SourceLocale, Locales: locales}, nil
}

func percentage(count, total int) int {
	if total <= 0 {
		return 0
	}
	return min(100, count*100/total)
}

const stringColumns = `
	k.id, k.key, k.source_text, k.context, k.type, k.max_length, k.is_hidden,
	f.source_path, k.created_at, k.updated_at`

const stringFrom = `
	FROM project_translation_keys k
	LEFT JOIN repository_source_files f ON f.id = k.repository_source_file_id`

func scanString(row rowScanner) (translationString, error) {
	var item translationString
	err := row.Scan(
		&item.ID, &item.Key, &item.SourceText, &item.Context, &item.Type, &item.MaxLength, &item.Hidden,
		&item.FilePath, &item.CreatedAt, &item.UpdatedAt,
	)
	return item, err
}

func (s *postgresStore) listStrings(ctx context.Context, actor principal, projectID string, filters stringFilters) ([]translationString, int, error) {
	scope, err := loadProjectScope(ctx, s.pool, actor, projectID)
	if err != nil {
		return nil, 0, err
	}
	where := newSQLFilter("k.organization_id = $1 AND k.project_id = $2", actor.OrganizationID, scope.ID)
	if !filters.IncludeHidden {
		where.conditions = append(where.conditions, "NOT k.is_hidden")
	}
	if filters.FilePath != "" {
		where.add("f.source_path = ?", filters.FilePath)
	}
	if filters.Search != "" {
		where.add("(k.key ILIKE ? OR k.source_text ILIKE ?)", "%"+filters.Search+"%")
	}
	var total int
	if err := s.pool.QueryRow(ctx, `SELECT count(*) `+stringFrom+` WHERE `+where.sql(), where.args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count strings: %w", err)
	}
	pageSQL := where.page(filters.Limit, filters.Offset)
	rows, err := s.pool.Query(ctx, `SELECT `+stringColumns+stringFrom+` WHERE `+where.sql()+`
		ORDER BY f.source_path ASC NULLS FIRST, k.key ASC, k.id ASC`+pageSQL, where.args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list strings: %w", err)
	}
	items, err := collectRows(rows, scanString)
	return items, total, err
}

func (s *postgresStore) getString(ctx context.Context, actor principal, projectID, stringID string) (translationString, error) {
	scope, err := loadProjectScope(ctx, s.pool, actor, projectID)
	if err != nil {
		return translationString{}, err
	}
	return loadString(ctx, s.pool, actor, scope, stringID)
}

func loadString(ctx context.Context, db queryRower, actor principal, scope projectScope, stringID string) (translationString, error) {
	if _, err := uuid.Parse(stringID); err != nil {
		return translationString{}, errStringNotFound
	}
	item, err := scanString(db.QueryRow(ctx, `SELECT `+stringColumns+stringFrom+`
		WHERE k.organization_id = $1 AND k.project_id = $2 AND k.id = $3`,
		actor.OrganizationID, scope.ID, stringID))
	if errors.Is(err, pgx.ErrNoRows) {
		return translationString{}, errStringNotFound
	}
	return item, err
}

// lockString takes the same key row lock as the web app and go-svc translation writers, so
// writes to one key and its translations run one at a time.
func lockString(ctx context.Context, tx pgx.Tx, actor principal, scope projectScope, stringID string) (*int, error) {
	if _, err := uuid.Parse(stringID); err != nil {
		return nil, errStringNotFound
	}
	var maxLength *int
	err := tx.QueryRow(ctx, `SELECT k.max_length
		FROM project_translation_keys k
		WHERE k.organization_id = $1 AND k.project_id = $2 AND k.id = $3
		FOR NO KEY UPDATE`,
		actor.OrganizationID, scope.ID, stringID).Scan(&maxLength)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, errStringNotFound
	}
	return maxLength, err
}

// withNativeProject runs fn in a transaction scoped to an accessible native project.
func (s *postgresStore) withNativeProject(ctx context.Context, actor principal, projectID string, fn func(pgx.Tx, projectScope) error) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	scope, err := loadProjectScope(ctx, tx, actor, projectID)
	if err != nil {
		return err
	}
	if err := scope.requireNative(); err != nil {
		return err
	}
	if err := fn(tx, scope); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *postgresStore) createString(ctx context.Context, actor principal, projectID string, input stringCreate) (translationString, error) {
	var created translationString
	err := s.withNativeProject(ctx, actor, projectID, func(tx pgx.Tx, scope projectScope) error {
		var fileID *string
		if input.FilePath != nil {
			var id string
			err := tx.QueryRow(ctx, `SELECT f.id FROM repository_source_files f
				WHERE f.organization_id = $1 AND f.project_id = $2 AND f.source_path = $3`,
				actor.OrganizationID, scope.ID, *input.FilePath).Scan(&id)
			if errors.Is(err, pgx.ErrNoRows) {
				return errSourceFileNotFound
			}
			if err != nil {
				return fmt.Errorf("load source file: %w", err)
			}
			fileID = &id
		}
		// The unique index treats a missing file as distinct, so serialize creates per key.
		if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))`,
			"public-api:string:"+scope.ID, input.Key); err != nil {
			return fmt.Errorf("lock string key: %w", err)
		}
		var exists bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS (
				SELECT 1 FROM project_translation_keys
				WHERE project_id = $1 AND key = $2 AND repository_source_file_id IS NOT DISTINCT FROM $3::uuid
			)`, scope.ID, input.Key, fileID).Scan(&exists); err != nil {
			return fmt.Errorf("check string key: %w", err)
		}
		if exists {
			return errStringKeyConflict
		}
		var id string
		if err := tx.QueryRow(ctx, `INSERT INTO project_translation_keys (
				organization_id, project_id, repository_source_file_id, key, source_text,
				normalized_source_text, context, type, max_length, is_hidden
			) VALUES ($1, $2, $3::uuid, $4, $5, $6, $7, $8, $9, $10)
			RETURNING id`,
			actor.OrganizationID, scope.ID, fileID, input.Key, input.SourceText,
			normalizeSourceText(input.SourceText), input.Context, input.Type, input.MaxLength, input.Hidden,
		).Scan(&id); err != nil {
			return fmt.Errorf("insert string: %w", err)
		}
		var err error
		created, err = loadString(ctx, tx, actor, scope, id)
		return err
	})
	return created, err
}

func (s *postgresStore) updateString(ctx context.Context, actor principal, projectID, stringID string, patch stringPatch) (translationString, error) {
	var updated translationString
	err := s.withNativeProject(ctx, actor, projectID, func(tx pgx.Tx, scope projectScope) error {
		if _, err := lockString(ctx, tx, actor, scope, stringID); err != nil {
			return err
		}
		set := newSQLFilter("updated_at = now()")
		if patch.SourceText != nil {
			set.add("source_text = ?", *patch.SourceText)
			set.add("normalized_source_text = ?", normalizeSourceText(*patch.SourceText))
		}
		if patch.Context.Set {
			set.add("context = ?", patch.Context.Value)
		}
		if patch.MaxLength.Set {
			set.add("max_length = ?", patch.MaxLength.Value)
		}
		if patch.Hidden != nil {
			set.add("is_hidden = ?", *patch.Hidden)
		}
		args := append(set.args, actor.OrganizationID, scope.ID, stringID)
		n := len(set.args)
		if _, err := tx.Exec(ctx, fmt.Sprintf(`UPDATE project_translation_keys SET %s
			WHERE organization_id = $%d AND project_id = $%d AND id = $%d`,
			strings.Join(set.conditions, ", "), n+1, n+2, n+3), args...); err != nil {
			return fmt.Errorf("update string: %w", err)
		}
		var err error
		updated, err = loadString(ctx, tx, actor, scope, stringID)
		return err
	})
	return updated, err
}

func (s *postgresStore) deleteString(ctx context.Context, actor principal, projectID, stringID string) error {
	return s.withNativeProject(ctx, actor, projectID, func(tx pgx.Tx, scope projectScope) error {
		if _, err := uuid.Parse(stringID); err != nil {
			return errStringNotFound
		}
		tag, err := tx.Exec(ctx, `DELETE FROM project_translation_keys
			WHERE organization_id = $1 AND project_id = $2 AND id = $3`,
			actor.OrganizationID, scope.ID, stringID)
		if err != nil {
			return fmt.Errorf("delete string: %w", err)
		}
		if tag.RowsAffected() == 0 {
			return errStringNotFound
		}
		return nil
	})
}

const translationColumns = `
	t.id, t.translation_key_id, k.key, t.target_locale, t.text, t.status::text,
	t.provenance::text, t.reviewed_by_user_id, t.reviewed_at, t.created_at, t.updated_at`

const translationFrom = `
	FROM project_translations t
	JOIN project_translation_keys k ON k.id = t.translation_key_id`

func scanTranslation(row rowScanner) (translationRecord, error) {
	var item translationRecord
	err := row.Scan(
		&item.ID, &item.StringID, &item.Key, &item.Locale, &item.Text, &item.Status,
		&item.Provenance, &item.ReviewedByUserID, &item.ReviewedAt, &item.CreatedAt, &item.UpdatedAt,
	)
	return item, err
}

func (s *postgresStore) listTranslations(ctx context.Context, actor principal, projectID string, filters translationFilters) ([]translationRecord, int, error) {
	scope, err := loadProjectScope(ctx, s.pool, actor, projectID)
	if err != nil {
		return nil, 0, err
	}
	where := newSQLFilter("t.organization_id = $1 AND t.project_id = $2", actor.OrganizationID, scope.ID)
	if filters.Locale != "" {
		where.add("t.target_locale = ?", filters.Locale)
	}
	if filters.Status != "" {
		where.add("t.status::text = ?", filters.Status)
	}
	var total int
	if err := s.pool.QueryRow(ctx, `SELECT count(*) `+translationFrom+` WHERE `+where.sql(), where.args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count translations: %w", err)
	}
	pageSQL := where.page(filters.Limit, filters.Offset)
	rows, err := s.pool.Query(ctx, `SELECT `+translationColumns+translationFrom+` WHERE `+where.sql()+`
		ORDER BY k.key ASC, k.id ASC, t.target_locale ASC`+pageSQL, where.args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list translations: %w", err)
	}
	items, err := collectRows(rows, scanTranslation)
	return items, total, err
}

func (s *postgresStore) listStringTranslations(ctx context.Context, actor principal, projectID, stringID string) ([]translationRecord, error) {
	scope, err := loadProjectScope(ctx, s.pool, actor, projectID)
	if err != nil {
		return nil, err
	}
	if _, err := loadString(ctx, s.pool, actor, scope, stringID); err != nil {
		return nil, err
	}
	rows, err := s.pool.Query(ctx, `SELECT `+translationColumns+translationFrom+`
		WHERE t.organization_id = $1 AND t.project_id = $2 AND t.translation_key_id = $3
		ORDER BY t.target_locale ASC`, actor.OrganizationID, scope.ID, stringID)
	if err != nil {
		return nil, fmt.Errorf("list string translations: %w", err)
	}
	return collectRows(rows, scanTranslation)
}

// translationSnapshot is a project_translations row as it was before a write.
type translationSnapshot struct {
	id, text, status, provenance string
	sourceJobID                  *string
	updatedAt                    time.Time
}

func (s *postgresStore) putTranslation(ctx context.Context, actor principal, projectID, stringID, locale string, input translationWrite) (translationRecord, error) {
	var saved translationRecord
	err := s.withNativeProject(ctx, actor, projectID, func(tx pgx.Tx, scope projectScope) error {
		if !slices.Contains(scope.TargetLocales, locale) {
			return errLocaleNotInProject
		}
		maxLength, err := lockString(ctx, tx, actor, scope, stringID)
		if err != nil {
			return err
		}
		if maxLength != nil && *maxLength > 0 && utf8.RuneCountInString(input.Text) > *maxLength {
			return errTranslationTooLong
		}
		var locked bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS (
				SELECT 1 FROM project_cat_segment_locks
				WHERE organization_id = $1 AND project_id = $2 AND target_locale = $3 AND external_string_id = $4
			)`, actor.OrganizationID, scope.ID, locale, stringID).Scan(&locked); err != nil {
			return fmt.Errorf("check segment lock: %w", err)
		}
		if locked {
			return errSegmentLocked
		}
		var before *translationSnapshot
		var snapshot translationSnapshot
		err = tx.QueryRow(ctx, `SELECT id, text, status::text, provenance::text, source_job_id, updated_at
			FROM project_translations
			WHERE organization_id = $1 AND translation_key_id = $2 AND target_locale = $3
			FOR UPDATE`, actor.OrganizationID, stringID, locale,
		).Scan(&snapshot.id, &snapshot.text, &snapshot.status, &snapshot.provenance, &snapshot.sourceJobID, &snapshot.updatedAt)
		switch {
		case err == nil:
			before = &snapshot
		case !errors.Is(err, pgx.ErrNoRows):
			return fmt.Errorf("lock translation: %w", err)
		}
		var reviewedBy *string
		var reviewedAt *time.Time
		if input.Status == "approved" {
			now := time.Now().UTC()
			reviewedBy, reviewedAt = &actor.UserID, &now
		}
		var translationID string
		if err := tx.QueryRow(ctx, `INSERT INTO project_translations (
				organization_id, project_id, translation_key_id, target_locale, text, status, provenance,
				reviewed_by_user_id, reviewed_at
			) VALUES ($1, $2, $3, $4, $5, $6::text::project_translation_status, 'manual', $7::uuid, $8::timestamptz)
			ON CONFLICT (translation_key_id, target_locale) DO UPDATE SET
				text = excluded.text,
				status = excluded.status,
				provenance = excluded.provenance,
				reviewed_by_user_id = excluded.reviewed_by_user_id,
				reviewed_at = excluded.reviewed_at,
				updated_at = now()
			RETURNING id`,
			actor.OrganizationID, scope.ID, stringID, locale, input.Text, input.Status, reviewedBy, reviewedAt,
		).Scan(&translationID); err != nil {
			return fmt.Errorf("save translation: %w", err)
		}
		if err := recordTranslationRevision(ctx, tx, actor, translationID, before, input); err != nil {
			return err
		}
		saved, err = scanTranslation(tx.QueryRow(ctx, `SELECT `+translationColumns+translationFrom+` WHERE t.id = $1`, translationID))
		return err
	})
	return saved, err
}

// recordTranslationRevision mirrors go-svc's recordEditorCatRevision: the first change to a
// translation with no history also keeps its earlier state as a baseline, so it can be undone.
func recordTranslationRevision(ctx context.Context, tx pgx.Tx, actor principal, translationID string, before *translationSnapshot, input translationWrite) error {
	if before != nil {
		if before.text == input.Text && before.status == input.Status {
			return nil
		}
		if _, err := tx.Exec(ctx, `INSERT INTO project_translation_revisions (
				organization_id, project_id, translation_id, translation_key_id, target_locale, text, status,
				provenance, source_job_id, actor_kind, created_at
			)
			SELECT t.organization_id, t.project_id, t.id, t.translation_key_id, t.target_locale, $3::text,
				$4::text::project_translation_status, $5::text::project_translation_provenance, $6::text,
				CASE $5::text WHEN 'agent' THEN 'agent' WHEN 'manual' THEN 'user' ELSE 'system' END,
				$7::timestamptz
			FROM project_translations t
			WHERE t.id = $1 AND t.organization_id = $2
				AND NOT EXISTS (SELECT 1 FROM project_translation_revisions r WHERE r.translation_id = $1)`,
			translationID, actor.OrganizationID, before.text, before.status, before.provenance, before.sourceJobID, before.updatedAt,
		); err != nil {
			return fmt.Errorf("record baseline revision: %w", err)
		}
	}
	if _, err := tx.Exec(ctx, `INSERT INTO project_translation_revisions (
			organization_id, project_id, translation_id, translation_key_id, target_locale, text, status,
			provenance, source_job_id, actor_kind, actor_user_id, created_at
		)
		SELECT t.organization_id, t.project_id, t.id, t.translation_key_id, t.target_locale, t.text, t.status,
			t.provenance, t.source_job_id, 'api_key', $3::uuid, clock_timestamp()
		FROM project_translations t
		WHERE t.id = $1 AND t.organization_id = $2`,
		translationID, actor.OrganizationID, actor.UserID,
	); err != nil {
		return fmt.Errorf("record revision: %w", err)
	}
	return nil
}

// sqlFilter collects AND conditions (or SET assignments) with positional arguments. Each `?`
// in a condition becomes the placeholder for its value.
type sqlFilter struct {
	conditions []string
	args       []any
}

func newSQLFilter(base string, args ...any) *sqlFilter {
	return &sqlFilter{conditions: []string{base}, args: args}
}

func (f *sqlFilter) add(condition string, value any) {
	f.args = append(f.args, value)
	f.conditions = append(f.conditions, strings.ReplaceAll(condition, "?", fmt.Sprintf("$%d", len(f.args))))
}

func (f *sqlFilter) sql() string { return strings.Join(f.conditions, " AND ") }

// page appends limit and offset arguments and returns the matching clause.
func (f *sqlFilter) page(limit, offset int) string {
	f.args = append(f.args, limit, offset)
	return fmt.Sprintf(" LIMIT $%d OFFSET $%d", len(f.args)-1, len(f.args))
}

func collectRows[T any](rows pgx.Rows, scan func(rowScanner) (T, error)) ([]T, error) {
	defer rows.Close()
	items := make([]T, 0)
	for rows.Next() {
		item, err := scan(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate rows: %w", err)
	}
	return items, nil
}
