package main

import (
	"context"
	"fmt"
)

func reportingProjectIDs(ctx context.Context, db dictionaryDB, actor workspaceActor) ([]string, error) {
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

func loadReportingJob(ctx context.Context, db dictionaryDB, actor workspaceActor, jobID string) (reportingJob, error) {
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
