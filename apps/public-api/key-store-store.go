package main

import (
	"context"
	"errors"
	"fmt"
	"slices"

	"github.com/hyperlocalise/hyperlocalise/internal/keymeta"
	"github.com/jackc/pgx/v5"
)

const (
	maxSelectedStrings  = 1000
	maxJobStrings       = 5000
	maxJobTargetLocales = 20
	maxTagFilters       = 10
	keyJobOpenStatus    = "waiting_for_review"
)

var (
	errNoStringsMatched        = errors.New("no strings matched the selection")
	errTooManyStringsSelected  = errors.New("the selection matches too many strings")
	errNotKeyJob               = errors.New("job is not a key job")
	errKeyJobClosed            = errors.New("key job is not open")
	errKeyJobTooManyStrings    = errors.New("key job would exceed the string limit")
	errKeyJobNeedsStrings      = errors.New("key job must keep at least one string")
	errKeyJobTooManyLocales    = errors.New("key job would exceed the locale limit")
	errKeyJobNeedsLocale       = errors.New("key job must keep at least one locale")
	errKeyJobLocaleNotIncluded = errors.New("locale is not a key job locale")
)

// stringSelector picks strings of one project by id, by key name (in any file) or by tags
// (every tag given). Handlers allow ids or keys, plus tags where a route takes them.
type stringSelector struct {
	StringIDs []string
	Keys      []string
	Tags      []string
}

// apply adds the selection to a filter over a `k` project_translation_keys alias.
func (sel stringSelector) apply(where *sqlFilter) {
	if len(sel.StringIDs) > 0 {
		where.add("k.id = ANY(?::uuid[])", sel.StringIDs)
	}
	if len(sel.Keys) > 0 {
		where.add("k.key = ANY(?::text[])", sel.Keys)
	}
	if len(sel.Tags) > 0 {
		where.add("k.tags @> ?::text[]", sel.Tags)
	}
}

type stringBulkUpdate struct {
	Select     stringSelector
	AddTags    []string
	RemoveTags []string
	DesignURL  optionalString
}

// bulkUpdateStrings adds and removes tags and sets the design link of the selected strings,
// returning how many changed.
func (s *postgresStore) bulkUpdateStrings(ctx context.Context, actor principal, projectID string, input stringBulkUpdate) (int, error) {
	updated := 0
	err := s.withNativeProject(ctx, actor, projectID, func(tx pgx.Tx, scope projectScope) error {
		where := newSQLFilter("k.organization_id = $1 AND k.project_id = $2", actor.OrganizationID, scope.ID)
		input.Select.apply(where)
		keyIDs, err := lockSelectedStrings(ctx, tx, where, maxSelectedStrings)
		if err != nil {
			return err
		}
		matched := len(keyIDs)
		// Change only the strings counted and locked above, not ones matching the selection since.
		where = newSQLFilter("k.organization_id = $1 AND k.project_id = $2", actor.OrganizationID, scope.ID)
		where.add("k.id = ANY(?::uuid[])", keyIDs)
		addTags, removeTags := input.AddTags, input.RemoveTags
		if addTags == nil {
			addTags = []string{}
		}
		if removeTags == nil {
			removeTags = []string{}
		}
		where.args = append(where.args, addTags, removeTags)
		addN, removeN := len(where.args)-1, len(where.args)
		tags := keymeta.TagsAfterChangeSQL("k.tags", addN, removeN)
		link := "k.design_url"
		if input.DesignURL.Set {
			where.args = append(where.args, input.DesignURL.Value)
			link = fmt.Sprintf("$%d::text", len(where.args))
		}
		tag, err := tx.Exec(ctx, fmt.Sprintf(`UPDATE project_translation_keys k
			SET tags = %[1]s, design_url = %[2]s, updated_at = now()
			WHERE %[3]s AND (k.tags IS DISTINCT FROM %[1]s OR k.design_url IS DISTINCT FROM %[2]s)`,
			tags, link, where.sql()), where.args...)
		if err != nil {
			return fmt.Errorf("update strings: %w", err)
		}
		updated = int(tag.RowsAffected())
		if updated == 0 {
			return nil
		}
		return insertActivity(ctx, tx, actor, activityEvent{
			EventType:  "project_strings_updated",
			TargetID:   scope.ID,
			TargetKind: "project",
			Payload:    map[string]any{"projectId": scope.ID, "created": 0, "updated": updated, "itemCount": matched},
		})
	})
	return updated, err
}

