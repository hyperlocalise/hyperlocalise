package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"

	"github.com/hyperlocalise/hyperlocalise/internal/activitylog"
	"github.com/jackc/pgx/v5"
)

var (
	errJobActionUnavailable = errors.New("job action is not available")
	errNotTaskAssignee      = errors.New("job is assigned to someone else")
)

// postEditWorkflowTaskStep is the web app's POST_EDIT_WORKFLOW_TASK_STEP: a post-editing task
// finishes with its workflow, not by Mark done.
const postEditWorkflowTaskStep = "edit"

// cancellableJobStatuses is the web app's CANCELLABLE_JOB_STATUSES.
var cancellableJobStatuses = []string{"queued", "running", "waiting_for_review"}

// openTaskStatuses is the web app's OPEN_TASK_STATUSES: a task in another status no longer holds
// its unfinished strings in Reports.
var openTaskStatuses = cancellableJobStatuses

// jobTransition is one lifecycle action: the status it moves a job to and what it records.
type jobTransition struct {
	ToStatus string
	// Outcome is the job's outcome payload after the action.
	Outcome map[string]string
	// ClearWorkflowRun detaches the job's workflow run, so a stale run cannot write to it.
	ClearWorkflowRun bool
	// JobEvent is the job_events type the action records.
	JobEvent string
	// Activity is the activity-log event type, when the action records one.
	Activity string
	// allowed reports whether a locked job can take the action.
	allowed func(lockedJob) bool
}

// lockedJob is the state of a job a lifecycle action checks under its row lock.
type lockedJob struct {
	ProjectID        *string
	Kind             string
	Status           string
	OwnerUserID      *string
	AssigneeType     *string
	WorkflowTaskStep *string
	External         bool
}

// completeJobTransition follows the web app's markTaskDone: only an open proofread task for
// people can be completed, and a post-editing task finishes with its workflow instead.
var completeJobTransition = jobTransition{
	ToStatus: "succeeded",
	// No message: lists show an outcome message as a failure reason.
	Outcome:  map[string]string{"code": "marked_done_by_user"},
	JobEvent: "job_marked_done",
	allowed: func(j lockedJob) bool {
		return j.Status == "waiting_for_review" && j.Kind == "proofread" &&
			(j.WorkflowTaskStep == nil || *j.WorkflowTaskStep != postEditWorkflowTaskStep) &&
			(j.AssigneeType == nil || *j.AssigneeType != "agent")
	},
}

// cancelJobTransition follows the web app's cancelNativeJob: queued, running, and
// waiting-for-review jobs can be cancelled.
var cancelJobTransition = jobTransition{
	ToStatus:         "cancelled",
	Outcome:          map[string]string{"code": "cancelled_by_user", "message": "Cancelled by user"},
	ClearWorkflowRun: true,
	JobEvent:         "job_cancelled",
	Activity:         "job_cancelled",
	allowed: func(j lockedJob) bool {
		return member(j.Status, cancellableJobStatuses...)
	},
}

// completeJob marks an open task for people done. Reviewers and managers complete any task;
// anyone else only a task they own, as Mark done in the app.
func (s *postgresStore) completeJob(ctx context.Context, actor principal, jobID string) (job, error) {
	mayFinishAnyTask := actor.Role == "admin" || actor.Role == "localization_manager" || actor.Role == "reviewer"
	return s.transitionJob(ctx, actor, jobID, completeJobTransition, mayFinishAnyTask)
}

// cancelJob cancels a job that is still open, as Cancel in the app.
func (s *postgresStore) cancelJob(ctx context.Context, actor principal, jobID string) (job, error) {
	return s.transitionJob(ctx, actor, jobID, cancelJobTransition, true)
}

