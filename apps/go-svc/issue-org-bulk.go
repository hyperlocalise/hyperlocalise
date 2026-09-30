package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/rand/v2"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"golang.org/x/sync/errgroup"
)

const (
	issueBulkActionMaxItems    = 100
	issueBulkActionConcurrency = 4
)

type bulkIssueTarget struct {
	IssueID   string `json:"issueId"`
	ProjectID string `json:"projectId"`
}

type bulkIssueActionRequest struct {
	Action         string            `json:"action"`
	Issues         []bulkIssueTarget `json:"issues"`
	AssigneeUserID *string           `json:"assigneeUserId"`
	Status         *string           `json:"status"`
	Priority       *string           `json:"priority"`
	IssueType      *string           `json:"issueType"`
}

func invalidIssueBulkAction() error {
	return issueSheetFailure(400, "invalid_issue_bulk_action", "Invalid issue bulk action")
}

func parseBulkIssueActionRequest(r *http.Request) (bulkIssueActionRequest, error) {
	var body bulkIssueActionRequest
	decoder := json.NewDecoder(r.Body)
	if err := decoder.Decode(&body); err != nil {
		return body, invalidIssueBulkAction()
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		return body, invalidIssueBulkAction()
	}

	switch body.Action {
	case "assign":
		if body.AssigneeUserID == nil || strings.TrimSpace(*body.AssigneeUserID) == "" {
			return body, invalidIssueBulkAction()
		}
	case "unassign":
	case "set_status":
		if body.Status == nil {
			return body, invalidIssueBulkAction()
		}
		switch *body.Status {
		case "open", "in_progress", "resolved", "wont_fix":
		default:
			return body, invalidIssueBulkAction()
		}
	case "set_priority":
		if body.Priority == nil {
			return body, invalidIssueBulkAction()
		}
		switch *body.Priority {
		case "P0", "P1", "P2":
		default:
			return body, invalidIssueBulkAction()
		}
	case "set_issue_type":
		if body.IssueType == nil {
			return body, invalidIssueBulkAction()
		}
		switch *body.IssueType {
		case "general_question", "translation_mistake", "context_request", "source_mistake",
			"glossary_violation", "qa_failure":
		default:
			return body, invalidIssueBulkAction()
		}
	default:
		return body, invalidIssueBulkAction()
	}

	if len(body.Issues) == 0 || len(body.Issues) > issueBulkActionMaxItems {
		return body, invalidIssueBulkAction()
	}
	for _, target := range body.Issues {
		if !isLegacyIssueUUID(target.IssueID) {
			return body, invalidIssueBulkAction()
		}
		if target.ProjectID == "" || len(target.ProjectID) > 128 {
			return body, invalidIssueBulkAction()
		}
	}
	return body, nil
}

func dedupeBulkIssueTargets(targets []bulkIssueTarget) []bulkIssueTarget {
	seen := map[string]bool{}
	out := make([]bulkIssueTarget, 0, len(targets))
	for _, t := range targets {
		key := t.ProjectID + ":" + t.IssueID
		if seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, t)
	}
	return out
}

func (api *issueSheetAPI) bulkIssueActionsHandler(r *http.Request, actor issueSheetActor) (any, int, error) {
	if !actor.canMutateIssues() {
		return nil, 0, issueSheetFailure(403, "forbidden", "Forbidden")
	}
	body, err := parseBulkIssueActionRequest(r)
	if err != nil {
		return nil, 0, err
	}
	targets := dedupeBulkIssueTargets(body.Issues)

	results := make([]map[string]any, len(targets))
	var mu sync.Mutex
	var succeeded, unchanged, failed int

	g := new(errgroup.Group)
	g.SetLimit(issueBulkActionConcurrency)
	for i, target := range targets {
		i, target := i, target
		g.Go(func() error {
			outcome, issue, errCode, errMessage := api.applyBulkIssueAction(r.Context(), r, actor, target, body)
			result := map[string]any{
				"issueId":   target.IssueID,
				"projectId": target.ProjectID,
				"outcome":   outcome,
			}
			if issue != nil {
				result["issue"] = issue
			}
			if errCode != "" {
				result["error"] = map[string]any{"code": errCode, "message": errMessage}
			}
			results[i] = result

			mu.Lock()
			switch outcome {
			case "updated":
				succeeded++
			case "unchanged":
				unchanged++
			default:
				failed++
			}
			mu.Unlock()
			return nil
		})
	}
	_ = g.Wait()

	return map[string]any{
		"bulkAction": map[string]any{
			"action":    body.Action,
			"requested": len(targets),
			"succeeded": succeeded,
			"failed":    failed,
			"unchanged": unchanged,
			"results":   results,
		},
	}, 200, nil
}

const bulkIssueActionMaxAttempts = 5

func bulkIssueActionRetryDelay(attempt int) time.Duration {
	base := time.Duration(attempt) * 4 * time.Millisecond
	jitter := time.Duration(rand.IntN(8)) * time.Millisecond
	return base + jitter
}

