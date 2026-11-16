package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

var errProjectSourceFileNotFound = fmt.Errorf("%w: source file", errResourceNotFound)

// projectSourceFile is a file tracked at a path in a project, with the import settings its
// uploads are parsed with.
type projectSourceFile struct {
	ID     string `json:"id"`
	Path   string `json:"path"`
	Branch string `json:"branch"`
	// MessageFormat is the placeholder syntax validation uses: auto, icu, or i18next.
	MessageFormat string `json:"messageFormat"`
	// PlaceholderPatterns are custom placeholder regular expressions.
	PlaceholderPatterns []string `json:"placeholderPatterns"`
	// Segmentation and ImportSettings are returned as the web app stores them.
	Segmentation   json.RawMessage `json:"segmentation"`
	ImportSettings json.RawMessage `json:"importSettings"`
	CreatedAt      time.Time       `json:"createdAt"`
	UpdatedAt      time.Time       `json:"updatedAt"`
}

type sourceFileFilters struct {
	Branch string
	Path   string
	Limit  int
	Offset int
}

const sourceFileColumns = `f.id, f.source_path, f.branch_name, f.message_format, f.placeholder_patterns,
	f.segmentation_settings, f.import_settings, f.created_at, f.updated_at`

func scanSourceFile(row rowScanner) (projectSourceFile, error) {
	var item projectSourceFile
	var patterns []byte
	err := row.Scan(&item.ID, &item.Path, &item.Branch, &item.MessageFormat, &patterns,
		&item.Segmentation, &item.ImportSettings, &item.CreatedAt, &item.UpdatedAt)
	if err != nil {
		return item, err
	}
	if json.Unmarshal(patterns, &item.PlaceholderPatterns) != nil || item.PlaceholderPatterns == nil {
		item.PlaceholderPatterns = []string{}
	}
	return item, nil
}

func (s *postgresStore) listSourceFiles(ctx context.Context, actor principal, projectID string, filters sourceFileFilters) ([]projectSourceFile, int, error) {
	if _, err := loadProjectScope(ctx, s.pool, actor, projectID); err != nil {
		return nil, 0, err
	}
	where := newSQLFilter("f.organization_id = $1 AND f.project_id = $2", actor.OrganizationID, projectID)
	if filters.Branch != "" {
		where.add("f.branch_name = ?", filters.Branch)
	}
	if filters.Path != "" {
		where.add("f.source_path = ?", filters.Path)
	}
	var total int
	if err := s.pool.QueryRow(ctx, `SELECT count(*) FROM repository_source_files f WHERE `+where.sql(), where.args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count source files: %w", err)
	}
	pageSQL := where.page(filters.Limit, filters.Offset)
	rows, err := s.pool.Query(ctx, `SELECT `+sourceFileColumns+` FROM repository_source_files f WHERE `+where.sql()+`
		ORDER BY f.source_path, f.branch_name, f.id`+pageSQL, where.args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list source files: %w", err)
	}
	items, err := collectRows(rows, scanSourceFile)
	return items, total, err
}

func (s *postgresStore) getSourceFile(ctx context.Context, actor principal, projectID, fileID string) (projectSourceFile, error) {
	if _, err := loadProjectScope(ctx, s.pool, actor, projectID); err != nil {
		return projectSourceFile{}, err
	}
	item, err := scanSourceFile(s.pool.QueryRow(ctx, `SELECT `+sourceFileColumns+` FROM repository_source_files f
		WHERE f.organization_id = $1 AND f.project_id = $2 AND f.id::text = $3`, actor.OrganizationID, projectID, fileID))
	if errors.Is(err, pgx.ErrNoRows) {
		return projectSourceFile{}, errProjectSourceFileNotFound
	}
	if err != nil {
		return projectSourceFile{}, fmt.Errorf("get source file: %w", err)
	}
	return item, nil
}

// projectContentSync is a project's built-in content sync and its latest runs. Sync is nil when
// the project has none.
type projectContentSync struct {
	Sync *contentSyncSettings `json:"sync"`
	Runs []contentSyncRun     `json:"runs"`
}

// contentSyncSettings is the saved sync. Config is the web app's ContentSyncConfig: provider,
// connectionId, resourceKey, folders, branch, and path template. It holds no secrets.
type contentSyncSettings struct {
	ID        string          `json:"id"`
	Provider  *string         `json:"provider"`
	Config    json.RawMessage `json:"config"`
	Schedule  string          `json:"schedule"`
	NextRunAt *time.Time      `json:"nextRunAt"`
	UpdatedAt time.Time       `json:"updatedAt"`
}

type contentSyncRun struct {
	ID       string  `json:"id"`
	Provider *string `json:"provider"`
	Trigger  string  `json:"trigger"`
	Status   string  `json:"status"`
	// PullRequestURL is the pull or merge request the run opened, when it opened one.
	PullRequestURL *string    `json:"pullRequestUrl"`
	ErrorCode      *string    `json:"errorCode"`
	ErrorMessage   *string    `json:"errorMessage"`
	StartedAt      time.Time  `json:"startedAt"`
	CompletedAt    *time.Time `json:"completedAt"`
}

// contentSyncRunLimit matches the web app's RECENT_RUN_LIMIT.
const contentSyncRunLimit = 10

func (s *postgresStore) getProjectContentSync(ctx context.Context, actor principal, projectID string) (projectContentSync, error) {
	if _, err := loadProjectScope(ctx, s.pool, actor, projectID); err != nil {
		return projectContentSync{}, err
	}
	result := projectContentSync{Runs: []contentSyncRun{}}
	var sync contentSyncSettings
	err := s.pool.QueryRow(ctx, `SELECT id, sync_config->>'provider', sync_config, schedule, next_run_at, updated_at
		FROM project_content_syncs WHERE organization_id = $1 AND project_id = $2`, actor.OrganizationID, projectID).
		Scan(&sync.ID, &sync.Provider, &sync.Config, &sync.Schedule, &sync.NextRunAt, &sync.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return result, nil
	}
	if err != nil {
		return projectContentSync{}, fmt.Errorf("get content sync: %w", err)
	}
	result.Sync = &sync
	// A run records the service it ran with, since the sync can move between services; older runs
	// follow the sync.
	rows, err := s.pool.Query(ctx, `SELECT id, coalesce(summary->>'provider', $3), trigger, status,
			CASE WHEN jsonb_typeof(summary->'pushed') = 'object' THEN summary->'pushed'->>'pullRequestUrl' END,
			error_code, error_message, started_at, completed_at
		FROM project_content_sync_runs
		WHERE organization_id = $1 AND sync_id = $2
		ORDER BY created_at DESC, id DESC
		LIMIT $4`, actor.OrganizationID, sync.ID, sync.Provider, contentSyncRunLimit)
	if err != nil {
		return projectContentSync{}, fmt.Errorf("list content sync runs: %w", err)
	}
	result.Runs, err = collectRows(rows, func(row rowScanner) (contentSyncRun, error) {
		var run contentSyncRun
		err := row.Scan(&run.ID, &run.Provider, &run.Trigger, &run.Status, &run.PullRequestURL,
			&run.ErrorCode, &run.ErrorMessage, &run.StartedAt, &run.CompletedAt)
		return run, err
	})
	if err != nil {
		return projectContentSync{}, err
	}
	return result, nil
}
