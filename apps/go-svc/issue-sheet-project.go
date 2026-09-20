package main

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
)

type issueSheetProject struct {
	ID         string
	Identifier string
}

func (api *issueSheetAPI) ownedProject(ctx context.Context, actor issueSheetActor, rawProjectID string) (issueSheetProject, error) {
	projectID := normalizeDictionaryProjectID(rawProjectID)
	if projectID == "" {
		return issueSheetProject{}, missingIssueSheetProject()
	}
	var project issueSheetProject
	err := api.pool.QueryRow(ctx, `
        select p.id, p.identifier
        from projects p
        where p.id = $1 and p.organization_id = $2
        and `+formatQaProjectTeamAccessSQL(3, 4, 2),
		projectID, actor.organizationID, actor.canWriteProjectTeam(), actor.userID,
	).Scan(&project.ID, &project.Identifier)
	if errors.Is(err, pgx.ErrNoRows) {
		return issueSheetProject{}, missingIssueSheetProject()
	}
	if err != nil {
		return issueSheetProject{}, err
	}
	return project, nil
}

func (api *issueSheetAPI) resolveIssueID(ctx context.Context, organizationID, projectID, issueRef string) (string, error) {
	matchSQL, matchArg := issueIDMatchSQL(issueRef, 3)
	var id string
	err := api.pool.QueryRow(ctx, `
        select id from issue_sheet_issues
        where organization_id = $1 and project_id = $2 and `+matchSQL+`
        limit 1`, organizationID, projectID, matchArg).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", missingIssueSheetIssue()
	}
	return id, err
}
