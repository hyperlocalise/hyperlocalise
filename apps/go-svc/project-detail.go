package main

import (
	"encoding/json"
	"fmt"
	"net/http"
)

func (api *projectAPI) getHandler(r *http.Request, actor projectActor) (any, int, error) {
	projectID, err := normalizedNativeProjectID(r.PathValue("projectId"))
	if err != nil {
		return nil, 0, err
	}

	var exists bool
	var project json.RawMessage
	if err := api.pool.QueryRow(r.Context(), `
		with project as (
			select p.*
			from projects p
			where p.id = $1 and p.organization_id = $2 and p.source = 'native'
				and `+formatQaProjectTeamAccessSQL(3, 4, 2)+`
		)
		select exists(select 1 from project),
			(select jsonb_build_object(
				'id', project.id,
				'organizationId', project.organization_id,
				'teamId', project.team_id,
				'createdByUserId', project.created_by_user_id,
				'name', project.name,
				'identifier', project.identifier,
				'description', project.description,
				'translationContext', project.translation_context,
				'source', project.source,
				'externalProviderKind', project.external_provider_kind,
				'externalProjectId', project.external_project_id,
				'sourceLocale', project.source_locale,
				'targetLocales', project.target_locales,
				'externalProjectUrl', project.external_project_url,
				'isActive', project.is_active,
				'lastSyncedAt', project.last_synced_at,
				'lastSyncErrorAt', project.last_sync_error_at,
				'lastSyncErrorMessage', project.last_sync_error_message,
				'createdAt', project.created_at,
				'updatedAt', project.updated_at,
				'openJobCount', coalesce((
					select count(*)::int
					from jobs j
					where j.organization_id = project.organization_id
						and j.project_id = project.id
						and j.status in ('queued', 'running', 'waiting_for_review')
				), 0)
			) from project)
		`,
		projectID,
		actor.organizationID,
		actor.canReadAllTeams(),
		actor.userID,
	).Scan(&exists, &project); err != nil {
		return nil, 0, fmt.Errorf("get native project detail: %w", err)
	}
	if !exists {
		return nil, 0, projectNotFound()
	}
	return map[string]json.RawMessage{"project": project}, http.StatusOK, nil
}
