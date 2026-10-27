package main

import (
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
)

type reportingTaskAnalysis struct {
	ID             string `json:"id"`
	SegmentID      string `json:"segmentId"`
	SourceRevision string `json:"sourceRevision"`
	TargetLocale   string `json:"targetLocale"`
	Words          *int   `json:"words"`
	Bucket         string `json:"bucket"`
	MatchScore     *int   `json:"matchScore"`
	CreatedAt      string `json:"createdAt"`
}

type reportingTimeEntry struct {
	ID             string  `json:"id"`
	OrganizationID string  `json:"organizationId"`
	ProjectID      *string `json:"projectId"`
	JobID          *string `json:"jobId"`
	ContributorID  string  `json:"contributorId"`
	Step           string  `json:"step"`
	TargetLocale   string  `json:"targetLocale"`
	WorkDate       string  `json:"workDate"`
	Minutes        int     `json:"minutes"`
	Note           *string `json:"note"`
	Voided         bool    `json:"voided"`
	CreatedAt      string  `json:"createdAt"`
}

type reportingTaskReport struct {
	Analyses    []reportingTaskAnalysis `json:"analyses"`
	TimeEntries []reportingTimeEntry    `json:"timeEntries"`
}

func (h *handler) getTaskReport(r *http.Request, actor workspaceActor) (any, int, error) {
	ctx, db := r.Context(), h.workspace.pool
	job, err := loadReportingJob(ctx, db, actor, r.PathValue("jobId"))
	if isNoRows(err) {
		return nil, 0, reportingNotFound("job_not_found")
	}
	if err != nil {
		return nil, 0, err
	}
	rows, err := db.Query(ctx, `
        select id, segment_id, source_revision, target_locale, words, bucket, match_score, created_at
        from reporting_analyses where organization_id=$1 and job_id=$2 and is_current`,
		actor.organizationID, job.ID)
	if err != nil {
		return nil, 0, fmt.Errorf("list task analyses: %w", err)
	}
	analyses, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (reportingTaskAnalysis, error) {
		var analysis reportingTaskAnalysis
		var created time.Time
		err := row.Scan(&analysis.ID, &analysis.SegmentID, &analysis.SourceRevision, &analysis.TargetLocale,
			&analysis.Words, &analysis.Bucket, &analysis.MatchScore, &created)
		analysis.CreatedAt = formatReportingTime(created)
		return analysis, err
	})
	if err != nil {
		return nil, 0, fmt.Errorf("list task analyses: %w", err)
	}
	rows, err = db.Query(ctx, `
        select id, organization_id, project_id, job_id, contributor_id, step, target_locale, work_date, minutes, note, voided, created_at
        from reporting_time_entries where organization_id=$1 and job_id=$2 and voided=false`,
		actor.organizationID, job.ID)
	if err != nil {
		return nil, 0, fmt.Errorf("list task time entries: %w", err)
	}
	entries, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (reportingTimeEntry, error) {
		var entry reportingTimeEntry
		var workDate, created time.Time
		err := row.Scan(&entry.ID, &entry.OrganizationID, &entry.ProjectID, &entry.JobID, &entry.ContributorID,
			&entry.Step, &entry.TargetLocale, &workDate, &entry.Minutes, &entry.Note, &entry.Voided, &created)
		entry.WorkDate = formatReportingTime(workDate)
		entry.CreatedAt = formatReportingTime(created)
		return entry, err
	})
	if err != nil {
		return nil, 0, fmt.Errorf("list task time entries: %w", err)
	}
	report := reportingTaskReport{Analyses: analyses, TimeEntries: []reportingTimeEntry{}}
	financial := hasOrganizationCapability(actor.role, "billing:read")
	for _, entry := range entries {
		if financial || entry.ContributorID == actor.userID {
			report.TimeEntries = append(report.TimeEntries, entry)
		}
	}
	return map[string]any{"taskReport": report}, http.StatusOK, nil
}

