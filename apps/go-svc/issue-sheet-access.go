package main

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/jackc/pgx/v5"
)

const activeOrgMembershipSQL = `m.workos_membership_id is not null and m.workos_membership_id not in ('', 'replacing')`

// optionalNullableString distinguishes omitted JSON fields from explicit null.
type optionalNullableString struct {
	Present bool
	Value   *string
}

func (o *optionalNullableString) UnmarshalJSON(data []byte) error {
	o.Present = true
	if string(data) == "null" {
		o.Value = nil
		return nil
	}
	var value string
	if err := json.Unmarshal(data, &value); err != nil {
		return err
	}
	o.Value = &value
	return nil
}

func (api *issueSheetAPI) assertAssignableAssignee(
	ctx context.Context,
	organizationID, projectID, assigneeUserID string,
) error {
	var allowed bool
	err := api.pool.QueryRow(ctx, `
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

func (api *issueSheetAPI) assertTranslationKeyInProject(
	ctx context.Context,
	organizationID, projectID, translationKeyID string,
) error {
	var id string
	err := api.pool.QueryRow(ctx, `
        select id from project_translation_keys
        where id = $1 and organization_id = $2 and project_id = $3
        limit 1`, translationKeyID, organizationID, projectID).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return issueSheetFailure(400, "translation_key_not_found", "Translation key not found in this project")
	}
	return err
}

func (api *issueSheetAPI) lookupAccessibleRelatedIssue(
	ctx context.Context,
	actor issueSheetActor,
	relatedRef string,
) (id, projectID, title, status string, err error) {
	accessSQL := formatQaProjectTeamAccessSQL(3, 4, 1)
	err = api.pool.QueryRow(ctx, `
        select i.id, i.project_id, i.title, i.status
        from issue_sheet_issues i
        join projects p on p.id = i.project_id
        where i.organization_id = $1
          and i.id = $2
          and `+accessSQL+`
        limit 1`,
		actor.organizationID, relatedRef, actor.canWriteProjectTeam(), actor.userID,
	).Scan(&id, &projectID, &title, &status)
	if errors.Is(err, pgx.ErrNoRows) {
		err = api.pool.QueryRow(ctx, `
            select i.id, i.project_id, i.title, i.status
            from issue_sheet_issues i
            join projects p on p.id = i.project_id
            where i.organization_id = $1
              and i.identifier = $2
              and `+accessSQL+`
            limit 1`,
			actor.organizationID, relatedRef, actor.canWriteProjectTeam(), actor.userID,
		).Scan(&id, &projectID, &title, &status)
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return "", "", "", "", issueSheetFailure(404, "related_issue_not_found", "Issue not found")
	}
	return id, projectID, title, status, err
}
