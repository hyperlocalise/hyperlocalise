package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

const notificationDedupeBucketMillis = int64(5 * time.Minute / time.Millisecond)

type notificationRow struct {
	organizationID  string
	projectID       string
	issueID         string
	recipientUserID string
	notifType       string
	actorUserID     string
	payload         map[string]any
	dedupeKey       string
}

func upsertNotifications(ctx context.Context, db dictionaryDB, rows []notificationRow) error {
	for _, row := range rows {
		payload, err := json.Marshal(row.payload)
		if err != nil {
			return err
		}
		if _, err := db.Exec(ctx, `
            insert into issue_notifications (
                organization_id, project_id, recipient_user_id, actor_user_id, issue_id, type, dedupe_key, payload
            ) values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
            on conflict (recipient_user_id, dedupe_key) do update set
                type = excluded.type,
                actor_user_id = excluded.actor_user_id,
                payload = excluded.payload,
                read_at = null,
                emailed_at = null,
                created_at = now()`,
			row.organizationID, row.projectID, row.recipientUserID, row.actorUserID, row.issueID,
			row.notifType, row.dedupeKey, string(payload),
		); err != nil {
			return err
		}
	}
	return nil
}

func userHasIssueProjectAccess(ctx context.Context, db dictionaryDB, organizationID, projectID, userID string) (bool, error) {
	var allowed bool
	err := db.QueryRow(ctx, `
        select exists(
            select 1
            from organization_memberships m
            join projects p on p.id = $3 and p.organization_id = $1
            where m.organization_id = $1
              and m.user_id = $2
              and `+activeOrgMembershipSQL+`
              and (
                m.role in ('admin', 'localization_manager')
                or exists (
                    select 1
                    from team_memberships tm
                    join teams t on t.id = tm.team_id
                    where tm.user_id = $2
                      and t.organization_id = $1
                      and (t.id = p.team_id or (p.team_id is null and t.slug = 'default'))
                )
              )
        )`, organizationID, userID, projectID).Scan(&allowed)
	return allowed, err
}

func accessibleWatchers(ctx context.Context, db dictionaryDB, organizationID, projectID, issueID string) ([]string, error) {
	rows, err := db.Query(ctx, `
        select user_id from issue_sheet_subscriptions
        where organization_id = $1 and project_id = $2 and issue_id = $3`,
		organizationID, projectID, issueID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var all []string
	for rows.Next() {
		var userID string
		if err := rows.Scan(&userID); err != nil {
			return nil, err
		}
		all = append(all, userID)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	accessible := make([]string, 0, len(all))
	for _, userID := range all {
		ok, err := userHasIssueProjectAccess(ctx, db, organizationID, projectID, userID)
		if err != nil {
			return nil, err
		}
		if ok {
			accessible = append(accessible, userID)
		}
	}
	return accessible, nil
}

func notificationDedupeBucket() int64 {
	return time.Now().UTC().UnixMilli() / notificationDedupeBucketMillis
}

func assigneeDedupePart(userID *string) string {
	if userID == nil || strings.TrimSpace(*userID) == "" {
		return "none"
	}
	return *userID
}

func nullableAny(v *string) any {
	if v == nil {
		return nil
	}
	return *v
}

func (api *issueSheetAPI) notifyStatusChanged(ctx context.Context, db dictionaryDB, organizationID, projectID, issueID, actorUserID, previousStatus, nextStatus string) error {
	watchers, err := accessibleWatchers(ctx, db, organizationID, projectID, issueID)
	if err != nil {
		return err
	}
	bucket := notificationDedupeBucket()
	rows := make([]notificationRow, 0, len(watchers))
	for _, recipient := range watchers {
		rows = append(rows, notificationRow{
			organizationID:  organizationID,
			projectID:       projectID,
			issueID:         issueID,
			recipientUserID: recipient,
			notifType:       "status_changed",
			actorUserID:     actorUserID,
			payload: map[string]any{
				"previousStatus": previousStatus,
				"nextStatus":     nextStatus,
			},
			dedupeKey: fmt.Sprintf("status:%s:%s:%d", issueID, nextStatus, bucket),
		})
	}
	return upsertNotifications(ctx, db, rows)
}

func (api *issueSheetAPI) notifyAssigneeChanged(ctx context.Context, db dictionaryDB, organizationID, projectID, issueID, actorUserID string, previousAssignee, nextAssignee *string) error {
	watchers, err := accessibleWatchers(ctx, db, organizationID, projectID, issueID)
	if err != nil {
		return err
	}
	bucket := notificationDedupeBucket()
	rows := make([]notificationRow, 0, len(watchers)+1)

	var newAssignee string
	if nextAssignee != nil && strings.TrimSpace(*nextAssignee) != "" {
		newAssignee = strings.TrimSpace(*nextAssignee)
		ok, err := userHasIssueProjectAccess(ctx, db, organizationID, projectID, newAssignee)
		if err != nil {
			return err
		}
		if ok {
			rows = append(rows, notificationRow{
				organizationID:  organizationID,
				projectID:       projectID,
				issueID:         issueID,
				recipientUserID: newAssignee,
				notifType:       "assigned",
				actorUserID:     actorUserID,
				payload:         map[string]any{"issueId": issueID},
				dedupeKey:       fmt.Sprintf("assigned:%s:%s", issueID, newAssignee),
			})
		}
	}

	payload := map[string]any{
		"previousAssigneeUserId": nullableAny(previousAssignee),
		"nextAssigneeUserId":     nullableAny(nextAssignee),
	}
	dedupeKey := fmt.Sprintf("assignee_changed:%s:%s:%s:%d", issueID, assigneeDedupePart(previousAssignee), assigneeDedupePart(nextAssignee), bucket)
	for _, recipient := range watchers {
		if recipient == newAssignee {
			continue
		}
		rows = append(rows, notificationRow{
			organizationID:  organizationID,
			projectID:       projectID,
			issueID:         issueID,
			recipientUserID: recipient,
			notifType:       "assignee_changed",
			actorUserID:     actorUserID,
			payload:         payload,
			dedupeKey:       dedupeKey,
		})
	}
	return upsertNotifications(ctx, db, rows)
}

func (api *issueSheetAPI) safeNotify(r *http.Request, label string, fn func() error) {
	if err := fn(); err != nil {
		logRequestFailure(r, "issue_org_bulk_notify_failed", label, err)
	}
}