// reviewChange is a batch review decision. Send to review moves approved translations back to
// needs_review, as a source text change does. Approve approves translations waiting for review
// and non-empty drafts; rejected ones and texts over the string's max length stay.
type reviewChange int

const (
	reviewSendToReview reviewChange = iota
	reviewApprove
)

// reviewTranslations applies a batch review decision to the selected strings, keeping each
// translation's text and recording a revision. Segments locked in the content editor are left
// alone.
func (s *postgresStore) reviewTranslations(ctx context.Context, actor principal, projectID string, sel stringSelector, locales []string, change reviewChange) (int, error) {
	moved := 0
	err := s.withNativeProject(ctx, actor, projectID, func(tx pgx.Tx, scope projectScope) error {
		for _, locale := range locales {
			if !contains(scope.TargetLocales, locale) {
				return errLocaleNotInProject
			}
		}
		where := newSQLFilter("k.organization_id = $1 AND k.project_id = $2", actor.OrganizationID, scope.ID)
		sel.apply(where)
		keyIDs, err := lockSelectedStrings(ctx, tx, where, maxSelectedStrings)
		if err != nil {
			return err
		}
		if locales == nil {
			locales = []string{}
		}
		from := `t.status = 'approved'`
		set := `status = 'needs_review', reviewed_by_user_id = NULL, reviewed_at = NULL`
		if change == reviewApprove {
			from = `t.status IN ('needs_review', 'draft') AND trim(t.text) <> ''
				AND NOT EXISTS (
					SELECT 1 FROM project_translation_keys mk
					WHERE mk.id = t.translation_key_id AND mk.max_length > 0 AND char_length(t.text) > mk.max_length
				)`
			set = `status = 'approved', reviewed_by_user_id = $5::uuid, reviewed_at = now()`
		}
		match := `t.organization_id = $1 AND t.project_id = $2 AND t.translation_key_id = ANY($3::uuid[])
			AND ` + from + ` AND (cardinality($4::text[]) = 0 OR t.target_locale = ANY($4::text[]))
			AND NOT EXISTS (
				SELECT 1 FROM project_cat_segment_locks l
				WHERE l.organization_id = t.organization_id AND l.project_id = t.project_id
					AND l.external_string_id = t.translation_key_id::text AND l.target_locale = t.target_locale
			)`
		count, err := moveTranslations(ctx, tx, match, set,
			actor.OrganizationID, scope.ID, keyIDs, locales, actor.UserID)
		if err != nil {
			return fmt.Errorf("review translations: %w", err)
		}
		moved = int(count)
		return nil
	})
	return moved, err
}

// keyJobScope is an accessible key job, locked for the rest of the transaction.
type keyJobScope struct {
	JobID         string
	ProjectID     string
	Status        string
	TargetLocales []string
}

