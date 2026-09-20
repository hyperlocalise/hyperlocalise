package main

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

func (api *issueSheetAPI) listSubscriptions(ctx context.Context, actor issueSheetActor, project issueSheetProject, issueRef string) (any, int, error) {
	issueID, err := api.resolveIssueID(ctx, actor.organizationID, project.ID, issueRef)
	if err != nil {
		return nil, 0, err
	}
	rows, err := api.pool.Query(ctx, `
        select s.user_id, u.first_name, u.last_name, u.email, u.avatar_url
        from issue_sheet_subscriptions s
        join users u on u.id = s.user_id
        where s.organization_id = $1 and s.project_id = $2 and s.issue_id = $3
        order by s.created_at asc`, actor.organizationID, project.ID, issueID)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	subscribers := []map[string]any{}
	for rows.Next() {
		var userID string
		var firstName, lastName, email, avatarURL *string
		if err := rows.Scan(&userID, &firstName, &lastName, &email, &avatarURL); err != nil {
			return nil, 0, err
		}
		display := stringsTrimJoin(firstName, lastName)
		if display == "" {
			display = stringFromPtr(email)
		}
		if display == "" {
			display = userID
		}
		subscribers = append(subscribers, map[string]any{
			"userId":      userID,
			"displayName": display,
			"avatarUrl":   avatarURL,
		})
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	return map[string]any{"subscribers": subscribers}, 200, nil
}

func stringsTrimJoin(first, last *string) string {
	return trimSpaceJoin(stringFromPtr(first), stringFromPtr(last))
}

func trimSpaceJoin(a, b string) string {
	if a == "" {
		return b
	}
	if b == "" {
		return a
	}
	return a + " " + b
}

func (api *issueSheetAPI) watchIssue(ctx context.Context, actor issueSheetActor, project issueSheetProject, issueRef string) (any, int, error) {
	issueID, err := api.resolveIssueID(ctx, actor.organizationID, project.ID, issueRef)
	if err != nil {
		return nil, 0, err
	}
	_, err = api.pool.Exec(ctx, `
        insert into issue_sheet_subscriptions (organization_id, project_id, issue_id, user_id)
        values ($1, $2, $3, $4)
        on conflict do nothing`,
		actor.organizationID, project.ID, issueID, actor.userID)
	if err != nil {
		return nil, 0, err
	}
	var createdAt time.Time
	err = api.pool.QueryRow(ctx, `
        select created_at from issue_sheet_subscriptions
        where organization_id = $1 and project_id = $2 and issue_id = $3 and user_id = $4`,
		actor.organizationID, project.ID, issueID, actor.userID).Scan(&createdAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, 0, missingIssueSheetIssue()
	}
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{
		"subscription": map[string]any{
			"issueId":   issueID,
			"userId":    actor.userID,
			"createdAt": formatIssueSheetTime(createdAt),
		},
	}, 201, nil
}

func (api *issueSheetAPI) unwatchIssue(ctx context.Context, actor issueSheetActor, project issueSheetProject, issueRef string) (any, int, error) {
	issueID, err := api.resolveIssueID(ctx, actor.organizationID, project.ID, issueRef)
	if err != nil {
		return nil, 0, err
	}
	_, err = api.pool.Exec(ctx, `
        delete from issue_sheet_subscriptions
        where organization_id = $1 and project_id = $2 and issue_id = $3 and user_id = $4`,
		actor.organizationID, project.ID, issueID, actor.userID)
	if err != nil {
		return nil, 0, err
	}
	return nil, 204, nil
}
