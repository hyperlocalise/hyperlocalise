package main

import (
	"context"
	"fmt"
	"net/http"
)

func (api *projectAPI) contentEditorBehaviorPreviewHandler(r *http.Request, actor projectActor) (any, int, error) {
	if !actor.canManageContentEditorBehavior() {
		return nil, 0, projectForbidden()
	}

	projectID, err := normalizedNativeProjectID(r.PathValue("projectId"))
	if err != nil {
		return nil, 0, err
	}

	preview, err := api.contentEditorBehaviorPreview(r.Context(), actor, projectID)
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"preview": preview}, http.StatusOK, nil
}

func (api *projectAPI) contentEditorBehaviorPreview(
	ctx context.Context,
	actor projectActor,
	projectID string,
) (map[string]int, error) {
	var exists bool
	var groups, affectedOccurrences int
	err := api.pool.QueryRow(ctx, `
		with project as (
			select p.id, p.organization_id
			from projects p
			where p.id = $1 and p.organization_id = $2 and p.source = 'native'
				and `+formatQaProjectTeamAccessSQL(3, 4, 2)+`
		),
		duplicate_groups as (
			select count(*) as occurrences
			from project_translation_keys k
			join project p on p.id = k.project_id and p.organization_id = k.organization_id
			group by k.source_text
			having count(*) > 1
		)
		select exists(select 1 from project),
			coalesce((select count(*)::int from duplicate_groups), 0),
			coalesce((select sum(occurrences)::int from duplicate_groups), 0)
		`,
		projectID,
		actor.organizationID,
		actor.canReadAllTeams(),
		actor.userID,
	).Scan(&exists, &groups, &affectedOccurrences)
	if err != nil {
		return nil, fmt.Errorf("preview native project content editor grouping: %w", err)
	}
	if !exists {
		return nil, projectNotFound()
	}
	return map[string]int{"groups": groups, "affectedOccurrences": affectedOccurrences}, nil
}