// loadKeyJob reads an accessible key job, locking its row for the transaction when it will
// be changed.
func loadKeyJob(ctx context.Context, tx pgx.Tx, actor principal, jobID string, lock bool) (keyJobScope, error) {
	var scope keyJobScope
	lockClause := ""
	if lock {
		lockClause = "FOR UPDATE OF j"
	}
	var jobType *string
	var projectID *string
	err := tx.QueryRow(ctx, `SELECT j.id, j.project_id, j.status::text, d.type::text,
			COALESCE(ARRAY(SELECT jsonb_array_elements_text(
				CASE WHEN jsonb_typeof(j.input_payload->'targetLocales') = 'array'
					THEN j.input_payload->'targetLocales' ELSE '[]'::jsonb END)), '{}')
		FROM jobs j
		LEFT JOIN translation_job_details d ON d.job_id = j.id
		WHERE `+jobAccessPredicate+` AND j.id = $3
		`+lockClause, actor.OrganizationID, actor.UserID, jobID).
		Scan(&scope.JobID, &projectID, &scope.Status, &jobType, &scope.TargetLocales)
	if errors.Is(err, pgx.ErrNoRows) {
		return keyJobScope{}, errJobNotFound
	}
	if err != nil {
		return keyJobScope{}, fmt.Errorf("lock job: %w", err)
	}
	if jobType == nil || *jobType != "keys" || projectID == nil {
		return keyJobScope{}, errNotKeyJob
	}
	scope.ProjectID = *projectID
	return scope, nil
}

func (s *postgresStore) withKeyJob(ctx context.Context, actor principal, jobID string, write bool, fn func(pgx.Tx, keyJobScope) error) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	scope, err := loadKeyJob(ctx, tx, actor, jobID, write)
	if err != nil {
		return err
	}
	if write && scope.Status != keyJobOpenStatus {
		return errKeyJobClosed
	}
	if err := fn(tx, scope); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *postgresStore) listJobStrings(ctx context.Context, actor principal, jobID string, limit, offset int) ([]translationString, int, error) {
	var items []translationString
	var total int
	err := s.withKeyJob(ctx, actor, jobID, false, func(tx pgx.Tx, scope keyJobScope) error {
		if err := tx.QueryRow(ctx, `SELECT count(*) FROM translation_job_keys WHERE job_id = $1`, scope.JobID).Scan(&total); err != nil {
			return fmt.Errorf("count job strings: %w", err)
		}
		rows, err := tx.Query(ctx, `SELECT `+stringColumns+stringFrom+`
			JOIN translation_job_keys jk ON jk.translation_key_id = k.id AND jk.job_id = $1
			ORDER BY f.source_path ASC NULLS FIRST, k.key ASC, k.id ASC
			LIMIT $2 OFFSET $3`, scope.JobID, limit, offset)
		if err != nil {
			return fmt.Errorf("list job strings: %w", err)
		}
		items, err = collectRows(rows, scanString)
		return err
	})
	return items, total, err
}

// addJobStrings adds the selected visible strings in the files of the job's project and
// returns how many were new to the job.
func (s *postgresStore) addJobStrings(ctx context.Context, actor principal, jobID string, sel stringSelector) (int, error) {
	added := 0
	err := s.withKeyJob(ctx, actor, jobID, true, func(tx pgx.Tx, scope keyJobScope) error {
		// Hidden strings and strings in no file are left out; the content editor can't show them.
		where := newSQLFilter("k.organization_id = $1 AND k.project_id = $2 AND NOT k.is_hidden AND k.repository_source_file_id IS NOT NULL",
			actor.OrganizationID, scope.ProjectID)
		sel.apply(where)
		if err := requireSelectionWithin(ctx, tx, where, maxJobStrings); err != nil {
			if errors.Is(err, errTooManyStringsSelected) {
				return errKeyJobTooManyStrings
			}
			return err
		}
		where.args = append(where.args, scope.JobID)
		n := len(where.args)
		tag, err := tx.Exec(ctx, fmt.Sprintf(`INSERT INTO translation_job_keys (job_id, translation_key_id)
			SELECT $%d, k.id FROM project_translation_keys k WHERE %s
			ON CONFLICT DO NOTHING`, n, where.sql()), where.args...)
		if err != nil {
			return fmt.Errorf("add job strings: %w", err)
		}
		added = int(tag.RowsAffected())
		var total int
		if err := tx.QueryRow(ctx, `SELECT count(*) FROM translation_job_keys WHERE job_id = $1`, scope.JobID).Scan(&total); err != nil {
			return fmt.Errorf("count job strings: %w", err)
		}
		if total > maxJobStrings {
			return errKeyJobTooManyStrings
		}
		return touchJob(ctx, tx, scope.JobID)
	})
	return added, err
}

