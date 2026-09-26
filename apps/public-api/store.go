package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var errResourceNotFound = errors.New("resource not found")

type pagination struct {
	Offset int `json:"offset"`
	Limit  int `json:"limit"`
	Total  int `json:"total"`
}

type project struct {
	ID                   string    `json:"id"`
	Name                 string    `json:"name"`
	Identifier           string    `json:"identifier"`
	Description          string    `json:"description"`
	Source               string    `json:"source"`
	ExternalProviderKind *string   `json:"externalProviderKind"`
	ExternalProjectID    *string   `json:"externalProjectId"`
	SourceLocale         *string   `json:"sourceLocale"`
	TargetLocales        []string  `json:"targetLocales"`
	ExternalProjectURL   *string   `json:"externalProjectUrl"`
	Active               bool      `json:"active"`
	CreatedAt            time.Time `json:"createdAt"`
	UpdatedAt            time.Time `json:"updatedAt"`
}

type queryRecord struct {
	ID             string     `json:"id"`
	Identifier     string     `json:"identifier"`
	Number         int        `json:"number"`
	ProjectID      string     `json:"projectId"`
	ProjectName    string     `json:"projectName"`
	Title          string     `json:"title"`
	Description    string     `json:"description"`
	IssueType      string     `json:"issueType"`
	Status         string     `json:"status"`
	TargetLocale   *string    `json:"targetLocale"`
	SourcePath     *string    `json:"sourcePath"`
	SegmentID      *string    `json:"segmentId"`
	LinkKind       *string    `json:"linkKind"`
	LinkLabel      *string    `json:"linkLabel"`
	LinkURL        *string    `json:"linkUrl"`
	TemplateKey    *string    `json:"templateKey"`
	AssigneeUserID *string    `json:"assigneeUserId"`
	Key            *string    `json:"key"`
	SourceText     *string    `json:"sourceText"`
	Priority       *string    `json:"priority"`
	CreatedAt      time.Time  `json:"createdAt"`
	UpdatedAt      time.Time  `json:"updatedAt"`
	ResolvedAt     *time.Time `json:"resolvedAt"`
}

type queryFilters struct {
	ProjectID string
	Status    string
	IssueType string
	Priority  string
	Locale    string
	Assignee  string
	Search    string
	Sort      string
	SortDir   string
	Limit     int
	Offset    int
}

type resourceStore interface {
	listProjects(context.Context, principal, int, int) ([]project, int, error)
	getProject(context.Context, principal, string) (project, error)
	listQueries(context.Context, principal, queryFilters) ([]queryRecord, int, error)
	getQuery(context.Context, principal, string) (queryRecord, error)
}

type postgresStore struct{ pool *pgxpool.Pool }

const accessibleProjectPredicate = `
	p.organization_id = $1
	AND (
		EXISTS (
			SELECT 1
			FROM organization_memberships om
			WHERE om.organization_id = $1
				AND om.user_id = $2
				AND om.role IN ('admin', 'localization_manager')
		)
		OR EXISTS (
			SELECT 1
			FROM team_memberships tm
			WHERE tm.user_id = $2 AND tm.team_id = p.team_id
		)
	)`

const projectColumns = `
	p.id, p.name, p.identifier, p.description, p.source,
	p.external_provider_kind, p.external_project_id, p.source_locale,
	p.target_locales, p.external_project_url, p.is_active,
	p.created_at, p.updated_at`

func (s *postgresStore) listProjects(ctx context.Context, actor principal, limit, offset int) ([]project, int, error) {
	var total int
	if err := s.pool.QueryRow(ctx, `SELECT count(*) FROM projects p WHERE `+accessibleProjectPredicate,
		actor.OrganizationID, actor.UserID).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count projects: %w", err)
	}

	rows, err := s.pool.Query(ctx, `SELECT `+projectColumns+`
		FROM projects p
		WHERE `+accessibleProjectPredicate+`
		ORDER BY p.created_at DESC, p.id ASC
		LIMIT $3 OFFSET $4`, actor.OrganizationID, actor.UserID, limit, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("list projects: %w", err)
	}
	defer rows.Close()

	projects := make([]project, 0)
	for rows.Next() {
		item, scanErr := scanProject(rows)
		if scanErr != nil {
			return nil, 0, scanErr
		}
		projects = append(projects, item)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("iterate projects: %w", err)
	}
	return projects, total, nil
}

func (s *postgresStore) getProject(ctx context.Context, actor principal, projectID string) (project, error) {
	row := s.pool.QueryRow(ctx, `SELECT `+projectColumns+`
		FROM projects p
		WHERE `+accessibleProjectPredicate+` AND p.id = $3`,
		actor.OrganizationID, actor.UserID, projectID)
	item, err := scanProject(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return project{}, errResourceNotFound
	}
	return item, err
}

type rowScanner interface{ Scan(...any) error }

func scanProject(row rowScanner) (project, error) {
	var item project
	var targetLocales []byte
	if err := row.Scan(
		&item.ID, &item.Name, &item.Identifier, &item.Description, &item.Source,
		&item.ExternalProviderKind, &item.ExternalProjectID, &item.SourceLocale,
		&targetLocales, &item.ExternalProjectURL, &item.Active,
		&item.CreatedAt, &item.UpdatedAt,
	); err != nil {
		return project{}, err
	}
	if err := json.Unmarshal(targetLocales, &item.TargetLocales); err != nil {
		return project{}, fmt.Errorf("decode project target locales: %w", err)
	}
	if item.TargetLocales == nil {
		item.TargetLocales = []string{}
	}
	return item, nil
}

