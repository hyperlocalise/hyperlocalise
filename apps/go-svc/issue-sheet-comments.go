package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

func canMutateIssueComment(authorUserID, actorUserID, role string) bool {
	return authorUserID == actorUserID || role == "admin"
}

type createCommentBody struct {
	Body              string   `json:"body"`
	ParentID          *string  `json:"parentId"`
	MentionedUserIDs  []string `json:"mentionedUserIds"`
	MentionedIssueIDs []string `json:"mentionedIssueIds"`
}

type updateCommentBody struct {
	Body              string   `json:"body"`
	MentionedUserIDs  []string `json:"mentionedUserIds"`
	MentionedIssueIDs []string `json:"mentionedIssueIds"`
}

func (api *issueSheetAPI) createComment(ctx context.Context, actor issueSheetActor, project issueSheetProject, issueRef string, r *http.Request) (any, int, error) {
	var body createCommentBody
	if err := readIssueSheetBody(r, &body); err != nil {
		return nil, 0, err
	}
	if strings.TrimSpace(body.Body) == "" {
		return nil, 0, issueSheetFailure(400, "invalid_issue_comment_payload", "Invalid issue comment payload")
	}
	issueID, err := api.resolveIssueID(ctx, actor.organizationID, project.ID, issueRef)
	if err != nil {
		return nil, 0, err
	}

	parentPath := ""
	depth := 0
	if body.ParentID != nil && *body.ParentID != "" {
		var parentDepth int
		err := api.pool.QueryRow(ctx, `
            select path, depth from issue_sheet_comments
            where id = $1 and issue_id = $2 and organization_id = $3 and project_id = $4`,
			*body.ParentID, issueID, actor.organizationID, project.ID).Scan(&parentPath, &parentDepth)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, 0, issueSheetFailure(400, "parent_not_found", "Parent comment not found")
		}
		if err != nil {
			return nil, 0, err
		}
		depth = parentDepth + 1
	}

	mentionedUsers, _ := json.Marshal(uniqueStrings(body.MentionedUserIDs))
	mentionedIssues, _ := json.Marshal(uniqueStrings(body.MentionedIssueIDs))

	tx, err := api.pool.Begin(ctx)
	if err != nil {
		return nil, 0, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var commentID string
	err = tx.QueryRow(ctx, `
        insert into issue_sheet_comments (
            organization_id, project_id, issue_id, parent_id, path, depth,
            author_user_id, body, mentioned_user_ids, mentioned_issue_ids
        ) values ($1, $2, $3, $4, 'pending', $5, $6, $7, $8::jsonb, $9::jsonb)
        returning id`,
		actor.organizationID, project.ID, issueID, body.ParentID, depth,
		actor.userID, body.Body, string(mentionedUsers), string(mentionedIssues),
	).Scan(&commentID)
	if err != nil {
		return nil, 0, err
	}

	segmentExpr := `lpad(((extract(epoch from created_at) * 1000000)::bigint)::text, 20, '0') || '_' || id::text`
	if parentPath != "" {
		if _, err := tx.Exec(ctx, `
            update issue_sheet_comments
            set path = $2 || '.' || `+segmentExpr+`
            where id = $1`, commentID, parentPath); err != nil {
			return nil, 0, err
		}
	} else {
		if _, err := tx.Exec(ctx, `
            update issue_sheet_comments
            set path = `+segmentExpr+`
            where id = $1`, commentID); err != nil {
			return nil, 0, err
		}
	}

	if _, err := tx.Exec(ctx, `
        insert into issue_sheet_subscriptions (organization_id, project_id, issue_id, user_id)
        values ($1, $2, $3, $4)
        on conflict do nothing`,
		actor.organizationID, project.ID, issueID, actor.userID); err != nil {
		return nil, 0, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, 0, err
	}

	comment, err := api.loadCommentByID(ctx, actor, commentID)
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"issueComment": comment}, 201, nil
}

func uniqueStrings(values []string) []string {
	seen := map[string]struct{}{}
	out := []string{}
	for _, v := range values {
		v = strings.TrimSpace(v)
		if v == "" {
			continue
		}
		if _, ok := seen[v]; ok {
			continue
		}
		seen[v] = struct{}{}
		out = append(out, v)
	}
	return out
}

func (api *issueSheetAPI) updateComment(ctx context.Context, actor issueSheetActor, project issueSheetProject, issueRef, commentID string, r *http.Request) (any, int, error) {
	var body updateCommentBody
	if err := readIssueSheetBody(r, &body); err != nil {
		return nil, 0, err
	}
	if strings.TrimSpace(body.Body) == "" {
		return nil, 0, issueSheetFailure(400, "invalid_issue_comment_payload", "Invalid issue comment payload")
	}
	issueID, err := api.resolveIssueID(ctx, actor.organizationID, project.ID, issueRef)
	if err != nil {
		return nil, 0, err
	}
	var authorUserID *string
	err = api.pool.QueryRow(ctx, `
        select author_user_id from issue_sheet_comments
        where id = $1 and issue_id = $2 and organization_id = $3 and project_id = $4`,
		commentID, issueID, actor.organizationID, project.ID).Scan(&authorUserID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, 0, issueSheetFailure(404, "comment_not_found", "Comment not found")
	}
	if err != nil {
		return nil, 0, err
	}
	author := ""
	if authorUserID != nil {
		author = *authorUserID
	}
	if !canMutateIssueComment(author, actor.userID, actor.role) {
		return nil, 0, issueSheetFailure(403, "forbidden", "Not allowed to modify this comment")
	}
	mentionedUsers, _ := json.Marshal(uniqueStrings(body.MentionedUserIDs))
	mentionedIssues, _ := json.Marshal(uniqueStrings(body.MentionedIssueIDs))
	_, err = api.pool.Exec(ctx, `
        update issue_sheet_comments
        set body = $5, mentioned_user_ids = $6::jsonb, mentioned_issue_ids = $7::jsonb, updated_at = now()
        where id = $1 and issue_id = $2 and organization_id = $3 and project_id = $4`,
		commentID, issueID, actor.organizationID, project.ID, body.Body, string(mentionedUsers), string(mentionedIssues))
	if err != nil {
		return nil, 0, err
	}
	comment, err := api.loadCommentByID(ctx, actor, commentID)
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"issueComment": comment}, 200, nil
}

