package main

import (
	"context"
	"fmt"
	"time"
)

// reportingProjectIDs are the projects the viewer can open, by the same team rule as the web
// app's getAccessibleProjectIds.
func reportingProjectIDs(ctx context.Context, db dictionaryDB, actor reportingActor) ([]string, error) {
	rows, err := db.Query(ctx, `
        select p.id from projects p
        where p.organization_id = $1 and `+formatQaProjectTeamAccessSQL(2, 3, 1),
		actor.organizationID, actor.orgWideProjectAccess(), actor.userID)
	if err != nil {
		return nil, fmt.Errorf("list reporting projects: %w", err)
	}
	defer rows.Close()
	ids := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("scan reporting project: %w", err)
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list reporting projects: %w", err)
	}
	return ids, nil
}

type reportingJob struct {
	ID        string
	ProjectID *string
}

func loadReportingJob(ctx context.Context, db dictionaryDB, actor reportingActor, jobID string) (reportingJob, error) {
	var job reportingJob
	err := db.QueryRow(ctx, `
        select j.id, j.project_id from jobs j
        where j.id = $1 and j.organization_id = $2
        and ($3::boolean or exists(
            select 1 from projects p
            where p.id = j.project_id and p.organization_id = $2
            and `+formatQaProjectTeamAccessSQL(4, 5, 2)+`
        ))`,
		jobID, actor.organizationID, actor.orgWideProjectAccess(), false, actor.userID,
	).Scan(&job.ID, &job.ProjectID)
	return job, err
}

// reportingStart is when Reports started recording for a workspace, nil when it has recorded
// nothing yet.
func reportingStart(ctx context.Context, db dictionaryDB, organizationID string) (*time.Time, error) {
	var started time.Time
	err := db.QueryRow(ctx, `select started_at from reporting_workspaces where organization_id = $1`, organizationID).Scan(&started)
	if isNoRows(err) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read reporting start: %w", err)
	}
	return &started, nil
}

// reportingContext is the viewer's workspace, projects and money access, and the dates Reports
// can cover: the web app's reportContext.
type reportingContext struct {
	organizationID string
	projectIDs     []string
	startedAt      *time.Time
	// The first day Reports can cover, "" before anything was recorded.
	startedDay string
	today      string
	// Whether the viewer sees what work costs, other people's time and workspace-wide work.
	financial bool
	userID    string
}

func (api *reportingAPI) context(ctx context.Context, db dictionaryDB, actor reportingActor) (reportingContext, error) {
	projectIDs, err := reportingProjectIDs(ctx, db, actor)
	if err != nil {
		return reportingContext{}, err
	}
	startedAt, err := reportingStart(ctx, db, actor.organizationID)
	if err != nil {
		return reportingContext{}, err
	}
	result := reportingContext{
		organizationID: actor.organizationID,
		projectIDs:     projectIDs,
		startedAt:      startedAt,
		today:          api.now().UTC().Format(time.DateOnly),
		financial:      actor.can("billing:read"),
		userID:         actor.userID,
	}
	if startedAt != nil {
		result.startedDay = startedAt.UTC().Format(time.DateOnly)
	}
	return result, nil
}

func (c reportingContext) scope(projectID, jobID, targetLocale string) reportingScope {
	scope := reportingScope{
		organizationID: c.organizationID,
		projectIDs:     c.projectIDs,
		projectID:      projectID,
		targetLocale:   targetLocale,
	}
	if jobID != "" {
		scope.jobIDs = []string{jobID}
	}
	return scope
}

func (c reportingContext) period(from, to string) reportingPeriod {
	return resolveReportingPeriod(from, to, c.today, c.startedDay)
}