func isSerializationFailure(err error) bool {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return pgErr.Code == "40P01" || pgErr.Code == "40001"
	}
	return false
}

func (api *issueSheetAPI) applyBulkIssueAction(ctx context.Context, r *http.Request, actor issueSheetActor, target bulkIssueTarget, body bulkIssueActionRequest) (outcome string, issue map[string]any, errCode, errMessage string) {
	var retryErr error
	for attempt := 1; attempt <= bulkIssueActionMaxAttempts; attempt++ {
		outcome, issue, errCode, errMessage, retryErr = api.attemptBulkIssueAction(ctx, r, actor, target, body)
		if retryErr == nil {
			return outcome, issue, errCode, errMessage
		}
		if !isSerializationFailure(retryErr) || attempt == bulkIssueActionMaxAttempts {
			return "failed", nil, "issue_update_failed", retryErr.Error()
		}
		time.Sleep(bulkIssueActionRetryDelay(attempt))
	}
	return "failed", nil, "issue_update_failed", retryErr.Error()
}

func (api *issueSheetAPI) attemptBulkIssueAction(ctx context.Context, r *http.Request, actor issueSheetActor, target bulkIssueTarget, body bulkIssueActionRequest) (outcome string, issue map[string]any, errCode, errMessage string, retryErr error) {
	orgWide := actor.canWriteProjectTeam()

	tx, err := api.pool.Begin(ctx)
	if err != nil {
		return "", nil, "", "", err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var previousStatus, previousIssueType string
	var previousAssignee *string
	err = tx.QueryRow(ctx, `
        select i.status, i.issue_type, i.assignee_user_id
        from issue_sheet_issues i
        join projects p on p.id = i.project_id
        where i.organization_id = $1 and i.project_id = $2 and i.id = $3
        and `+formatQaProjectTeamAccessSQL(4, 5, 1)+`
        for update`,
		actor.organizationID, target.ProjectID, target.IssueID, orgWide, actor.userID,
	).Scan(&previousStatus, &previousIssueType, &previousAssignee)
	if errors.Is(err, pgx.ErrNoRows) {
		return "failed", nil, "issue_not_found", "Issue not found", nil
	}
	if err != nil {
		return "", nil, "", "", err
	}

	var nextAssignee *string
	assigneeApplies := body.Action == "assign" || body.Action == "unassign"
	if body.Action == "assign" {
		nextAssignee = body.AssigneeUserID
	}

	if assigneeApplies && nextAssignee != nil && strings.TrimSpace(*nextAssignee) != "" {
		if err := api.assertAssignableAssigneeTx(ctx, tx, actor.organizationID, target.ProjectID, *nextAssignee); err != nil {
			var failure *issueSheetError
			if errors.As(err, &failure) {
				return "failed", nil, failure.code, failure.message, nil
			}
			return "", nil, "", "", err
		}
	}

	sets := []string{"updated_at = now()"}
	args := []any{actor.organizationID, target.ProjectID, target.IssueID}
	add := func(col string, value any) {
		args = append(args, value)
		sets = append(sets, fmt.Sprintf("%s = $%d", col, len(args)))
	}

	assigneeChanged := false
	statusChanged := false
	issueTypeChanged := false
	nextStatus := previousStatus

	if assigneeApplies {
		changed := (previousAssignee == nil) != (nextAssignee == nil) ||
			(previousAssignee != nil && nextAssignee != nil && *previousAssignee != *nextAssignee)
		if changed {
			add("assignee_user_id", nextAssignee)
			assigneeChanged = true
		}
	}
	if body.Action == "set_status" {
		nextStatus = *body.Status
		if nextStatus != previousStatus {
			add("status", nextStatus)
			switch nextStatus {
			case "resolved", "wont_fix":
				add("resolved_at", time.Now().UTC())
			case "open", "in_progress":
				add("resolved_at", nil)
			}
			statusChanged = true
		}
	}
	if body.Action == "set_issue_type" && *body.IssueType != previousIssueType {
		add("issue_type", *body.IssueType)
		issueTypeChanged = true
	}

	coreChanged := len(sets) > 1
	if coreChanged {
		tag, err := tx.Exec(ctx, `
            update issue_sheet_issues set `+strings.Join(sets, ", ")+`
            where organization_id = $1 and project_id = $2 and id = $3`, args...)
		if err != nil {
			return "", nil, "", "", err
		}
		if tag.RowsAffected() == 0 {
			return "failed", nil, "issue_not_found", "Issue not found", nil
		}
	}

	if statusChanged {
		if err := insertBulkIssueActivity(ctx, tx, actor, target, "status_changed", map[string]any{
			"previousStatus": previousStatus,
			"nextStatus":     nextStatus,
		}); err != nil {
			return "", nil, "", "", err
		}
	}
	if issueTypeChanged {
		if err := insertBulkIssueActivity(ctx, tx, actor, target, "issue_type_changed", map[string]any{
			"previousIssueType": previousIssueType,
			"nextIssueType":     *body.IssueType,
		}); err != nil {
			return "", nil, "", "", err
		}
	}
	if assigneeChanged {
		if err := insertBulkIssueActivity(ctx, tx, actor, target, "assignee_changed", map[string]any{
			"previousAssigneeUserId": nullableAny(previousAssignee),
			"nextAssigneeUserId":     nullableAny(nextAssignee),
		}); err != nil {
			return "", nil, "", "", err
		}
		if nextAssignee != nil && strings.TrimSpace(*nextAssignee) != "" {
			if _, err := tx.Exec(ctx, `
                insert into issue_sheet_subscriptions (organization_id, project_id, issue_id, user_id)
                values ($1, $2, $3, $4)
                on conflict do nothing`,
				actor.organizationID, target.ProjectID, target.IssueID, *nextAssignee); err != nil {
				return "", nil, "", "", err
			}
		}
	}

	priorityChanged := false
	if body.Action == "set_priority" {
		changed, err := setPriorityTx(ctx, tx, actor.organizationID, target.ProjectID, target.IssueID, actor.userID, *body.Priority)
		if err != nil {
			var failure *issueSheetError
			if errors.As(err, &failure) {
				return "failed", nil, failure.code, failure.message, nil
			}
			return "", nil, "", "", err
		}
		priorityChanged = changed
	}

	if err := tx.Commit(ctx); err != nil {
		return "", nil, "", "", err
	}

	if statusChanged {
		api.safeNotify(r, "status_changed", func() error {
			return api.notifyStatusChanged(ctx, api.pool, actor.organizationID, target.ProjectID, target.IssueID, actor.userID, previousStatus, nextStatus)
		})
	}
	if assigneeChanged {
		api.safeNotify(r, "assignee_changed", func() error {
			return api.notifyAssigneeChanged(ctx, api.pool, actor.organizationID, target.ProjectID, target.IssueID, actor.userID, previousAssignee, nextAssignee)
		})
	}

	issueMap, err := api.loadIssue(ctx, actor, issueSheetProject{ID: target.ProjectID}, target.IssueID)
	if err != nil {
		return "failed", nil, "issue_update_failed", err.Error(), nil
	}
	if coreChanged || priorityChanged {
		return "updated", issueMap, "", "", nil
	}
	return "unchanged", issueMap, "", "", nil
}

func (api *issueSheetAPI) assertAssignableAssigneeTx(ctx context.Context, tx pgx.Tx, organizationID, projectID, assigneeUserID string) error {
	var allowed bool
	err := tx.QueryRow(ctx, `
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
        )`, organizationID, assigneeUserID, projectID).Scan(&allowed)
	if err != nil {
		return err
	}
	if !allowed {
		return issueSheetFailure(400, "assignee_not_assignable", "Assignee is not assignable to this project")
	}
	return nil
}

func insertBulkIssueActivity(ctx context.Context, tx pgx.Tx, actor issueSheetActor, target bulkIssueTarget, activityType string, payload map[string]any) error {
	raw, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `
        insert into issue_sheet_activities (
            organization_id, project_id, issue_id, actor_user_id, type, payload, created_at
        ) values ($1, $2, $3, $4, $5, $6::jsonb, clock_timestamp())`,
		actor.organizationID, target.ProjectID, target.IssueID, actor.userID, activityType, string(raw))
	return err
}