type reportingTaskRate struct {
	ID               string  `json:"id"`
	OrganizationID   string  `json:"organizationId"`
	JobID            *string `json:"jobId"`
	Step             string  `json:"step"`
	RateID           *string `json:"rateId"`
	EstimatedMinutes *int    `json:"estimatedMinutes"`
	OverrideUSD      *string `json:"overrideUsd"`
	CreatedAt        string  `json:"createdAt"`
}

func (h *handler) putTaskRate(r *http.Request, actor workspaceActor) (any, int, error) {
	if !hasOrganizationCapability(actor.role, "billing:write") {
		return nil, 0, reportingForbidden("report_costs_forbidden")
	}
	body, err := readReportingBody(r, "invalid_task_rate")
	if err != nil {
		return nil, 0, err
	}
	jobID := body.text("jobId", 1, math.MaxInt)
	step := body.step("step")
	rateID := body.nullableUUID("rateId")
	estimatedMinutes := body.nullableInteger("estimatedMinutes", 0, 525600)
	overrideUSD := body.nullableUSD("overrideUsd")
	if !body.valid {
		return nil, 0, reportingInvalid("invalid_task_rate")
	}
	ctx, pool := r.Context(), h.workspace.pool
	job, err := loadReportingJob(ctx, pool, actor, jobID)
	if isNoRows(err) {
		return nil, 0, reportingNotFound("job_not_found")
	}
	if err != nil {
		return nil, 0, err
	}
	if rateID != nil {
		var found string
		err := pool.QueryRow(ctx, `select id from reporting_rates where id=$1 and organization_id=$2 and step=$3`,
			*rateID, actor.organizationID, step).Scan(&found)
		if isNoRows(err) {
			return nil, 0, reportingInvalid("invalid_rate")
		}
		if err != nil {
			return nil, 0, fmt.Errorf("load task rate card: %w", err)
		}
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		return nil, 0, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var status string
	if err := tx.QueryRow(ctx, `select status from jobs where id=$1 for update`, job.ID).Scan(&status); err != nil {
		return nil, 0, fmt.Errorf("lock task rate job: %w", err)
	}
	var started bool
	if err := tx.QueryRow(ctx, `
        select exists(select 1 from reporting_analyses where job_id=$1 and step=$2)
          or exists(select 1 from reporting_costs where job_id=$1 and step=$2)
          or exists(select 1 from reporting_time_entries where job_id=$1 and step=$2) as started`,
		job.ID, step).Scan(&started); err != nil {
		return nil, 0, fmt.Errorf("check task activity: %w", err)
	}
	if status != "queued" || started {
		return nil, 0, workspaceFailure(400, "task_rate_locked", "Task rates can only change before work starts.")
	}
	var saved reportingTaskRate
	var created time.Time
	if err := tx.QueryRow(ctx, `
        insert into reporting_task_rates (organization_id, job_id, step, rate_id, estimated_minutes, override_usd)
        values ($1, $2, $3, $4, $5, $6::text::numeric)
        on conflict (organization_id, job_id, step) do update
        set job_id = excluded.job_id, step = excluded.step, rate_id = excluded.rate_id,
            estimated_minutes = excluded.estimated_minutes, override_usd = excluded.override_usd
        returning id, organization_id, job_id, step, rate_id, estimated_minutes, override_usd::text, created_at`,
		actor.organizationID, job.ID, step, rateID, estimatedMinutes, overrideUSD,
	).Scan(&saved.ID, &saved.OrganizationID, &saved.JobID, &saved.Step, &saved.RateID, &saved.EstimatedMinutes, &saved.OverrideUSD, &created); err != nil {
		return nil, 0, fmt.Errorf("upsert task rate: %w", err)
	}
	saved.CreatedAt = formatReportingTime(created)
	after, err := json.Marshal(saved)
	if err != nil {
		return nil, 0, err
	}
	if _, err := tx.Exec(ctx, `
        insert into reporting_audit (organization_id, actor_id, resource_id, action, after)
        values ($1, $2, $3, 'task_rate_saved', $4::text::jsonb)`,
		actor.organizationID, actor.userID, saved.ID, string(after)); err != nil {
		return nil, 0, fmt.Errorf("audit task rate: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, 0, err
	}
	return map[string]any{"taskRate": saved}, http.StatusOK, nil
}
