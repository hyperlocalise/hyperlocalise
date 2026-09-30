package main

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"strings"
)

type mentionSuggestionsQuery struct {
	q         string
	projectID string
	issueID   string
	limit     int
}

func invalidMentionSuggestionsQuery() error {
	return notificationsFailure(400, "invalid_mention_suggestions_query", "Invalid mention suggestions query")
}

func parseMentionSuggestionsQuery(r *http.Request) (mentionSuggestionsQuery, error) {
	q := r.URL.Query()
	out := mentionSuggestionsQuery{
		q:         strings.TrimSpace(q.Get("q")),
		projectID: strings.TrimSpace(q.Get("projectId")),
		issueID:   strings.TrimSpace(q.Get("issueId")),
		limit:     5,
	}
	if len(out.q) > 100 {
		return out, invalidMentionSuggestionsQuery()
	}
	if len(out.projectID) > 128 {
		return out, invalidMentionSuggestionsQuery()
	}
	if out.issueID != "" && !isLegacyIssueUUID(out.issueID) {
		return out, invalidMentionSuggestionsQuery()
	}
	if raw := strings.TrimSpace(q.Get("limit")); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n < 1 || n > 20 {
			return out, invalidMentionSuggestionsQuery()
		}
		out.limit = n
	}
	return out, nil
}

func (api *notificationsAPI) mentionSuggestionsHandler(r *http.Request, actor notificationsActor) (any, int, error) {
	query, err := parseMentionSuggestionsQuery(r)
	if err != nil {
		return nil, 0, err
	}
	users, err := api.mentionSuggestionUsers(r.Context(), actor, query)
	if err != nil {
		return nil, 0, err
	}
	issues, err := api.mentionSuggestionIssues(r.Context(), actor, query)
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{
		"mentionSuggestions": map[string]any{
			"users":  users,
			"issues": issues,
		},
	}, 200, nil
}

func (api *notificationsAPI) mentionSuggestionUsers(ctx context.Context, actor notificationsActor, query mentionSuggestionsQuery) ([]map[string]any, error) {
	args := []any{actor.organizationID}
	where := []string{"m.organization_id = $1", activeOrgMembershipSQL}
	if query.q != "" {
		pattern := "%" + query.q + "%"
		args = append(args, pattern)
		n := len(args)
		where = append(where, fmt.Sprintf(
			`(u.email ilike $%d or u.first_name ilike $%d or u.last_name ilike $%d or (u.first_name || ' ' || u.last_name) ilike $%d)`,
			n, n, n, n))
	}
	args = append(args, query.limit)

	rows, err := api.pool.Query(ctx, `
        select u.id, u.first_name, u.last_name, u.email, u.avatar_url
        from organization_memberships m
        join users u on u.id = m.user_id
        where `+strings.Join(where, " and ")+`
        order by u.first_name, u.last_name, u.email
        limit $`+strconv.Itoa(len(args)), args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	users := []map[string]any{}
	for rows.Next() {
		var id string
		var first, last, email, avatar *string
		if err := rows.Scan(&id, &first, &last, &email, &avatar); err != nil {
			return nil, err
		}
		display := trimSpaceJoin(stringFromPtr(first), stringFromPtr(last))
		if display == "" {
			display = stringFromPtr(email)
		}
		if display == "" {
			display = id
		}
		users = append(users, map[string]any{
			"userId":      id,
			"displayName": display,
			"email":       stringFromPtr(email),
			"avatarUrl":   avatar,
		})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return users, nil
}

func (api *notificationsAPI) mentionSuggestionIssues(ctx context.Context, actor notificationsActor, query mentionSuggestionsQuery) ([]map[string]any, error) {
	orgWide := actor.canReadAllTeams()
	args := []any{actor.organizationID, orgWide, actor.userID}
	where := []string{"i.organization_id = $1", formatQaProjectTeamAccessSQL(2, 3, 1)}
	if query.projectID != "" {
		args = append(args, query.projectID)
		where = append(where, fmt.Sprintf("i.project_id = $%d", len(args)))
	}
	if query.issueID != "" {
		args = append(args, query.issueID)
		where = append(where, fmt.Sprintf("i.id != $%d", len(args)))
	}
	if query.q != "" {
		pattern := "%" + query.q + "%"
		args = append(args, pattern)
		n := len(args)
		where = append(where, fmt.Sprintf("(i.title ilike $%d or i.external_ref ilike $%d)", n, n))
	}
	args = append(args, query.limit)

	rows, err := api.pool.Query(ctx, `
        select i.id, i.project_id, i.external_ref, i.title, i.status
        from issue_sheet_issues i
        join projects p on p.id = i.project_id
        where `+strings.Join(where, " and ")+`
        order by i.updated_at asc
        limit $`+strconv.Itoa(len(args)), args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	issues := []map[string]any{}
	for rows.Next() {
		var id, projectID, title, status string
		var externalRef *string
		if err := rows.Scan(&id, &projectID, &externalRef, &title, &status); err != nil {
			return nil, err
		}
		issues = append(issues, map[string]any{
			"issueId":    id,
			"projectId":  projectID,
			"displayKey": mentionIssueDisplayKey(id, externalRef),
			"title":      title,
			"status":     status,
		})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return issues, nil
}

func mentionIssueDisplayKey(id string, externalRef *string) string {
	if externalRef != nil && strings.TrimSpace(*externalRef) != "" {
		return strings.TrimSpace(*externalRef)
	}
	clean := strings.ToUpper(strings.ReplaceAll(id, "-", ""))
	if len(clean) > 8 {
		clean = clean[:8]
	}
	return clean
}