const queryFrom = `
	FROM issue_sheet_issues i
	JOIN projects p ON p.id = i.project_id
	LEFT JOIN project_translation_keys k ON k.id = i.translation_key_id
	LEFT JOIN issue_sheet_columns pc ON pc.project_id = i.project_id AND pc.key = 'priority'
	LEFT JOIN issue_sheet_row_values pv ON pv.issue_id = i.id AND pv.column_id = pc.id`

const queryColumns = `
	i.id, i.identifier, i.number, i.project_id, p.name,
	i.title, i.description, i.issue_type, i.status,
	i.target_locale, i.source_path, i.segment_id,
	i.link_kind, i.link_label, i.link_url, i.template_key,
	i.assignee_user_id, k.key, k.source_text,
	pv.value #>> '{}', i.created_at, i.updated_at, i.resolved_at`

func (s *postgresStore) listQueries(ctx context.Context, actor principal, filters queryFilters) ([]queryRecord, int, error) {
	where, args := buildQueryWhere(actor, filters)
	var total int
	if err := s.pool.QueryRow(ctx, `SELECT count(*) `+queryFrom+` WHERE `+where, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count queries: %w", err)
	}

	args = append(args, filters.Limit, filters.Offset)
	limitParam := len(args) - 1
	offsetParam := len(args)
	rows, err := s.pool.Query(ctx, `SELECT `+queryColumns+queryFrom+` WHERE `+where+buildQueryOrder(filters)+
		fmt.Sprintf(" LIMIT $%d OFFSET $%d", limitParam, offsetParam), args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list queries: %w", err)
	}
	defer rows.Close()

	queries := make([]queryRecord, 0)
	for rows.Next() {
		item, scanErr := scanQuery(rows)
		if scanErr != nil {
			return nil, 0, scanErr
		}
		queries = append(queries, item)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("iterate queries: %w", err)
	}
	return queries, total, nil
}

func (s *postgresStore) getQuery(ctx context.Context, actor principal, queryID string) (queryRecord, error) {
	row := s.pool.QueryRow(ctx, `SELECT `+queryColumns+queryFrom+`
		WHERE `+accessibleProjectPredicate+` AND (i.id::text = $3 OR i.identifier = $3)`,
		actor.OrganizationID, actor.UserID, queryID)
	item, err := scanQuery(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return queryRecord{}, errResourceNotFound
	}
	return item, err
}

func scanQuery(row rowScanner) (queryRecord, error) {
	var item queryRecord
	if err := row.Scan(
		&item.ID, &item.Identifier, &item.Number, &item.ProjectID, &item.ProjectName,
		&item.Title, &item.Description, &item.IssueType, &item.Status,
		&item.TargetLocale, &item.SourcePath, &item.SegmentID,
		&item.LinkKind, &item.LinkLabel, &item.LinkURL, &item.TemplateKey,
		&item.AssigneeUserID, &item.Key, &item.SourceText,
		&item.Priority, &item.CreatedAt, &item.UpdatedAt, &item.ResolvedAt,
	); err != nil {
		return queryRecord{}, err
	}
	return item, nil
}

func buildQueryWhere(actor principal, filters queryFilters) (string, []any) {
	conditions := []string{accessibleProjectPredicate}
	args := []any{actor.OrganizationID, actor.UserID}
	add := func(condition string, value any) {
		args = append(args, value)
		placeholder := fmt.Sprintf("$%d", len(args))
		conditions = append(conditions, strings.ReplaceAll(condition, "?", placeholder))
	}
	if filters.ProjectID != "" {
		add("i.project_id = ?", filters.ProjectID)
	}
	if filters.Status != "" && filters.Status != "all" {
		add("i.status = ?", filters.Status)
	}
	if filters.IssueType != "" && filters.IssueType != "all" {
		add("i.issue_type = ?", filters.IssueType)
	}
	if filters.Priority != "" {
		add("pv.value #>> '{}' = ?", filters.Priority)
	}
	if filters.Locale != "" {
		add("i.target_locale = ?", filters.Locale)
	}
	switch filters.Assignee {
	case "me":
		conditions = append(conditions, "i.assignee_user_id = $2")
	case "unassigned":
		conditions = append(conditions, "i.assignee_user_id IS NULL")
	case "":
	default:
		add("i.assignee_user_id = ?", filters.Assignee)
	}
	if filters.Search != "" {
		add("(i.identifier ILIKE ? OR i.title ILIKE ? OR i.description ILIKE ? OR i.source_path ILIKE ? OR p.name ILIKE ?)", "%"+filters.Search+"%")
	}
	return strings.Join(conditions, " AND "), args
}

func buildQueryOrder(filters queryFilters) string {
	direction := "DESC"
	if filters.SortDir == "asc" {
		direction = "ASC"
	}
	column := "i.updated_at"
	switch filters.Sort {
	case "created_at":
		column = "i.created_at"
	case "priority":
		column = "CASE pv.value #>> '{}' WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 ELSE 3 END"
	case "status":
		column = "CASE i.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'resolved' THEN 2 WHEN 'wont_fix' THEN 3 ELSE 4 END"
	}
	return " ORDER BY " + column + " " + direction + ", i.updated_at DESC, i.id ASC"
}
