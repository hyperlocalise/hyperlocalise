package main

import (
	"context"
	"net/http"
	"strings"
	"time"
)

func (api *notificationsAPI) loadOwnedNotification(ctx context.Context, actor notificationsActor, id string) (map[string]any, error) {
	orgWide := actor.canReadAllTeams()
	rows, err := api.pool.Query(ctx, `
        select n.id, n.organization_id, n.project_id, n.issue_id, n.qa_run_id, n.type, n.payload, n.read_at, n.created_at,
               n.actor_user_id, u.first_name, u.last_name, u.email, u.avatar_url
        from issue_notifications n
        join projects p on p.id = n.project_id
        left join users u on u.id = n.actor_user_id
        where n.organization_id = $1 and n.recipient_user_id = $2 and n.id = $3
        and `+formatQaProjectTeamAccessSQL(4, 2, 1)+`
        limit 1`, actor.organizationID, actor.userID, id, orgWide)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, missingNotification()
	}
	notification, err := scanNotificationRow(rows)
	if err != nil {
		return nil, err
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return notification, nil
}

func (api *notificationsAPI) getNotificationHandler(r *http.Request, actor notificationsActor) (any, int, error) {
	id := strings.TrimSpace(r.PathValue("notificationId"))
	if !isLegacyIssueUUID(id) {
		return nil, 0, invalidNotificationID()
	}
	notification, err := api.loadOwnedNotification(r.Context(), actor, id)
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"notification": notification}, 200, nil
}

func (api *notificationsAPI) markReadHandler(r *http.Request, actor notificationsActor) (any, int, error) {
	id := strings.TrimSpace(r.PathValue("notificationId"))
	if !isLegacyIssueUUID(id) {
		return nil, 0, invalidNotificationID()
	}
	existing, err := api.loadOwnedNotification(r.Context(), actor, id)
	if err != nil {
		return nil, 0, err
	}

	var readAt time.Time
	if err := api.pool.QueryRow(r.Context(), `
        update issue_notifications
        set read_at = coalesce(read_at, $1)
        where id = $2 and recipient_user_id = $3
        returning read_at`,
		time.Now().UTC(), id, actor.userID,
	).Scan(&readAt); err != nil {
		return nil, 0, err
	}
	return map[string]any{"notification": map[string]any{"id": existing["id"], "readAt": readAt}}, 200, nil
}

func (api *notificationsAPI) readAllHandler(r *http.Request, actor notificationsActor) (any, int, error) {
	orgWide := actor.canReadAllTeams()
	rows, err := api.pool.Query(r.Context(), `
        select n.id
        from issue_notifications n
        join projects p on p.id = n.project_id
        where n.organization_id = $1 and n.recipient_user_id = $2 and `+formatQaProjectTeamAccessSQL(3, 2, 1)+`
        and n.read_at is null`,
		actor.organizationID, actor.userID, orgWide)
	if err != nil {
		return nil, 0, err
	}
	ids := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return nil, 0, err
		}
		ids = append(ids, id)
	}
	rowsErr := rows.Err()
	rows.Close()
	if rowsErr != nil {
		return nil, 0, rowsErr
	}
	if len(ids) == 0 {
		return map[string]any{"markedCount": 0}, 200, nil
	}

	tag, err := api.pool.Exec(r.Context(), `
        update issue_notifications set read_at = now()
        where recipient_user_id = $1 and id = any($2::uuid[])`,
		actor.userID, ids)
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"markedCount": int(tag.RowsAffected())}, 200, nil
}