func setPriorityTx(ctx context.Context, tx pgx.Tx, organizationID, projectID, issueID, actorUserID, priority string) (bool, error) {
	var columnID string
	err := tx.QueryRow(ctx, `
        select id from issue_sheet_columns
        where organization_id = $1 and project_id = $2 and key = 'priority'
        limit 1`, organizationID, projectID).Scan(&columnID)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, issueSheetFailure(400, "issue_sheet_column_not_found", "Priority column not found")
	}
	if err != nil {
		return false, err
	}

	var previous *string
	err = tx.QueryRow(ctx, `
        select value #>> '{}' from issue_sheet_row_values
        where issue_id = $1 and column_id = $2`, issueID, columnID).Scan(&previous)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return false, err
	}
	if previous != nil && *previous == priority {
		return false, nil
	}

	valueJSON, err := json.Marshal(priority)
	if err != nil {
		return false, err
	}
	if _, err := tx.Exec(ctx, `
        insert into issue_sheet_row_values (organization_id, project_id, issue_id, column_id, value)
        values ($1, $2, $3, $4, $5::jsonb)
        on conflict (issue_id, column_id) do update set value = excluded.value, updated_at = now()`,
		organizationID, projectID, issueID, columnID, string(valueJSON)); err != nil {
		return false, err
	}

	payload, err := json.Marshal(map[string]any{
		"previousPriority": nullableAny(previous),
		"nextPriority":     priority,
	})
	if err != nil {
		return false, err
	}
	if _, err := tx.Exec(ctx, `
        insert into issue_sheet_activities (
            organization_id, project_id, issue_id, actor_user_id, type, payload, created_at
        ) values ($1, $2, $3, $4, 'priority_changed', $5::jsonb, clock_timestamp())`,
		organizationID, projectID, issueID, actorUserID, string(payload)); err != nil {
		return false, err
	}
	return true, nil
}
