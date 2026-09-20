package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

type createIssueBody struct {
	Title            string                     `json:"title"`
	Description      *string                    `json:"description"`
	IssueType        *string                    `json:"issueType"`
	Status           *string                    `json:"status"`
	TargetLocale     *string                    `json:"targetLocale"`
	SourcePath       *string                    `json:"sourcePath"`
	SegmentID        *string                    `json:"segmentId"`
	TranslationKeyID *string                    `json:"translationKeyId"`
	LinkedCommentID  *string                    `json:"linkedCommentId"`
	LinkedAgentRunID *string                    `json:"linkedAgentRunId"`
	LinkKind         *string                    `json:"linkKind"`
	LinkLabel        *string                    `json:"linkLabel"`
	LinkURL          *string                    `json:"linkUrl"`
	ExternalRef      *string                    `json:"externalRef"`
	TemplateKey      *string                    `json:"templateKey"`
	AssigneeUserID   *string                    `json:"assigneeUserId"`
	Priority         *string                    `json:"priority"`
	Values           map[string]json.RawMessage `json:"values"`
}

type updateIssueBody struct {
	Title            *string                `json:"title"`
	Description      *string                `json:"description"`
	IssueType        *string                `json:"issueType"`
	Status           *string                `json:"status"`
	TargetLocale     optionalNullableString `json:"targetLocale"`
	SourcePath       optionalNullableString `json:"sourcePath"`
	SegmentID        optionalNullableString `json:"segmentId"`
	TranslationKeyID optionalNullableString `json:"translationKeyId"`
	LinkKind         optionalNullableString `json:"linkKind"`
	LinkLabel        optionalNullableString `json:"linkLabel"`
	LinkURL          optionalNullableString `json:"linkUrl"`
	AssigneeUserID   optionalNullableString `json:"assigneeUserId"`
}

type setValueBody struct {
	ColumnKey string          `json:"columnKey"`
	Value     json.RawMessage `json:"value"`
}

const issueSelectSQL = `
        select i.id, i.identifier, i.number, i.title, i.description, i.issue_type, i.status,
               i.target_locale, i.source_path, i.segment_id, i.translation_key_id,
               i.linked_comment_id, i.linked_agent_run_id, i.link_kind, i.link_label, i.link_url,
               i.external_ref, i.template_key, i.assignee_user_id,
               reporter.first_name, reporter.last_name, reporter.email,
               assignee.first_name, assignee.last_name, assignee.email,
               k.key, k.source_text,
               i.created_at, i.updated_at, i.resolved_at
        from issue_sheet_issues i
        left join users reporter on reporter.id = i.reporter_user_id
        left join users assignee on assignee.id = i.assignee_user_id
        left join project_translation_keys k on k.id = i.translation_key_id`