func (s *postgresStore) transitionJob(ctx context.Context, actor principal, jobID string, t jobTransition, mayActOnAnyJob bool) (job, error) {
	var updated job
	err := s.inTx(ctx, func(tx pgx.Tx) error {
		var locked lockedJob
		err := tx.QueryRow(ctx, `SELECT j.project_id, j.kind::text, j.status::text, j.owner_user_id::text,
				j.assignee_type::text, j.input_payload->'metadata'->>'workflowTaskStep', x.job_id IS NOT NULL
			FROM jobs j
			LEFT JOIN external_job_details x ON x.job_id = j.id
			WHERE `+jobAccessPredicate+` AND j.id = $3
			FOR UPDATE OF j`, actor.OrganizationID, actor.UserID, jobID).Scan(&locked.ProjectID, &locked.Kind,
			&locked.Status, &locked.OwnerUserID, &locked.AssigneeType, &locked.WorkflowTaskStep, &locked.External)
		if errors.Is(err, pgx.ErrNoRows) {
			return errJobNotFound
		}
		if err != nil {
			return fmt.Errorf("lock job: %w", err)
		}
		// As the web app does, someone who may only act on their own tasks hears that the job is
		// someone else's before hearing that it cannot take the action.
		if !mayActOnAnyJob && (locked.OwnerUserID == nil || *locked.OwnerUserID != actor.UserID) {
			return errNotTaskAssignee
		}
		if locked.External || !t.allowed(locked) {
			return errJobActionUnavailable
		}

		outcome, err := json.Marshal(t.Outcome)
		if err != nil {
			return fmt.Errorf("marshal job outcome: %w", err)
		}
		workflowRun := ""
		if t.ClearWorkflowRun {
			workflowRun = ", workflow_run_id = NULL"
		}
		if _, err := tx.Exec(ctx, `UPDATE jobs
			SET status = $3::job_status, last_error = NULL, outcome_payload = $4::jsonb,
				completed_at = now(), updated_at = now()`+workflowRun+`
			WHERE organization_id = $1 AND id = $2`,
			actor.OrganizationID, jobID, t.ToStatus, outcome); err != nil {
			return fmt.Errorf("update job status: %w", err)
		}
		// The job change outbox, as the web app's updateJobs records it, so outbound webhooks and
		// Job changed workflows hear about the new status.
		if err := insertJobChangeEvent(ctx, tx, "job.status_changed", actor.OrganizationID, jobID, locked.ProjectID,
			locked.Kind, locked.Status, t.ToStatus, locked.AssigneeType); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO job_events (job_id, organization_id, actor_user_id, type, payload)
			VALUES ($1, $2, $3, $4, '{}'::jsonb)`, jobID, actor.OrganizationID, actor.UserID, t.JobEvent); err != nil {
			return fmt.Errorf("record job event: %w", err)
		}
		if t.Activity != "" {
			payload := map[string]any{"jobId": jobID, "kind": locked.Kind, "status": t.ToStatus}
			if locked.ProjectID != nil {
				payload["projectId"] = *locked.ProjectID
			}
			if err := insertActivity(ctx, tx, actor, activityEvent{
				EventType: t.Activity, TargetID: jobID, TargetKind: "job", Payload: payload,
			}); err != nil {
				return err
			}
		}
		updated, err = loadJob(ctx, tx, actor, jobID)
		return err
	})
	if err != nil {
		return job{}, err
	}
	// Reports never fail the action, as the web app's captureJobStatus never throws.
	if err := captureJobStatus(ctx, s.pool, actor.OrganizationID, jobID, t.ToStatus); err != nil {
		slog.Warn("reporting job status capture failed", "jobId", jobID, "error", err)
	}
	return updated, nil
}

// captureJobStatus ports the web app's captureJobStatus: Reports starts for the workspace, a
// succeeded task charges its fixed fee, and a task that is no longer open has its strings'
// days worked out again, so Progress leaves out what it holds no more.
func captureJobStatus(ctx context.Context, db activitylog.Executor, organizationID, jobID, status string) error {
	if _, err := db.Exec(ctx, `INSERT INTO reporting_workspaces (organization_id, started_at)
		SELECT $1::uuid, coalesce(least(
			(SELECT min(created_at) FROM reporting_analyses WHERE organization_id = $1::uuid),
			(SELECT min(created_at) FROM reporting_activity WHERE organization_id = $1::uuid),
			(SELECT min(created_at) FROM reporting_costs WHERE organization_id = $1::uuid)
		), now())
		ON CONFLICT (organization_id) DO NOTHING`, organizationID); err != nil {
		return fmt.Errorf("start reporting: %w", err)
	}
	if status == "succeeded" {
		// Fixed task fees are recognized once, at job success.
		if _, err := db.Exec(ctx, `INSERT INTO reporting_costs
				(organization_id, project_id, job_id, operation_key, kind, step, amount_usd, basis, created_at)
			SELECT r.organization_id, j.project_id, j.id, 'task-override:' || r.id, 'human', r.step, r.override_usd,
				'manual', coalesce(j.completed_at, now())
			FROM reporting_task_rates r JOIN jobs j ON j.id = r.job_id
			WHERE j.id = $1 AND j.status = 'succeeded' AND r.override_usd IS NOT NULL
			ON CONFLICT (organization_id, operation_key) DO NOTHING`, jobID); err != nil {
			return fmt.Errorf("capture task overrides: %w", err)
		}
	}
	if member(status, openTaskStatuses...) {
		return nil
	}
	// The task's strings, and the same strings in other tasks: a project counts a string on its
	// earliest current analysis, which may be another task's. Rows are marked in a stable order,
	// so two writes marking the same days lock the queue rows in the same order.
	if _, err := db.Exec(ctx, `INSERT INTO reporting_summary_queue (organization_id, project_id, day)
		SELECT DISTINCT $1::uuid, s.project_id, (s.created_at AT TIME ZONE 'UTC')::date
		FROM reporting_analyses a
		JOIN reporting_analyses s ON s.organization_id = a.organization_id
			AND s.segment_id = a.segment_id AND s.target_locale = a.target_locale
			AND s.step = a.step AND s.source_revision = a.source_revision AND s.is_current
		WHERE a.organization_id = $1::uuid AND a.job_id = $2 AND a.is_current AND s.project_id IS NOT NULL
		ORDER BY 2, 3
		ON CONFLICT (organization_id, project_id, day)
		DO UPDATE SET generation = reporting_summary_queue.generation + 1, marked_at = now()`,
		organizationID, jobID); err != nil {
		return fmt.Errorf("mark task days: %w", err)
	}
	return nil
}