func (api *issueSheetAPI) deleteComment(ctx context.Context, actor issueSheetActor, project issueSheetProject, issueRef, commentID string) (any, int, error) {
	issueID, err := api.resolveIssueID(ctx, actor.organizationID, project.ID, issueRef)
	if err != nil {
		return nil, 0, err
	}
	var authorUserID *string
	err = api.pool.QueryRow(ctx, `
        select author_user_id from issue_sheet_comments
        where id = $1 and issue_id = $2 and organization_id = $3 and project_id = $4`,
		commentID, issueID, actor.organizationID, project.ID).Scan(&authorUserID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, 0, issueSheetFailure(404, "comment_not_found", "Comment not found")
	}
	if err != nil {
		return nil, 0, err
	}
	author := ""
	if authorUserID != nil {
		author = *authorUserID
	}
	if !canMutateIssueComment(author, actor.userID, actor.role) {
		return nil, 0, issueSheetFailure(403, "forbidden", "Not allowed to modify this comment")
	}
	tag, err := api.pool.Exec(ctx, `
        delete from issue_sheet_comments
        where id = $1 and issue_id = $2 and organization_id = $3 and project_id = $4`,
		commentID, issueID, actor.organizationID, project.ID)
	if err != nil {
		return nil, 0, err
	}
	if tag.RowsAffected() == 0 {
		return nil, 0, issueSheetFailure(404, "comment_not_found", "Comment not found")
	}
	return nil, 204, nil
}

func (api *issueSheetAPI) loadCommentByID(ctx context.Context, actor issueSheetActor, commentID string) (map[string]any, error) {
	var (
		id, organizationID, projectID, issueID, path, body string
		parentID, authorUserID                             *string
		depth                                              int
		mentionedUsersRaw, mentionedIssuesRaw              []byte
		createdAt, updatedAt                               time.Time
		firstName, lastName, email, avatarURL              *string
	)
	err := api.pool.QueryRow(ctx, `
        select c.id, c.organization_id, c.project_id, c.issue_id, c.parent_id, c.path, c.depth, c.body,
               c.author_user_id, c.mentioned_user_ids, c.mentioned_issue_ids, c.created_at, c.updated_at,
               u.first_name, u.last_name, u.email, u.avatar_url
        from issue_sheet_comments c
        left join users u on u.id = c.author_user_id
        where c.id = $1`, commentID).Scan(
		&id, &organizationID, &projectID, &issueID, &parentID, &path, &depth, &body,
		&authorUserID, &mentionedUsersRaw, &mentionedIssuesRaw, &createdAt, &updatedAt,
		&firstName, &lastName, &email, &avatarURL,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return mapCommentRow(actor, id, organizationID, projectID, issueID, parentID, path, depth, body, authorUserID, mentionedUsersRaw, mentionedIssuesRaw, createdAt, updatedAt, firstName, lastName, email, avatarURL), nil
}

func mapCommentRow(
	actor issueSheetActor,
	id, organizationID, projectID, issueID string,
	parentID *string,
	path string,
	depth int,
	body string,
	authorUserID *string,
	mentionedUsersRaw, mentionedIssuesRaw []byte,
	createdAt, updatedAt time.Time,
	firstName, lastName, email, avatarURL *string,
) map[string]any {
	var mentionedUsers, mentionedIssues []string
	_ = json.Unmarshal(mentionedUsersRaw, &mentionedUsers)
	_ = json.Unmarshal(mentionedIssuesRaw, &mentionedIssues)
	if mentionedUsers == nil {
		mentionedUsers = []string{}
	}
	if mentionedIssues == nil {
		mentionedIssues = []string{}
	}
	var author any
	authorID := ""
	if authorUserID != nil {
		authorID = *authorUserID
		display := strings.TrimSpace(stringFromPtr(firstName) + " " + stringFromPtr(lastName))
		if display == "" {
			display = stringFromPtr(email)
		}
		if display == "" {
			display = "Unknown"
		}
		author = map[string]any{
			"userId":      authorID,
			"displayName": display,
			"email":       email,
			"avatarUrl":   avatarURL,
		}
	}
	canMutate := canMutateIssueComment(authorID, actor.userID, actor.role)
	return map[string]any{
		"id":                id,
		"issueId":           issueID,
		"projectId":         projectID,
		"organizationId":    organizationID,
		"parentId":          parentID,
		"path":              path,
		"depth":             depth,
		"body":              body,
		"author":            author,
		"mentionedUserIds":  mentionedUsers,
		"mentionedIssueIds": mentionedIssues,
		"createdAt":         formatIssueSheetTime(createdAt),
		"updatedAt":         formatIssueSheetTime(updatedAt),
		"canEdit":           canMutate,
		"canDelete":         canMutate,
	}
}
