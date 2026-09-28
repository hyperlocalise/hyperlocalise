package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
)

type workspaceFilesQuery struct {
	limit     int
	search    string
	empty     bool
	locale    string
	projectID string
}

func parseWorkspaceFilesQuery(values url.Values) (workspaceFilesQuery, error) {
	query := workspaceFilesQuery{
		limit:  projectFilesDefaultLimit,
		search: strings.TrimSpace(values.Get("search")),
		locale: strings.TrimSpace(values.Get("locale")),
	}
	invalid := func() (workspaceFilesQuery, error) {
		return workspaceFilesQuery{}, projectFailure(400, "invalid_workspace_files_query", "Invalid workspace files query parameters")
	}
	if len(query.search) > 256 || len(query.locale) > 32 {
		return invalid()
	}
	var err error
	if raw := strings.TrimSpace(values.Get("limit")); raw != "" {
		query.limit, err = strconv.Atoi(raw)
		if err != nil || query.limit < 1 || query.limit > projectFilesMaxLimit {
			return invalid()
		}
	}
	if raw := strings.TrimSpace(values.Get("offset")); raw != "" {
		offset, err := strconv.Atoi(raw)
		if err != nil || offset < 0 {
			return invalid()
		}
	}
	origin := strings.TrimSpace(values.Get("origin"))
	resourceType := strings.TrimSpace(values.Get("resourceType"))
	providerKind := strings.TrimSpace(values.Get("providerKind"))
	syncState := strings.TrimSpace(values.Get("syncState"))
	branch := strings.TrimSpace(values.Get("branch"))
	validOrigin := map[string]bool{"": true, "all": true, "repository": true, "provider": true}
	validResourceType := map[string]bool{"": true, "all": true, "file": true, "key": true}
	validProviderKind := map[string]bool{"": true, "all": true, "crowdin": true, "smartling": true, "phrase": true, "lokalise": true}
	if !validOrigin[origin] || !validResourceType[resourceType] || !validProviderKind[providerKind] ||
		len(syncState) > 64 || len(branch) > 256 || (values.Has("branch") && branch == "") {
		return invalid()
	}
	query.empty = origin == "provider" || resourceType == "key" ||
		(providerKind != "" && providerKind != "all") ||
		(syncState != "" && syncState != "all" && syncState != "repository")

	projectID := strings.TrimSpace(values.Get("projectId"))
	if len(projectID) > 128 {
		return invalid()
	}
	if projectID != "" && projectID != "all" {
		query.projectID = projectID
	}
	return query, nil
}

func (api *projectAPI) workspaceFilesHandler(r *http.Request, actor projectActor) (any, int, error) {
	query, err := parseWorkspaceFilesQuery(r.URL.Query())
	if err != nil {
		return nil, 0, err
	}
	files, err := api.workspaceFiles(r.Context(), actor, query)
	if err != nil {
		return nil, 0, err
	}
	return map[string]json.RawMessage{"files": files}, http.StatusOK, nil
}

