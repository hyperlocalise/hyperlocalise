package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"
)

func (api *issueSheetAPI) resolveOrgIssue(ctx context.Context, actor issueSheetActor, issueRef string) (issueID, projectID string, err error) {
	orgWide := actor.canWriteProjectTeam()
	matchSQL, matchArg := issueIDMatchSQL(issueRef, 4)
	sql := `
        select i.id, i.project_id
        from issue_sheet_issues i
        join projects p on p.id = i.project_id
        where i.organization_id = $1 and ` + formatQaProjectTeamAccessSQL(2, 3, 1) + `
        and i.` + matchSQL + `
        limit 1`
	err = api.pool.QueryRow(ctx, sql, actor.organizationID, orgWide, actor.userID, matchArg).Scan(&issueID, &projectID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", "", missingIssueSheetIssue()
	}
	return issueID, projectID, err
}

func (api *issueSheetAPI) getOrgIssueHandler(r *http.Request, actor issueSheetActor) (any, int, error) {
	issueRef := strings.TrimSpace(r.PathValue("issueId"))
	if issueRef == "" {
		return nil, 0, missingIssueSheetIssue()
	}
	issueID, projectID, err := api.resolveOrgIssue(r.Context(), actor, issueRef)
	if err != nil {
		return nil, 0, err
	}
	var projectName string
	if err := api.pool.QueryRow(r.Context(), `select name from projects where id = $1`, projectID).Scan(&projectName); err != nil {
		return nil, 0, err
	}
	issue, err := api.loadIssue(r.Context(), actor, issueSheetProject{ID: projectID}, issueID)
	if err != nil {
		return nil, 0, err
	}
	issue["projectId"] = projectID
	issue["projectName"] = projectName
	return map[string]any{"issue": issue}, 200, nil
}

type orgIssueSearchQuery struct {
	q              string
	excludeIssueID string
	limit          int
}

func invalidIssueSearchQuery() error {
	return issueSheetFailure(400, "invalid_issue_search_query", "Invalid issue search query")
}

func parseOrgIssueSearchQuery(r *http.Request) (orgIssueSearchQuery, error) {
	q := r.URL.Query()
	out := orgIssueSearchQuery{
		q:              strings.TrimSpace(q.Get("q")),
		excludeIssueID: strings.TrimSpace(q.Get("excludeIssueId")),
		limit:          20,
	}
	if len(out.q) > 100 {
		return out, invalidIssueSearchQuery()
	}
	if out.excludeIssueID != "" && !isLegacyIssueUUID(out.excludeIssueID) {
		return out, invalidIssueSearchQuery()
	}
	if raw := strings.TrimSpace(q.Get("limit")); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n < 1 || n > 50 {
			return out, invalidIssueSearchQuery()
		}
		out.limit = n
	}
	return out, nil
}

func (api *issueSheetAPI) searchOrgIssuesHandler(r *http.Request, actor issueSheetActor) (any, int, error) {
	query, err := parseOrgIssueSearchQuery(r)
	if err != nil {
		return nil, 0, err
	}
	orgWide := actor.canWriteProjectTeam()
	args := []any{actor.organizationID, orgWide, actor.userID}
	parts := []string{"i.organization_id = $1", formatQaProjectTeamAccessSQL(2, 3, 1)}
	if query.excludeIssueID != "" {
		args = append(args, query.excludeIssueID)
		parts = append(parts, fmt.Sprintf("i.id != $%d", len(args)))
	}
	if query.q != "" {
		pattern := "%" + query.q + "%"
		args = append(args, pattern)
		n := len(args)
		parts = append(parts, fmt.Sprintf("(i.title ilike $%d or i.external_ref ilike $%d)", n, n))
	}
	args = append(args, query.limit)

	sql := `
        select i.id, i.project_id, i.title, i.status
        from issue_sheet_issues i
        join projects p on p.id = i.project_id
        where ` + strings.Join(parts, " and ") + `
        order by i.updated_at desc
        limit $` + strconv.Itoa(len(args))

	rows, err := api.pool.Query(r.Context(), sql, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	issues := []map[string]any{}
	for rows.Next() {
		var id, projectID, title, status string
		if err := rows.Scan(&id, &projectID, &title, &status); err != nil {
			return nil, 0, err
		}
		issues = append(issues, map[string]any{
			"issueId":   id,
			"projectId": projectID,
			"title":     title,
			"status":    status,
		})
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	return map[string]any{"issues": issues}, 200, nil
}
