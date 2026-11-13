package main

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"golang.org/x/sync/errgroup"
)

const orgIssueSelectSQL = `
        select i.id, i.identifier, i.number, i.project_id, p.name,
               i.title, i.description, i.issue_type, i.status,
               i.target_locale, i.source_path, i.segment_id,
               i.link_kind, i.link_label, i.link_url, i.template_key, i.assignee_user_id,
               reporter.first_name, reporter.last_name, reporter.email,
               assignee.first_name, assignee.last_name, assignee.email,
               k.key, k.source_text,
               priority_values.value #>> '{}',
               i.created_at, i.updated_at, i.resolved_at
        from issue_sheet_issues i
        join projects p on p.id = i.project_id
        left join users reporter on reporter.id = i.reporter_user_id
        left join users assignee on assignee.id = i.assignee_user_id
        left join project_translation_keys k on k.id = i.translation_key_id
        left join issue_sheet_columns priority_columns
          on priority_columns.organization_id = i.organization_id
         and priority_columns.project_id = i.project_id
         and priority_columns.key = 'priority'
        left join issue_sheet_row_values priority_values
          on priority_values.issue_id = i.id
         and priority_values.column_id = priority_columns.id`

const orgIssuePriorityJoinSQL = `
            left join issue_sheet_columns priority_columns
              on priority_columns.organization_id = i.organization_id
             and priority_columns.project_id = i.project_id
             and priority_columns.key = 'priority'
            left join issue_sheet_row_values priority_values
              on priority_values.issue_id = i.id
             and priority_values.column_id = priority_columns.id`

type orgIssueListQuery struct {
	view        string
	status      string
	issueType   string
	priority    string
	locale      string
	assignee    string
	projectID   string
	qaCheckType string
	search      string
	sort        string
	sortDir     string
	limit       int
	offset      int
}

func invalidOrgIssuesQuery() error {
	return issueSheetFailure(400, "invalid_organization_issues_query", "Invalid organization issues query")
}

func parseOrgIssueListQuery(r *http.Request, actorUserID string) (orgIssueListQuery, error) {
	q := r.URL.Query()
	out := orgIssueListQuery{
		view:        strings.TrimSpace(q.Get("view")),
		status:      strings.TrimSpace(q.Get("status")),
		issueType:   strings.TrimSpace(q.Get("issueType")),
		priority:    strings.TrimSpace(q.Get("priority")),
		locale:      strings.TrimSpace(q.Get("locale")),
		assignee:    strings.TrimSpace(q.Get("assignee")),
		projectID:   strings.TrimSpace(q.Get("projectId")),
		qaCheckType: strings.TrimSpace(q.Get("qaCheckType")),
		search:      strings.TrimSpace(q.Get("search")),
		sort:        strings.TrimSpace(q.Get("sort")),
		sortDir:     strings.TrimSpace(q.Get("sortDir")),
		limit:       50,
		offset:      0,
	}
	if out.view != "" {
		switch out.view {
		case "my_work", "qa_triage", "source_context", "all_open":
		default:
			return out, invalidOrgIssuesQuery()
		}
	}
	if out.status != "" {
		switch out.status {
		case "open", "in_progress", "resolved", "wont_fix", "all":
		default:
			return out, invalidOrgIssuesQuery()
		}
	}
	if out.issueType != "" {
		switch out.issueType {
		case "general_question", "translation_mistake", "context_request", "source_mistake",
			"glossary_violation", "qa_failure", "all":
		default:
			return out, invalidOrgIssuesQuery()
		}
	}
	if out.priority != "" {
		switch out.priority {
		case "P0", "P1", "P2":
		default:
			return out, invalidOrgIssuesQuery()
		}
	}
	if out.qaCheckType != "" {
		if _, ok := validQACheckTypes[out.qaCheckType]; !ok {
			return out, invalidOrgIssuesQuery()
		}
	}
	if out.sort != "" {
		switch out.sort {
		case "updated_at", "created_at", "priority", "status":
		default:
			return out, invalidOrgIssuesQuery()
		}
	}
	if out.sortDir != "" {
		switch out.sortDir {
		case "asc", "desc":
		default:
			return out, invalidOrgIssuesQuery()
		}
	}
	if len(out.projectID) > 128 {
		return out, invalidOrgIssuesQuery()
	}
	if len(out.search) > 200 {
		return out, invalidOrgIssuesQuery()
	}
	if len(out.locale) > 32 {
		return out, invalidOrgIssuesQuery()
	}
	if out.assignee != "" && out.assignee != "me" && out.assignee != "unassigned" && !isLegacyIssueUUID(out.assignee) {
		return out, invalidOrgIssuesQuery()
	}
	if out.view == "my_work" && out.assignee == "" {
		out.assignee = actorUserID
	}
	if raw := strings.TrimSpace(q.Get("limit")); raw != "" {
		n, parseErr := strconv.Atoi(raw)
		if parseErr != nil || n < 1 || n > 100 {
			return out, invalidOrgIssuesQuery()
		}
		out.limit = n
	}
	if raw := strings.TrimSpace(q.Get("offset")); raw != "" {
		n, parseErr := strconv.Atoi(raw)
		if parseErr != nil || n < 0 {
			return out, invalidOrgIssuesQuery()
		}
		out.offset = n
	}
	return out, nil
}

