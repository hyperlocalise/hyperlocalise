package main

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type claimedProcess struct {
	ID                string
	OrganizationID    string
	ProjectID         string
	ScreenshotID      string
	SourceFileID      *string
	TranslationKeyIDs []string
	OverrideDays      *int
	Attempts          int
	ScreenshotStatus  string
	ObjectLocation    string
	ObjectKey         string
	ContentType       string
}

type matchRepository interface {
	ClaimProcess(ctx context.Context, processID string) (claimedProcess, bool, error)
	LoadCandidates(ctx context.Context, process claimedProcess, limit int) ([]matchCandidate, error)
	CompleteProcess(ctx context.Context, process claimedProcess, checked int, matches []stringMatch) (int, error)
	FailProcess(ctx context.Context, processID, code string) error
}

type pgMatchRepository struct {
	pool *pgxpool.Pool
}

// ClaimProcess moves a queued process to in_progress and counts the attempt.
// An in_progress row is reclaimed because SQS only redelivers after the
// previous invocation failed or timed out.
func (r pgMatchRepository) ClaimProcess(ctx context.Context, processID string) (claimedProcess, bool, error) {
	var process claimedProcess
	err := r.pool.QueryRow(ctx, `
        update project_visual_context_match_processes p
        set status='in_progress', attempts=p.attempts+1,
            started_at=coalesce(p.started_at, now()), updated_at=now()
        from project_visual_context_screenshots s
        where p.id=$1 and s.id=p.screenshot_id and p.status in ('queued', 'in_progress')
        returning p.id::text, p.organization_id::text, p.project_id, p.screenshot_id::text,
            p.repository_source_file_id::text, p.translation_key_ids::text[],
            p.override_context_older_than_days, p.attempts,
            s.status, s.object_location, s.object_key, s.content_type`,
		processID,
	).Scan(
		&process.ID, &process.OrganizationID, &process.ProjectID, &process.ScreenshotID,
		&process.SourceFileID, &process.TranslationKeyIDs,
		&process.OverrideDays, &process.Attempts,
		&process.ScreenshotStatus, &process.ObjectLocation, &process.ObjectKey, &process.ContentType,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return process, false, nil
	}
	if err != nil {
		return process, false, fmt.Errorf("claim match process: %w", err)
	}
	return process, true, nil
}

// LoadCandidates returns strings in scope that may receive an auto binding.
// Keys with a manual binding on this screenshot are skipped, and keys already
// bound to another screenshot are skipped unless that context is older than
// the override window (Smartling's overrideContextOlderThanDays semantics).
func (r pgMatchRepository) LoadCandidates(ctx context.Context, process claimedProcess, limit int) ([]matchCandidate, error) {
	rows, err := r.pool.Query(ctx, `
        select k.id::text, k.source_text
        from project_translation_keys k
        where k.organization_id=$1 and k.project_id=$2 and k.is_hidden=false
          and trim(k.source_text) <> ':::' and trim(k.source_text) not like ':::callout%'
          and ($3::uuid is null or k.repository_source_file_id=$3::uuid)
          and ($4::uuid[] is null or k.id = any($4::uuid[]))
          and not exists (
            select 1 from project_visual_context_bindings b
            where b.screenshot_id=$5 and b.translation_key_id=k.id and b.source='manual'
          )
          and not exists (
            select 1 from project_visual_context_bindings b
            where b.translation_key_id=k.id and b.screenshot_id<>$5
              and ($6::int is null or b.updated_at > now() - make_interval(days => $6::int))
          )
        limit $7`,
		process.OrganizationID, process.ProjectID, process.SourceFileID, process.TranslationKeyIDs,
		process.ScreenshotID, process.OverrideDays, limit,
	)
	if err != nil {
		return nil, fmt.Errorf("load match candidates: %w", err)
	}
	candidates, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (matchCandidate, error) {
		var candidate matchCandidate
		err := row.Scan(&candidate.KeyID, &candidate.SourceText)
		return candidate, err
	})
	if err != nil {
		return nil, fmt.Errorf("scan match candidates: %w", err)
	}
	return candidates, nil
}

// CompleteProcess writes auto bindings and completes the process atomically.
// Manual bindings are never overwritten.
func (r pgMatchRepository) CompleteProcess(ctx context.Context, process claimedProcess, checked int, matches []stringMatch) (int, error) {
	keyIDs := make([]string, 0, len(matches))
	lefts, tops, widths, heights := make([]float64, 0, len(matches)), make([]float64, 0, len(matches)), make([]float64, 0, len(matches)), make([]float64, 0, len(matches))
	for _, match := range matches {
		for _, keyID := range match.KeyIDs {
			keyIDs = append(keyIDs, keyID)
			lefts = append(lefts, match.Marker.Left)
			tops = append(tops, match.Marker.Top)
			widths = append(widths, match.Marker.Width)
			heights = append(heights, match.Marker.Height)
		}
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return 0, fmt.Errorf("begin complete match process: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	bound := 0
	if len(keyIDs) > 0 {
		tag, err := tx.Exec(ctx, `
            insert into project_visual_context_bindings (
              organization_id, project_id, screenshot_id, translation_key_id,
              marker_left, marker_top, marker_width, marker_height, source, match_process_id
            )
            select $1, $2, $3, m.key_id, m.ml, m.mt, m.mw, m.mh, 'auto', $4
            from unnest($5::uuid[], $6::float8[], $7::float8[], $8::float8[], $9::float8[])
              as m(key_id, ml, mt, mw, mh)
            join project_translation_keys k on k.id=m.key_id
            on conflict (screenshot_id, translation_key_id) do update
            set marker_left=excluded.marker_left, marker_top=excluded.marker_top,
                marker_width=excluded.marker_width, marker_height=excluded.marker_height,
                match_process_id=excluded.match_process_id, updated_at=now()
            where project_visual_context_bindings.source='auto'`,
			process.OrganizationID, process.ProjectID, process.ScreenshotID, process.ID,
			keyIDs, lefts, tops, widths, heights,
		)
		if err != nil {
			return 0, fmt.Errorf("write auto bindings: %w", err)
		}
		bound = int(tag.RowsAffected())
	}
	if _, err := tx.Exec(ctx, `
        update project_visual_context_match_processes
        set status='completed', checked_strings_count=$2, bound_strings_count=$3,
            error_code=null, completed_at=now(), updated_at=now()
        where id=$1 and status='in_progress'`,
		process.ID, checked, bound,
	); err != nil {
		return 0, fmt.Errorf("complete match process: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, fmt.Errorf("commit match process: %w", err)
	}
	return bound, nil
}

func (r pgMatchRepository) FailProcess(ctx context.Context, processID, code string) error {
	if _, err := r.pool.Exec(ctx, `
        update project_visual_context_match_processes
        set status='failed', error_code=$2, completed_at=now(), updated_at=now()
        where id=$1 and status in ('queued', 'in_progress')`,
		processID, code,
	); err != nil {
		return fmt.Errorf("fail match process: %w", err)
	}
	return nil
}
