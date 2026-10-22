package main

import (
	"fmt"
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