func buildOrgIssueListWhere(organizationID string, orgWide bool, actorUserID string, query orgIssueListQuery) (string, []any, bool) {
	args := []any{organizationID, orgWide, actorUserID}
	parts := []string{"i.organization_id = $1", formatQaProjectTeamAccessSQL(2, 3, 1)}
	add := func(clause string, value any) {
		args = append(args, value)
		parts = append(parts, fmt.Sprintf(clause, len(args)))
	}

	hasStatusFilter := query.status != "" && query.status != "all"
	hasTypeFilter := query.issueType != "" && query.issueType != "all"
	hasAssigneeFilter := query.assignee != ""

	switch query.view {
	case "my_work":
		if !hasAssigneeFilter {
			add("i.assignee_user_id = $%d", actorUserID)
		}
		if !hasStatusFilter {
			parts = append(parts, "i.status in ('open', 'in_progress')")
		}
	case "qa_triage":
		if !hasTypeFilter {
			parts = append(parts, "i.issue_type = 'qa_failure'")
		}
		if !hasAssigneeFilter {
			parts = append(parts, "i.assignee_user_id is null")
		}
		if !hasStatusFilter {
			parts = append(parts, "i.status in ('open', 'in_progress')")
		}
	case "source_context":
		if !hasTypeFilter {
			parts = append(parts, "i.issue_type in ('source_mistake', 'context_request', 'general_question')")
		}
		if !hasStatusFilter {
			parts = append(parts, "i.status in ('open', 'in_progress')")
		}
	case "all_open":
		if !hasStatusFilter {
			parts = append(parts, "i.status in ('open', 'in_progress')")
		}
	}

	if hasStatusFilter {
		add("i.status = $%d", query.status)
	}
	if hasTypeFilter {
		add("i.issue_type = $%d", query.issueType)
	}
	needsPriorityJoin := query.priority != "" || query.sort == "priority"
	if query.priority != "" {
		add("priority_values.value #>> '{}' = $%d", query.priority)
	}
	if query.locale != "" {
		add("i.target_locale = $%d", query.locale)
	}
	switch query.assignee {
	case "":
	case "me":
		add("i.assignee_user_id = $%d", actorUserID)
	case "unassigned":
		parts = append(parts, "i.assignee_user_id is null")
	default:
		add("i.assignee_user_id = $%d", query.assignee)
	}
	if query.projectID != "" {
		add("i.project_id = $%d", query.projectID)
	}
	if query.qaCheckType != "" {
		add("i.metadata #>> '{qaFinding,checkType}' = $%d", query.qaCheckType)
	}
	if query.search != "" {
		pattern := "%" + query.search + "%"
		args = append(args, pattern)
		n := len(args)
		parts = append(parts, fmt.Sprintf(
			`(i.identifier ilike $%d or i.title ilike $%d or i.description ilike $%d or i.source_path ilike $%d or p.name ilike $%d)`,
			n, n, n, n, n,
		))
	}

	return strings.Join(parts, " and "), args, needsPriorityJoin
}