func (api *projectAPI) workspaceFiles(ctx context.Context, actor projectActor, query workspaceFilesQuery) (json.RawMessage, error) {
	args := []any{actor.organizationID, actor.canReadAllTeams(), actor.userID, query.projectID}
	filters := []string{"ranked.version_rank = 1"}
	if query.empty {
		filters = append(filters, "false")
	}
	if query.search != "" {
		args = append(args, "%"+query.search+"%")
		filters = append(filters, fmt.Sprintf("(ranked.source_path ilike $%d or ranked.filename ilike $%d)", len(args), len(args)))
	}
	if query.locale != "" && query.locale != "all" {
		args = append(args, query.locale)
		filters = append(filters, fmt.Sprintf("p.target_locales ? $%d", len(args)))
	}
	args = append(args, query.limit)
	limitPosition := len(args)

	statement := `
		with projects_in_scope as (
			select p.id, p.name, p.target_locales
			from projects p
			where p.organization_id = $1 and p.source = 'native'
				and ` + formatQaProjectTeamAccessSQL(2, 3, 1) + `
				and ($4 = '' or p.id = $4)
		),
		ranked as (
			select v.id as version_id, v.project_id, v.source_path, v.source_hash, v.commit_sha,
				v.workflow_run_id, v.created_at as uploaded_at, v.stored_file_id,
				f.metadata, f.filename, f.byte_size,
				row_number() over (
					partition by v.project_id, v.source_path
					order by v.created_at desc, v.id desc
				) as version_rank
			from repository_source_file_versions v
			join projects_in_scope p on p.id = v.project_id
			join stored_files f on f.id = v.stored_file_id
				and f.organization_id = v.organization_id
				and f.project_id = v.project_id
			where f.role = 'source' and f.source_kind = 'repository_file'
				and v.organization_id = $1
		),
		selected as (
			select ranked.*
			from ranked
			join projects_in_scope p on p.id = ranked.project_id
			where ` + strings.Join(filters, " and ") + `
			order by p.name, ranked.source_path
			limit $` + strconv.Itoa(limitPosition) + `
		),
		latest_jobs as (
			select distinct on (d.source_file_version_id)
				d.source_file_version_id, j.id, j.status, j.created_at, d.type
			from translation_job_details d
			join jobs j on j.id = d.job_id
			join selected s on s.version_id = d.source_file_version_id
			where j.organization_id = $1 and j.project_id = s.project_id
			order by d.source_file_version_id, j.created_at desc, j.id desc
		),
		latest_locale_jobs as (
			select distinct on (d.source_file_version_id, locale.value)
				d.source_file_version_id, locale.value as locale, j.status
			from translation_job_details d
			join jobs j on j.id = d.job_id
			join selected s on s.version_id = d.source_file_version_id
			cross join lateral jsonb_array_elements_text(
				case
					when jsonb_typeof(j.input_payload->'targetLocales') = 'array'
					then j.input_payload->'targetLocales'
					else '[]'::jsonb
				end
			) locale(value)
			where j.organization_id = $1 and j.project_id = s.project_id
			order by d.source_file_version_id, locale.value, j.created_at desc, j.id desc
		)
		select coalesce(jsonb_agg(
			jsonb_build_object(
				'origin', 'repository',
				'sourcePath', s.source_path,
				'sourceHash', s.source_hash,
				'commitSha', s.commit_sha,
				'workflowRunId', s.workflow_run_id,
				'uploadedAt', s.uploaded_at,
				'storedFileId', s.stored_file_id,
				'metadata', s.metadata,
				'filename', s.filename,
				'byteSize', s.byte_size,
				'provider', null,
				'projectId', p.id,
				'projectName', p.name,
				'latestJob', case when j.id is null then null else jsonb_build_object(
					'id', j.id,
					'status', j.status,
					'createdAt', j.created_at,
					'type', j.type
				) end
			) || case
				when jsonb_array_length(p.target_locales) = 0 then '{}'::jsonb
				else jsonb_build_object(
					'localeReadiness', (
						select jsonb_object_agg(locale.value, coalesce(
							case lj.status
								when 'succeeded' then 'ready'
								when 'waiting_for_review' then 'needs_review'
								when 'failed' then 'stale'
								when 'cancelled' then 'stale'
								when 'queued' then 'in_progress'
								when 'running' then 'in_progress'
								else 'missing'
							end,
							'missing'
						))
						from jsonb_array_elements_text(p.target_locales) locale(value)
						left join latest_locale_jobs lj
							on lj.source_file_version_id = s.version_id
							and lj.locale = locale.value
					)
				)
			end
			order by p.name, s.source_path
		), '[]'::jsonb)
		from selected s
		join projects_in_scope p on p.id = s.project_id
		left join latest_jobs j on j.source_file_version_id = s.version_id
		`

	var files json.RawMessage
	if err := api.pool.QueryRow(ctx, statement, args...).Scan(&files); err != nil {
		return nil, fmt.Errorf("list workspace native files: %w", err)
	}
	return files, nil
}