func (api *issueSheetAPI) listIssues(ctx context.Context, actor issueSheetActor, project issueSheetProject, r *http.Request) (any, int, error) {
	tx, err := api.pool.Begin(ctx)
	if err != nil {
		return nil, 0, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if err := ensureIssueStarterColumns(ctx, tx, actor.organizationID, project.ID, actor.userID); err != nil {
		return nil, 0, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, 0, err
	}

	query, err := parseIssueListQuery(r, actor.userID)
	if err != nil {
		return nil, 0, err
	}

	columns, err := api.loadColumns(ctx, actor.organizationID, project.ID)
	if err != nil {
		return nil, 0, err
	}

	whereSQL, whereArgs, needsPriorityJoin := buildIssueListWhere(actor.organizationID, project.ID, actor.userID, query)
	countSQL := `select count(*)::int from issue_sheet_issues i`
	if needsPriorityJoin {
		countSQL += `
            left join issue_sheet_columns priority_columns
              on priority_columns.organization_id = i.organization_id
             and priority_columns.project_id = i.project_id
             and priority_columns.key = 'priority'
            left join issue_sheet_row_values priority_values
              on priority_values.issue_id = i.id
             and priority_values.column_id = priority_columns.id`
	}
	countSQL += ` where ` + whereSQL

	var total int
	if err := api.pool.QueryRow(ctx, countSQL, whereArgs...).Scan(&total); err != nil {
		return nil, 0, err
	}

	summary, err := api.loadIssueSummary(ctx, actor.organizationID, project.ID)
	if err != nil {
		return nil, 0, err
	}

	orderSQL := buildIssueListOrderBy(query)
	listSQL := issueSelectSQL
	if needsPriorityJoin || query.sort == "priority" {
		listSQL += `
            left join issue_sheet_columns priority_columns
              on priority_columns.organization_id = i.organization_id
             and priority_columns.project_id = i.project_id
             and priority_columns.key = 'priority'
            left join issue_sheet_row_values priority_values
              on priority_values.issue_id = i.id
             and priority_values.column_id = priority_columns.id`
	}
	listArgs := append([]any{}, whereArgs...)
	listArgs = append(listArgs, query.limit, query.offset)
	listSQL += ` where ` + whereSQL + ` order by ` + orderSQL +
		fmt.Sprintf(` limit $%d offset $%d`, len(whereArgs)+1, len(whereArgs)+2)

	rows, err := api.pool.Query(ctx, listSQL, listArgs...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	issues := []map[string]any{}
	issueIDs := []string{}
	for rows.Next() {
		issue, id, scanErr := scanIssueRow(rows)
		if scanErr != nil {
			return nil, 0, scanErr
		}
		issues = append(issues, issue)
		issueIDs = append(issueIDs, id)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}

	valuesByIssue, err := api.loadValuesByIssueID(ctx, actor.organizationID, project.ID, issueIDs)
	if err != nil {
		return nil, 0, err
	}
	for i, id := range issueIDs {
		if vals, ok := valuesByIssue[id]; ok {
			issues[i]["values"] = vals
		} else {
			issues[i]["values"] = map[string]any{}
		}
	}

	return map[string]any{
		"issues":  issues,
		"columns": columns,
		"total":   total,
		"summary": summary,
	}, 200, nil
}

type issueListQuery struct {
	view             string
	status           string
	issueType        string
	priority         string
	locale           string
	assignee         string
	translationKeyID string
	search           string
	sort             string
	sortDir          string
	limit            int
	offset           int
}

func parseIssueListQuery(r *http.Request, actorUserID string) (issueListQuery, error) {
	q := r.URL.Query()
	out := issueListQuery{
		view:             strings.TrimSpace(q.Get("view")),
		status:           strings.TrimSpace(q.Get("status")),
		issueType:        strings.TrimSpace(q.Get("issueType")),
		priority:         strings.TrimSpace(q.Get("priority")),
		locale:           strings.TrimSpace(q.Get("locale")),
		assignee:         strings.TrimSpace(q.Get("assignee")),
		translationKeyID: strings.TrimSpace(q.Get("translationKeyId")),
		search:           strings.TrimSpace(q.Get("search")),
		sort:             strings.TrimSpace(q.Get("sort")),
		sortDir:          strings.TrimSpace(q.Get("sortDir")),
		limit:            50,
		offset:           0,
	}
	if out.view != "" {
		switch out.view {
		case "my_work", "qa_triage", "source_context", "all_open":
		default:
			return out, issueSheetFailure(400, "invalid_issue_sheet_query", "Invalid issue sheet query")
		}
	}
	if out.status != "" {
		switch out.status {
		case "open", "in_progress", "resolved", "wont_fix", "all":
		default:
			return out, issueSheetFailure(400, "invalid_issue_sheet_query", "Invalid issue sheet query")
		}
	}
	if out.issueType != "" {
		switch out.issueType {
		case "general_question", "translation_mistake", "context_request", "source_mistake",
			"glossary_violation", "qa_failure", "all":
		default:
			return out, issueSheetFailure(400, "invalid_issue_sheet_query", "Invalid issue sheet query")
		}
	}
	if out.priority != "" {
		switch out.priority {
		case "P0", "P1", "P2":
		default:
			return out, issueSheetFailure(400, "invalid_issue_sheet_query", "Invalid issue sheet query")
		}
	}
	if out.sort != "" {
		switch out.sort {
		case "updated_at", "created_at", "priority", "status":
		default:
			return out, issueSheetFailure(400, "invalid_issue_sheet_query", "Invalid issue sheet query")
		}
	}
	if out.sortDir != "" {
		switch out.sortDir {
		case "asc", "desc":
		default:
			return out, issueSheetFailure(400, "invalid_issue_sheet_query", "Invalid issue sheet query")
		}
	}
	if out.view == "my_work" && out.assignee == "" {
		out.assignee = actorUserID
	}
	if raw := strings.TrimSpace(q.Get("limit")); raw != "" {
		n, parseErr := strconv.Atoi(raw)
		if parseErr != nil || n < 1 || n > 200 {
			return out, issueSheetFailure(400, "invalid_issue_sheet_query", "Invalid issue sheet query")
		}
		out.limit = n
	}
	if raw := strings.TrimSpace(q.Get("offset")); raw != "" {
		n, parseErr := strconv.Atoi(raw)
		if parseErr != nil || n < 0 {
			return out, issueSheetFailure(400, "invalid_issue_sheet_query", "Invalid issue sheet query")
		}
		out.offset = n
	}
	return out, nil
}

func buildIssueListWhere(organizationID, projectID, actorUserID string, query issueListQuery) (string, []any, bool) {
	parts := []string{"i.organization_id = $1", "i.project_id = $2"}
	args := []any{organizationID, projectID}
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
	if query.translationKeyID != "" {
		add("i.translation_key_id = $%d", query.translationKeyID)
	}
	if query.search != "" {
		pattern := "%" + query.search + "%"
		args = append(args, pattern)
		n := len(args)
		parts = append(parts, fmt.Sprintf(
			`(i.identifier ilike $%d or i.title ilike $%d or i.description ilike $%d or i.source_path ilike $%d)`,
			n, n, n, n,
		))
	}

	return strings.Join(parts, " and "), args, needsPriorityJoin
}

func buildIssueListOrderBy(query issueListQuery) string {
	sort := query.sort
	if sort == "" {
		sort = "status"
	}
	direction := query.sortDir
	if direction == "" {
		if sort == "priority" || sort == "status" {
			direction = "asc"
		} else {
			direction = "desc"
		}
	}
	ordered := func(expr string) string {
		return expr + " " + direction
	}
	statusRank := `case
        when i.status = 'open' then 0
        when i.status = 'in_progress' then 1
        when i.status = 'resolved' then 2
        when i.status = 'wont_fix' then 3
        else 4 end`
	priorityRank := `case
        when priority_values.value #>> '{}' = 'P0' then 0
        when priority_values.value #>> '{}' = 'P1' then 1
        when priority_values.value #>> '{}' = 'P2' then 2
        else 3 end`
	idTie := "i.id asc"
	withinUpdated := "i.updated_at desc"

	switch sort {
	case "status":
		return ordered(statusRank) + ", " + withinUpdated + ", " + idTie
	case "created_at":
		return statusRank + " asc, " + ordered("i.created_at") + ", " + idTie
	case "priority":
		return statusRank + " asc, " + ordered(priorityRank) + ", " + idTie
	default:
		return statusRank + " asc, " + ordered("i.updated_at") + ", " + idTie
	}
}

func (api *issueSheetAPI) loadIssueSummary(ctx context.Context, organizationID, projectID string) (map[string]int, error) {
	rows, err := api.pool.Query(ctx, `
        select status, count(*)::int
        from issue_sheet_issues
        where organization_id = $1 and project_id = $2
        group by status`, organizationID, projectID)
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

func (api *issueSheetAPI) listAssignableMembers(ctx context.Context, actor issueSheetActor, project issueSheetProject) (any, int, error) {
	rows, err := api.pool.Query(ctx, `
        select u.id, u.workos_user_id, u.email, u.first_name, u.last_name, u.avatar_url
        from organization_memberships m
        join users u on u.id = m.user_id
        join projects p on p.id = $2 and p.organization_id = $1
        where m.organization_id = $1
          and `+activeOrgMembershipSQL+`
          and (
            m.role in ('admin', 'localization_manager')
            or exists (
                select 1
                from team_memberships tm
                join teams t on t.id = tm.team_id
                where tm.user_id = m.user_id
                  and t.organization_id = $1
                  and (t.id = p.team_id or (p.team_id is null and t.slug = 'default'))
            )
          )
        order by u.email asc`, actor.organizationID, project.ID)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	members := []map[string]any{}
	for rows.Next() {
		var userID, workosUserID, email string
		var firstName, lastName, avatarURL *string
		if err := rows.Scan(&userID, &workosUserID, &email, &firstName, &lastName, &avatarURL); err != nil {
			return nil, 0, err
		}
		display := strings.TrimSpace(stringFromPtr(firstName) + " " + stringFromPtr(lastName))
		if display == "" {
			display = email
		}
		members = append(members, map[string]any{
			"userId":        userID,
			"workosUserId":  workosUserID,
			"email":         email,
			"firstName":     firstName,
			"lastName":      lastName,
			"displayName":   display,
			"avatarUrl":     avatarURL,
			"isCurrentUser": userID == actor.userID,
		})
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	return map[string]any{"members": members}, 200, nil
}

func stringFromPtr(v *string) string {
	if v == nil {
		return ""
	}
	return *v
}

func scanIssueRow(rows pgx.Rows) (map[string]any, string, error) {
	var (
		id, identifier, title, description, issueType, status  string
		number                                                 int
		targetLocale, sourcePath, segmentID                    *string
		translationKeyID, linkedCommentID, linkedAgentRunID    *string
		linkKind, linkLabel, linkURL, externalRef, templateKey *string
		assigneeUserID                                         *string
		reporterFirst, reporterLast, reporterEmail             *string
		assigneeFirst, assigneeLast, assigneeEmail             *string
		key, sourceText                                        *string
		createdAt, updatedAt                                   time.Time
		resolvedAt                                             *time.Time
	)
	if err := rows.Scan(
		&id, &identifier, &number, &title, &description, &issueType, &status,
		&targetLocale, &sourcePath, &segmentID, &translationKeyID,
		&linkedCommentID, &linkedAgentRunID, &linkKind, &linkLabel, &linkURL,
		&externalRef, &templateKey, &assigneeUserID,
		&reporterFirst, &reporterLast, &reporterEmail,
		&assigneeFirst, &assigneeLast, &assigneeEmail,
		&key, &sourceText,
		&createdAt, &updatedAt, &resolvedAt,
	); err != nil {
		return nil, "", err
	}
	return map[string]any{
		"id":               id,
		"identifier":       identifier,
		"number":           number,
		"title":            title,
		"description":      description,
		"issueType":        issueType,
		"status":           status,
		"targetLocale":     targetLocale,
		"sourcePath":       sourcePath,
		"segmentId":        segmentID,
		"translationKeyId": translationKeyID,
		"linkedCommentId":  linkedCommentID,
		"linkedAgentRunId": linkedAgentRunID,
		"linkKind":         linkKind,
		"linkLabel":        linkLabel,
		"linkUrl":          linkURL,
		"externalRef":      externalRef,
		"templateKey":      templateKey,
		"reporter":         formatIssueUser(reporterFirst, reporterLast, reporterEmail),
		"assignee":         formatIssueUser(assigneeFirst, assigneeLast, assigneeEmail),
		"assigneeUserId":   assigneeUserID,
		"key":              key,
		"sourceText":       sourceText,
		"createdAt":        formatIssueSheetTime(createdAt),
		"updatedAt":        formatIssueSheetTime(updatedAt),
		"resolvedAt":       formatIssueSheetTimePtr(resolvedAt),
		"values":           map[string]any{},
		"isWatching":       false,
	}, id, nil
}

func formatIssueUser(first, last, email *string) *string {
	if email == nil || *email == "" {
		return nil
	}
	name := strings.TrimSpace(stringFromPtr(first) + " " + stringFromPtr(last))
	if name == "" {
		name = *email
	}
	return &name
}

func (api *issueSheetAPI) loadValuesByIssueID(ctx context.Context, organizationID, projectID string, issueIDs []string) (map[string]map[string]any, error) {
	out := map[string]map[string]any{}
	if len(issueIDs) == 0 {
		return out, nil
	}
	rows, err := api.pool.Query(ctx, `
        select v.issue_id, c.key, v.value
        from issue_sheet_row_values v
        join issue_sheet_columns c on c.id = v.column_id
        where v.organization_id = $1 and v.project_id = $2 and v.issue_id = any($3)`,
		organizationID, projectID, issueIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var issueID, key string
		var raw []byte
		if err := rows.Scan(&issueID, &key, &raw); err != nil {
			return nil, err
		}
		var value any
		if len(raw) > 0 {
			_ = json.Unmarshal(raw, &value)
		}
		if out[issueID] == nil {
			out[issueID] = map[string]any{}
		}
		out[issueID][key] = value
	}
	return out, rows.Err()
}

func (api *issueSheetAPI) getIssue(ctx context.Context, actor issueSheetActor, project issueSheetProject, issueRef string) (any, int, error) {
	issue, err := api.loadIssue(ctx, actor, project, issueRef)
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"issue": issue}, 200, nil
}

func (api *issueSheetAPI) loadIssue(ctx context.Context, actor issueSheetActor, project issueSheetProject, issueRef string) (map[string]any, error) {
	var sql string
	if isLegacyIssueUUID(issueRef) {
		sql = issueSelectSQL + `
        where i.organization_id = $1 and i.project_id = $2 and i.id = $3
        limit 1`
	} else {
		sql = issueSelectSQL + `
        where i.organization_id = $1 and i.project_id = $2 and i.identifier = $3
        limit 1`
	}
	rows, err := api.pool.Query(ctx, sql, actor.organizationID, project.ID, issueRef)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, missingIssueSheetIssue()
	}
	issue, id, err := scanIssueRow(rows)
	if err != nil {
		return nil, err
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	values, err := api.loadValuesByIssueID(ctx, actor.organizationID, project.ID, []string{id})
	if err != nil {
		return nil, err
	}
	if vals, ok := values[id]; ok {
		issue["values"] = vals
	}
	var watching bool
	_ = api.pool.QueryRow(ctx, `
        select exists(
            select 1 from issue_sheet_subscriptions
            where issue_id = $1 and user_id = $2
        )`, id, actor.userID).Scan(&watching)
	issue["isWatching"] = watching
	return issue, nil
}

func (api *issueSheetAPI) createIssue(ctx context.Context, actor issueSheetActor, project issueSheetProject, r *http.Request) (any, int, error) {
	var body createIssueBody
	if err := readIssueSheetBody(r, &body); err != nil {
		return nil, 0, err
	}
	title := strings.TrimSpace(body.Title)
	if title == "" {
		return nil, 0, issueSheetFailure(400, "invalid_issue_sheet_issue_payload", "Title is required")
	}
	if body.TranslationKeyID != nil && strings.TrimSpace(*body.TranslationKeyID) != "" {
		if err := api.assertTranslationKeyInProject(ctx, actor.organizationID, project.ID, strings.TrimSpace(*body.TranslationKeyID)); err != nil {
			return nil, 0, err
		}
	}
	if body.AssigneeUserID != nil && strings.TrimSpace(*body.AssigneeUserID) != "" {
		if err := api.assertAssignableAssignee(ctx, actor.organizationID, project.ID, strings.TrimSpace(*body.AssigneeUserID)); err != nil {
			return nil, 0, err
		}
	}

	tx, err := api.pool.Begin(ctx)
	if err != nil {
		return nil, 0, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if err := ensureIssueStarterColumns(ctx, tx, actor.organizationID, project.ID, actor.userID); err != nil {
		return nil, 0, err
	}

	var issueNumber int
	var projectIdentifier string
	if err := tx.QueryRow(ctx, `
        update projects set
            issue_number_seq = greatest(
                issue_number_seq,
                coalesce((select max(number) from issue_sheet_issues where project_id = $1), 0)
            ) + 1,
            updated_at = now()
        where id = $1
        returning issue_number_seq, identifier`, project.ID).Scan(&issueNumber, &projectIdentifier); err != nil {
		return nil, 0, err
	}
	identifier := fmt.Sprintf("%s-%d", projectIdentifier, issueNumber)

	description := ""
	if body.Description != nil {
		description = *body.Description
	}
	issueType := "general_question"
	if body.IssueType != nil && *body.IssueType != "" {
		issueType = *body.IssueType
	}
	status := "open"
	if body.Status != nil && *body.Status != "" {
		status = *body.Status
	}
	var resolvedAt any
	if status == "resolved" || status == "wont_fix" {
		resolvedAt = time.Now().UTC()
	}

	var issueID string
	err = tx.QueryRow(ctx, `
        insert into issue_sheet_issues (
            identifier, number, organization_id, project_id, title, description, issue_type, status,
            target_locale, source_path, segment_id, translation_key_id, linked_comment_id, linked_agent_run_id,
            link_kind, link_label, link_url, external_ref, template_key, reporter_user_id, assignee_user_id, resolved_at
        ) values (
            $1, $2, $3, $4, $5, $6, $7, $8,
            $9, $10, $11, $12, $13, $14,
            $15, $16, $17, $18, $19, $20, $21, $22
        )
        returning id`,
		identifier, issueNumber, actor.organizationID, project.ID, title, description, issueType, status,
		body.TargetLocale, body.SourcePath, body.SegmentID, body.TranslationKeyID, body.LinkedCommentID, body.LinkedAgentRunID,
		body.LinkKind, body.LinkLabel, body.LinkURL, body.ExternalRef, body.TemplateKey, actor.userID, body.AssigneeUserID, resolvedAt,
	).Scan(&issueID)
	if err != nil {
		return nil, 0, err
	}

	if _, err := tx.Exec(ctx, `
        insert into issue_sheet_activities (
            organization_id, project_id, issue_id, actor_user_id, type, payload, created_at
        ) values ($1, $2, $3, $4, 'issue_created', '{}'::jsonb, clock_timestamp())`,
		actor.organizationID, project.ID, issueID, actor.userID); err != nil {
		return nil, 0, err
	}

	if _, err := tx.Exec(ctx, `
        insert into issue_sheet_subscriptions (organization_id, project_id, issue_id, user_id)
        values ($1, $2, $3, $4)
        on conflict do nothing`,
		actor.organizationID, project.ID, issueID, actor.userID); err != nil {
		return nil, 0, err
	}
	if body.AssigneeUserID != nil && *body.AssigneeUserID != "" && *body.AssigneeUserID != actor.userID {
		if _, err := tx.Exec(ctx, `
            insert into issue_sheet_subscriptions (organization_id, project_id, issue_id, user_id)
            values ($1, $2, $3, $4)
            on conflict do nothing`,
			actor.organizationID, project.ID, issueID, *body.AssigneeUserID); err != nil {
			return nil, 0, err
		}
	}

	if body.Priority != nil && *body.Priority != "" {
		if err := setIssueValueTx(ctx, tx, actor.organizationID, project.ID, issueID, "priority", json.RawMessage(strconv.Quote(*body.Priority))); err != nil {
			return nil, 0, err
		}
	}
	for columnKey, rawValue := range body.Values {
		if columnKey == "priority" {
			continue
		}
		if err := setIssueValueTx(ctx, tx, actor.organizationID, project.ID, issueID, columnKey, rawValue); err != nil {
			return nil, 0, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, 0, err
	}

	issue, err := api.loadIssue(ctx, actor, project, identifier)
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"issue": issue}, 201, nil
}

func (api *issueSheetAPI) updateIssue(ctx context.Context, actor issueSheetActor, project issueSheetProject, issueRef string, r *http.Request) (any, int, error) {
	var body updateIssueBody
	if err := readIssueSheetBody(r, &body); err != nil {
		return nil, 0, err
	}
	issueID, err := api.resolveIssueID(ctx, actor.organizationID, project.ID, issueRef)
	if err != nil {
		var failure *issueSheetError
		if errors.As(err, &failure) && failure.code == "issue_not_found" {
			return nil, 0, issueSheetFailure(400, "issue_sheet_issue_not_found", "Issue not found")
		}
		return nil, 0, err
	}

	if body.AssigneeUserID.Present && body.AssigneeUserID.Value != nil && strings.TrimSpace(*body.AssigneeUserID.Value) != "" {
		if err := api.assertAssignableAssignee(ctx, actor.organizationID, project.ID, strings.TrimSpace(*body.AssigneeUserID.Value)); err != nil {
			return nil, 0, err
		}
	}
	if body.TranslationKeyID.Present && body.TranslationKeyID.Value != nil && strings.TrimSpace(*body.TranslationKeyID.Value) != "" {
		if err := api.assertTranslationKeyInProject(ctx, actor.organizationID, project.ID, strings.TrimSpace(*body.TranslationKeyID.Value)); err != nil {
			return nil, 0, err
		}
	}

	sets := []string{"updated_at = now()"}
	args := []any{actor.organizationID, project.ID, issueID}
	add := func(col string, value any) {
		args = append(args, value)
		sets = append(sets, fmt.Sprintf("%s = $%d", col, len(args)))
	}
	if body.Title != nil {
		add("title", *body.Title)
	}
	if body.Description != nil {
		add("description", *body.Description)
	}
	if body.IssueType != nil {
		add("issue_type", *body.IssueType)
	}
	if body.Status != nil {
		add("status", *body.Status)
		switch *body.Status {
		case "resolved", "wont_fix":
			add("resolved_at", time.Now().UTC())
		case "open", "in_progress":
			add("resolved_at", nil)
		}
	}
	if body.TargetLocale.Present {
		add("target_locale", body.TargetLocale.Value)
	}
	if body.SourcePath.Present {
		add("source_path", body.SourcePath.Value)
	}
	if body.SegmentID.Present {
		add("segment_id", body.SegmentID.Value)
	}
	if body.TranslationKeyID.Present {
		add("translation_key_id", body.TranslationKeyID.Value)
	}
	if body.LinkKind.Present {
		add("link_kind", body.LinkKind.Value)
	}
	if body.LinkLabel.Present {
		add("link_label", body.LinkLabel.Value)
	}
	if body.LinkURL.Present {
		add("link_url", body.LinkURL.Value)
	}
	if body.AssigneeUserID.Present {
		add("assignee_user_id", body.AssigneeUserID.Value)
	}
	if len(sets) == 1 {
		return nil, 0, issueSheetFailure(400, "invalid_issue_sheet_issue_payload", "At least one field must be provided")
	}

	tag, err := api.pool.Exec(ctx, `
        update issue_sheet_issues set `+strings.Join(sets, ", ")+`
        where organization_id = $1 and project_id = $2 and id = $3`, args...)
	if err != nil {
		return nil, 0, err
	}
	if tag.RowsAffected() == 0 {
		return nil, 0, issueSheetFailure(400, "issue_sheet_issue_not_found", "Issue not found")
	}
	issue, err := api.loadIssue(ctx, actor, project, issueID)
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"issue": issue}, 200, nil
}

func (api *issueSheetAPI) setIssueValue(ctx context.Context, actor issueSheetActor, project issueSheetProject, issueRef string, r *http.Request) (any, int, error) {
	var body setValueBody
	if err := readIssueSheetBody(r, &body); err != nil {
		return nil, 0, err
	}
	if strings.TrimSpace(body.ColumnKey) == "" {
		return nil, 0, issueSheetFailure(400, "invalid_issue_sheet_value_payload", "Invalid issue sheet value payload")
	}
	issueID, err := api.resolveIssueID(ctx, actor.organizationID, project.ID, issueRef)
	if err != nil {
		return nil, 0, issueSheetFailure(400, "issue_sheet_issue_not_found", "Issue not found")
	}
	tx, err := api.pool.Begin(ctx)
	if err != nil {
		return nil, 0, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if err := setIssueValueTx(ctx, tx, actor.organizationID, project.ID, issueID, body.ColumnKey, body.Value); err != nil {
		return nil, 0, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, 0, err
	}
	var value any
	if len(body.Value) > 0 {
		_ = json.Unmarshal(body.Value, &value)
	}
	return map[string]any{
		"value": map[string]any{
			"issueId":   issueRef,
			"columnKey": body.ColumnKey,
			"value":     value,
		},
	}, 200, nil
}

func setIssueValueTx(ctx context.Context, tx pgx.Tx, organizationID, projectID, issueID, columnKey string, raw json.RawMessage) error {
	var columnID, columnType string
	var configRaw []byte
	err := tx.QueryRow(ctx, `
        select id, type, config from issue_sheet_columns
        where organization_id = $1 and project_id = $2 and key = $3
        limit 1`, organizationID, projectID, columnKey).Scan(&columnID, &columnType, &configRaw)
	if errors.Is(err, pgx.ErrNoRows) {
		return issueSheetFailure(400, "issue_sheet_column_not_found", "Column not found")
	}
	if err != nil {
		return err
	}

	var value any
	if len(raw) == 0 || string(raw) == "null" || string(raw) == `""` {
		value = nil
	} else if err := json.Unmarshal(raw, &value); err != nil {
		return issueSheetFailure(400, "invalid_issue_sheet_value_payload", "Invalid issue sheet value payload")
	}

	if columnType == "select" && value != nil {
		var config struct {
			Options []struct {
				ID string `json:"id"`
			} `json:"options"`
		}
		_ = json.Unmarshal(configRaw, &config)
		allowed := false
		if str, ok := value.(string); ok {
			for _, opt := range config.Options {
				if opt.ID == str {
					allowed = true
					break
				}
			}
		}
		if !allowed {
			return issueSheetFailure(400, "invalid_issue_sheet_select_value", "Invalid select value")
		}
	}

	valueJSON, err := json.Marshal(value)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `
        insert into issue_sheet_row_values (organization_id, project_id, issue_id, column_id, value)
        values ($1, $2, $3, $4, $5::jsonb)
        on conflict (issue_id, column_id) do update set value = excluded.value, updated_at = now()`,
		organizationID, projectID, issueID, columnID, string(valueJSON))
	return err
}
