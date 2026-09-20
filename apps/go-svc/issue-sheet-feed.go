package main

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"
)

type feedCursor struct {
	createdAt string
	sortRank  int
	id        string
	issueID   string
}

func parseFeedCursor(raw string) (feedCursor, bool) {
	parts := strings.Split(raw, "|")
	if len(parts) != 3 && len(parts) != 4 {
		return feedCursor{}, false
	}
	createdAt := parts[0]
	// Accept Postgres timestamptz::text and RFC3339 forms; the query casts to timestamptz.
	if createdAt == "" || !strings.ContainsAny(createdAt, "0123456789") {
		return feedCursor{}, false
	}
	if parts[1] != "0" && parts[1] != "1" {
		return feedCursor{}, false
	}
	sortRank, _ := strconv.Atoi(parts[1])
	id := parts[2]
	if !isLegacyIssueUUID(id) {
		return feedCursor{}, false
	}
	cursor := feedCursor{createdAt: createdAt, sortRank: sortRank, id: id}
	if len(parts) == 4 {
		if !isLegacyIssueUUID(parts[3]) {
			return feedCursor{}, false
		}
		cursor.issueID = parts[3]
	}
	return cursor, true
}

func encodeFeedCursor(c feedCursor) string {
	cursor := c.createdAt + "|" + strconv.Itoa(c.sortRank) + "|" + c.id
	if c.issueID != "" {
		return cursor + "|" + c.issueID
	}
	return cursor
}

func (api *issueSheetAPI) listFeed(ctx context.Context, actor issueSheetActor, project issueSheetProject, issueRef string, r *http.Request) (any, int, error) {
	issueID, err := api.resolveIssueID(ctx, actor.organizationID, project.ID, issueRef)
	if err != nil {
		return nil, 0, err
	}

	limit := 100
	if raw := strings.TrimSpace(r.URL.Query().Get("limit")); raw != "" {
		n, parseErr := strconv.Atoi(raw)
		if parseErr != nil || n < 1 || n > 100 {
			return nil, 0, issueSheetFailure(400, "invalid_issue_sheet_feed_query", "Invalid feed query")
		}
		limit = n
	}
	mode := strings.TrimSpace(r.URL.Query().Get("mode"))
	if mode == "" {
		mode = "all"
	}
	if mode != "all" && mode != "comments" {
		return nil, 0, issueSheetFailure(400, "invalid_issue_sheet_feed_query", "Invalid feed query")
	}
	commentsOnly := mode == "comments"

	var cursor *feedCursor
	if raw := strings.TrimSpace(r.URL.Query().Get("cursor")); raw != "" {
		parsed, ok := parseFeedCursor(raw)
		if !ok {
			return nil, 0, issueSheetFailure(400, "invalid_issue_sheet_feed_cursor", "Invalid feed cursor")
		}
		if parsed.issueID != "" && parsed.issueID != issueID {
			return nil, 0, issueSheetFailure(400, "invalid_issue_sheet_feed_cursor", "Invalid feed cursor")
		}
		if commentsOnly && (parsed.sortRank != 1 || parsed.issueID == "") {
			return nil, 0, issueSheetFailure(400, "invalid_issue_sheet_feed_cursor", "Invalid feed cursor")
		}
		cursor = &parsed
	}

	total, err := api.countFeedItems(ctx, actor.organizationID, project.ID, issueID, commentsOnly)
	if err != nil {
		return nil, 0, err
	}

	pageRows, err := api.queryFeedPage(ctx, actor.organizationID, project.ID, issueID, commentsOnly, cursor, limit+1)
	if err != nil {
		return nil, 0, err
	}
	hasMore := len(pageRows) > limit
	if hasMore {
		pageRows = pageRows[:limit]
	}

	activityIDs := []string{}
	rootCommentIDs := []string{}
	for _, row := range pageRows {
		if row.kind == "activity" {
			activityIDs = append(activityIDs, row.id)
		} else {
			rootCommentIDs = append(rootCommentIDs, row.id)
		}
	}

	activitiesByID, err := api.loadFeedActivities(ctx, actor, activityIDs)
	if err != nil {
		return nil, 0, err
	}
	threadsByID, err := api.loadFeedCommentThreads(ctx, actor, project.ID, issueID, rootCommentIDs)
	if err != nil {
		return nil, 0, err
	}

	items := make([]map[string]any, 0, len(pageRows))
	for _, row := range pageRows {
		if row.kind == "activity" {
			if activity, ok := activitiesByID[row.id]; ok {
				items = append(items, map[string]any{"kind": "activity", "activity": activity})
			}
			continue
		}
		if thread, ok := threadsByID[row.id]; ok {
			items = append(items, thread)
		}
	}

	var nextCursor any
	if hasMore && len(pageRows) > 0 {
		last := pageRows[len(pageRows)-1]
		encoded := encodeFeedCursor(feedCursor{
			createdAt: last.createdAtCursor,
			sortRank:  last.sortRank,
			id:        last.id,
			issueID: func() string {
				if commentsOnly {
					return issueID
				}
				return ""
			}(),
		})
		nextCursor = encoded
	}

	return map[string]any{
		"items":      items,
		"total":      total,
		"nextCursor": nextCursor,
	}, 200, nil
}