func (s *postgresStore) removeJobStrings(ctx context.Context, actor principal, jobID string, sel stringSelector) (int, error) {
	removed := 0
	err := s.withKeyJob(ctx, actor, jobID, true, func(tx pgx.Tx, scope keyJobScope) error {
		where := newSQLFilter("k.organization_id = $1 AND k.project_id = $2", actor.OrganizationID, scope.ProjectID)
		sel.apply(where)
		where.args = append(where.args, scope.JobID)
		n := len(where.args)
		tag, err := tx.Exec(ctx, fmt.Sprintf(`DELETE FROM translation_job_keys jk
			USING project_translation_keys k
			WHERE jk.job_id = $%d AND jk.translation_key_id = k.id AND %s`, n, where.sql()), where.args...)
		if err != nil {
			return fmt.Errorf("remove job strings: %w", err)
		}
		removed = int(tag.RowsAffected())
		if removed == 0 {
			return errNoStringsMatched
		}
		var left bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM translation_job_keys WHERE job_id = $1)`, scope.JobID).Scan(&left); err != nil {
			return fmt.Errorf("count job strings: %w", err)
		}
		if !left {
			return errKeyJobNeedsStrings
		}
		return touchJob(ctx, tx, scope.JobID)
	})
	return removed, err
}

type jobLocaleProgress struct {
	Locale             string `json:"locale"`
	TotalStrings       int    `json:"totalStrings"`
	TranslatedStrings  int    `json:"translatedStrings"`
	ApprovedStrings    int    `json:"approvedStrings"`
	NeedsReviewStrings int    `json:"needsReviewStrings"`
}

// jobLocales reports each job language's progress over the job's visible strings, worked out
// now so a translation sent back to review shows at once.
func (s *postgresStore) jobLocales(ctx context.Context, actor principal, jobID string) ([]jobLocaleProgress, error) {
	var locales []jobLocaleProgress
	err := s.withKeyJob(ctx, actor, jobID, false, func(tx pgx.Tx, scope keyJobScope) error {
		var err error
		locales, err = keyJobProgress(ctx, tx, scope)
		return err
	})
	return locales, err
}

func keyJobProgress(ctx context.Context, tx pgx.Tx, scope keyJobScope) ([]jobLocaleProgress, error) {
	rows, err := tx.Query(ctx, `SELECT l.locale,
			count(k.id),
			count(t.id) FILTER (WHERE trim(t.text) <> '' AND t.status <> 'rejected'),
			count(t.id) FILTER (WHERE t.status = 'approved'),
			count(t.id) FILTER (WHERE t.status = 'needs_review')
		FROM unnest($2::text[]) WITH ORDINALITY AS l(locale, position)
		LEFT JOIN translation_job_keys jk ON jk.job_id = $1
		LEFT JOIN project_translation_keys k ON k.id = jk.translation_key_id AND NOT k.is_hidden
		LEFT JOIN project_translations t ON t.translation_key_id = k.id AND t.target_locale = l.locale
		GROUP BY l.locale, l.position
		ORDER BY l.position`, scope.JobID, scope.TargetLocales)
	if err != nil {
		return nil, fmt.Errorf("job progress: %w", err)
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (jobLocaleProgress, error) {
		var item jobLocaleProgress
		err := r.Scan(&item.Locale, &item.TotalStrings, &item.TranslatedStrings, &item.ApprovedStrings, &item.NeedsReviewStrings)
		return item, err
	})
}

func (s *postgresStore) addJobLocale(ctx context.Context, actor principal, jobID, locale string) ([]jobLocaleProgress, error) {
	return s.changeJobLocales(ctx, actor, jobID, func(scope keyJobScope, project projectScope) ([]string, error) {
		if !contains(project.TargetLocales, locale) {
			return nil, errLocaleNotInProject
		}
		if contains(scope.TargetLocales, locale) {
			return scope.TargetLocales, nil
		}
		if len(scope.TargetLocales) >= maxJobTargetLocales {
			return nil, errKeyJobTooManyLocales
		}
		return append(scope.TargetLocales, locale), nil
	})
}

func (s *postgresStore) removeJobLocale(ctx context.Context, actor principal, jobID, locale string) ([]jobLocaleProgress, error) {
	return s.changeJobLocales(ctx, actor, jobID, func(scope keyJobScope, _ projectScope) ([]string, error) {
		if !contains(scope.TargetLocales, locale) {
			return nil, errKeyJobLocaleNotIncluded
		}
		if len(scope.TargetLocales) == 1 {
			return nil, errKeyJobNeedsLocale
		}
		kept := make([]string, 0, len(scope.TargetLocales)-1)
		for _, current := range scope.TargetLocales {
			if current != locale {
				kept = append(kept, current)
			}
		}
		return kept, nil
	})
}

func (s *postgresStore) changeJobLocales(ctx context.Context, actor principal, jobID string, change func(keyJobScope, projectScope) ([]string, error)) ([]jobLocaleProgress, error) {
	var locales []jobLocaleProgress
	err := s.withKeyJob(ctx, actor, jobID, true, func(tx pgx.Tx, scope keyJobScope) error {
		project, err := loadProjectScope(ctx, tx, actor, scope.ProjectID)
		if err != nil {
			return err
		}
		next, err := change(scope, project)
		if err != nil {
			return err
		}
		if !slices.Equal(next, scope.TargetLocales) {
			if _, err := tx.Exec(ctx, `UPDATE jobs SET input_payload = jsonb_set(
					CASE WHEN jsonb_typeof(input_payload) = 'object' THEN input_payload ELSE '{}'::jsonb END,
					'{targetLocales}', to_jsonb($2::text[])), updated_at = now()
				WHERE id = $1`, scope.JobID, next); err != nil {
				return fmt.Errorf("update job locales: %w", err)
			}
			scope.TargetLocales = next
		}
		locales, err = keyJobProgress(ctx, tx, scope)
		return err
	})
	return locales, err
}

func touchJob(ctx context.Context, tx pgx.Tx, jobID string) error {
	if _, err := tx.Exec(ctx, `UPDATE jobs SET updated_at = now() WHERE id = $1`, jobID); err != nil {
		return fmt.Errorf("touch job: %w", err)
	}
	return nil
}

func validKeyNames(keys []string, limit int) bool {
	if len(keys) > limit {
		return false
	}
	for _, key := range keys {
		if key == "" || len(key) > 1000 {
			return false
		}
	}
	return true
}

// requireSelectionWithin refuses a selection that matches no string or more than limit.
func requireSelectionWithin(ctx context.Context, tx pgx.Tx, where *sqlFilter, limit int) error {
	var matched int
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM (SELECT 1 FROM project_translation_keys k WHERE `+
		where.sql()+fmt.Sprintf(` LIMIT %d) capped`, limit+1), where.args...).Scan(&matched); err != nil {
		return fmt.Errorf("count strings: %w", err)
	}
	if matched == 0 {
		return errNoStringsMatched
	}
	if matched > limit {
		return errTooManyStringsSelected
	}
	return nil
}

// lockSelectedStrings takes the key row lock every translation writer takes, in id order so
// concurrent batches can't deadlock, and returns the locked ids.
func lockSelectedStrings(ctx context.Context, tx pgx.Tx, where *sqlFilter, limit int) ([]string, error) {
	if err := requireSelectionWithin(ctx, tx, where, limit); err != nil {
		return nil, err
	}
	rows, err := tx.Query(ctx, `SELECT k.id FROM project_translation_keys k WHERE `+where.sql()+`
		ORDER BY k.id FOR NO KEY UPDATE`, where.args...)
	if err != nil {
		return nil, fmt.Errorf("lock strings: %w", err)
	}
	ids, err := pgx.CollectRows(rows, pgx.RowTo[string])
	if err != nil {
		return nil, fmt.Errorf("lock strings: %w", err)
	}
	return ids, nil
}