func (api *issueSheetAPI) loadOrgIssueSummary(ctx context.Context, organizationID string, orgWide bool, actorUserID string) (map[string]int, error) {
	rows, err := api.pool.Query(ctx, `
        select i.status, count(*)::int
        from issue_sheet_issues i
        join projects p on p.id = i.project_id
        where i.organization_id = $1 and `+formatQaProjectTeamAccessSQL(2, 3, 1)+`
        group by i.status`, organizationID, orgWide, actorUserID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	summary := map[string]int{"total": 0, "open": 0, "inProgress": 0, "resolved": 0, "wontFix": 0}
	for rows.Next() {
		var status string
		var count int
		if err := rows.Scan(&status, &count); err != nil {
			return nil, err
		}
		summary["total"] += count
		switch status {
		case "open":
			summary["open"] = count
		case "in_progress":
			summary["inProgress"] = count
		case "resolved":
			summary["resolved"] = count
		case "wont_fix":
			summary["wontFix"] = count
		}
	}
	return summary, rows.Err()
}

func scanOrgIssueRow(rows pgx.Rows) (map[string]any, error) {
	var (
		id, identifier, projectID, projectName     string
		number                                     int
		title, description, issueType, status      string
		targetLocale, sourcePath, segmentID        *string
		linkKind, linkLabel, linkURL, templateKey  *string
		assigneeUserID                             *string
		reporterFirst, reporterLast, reporterEmail *string
		assigneeFirst, assigneeLast, assigneeEmail *string
		key, sourceText                            *string
		priority                                   *string
		createdAt, updatedAt                       time.Time
		resolvedAt                                 *time.Time
	)
	if err := rows.Scan(
		&id, &identifier, &number, &projectID, &projectName,
		&title, &description, &issueType, &status,
		&targetLocale, &sourcePath, &segmentID,
		&linkKind, &linkLabel, &linkURL, &templateKey, &assigneeUserID,
		&reporterFirst, &reporterLast, &reporterEmail,
		&assigneeFirst, &assigneeLast, &assigneeEmail,
		&key, &sourceText,
		&priority,
		&createdAt, &updatedAt, &resolvedAt,
	); err != nil {
		return nil, err
	}
	return map[string]any{
		"id":             id,
		"identifier":     identifier,
		"number":         number,
		"projectId":      projectID,
		"projectName":    projectName,
		"title":          title,
		"description":    description,
		"issueType":      issueType,
		"status":         status,
		"targetLocale":   targetLocale,
		"sourcePath":     sourcePath,
		"segmentId":      segmentID,
		"linkKind":       linkKind,
		"linkLabel":      linkLabel,
		"linkUrl":        linkURL,
		"templateKey":    templateKey,
		"reporter":       formatIssueUser(reporterFirst, reporterLast, reporterEmail),
		"assignee":       formatIssueUser(assigneeFirst, assigneeLast, assigneeEmail),
		"assigneeUserId": assigneeUserID,
		"key":            key,
		"sourceText":     sourceText,
		"priority":       priority,
		"createdAt":      createdAt,
		"updatedAt":      updatedAt,
		"resolvedAt":     resolvedAt,
	}, nil
}

func (api *issueSheetAPI) listOrgIssuesHandler(r *http.Request, actor issueSheetActor) (any, int, error) {
	query, err := parseOrgIssueListQuery(r, actor.userID)
	if err != nil {
		return nil, 0, err
	}
	orgWide := actor.canWriteProjectTeam()
	whereSQL, whereArgs, needsPriorityJoin := buildOrgIssueListWhere(actor.organizationID, orgWide, actor.userID, query)

	var (
		total   int
		summary map[string]int
		issues  []map[string]any
	)
	g, ctx := errgroup.WithContext(r.Context())
	g.Go(func() error {
		countSQL := `select count(*)::int from issue_sheet_issues i join projects p on p.id = i.project_id`
		if needsPriorityJoin {
			countSQL += orgIssuePriorityJoinSQL
		}
		countSQL += ` where ` + whereSQL
		return api.pool.QueryRow(ctx, countSQL, whereArgs...).Scan(&total)
	})
	g.Go(func() error {
		loaded, err := api.loadOrgIssueSummary(ctx, actor.organizationID, orgWide, actor.userID)
		if err != nil {
			return err
		}
		summary = loaded
		return nil
	})
	g.Go(func() error {
		orderSQL := buildIssueListOrderBy(issueListQuery{sort: query.sort, sortDir: query.sortDir})
		listArgs := append(append([]any{}, whereArgs...), query.limit, query.offset)
		listSQL := orgIssueSelectSQL + ` where ` + whereSQL + ` order by ` + orderSQL +
			fmt.Sprintf(` limit $%d offset $%d`, len(whereArgs)+1, len(whereArgs)+2)
		rows, err := api.pool.Query(ctx, listSQL, listArgs...)
		if err != nil {
			return err
		}
		defer rows.Close()
		collected := []map[string]any{}
		for rows.Next() {
			issue, scanErr := scanOrgIssueRow(rows)
			if scanErr != nil {
				return scanErr
			}
			collected = append(collected, issue)
		}
		if err := rows.Err(); err != nil {
			return err
		}
		issues = collected
		return nil
	})
	if err := g.Wait(); err != nil {
		return nil, 0, err
	}

	return map[string]any{
		"issues":  issues,
		"total":   total,
		"summary": summary,
	}, 200, nil
}
