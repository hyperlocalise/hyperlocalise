package main

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"
)

func (api *issueSheetAPI) listFeed(ctx context.Context, actor issueSheetActor, project issueSheetProject, issueRef string, r *http.Request) (any, int, error) {
	issueID, err := api.resolveIssueID(ctx, actor.organizationID, project.ID, issueRef)
	if err != nil {
		return nil, 0, err
	}
	limit := 50
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

	items := []map[string]any{}
	if mode == "all" || mode == "comments" {
		rows, err := api.pool.Query(ctx, `
            select c.id, c.body, c.parent_id, c.path, c.depth, c.author_user_id, c.created_at, c.updated_at,
                   u.first_name, u.last_name, u.email, u.avatar_url
            from issue_sheet_comments c
            left join users u on u.id = c.author_user_id
            where c.organization_id=$1 and c.project_id=$2 and c.issue_id=$3
            order by c.path asc
            limit $4`, actor.organizationID, project.ID, issueID, limit)
		if err != nil {
			return nil, 0, err
		}
		for rows.Next() {
			var id, body, path string
			var parentID *string
			var depth int
			var authorID *string
			var created, updated time.Time
			var first, last, email, avatar *string
			if err := rows.Scan(&id, &body, &parentID, &path, &depth, &authorID, &created, &updated, &first, &last, &email, &avatar); err != nil {
				rows.Close()
				return nil, 0, err
			}
			items = append(items, map[string]any{
				"kind": "comment", "id": id, "body": body, "parentId": parentID, "path": path, "depth": depth,
				"authorUserId":      authorID,
				"authorDisplayName": strings.TrimSpace(stringFromPtr(first) + " " + stringFromPtr(last)),
				"authorAvatarUrl":   avatar,
				"createdAt":         formatIssueSheetTime(created),
				"updatedAt":         formatIssueSheetTime(updated),
			})
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return nil, 0, err
		}
	}
	if mode == "all" {
		rows, err := api.pool.Query(ctx, `
            select a.id, a.type, a.payload, a.actor_user_id, a.created_at,
                   u.first_name, u.last_name, u.email, u.avatar_url
            from issue_sheet_activities a
            left join users u on u.id = a.actor_user_id
            where a.organization_id=$1 and a.project_id=$2 and a.issue_id=$3
            order by a.created_at desc, a.id desc
            limit $4`, actor.organizationID, project.ID, issueID, limit)
		if err != nil {
			return nil, 0, err
		}
		for rows.Next() {
			var id, typ string
			var payload []byte
			var actorID *string
			var created time.Time
			var first, last, email, avatar *string
			if err := rows.Scan(&id, &typ, &payload, &actorID, &created, &first, &last, &email, &avatar); err != nil {
				rows.Close()
				return nil, 0, err
			}
			if len(payload) == 0 {
				payload = []byte(`{}`)
			}
			items = append(items, map[string]any{
				"kind": "activity", "id": id, "type": typ, "payload": json.RawMessage(payload),
				"actorUserId":      actorID,
				"actorDisplayName": strings.TrimSpace(stringFromPtr(first) + " " + stringFromPtr(last)),
				"actorAvatarUrl":   avatar,
				"createdAt":        formatIssueSheetTime(created),
			})
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return nil, 0, err
		}
	}
	return map[string]any{"feed": items, "nextCursor": nil}, 200, nil
}
