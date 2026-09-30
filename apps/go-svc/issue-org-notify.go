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

func subscriberUserIDs(ctx context.Context, db dictionaryDB, organizationID, projectID, issueID string) ([]string, error) {
	rows, err := db.Query(ctx, `
        select user_id from issue_sheet_subscriptions
        where organization_id = $1 and project_id = $2 and issue_id = $3`,
		organizationID, projectID, issueID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var userID string
		if err := rows.Scan(&userID); err != nil {
			return nil, err
		}
		ids = append(ids, userID)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return ids, nil
}

func resolveAccessibleRecipients(ctx context.Context, db dictionaryDB, organizationID, projectID, actorUserID string, candidateUserIDs []string) ([]string, error) {
	seen := map[string]bool{}
	recipients := make([]string, 0, len(candidateUserIDs))
	for _, userID := range candidateUserIDs {
		if userID == "" || userID == actorUserID || seen[userID] {
			continue
		}
		seen[userID] = true
		ok, err := userHasIssueProjectAccess(ctx, db, organizationID, projectID, userID)
		if err != nil {
			return nil, err
		}
		if ok {
			recipients = append(recipients, userID)
		}
	}
	return recipients, nil
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

func (api *issueSheetAPI) notifyStatusChanged(ctx context.Context, db dictionaryDB, organizationID, projectID, issueID, actorUserID, issueTitle, previousStatus, nextStatus string) error {
	subscribers, err := subscriberUserIDs(ctx, db, organizationID, projectID, issueID)
	if err != nil {
		return err
	}
	recipients, err := resolveAccessibleRecipients(ctx, db, organizationID, projectID, actorUserID, subscribers)
	if err != nil {
		return err
	}
	if len(recipients) == 0 {
		return nil
	}
	bucket := notificationDedupeBucket()
	rows := make([]notificationRow, 0, len(recipients))
	for _, recipient := range recipients {
		rows = append(rows, notificationRow{
			organizationID:  organizationID,
			projectID:       projectID,
			issueID:         issueID,
			recipientUserID: recipient,
			notifType:       "status_changed",
			actorUserID:     actorUserID,
			payload: map[string]any{
				"issueTitle":     issueTitle,
				"projectId":      projectID,
				"previousStatus": previousStatus,
				"nextStatus":     nextStatus,
			},
			dedupeKey: fmt.Sprintf("status:%s:%s:%d", issueID, nextStatus, bucket),
		})
	}
	return upsertNotifications(ctx, db, rows)
}

func (api *issueSheetAPI) notifyAssigned(ctx context.Context, db dictionaryDB, organizationID, projectID, issueID, actorUserID, issueTitle, assigneeUserID string) error {
	recipients, err := resolveAccessibleRecipients(ctx, db, organizationID, projectID, actorUserID, []string{assigneeUserID})
	if err != nil {
		return err
	}
	if len(recipients) == 0 {
		return nil
	}
	rows := make([]notificationRow, 0, 1)
	for _, recipient := range recipients {
		rows = append(rows, notificationRow{
			organizationID:  organizationID,
			projectID:       projectID,
			issueID:         issueID,
			recipientUserID: recipient,
			notifType:       "assigned",
			actorUserID:     actorUserID,
			payload: map[string]any{
				"issueTitle":         issueTitle,
				"projectId":          projectID,
				"nextAssigneeUserId": assigneeUserID,
			},
			dedupeKey: fmt.Sprintf("assigned:%s:%s", issueID, assigneeUserID),
		})
	}
	return upsertNotifications(ctx, db, rows)
}

func (api *issueSheetAPI) notifyAssigneeChanged(ctx context.Context, db dictionaryDB, organizationID, projectID, issueID, actorUserID, issueTitle string, previousAssignee, nextAssignee *string) error {
	var nextAssigneeID string
	if nextAssignee != nil {
		nextAssigneeID = strings.TrimSpace(*nextAssignee)
	}
	if nextAssigneeID != "" {
		if err := api.notifyAssigned(ctx, db, organizationID, projectID, issueID, actorUserID, issueTitle, nextAssigneeID); err != nil {
			return err
		}
	}

	subscribers, err := subscriberUserIDs(ctx, db, organizationID, projectID, issueID)
	if err != nil {
		return err
	}
	candidates := make([]string, 0, len(subscribers)+1)
	candidates = append(candidates, subscribers...)
	if previousAssignee != nil {
		if previousID := strings.TrimSpace(*previousAssignee); previousID != "" {
			candidates = append(candidates, previousID)
		}
	}
	filtered := candidates[:0:0]
	for _, candidate := range candidates {
		if candidate != nextAssigneeID {
			filtered = append(filtered, candidate)
		}
	}

	recipients, err := resolveAccessibleRecipients(ctx, db, organizationID, projectID, actorUserID, filtered)
	if err != nil {
		return err
	}
	if len(recipients) == 0 {
		return nil
	}
	bucket := notificationDedupeBucket()
	payload := map[string]any{
		"issueTitle":             issueTitle,
		"projectId":              projectID,
		"previousAssigneeUserId": nullableAny(previousAssignee),
		"nextAssigneeUserId":     nullableAny(nextAssignee),
	}
	dedupeKey := fmt.Sprintf("assignee_changed:%s:%s:%s:%d", issueID, assigneeDedupePart(previousAssignee), assigneeDedupePart(nextAssignee), bucket)
	rows := make([]notificationRow, 0, len(recipients))
	for _, recipient := range recipients {
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