type feedPageRow struct {
	id              string
	kind            string
	createdAtCursor string
	sortRank        int
}

func (api *issueSheetAPI) countFeedItems(ctx context.Context, organizationID, projectID, issueID string, commentsOnly bool) (int, error) {
	var total int
	if commentsOnly {
		err := api.pool.QueryRow(ctx, `
            select count(*)::int
            from issue_sheet_comments
            where organization_id = $1 and project_id = $2 and issue_id = $3 and depth = 0`,
			organizationID, projectID, issueID).Scan(&total)
		return total, err
	}
	err := api.pool.QueryRow(ctx, `
        select (
            (select count(*)::int from issue_sheet_activities
             where organization_id = $1 and project_id = $2 and issue_id = $3)
          + (select count(*)::int from issue_sheet_comments
             where organization_id = $1 and project_id = $2 and issue_id = $3 and depth = 0)
        )::int`, organizationID, projectID, issueID).Scan(&total)
	return total, err
}

func (api *issueSheetAPI) queryFeedPage(
	ctx context.Context,
	organizationID, projectID, issueID string,
	commentsOnly bool,
	cursor *feedCursor,
	limit int,
) ([]feedPageRow, error) {
	args := []any{organizationID, projectID, issueID}
	kindFilter := ""
	if commentsOnly {
		kindFilter = ` and feed.kind = 'comment_thread'`
	}
	cursorFilter := ""
	if cursor != nil {
		args = append(args, cursor.createdAt, cursor.sortRank, cursor.id)
		cursorFilter = ` and (feed.created_at, feed.sort_rank, feed.id) > ($4::timestamptz, $5, $6::uuid)`
	}
	args = append(args, limit)
	limitParam := len(args)

	rows, err := api.pool.Query(ctx, `
        select feed.id::text, feed.kind, feed.created_at_cursor, feed.sort_rank
        from (
            select a.id,
                   'activity'::text as kind,
                   a.created_at,
                   a.created_at::text as created_at_cursor,
                   case when a.type = 'issue_created' then 0 else 1 end as sort_rank
            from issue_sheet_activities a
            where a.organization_id = $1 and a.project_id = $2 and a.issue_id = $3

            union all

            select c.id,
                   'comment_thread'::text as kind,
                   c.created_at,
                   c.created_at::text as created_at_cursor,
                   1 as sort_rank
            from issue_sheet_comments c
            where c.organization_id = $1 and c.project_id = $2 and c.issue_id = $3 and c.depth = 0
        ) as feed
        where true`+kindFilter+cursorFilter+`
        order by feed.created_at asc, feed.sort_rank asc, feed.id asc
        limit $`+strconv.Itoa(limitParam), args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []feedPageRow{}
	for rows.Next() {
		var row feedPageRow
		if err := rows.Scan(&row.id, &row.kind, &row.createdAtCursor, &row.sortRank); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

func (api *issueSheetAPI) loadFeedActivities(ctx context.Context, _ issueSheetActor, ids []string) (map[string]map[string]any, error) {
	out := map[string]map[string]any{}
	if len(ids) == 0 {
		return out, nil
	}
	rows, err := api.pool.Query(ctx, `
        select a.id, a.type, a.payload, a.actor_user_id, a.created_at,
               u.first_name, u.last_name, u.email, u.avatar_url
        from issue_sheet_activities a
        left join users u on u.id = a.actor_user_id
        where a.id = any($1::uuid[])`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id, typ string
		var payload []byte
		var actorID *string
		var created time.Time
		var first, last, email, avatar *string
		if err := rows.Scan(&id, &typ, &payload, &actorID, &created, &first, &last, &email, &avatar); err != nil {
			return nil, err
		}
		activity := map[string]any{
			"id":        id,
			"type":      typ,
			"createdAt": formatIssueSheetTime(created),
			"actor":     nil,
		}
		if actorID != nil {
			display := strings.TrimSpace(stringFromPtr(first) + " " + stringFromPtr(last))
			if display == "" {
				display = stringFromPtr(email)
			}
			if display == "" {
				display = "Unknown"
			}
			activity["actor"] = map[string]any{
				"userId":      *actorID,
				"displayName": display,
				"email":       email,
				"avatarUrl":   avatar,
			}
		}
		if len(payload) > 0 && string(payload) != "null" {
			var fields map[string]any
			if err := json.Unmarshal(payload, &fields); err == nil {
				for key, value := range fields {
					activity[key] = value
				}
			}
		}
		out[id] = activity
	}
	return out, rows.Err()
}

func (api *issueSheetAPI) loadFeedCommentThreads(
	ctx context.Context,
	actor issueSheetActor,
	projectID, issueID string,
	rootIDs []string,
) (map[string]map[string]any, error) {
	out := map[string]map[string]any{}
	if len(rootIDs) == 0 {
		return out, nil
	}

	roots := map[string]map[string]any{}
	rootPaths := map[string]string{}
	rows, err := api.pool.Query(ctx, `
        select c.id, c.organization_id, c.project_id, c.issue_id, c.parent_id, c.path, c.depth,
               c.body, c.author_user_id, c.mentioned_user_ids, c.mentioned_issue_ids,
               c.created_at, c.updated_at, u.first_name, u.last_name, u.email, u.avatar_url
        from issue_sheet_comments c
        left join users u on u.id = c.author_user_id
        where c.id = any($1::uuid[])`, rootIDs)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		comment, path, scanErr := scanFeedComment(rows, actor)
		if scanErr != nil {
			rows.Close()
			return nil, scanErr
		}
		roots[comment["id"].(string)] = comment
		rootPaths[comment["id"].(string)] = path
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, err
	}

	repliesByRoot := map[string][]map[string]any{}
	if len(roots) > 0 {
		likeArgs := make([]any, 0, len(roots)+3)
		likeArgs = append(likeArgs, actor.organizationID, projectID, issueID)
		likeClauses := make([]string, 0, len(roots))
		for _, path := range rootPaths {
			likeArgs = append(likeArgs, path+".%")
			likeClauses = append(likeClauses, "c.path like $"+strconv.Itoa(len(likeArgs)))
		}
		replyRows, replyErr := api.pool.Query(ctx, `
            select c.id, c.organization_id, c.project_id, c.issue_id, c.parent_id, c.path, c.depth,
                   c.body, c.author_user_id, c.mentioned_user_ids, c.mentioned_issue_ids,
                   c.created_at, c.updated_at, u.first_name, u.last_name, u.email, u.avatar_url
            from issue_sheet_comments c
            left join users u on u.id = c.author_user_id
            where c.organization_id = $1 and c.project_id = $2 and c.issue_id = $3
              and c.depth > 0 and (`+strings.Join(likeClauses, " or ")+`)
            order by c.created_at asc, c.id asc`, likeArgs...)
		if replyErr != nil {
			return nil, replyErr
		}
		for replyRows.Next() {
			comment, path, scanErr := scanFeedComment(replyRows, actor)
			if scanErr != nil {
				replyRows.Close()
				return nil, scanErr
			}
			for rootID, rootPath := range rootPaths {
				if strings.HasPrefix(path, rootPath+".") {
					repliesByRoot[rootID] = append(repliesByRoot[rootID], comment)
					break
				}
			}
		}
		err = replyRows.Err()
		replyRows.Close()
		if err != nil {
			return nil, err
		}
	}

	for _, rootID := range rootIDs {
		root, ok := roots[rootID]
		if !ok {
			continue
		}
		replies := repliesByRoot[rootID]
		if replies == nil {
			replies = []map[string]any{}
		}
		out[rootID] = map[string]any{
			"kind":    "comment_thread",
			"root":    root,
			"replies": replies,
		}
	}
	return out, nil
}

func scanFeedComment(rows interface {
	Scan(dest ...any) error
}, actor issueSheetActor,
) (map[string]any, string, error) {
	var (
		id, organizationID, projectID, issueID, path, body string
		parentID, authorUserID                             *string
		depth                                              int
		mentionedUsersRaw, mentionedIssuesRaw              []byte
		createdAt, updatedAt                               time.Time
		firstName, lastName, email, avatarURL              *string
	)
	if err := rows.Scan(
		&id, &organizationID, &projectID, &issueID, &parentID, &path, &depth,
		&body, &authorUserID, &mentionedUsersRaw, &mentionedIssuesRaw,
		&createdAt, &updatedAt, &firstName, &lastName, &email, &avatarURL,
	); err != nil {
		return nil, "", err
	}
	return mapCommentRow(
		actor, id, organizationID, projectID, issueID, parentID, path, depth, body, authorUserID,
		mentionedUsersRaw, mentionedIssuesRaw, createdAt, updatedAt, firstName, lastName, email, avatarURL,
	), path, nil
}
