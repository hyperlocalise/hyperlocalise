package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

const (
	projectRequestTimeout    = 30 * time.Second
	projectFilesDefaultLimit = 500
	projectFilesMaxLimit     = 1000
)

type projectAPI struct {
	pool       dictionaryPool
	membership organizationMembershipLookup
}

type projectActor struct {
	userID, organizationID, role string
}

func (a projectActor) canReadAllTeams() bool {
	return a.role == "admin" || a.role == "localization_manager"
}

func (a projectActor) canManageContentEditorBehavior() bool {
	return a.role == "admin" || a.role == "localization_manager"
}

type projectError struct {
	status        int
	code, message string
}

func (e *projectError) Error() string { return e.code }

func projectFailure(status int, code, message string) error {
	return &projectError{status: status, code: code, message: message}
}

func projectNotFound() error {
	return projectFailure(http.StatusNotFound, "project_not_found", "Project not found")
}

func projectJSON(ctx context.Context, w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(value); err != nil {
		slog.WarnContext(ctx, "project_response_write_failed")
	}
}

func writeProjectError(w http.ResponseWriter, r *http.Request, phase string, err error) {
	var failure *projectError
	if !errors.As(err, &failure) {
		slog.ErrorContext(r.Context(), "project_request_failed", "phase", phase, "path", requestLogPath(r.URL.Path), "error", err.Error())
		failure = &projectError{status: 500, code: "internal_error", message: "Internal server error"}
	} else if failure.status >= 500 {
		slog.ErrorContext(r.Context(), "project_request_failed", "phase", phase, "path", requestLogPath(r.URL.Path), "code", failure.code)
	}
	projectJSON(r.Context(), w, failure.status, map[string]string{
		"error":   failure.code,
		"message": failure.message,
	})
}

func (api *projectAPI) register(mux *http.ServeMux, verifier SessionVerifier) {
	projects := orgRoutePrefix + "/projects"
	project := projects + "/{projectId}"
	route := func(pattern string, fn func(*http.Request, projectActor) (any, int, error)) {
		registerAuthenticated(mux, verifier, pattern, api.handle(fn))
	}
	route("GET "+projects, bindActor(api, (*projectAPI).listHandler))
	route("GET "+project+"/open-job-count", bindActor(api, (*projectAPI).openJobCountHandler))
	route("GET "+project+"/content-editor-behavior", bindActor(api, (*projectAPI).contentEditorBehaviorHandler))
	route("GET "+project+"/files", bindActor(api, (*projectAPI).filesHandler))
}

func (api *projectAPI) actor(ctx context.Context, claims AuthClaims, slug string) (projectActor, error) {
	resolved, err := resolveOrganizationActor(ctx, api.pool, api.membership, claims, slug)
	if err != nil {
		return projectActor{}, mapOrganizationAccessError(err, projectFailure)
	}
	return projectActor(resolved), nil
}

func (api *projectAPI) handle(fn func(*http.Request, projectActor) (any, int, error)) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		if api.pool == nil {
			writeProjectError(w, r, "availability", projectFailure(503, "projects_unavailable", "Projects are unavailable"))
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), projectRequestTimeout)
		defer cancel()
		r = r.WithContext(ctx)
		claims, ok := ctx.Value(authContextKey{}).(AuthClaims)
		if !ok {
			writeProjectError(w, r, "auth", projectFailure(401, "unauthorized", "Unauthorized"))
			return
		}
		actor, err := api.actor(ctx, claims, r.PathValue("organizationSlug"))
		if err != nil {
			writeProjectError(w, r, "resolve_actor", err)
			return
		}
		value, status, err := fn(r, actor)
		if err != nil {
			writeProjectError(w, r, "handle", err)
			return
		}
		projectJSON(ctx, w, status, value)
	})
}

func normalizedNativeProjectID(raw string) (string, error) {
	projectID := normalizeDictionaryProjectID(raw)
	if projectID == "" || len(projectID) > 256 || strings.HasPrefix(projectID, "ext:") {
		return "", projectNotFound()
	}
	return projectID, nil
}

func (api *projectAPI) listHandler(r *http.Request, actor projectActor) (any, int, error) {
	statement := `
		select coalesce(jsonb_agg(jsonb_build_object(
			'id', p.id,
			'organizationId', p.organization_id,
			'teamId', p.team_id,
			'createdByUserId', p.created_by_user_id,
			'name', p.name,
			'identifier', p.identifier,
			'description', p.description,
			'translationContext', p.translation_context,
			'source', p.source,
			'externalProviderKind', p.external_provider_kind,
			'externalProjectId', p.external_project_id,
			'sourceLocale', p.source_locale,
			'targetLocales', p.target_locales,
			'externalProjectUrl', p.external_project_url,
			'isActive', p.is_active,
			'lastSyncedAt', p.last_synced_at,
			'lastSyncErrorAt', p.last_sync_error_at,
			'lastSyncErrorMessage', p.last_sync_error_message,
			'createdAt', p.created_at,
			'updatedAt', p.updated_at,
			'openJobCount', coalesce(open_jobs.count, 0)
		) order by p.updated_at desc), '[]'::jsonb)
		from projects p
		left join (
			select j.project_id, count(*)::int
			from jobs j
			where j.organization_id = $1
				and j.status in ('queued', 'running', 'waiting_for_review')
			group by j.project_id
		) open_jobs on open_jobs.project_id = p.id
		where p.organization_id = $1
			and p.source = 'native'
			and p.is_active
			and ` + formatQaProjectTeamAccessSQL(2, 3, 1)

	var projects json.RawMessage
	if err := api.pool.QueryRow(
		r.Context(),
		statement,
		actor.organizationID,
		actor.canReadAllTeams(),
		actor.userID,
	).Scan(&projects); err != nil {
		return nil, 0, fmt.Errorf("list native projects: %w", err)
	}
	return map[string]json.RawMessage{"projects": projects}, http.StatusOK, nil
}

func (api *projectAPI) openJobCountHandler(r *http.Request, actor projectActor) (any, int, error) {
	projectID, err := normalizedNativeProjectID(r.PathValue("projectId"))
	if err != nil {
		return nil, 0, err
	}
	var exists bool
	var openJobCount int
	if err := api.pool.QueryRow(r.Context(), `
		with project as (
			select p.id, p.organization_id
			from projects p
			where p.id = $1 and p.organization_id = $2 and p.source = 'native'
				and `+formatQaProjectTeamAccessSQL(3, 4, 2)+`
		)
		select exists(select 1 from project),
			(select count(*)::int
				from jobs j
				join project p on p.id = j.project_id and p.organization_id = j.organization_id
				where j.status in ('queued', 'running', 'waiting_for_review'))
		`,
		projectID,
		actor.organizationID,
		actor.canReadAllTeams(),
		actor.userID,
	).Scan(&exists, &openJobCount); err != nil {
		return nil, 0, fmt.Errorf("count native project open jobs: %w", err)
	}
	if !exists {
		return nil, 0, projectNotFound()
	}
	return map[string]int{"openJobCount": openJobCount}, http.StatusOK, nil
}

func (api *projectAPI) contentEditorBehaviorHandler(r *http.Request, actor projectActor) (any, int, error) {
	projectID, err := normalizedNativeProjectID(r.PathValue("projectId"))
	if err != nil {
		return nil, 0, err
	}
	var automaticallyGroupIdenticalStrings bool
	var groupingRevision int
	err = api.pool.QueryRow(r.Context(), `
		select p.automatically_group_identical_strings, p.cat_grouping_revision
		from projects p
		where p.id = $1 and p.organization_id = $2 and p.source = 'native'
			and `+formatQaProjectTeamAccessSQL(3, 4, 2),
		projectID,
		actor.organizationID,
		actor.canReadAllTeams(),
		actor.userID,
	).Scan(&automaticallyGroupIdenticalStrings, &groupingRevision)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, 0, projectNotFound()
	}
	if err != nil {
		return nil, 0, fmt.Errorf("get native project content editor behavior: %w", err)
	}
	return map[string]any{
		"contentEditorBehavior": map[string]any{
			"automaticallyGroupIdenticalStrings": automaticallyGroupIdenticalStrings,
			"groupingRevision":                   groupingRevision,
			"canManage":                          actor.canManageContentEditorBehavior(),
		},
	}, http.StatusOK, nil
}

type projectFilesQuery struct {
	limit, offset int
	search        string
	empty         bool
	locale        string
}

func parseProjectFilesQuery(values url.Values) (projectFilesQuery, error) {
	query := projectFilesQuery{
		limit:  projectFilesDefaultLimit,
		search: strings.TrimSpace(values.Get("search")),
		locale: strings.TrimSpace(values.Get("locale")),
	}
	invalid := func() (projectFilesQuery, error) {
		return projectFilesQuery{}, projectFailure(400, "invalid_project_files_query", "Invalid project files query parameters")
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
		query.offset, err = strconv.Atoi(raw)
		if err != nil || query.offset < 0 {
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
	return query, nil
}

func (api *projectAPI) filesHandler(r *http.Request, actor projectActor) (any, int, error) {
	projectID, err := normalizedNativeProjectID(r.PathValue("projectId"))
	if err != nil {
		return nil, 0, err
	}
	query, err := parseProjectFilesQuery(r.URL.Query())
	if err != nil {
		return nil, 0, err
	}
	files, err := api.files(r.Context(), actor, projectID, query)
	if err != nil {
		return nil, 0, err
	}
	return map[string]json.RawMessage{"files": files}, http.StatusOK, nil
}

func (api *projectAPI) files(ctx context.Context, actor projectActor, projectID string, query projectFilesQuery) (json.RawMessage, error) {
	args := []any{projectID, actor.organizationID, actor.canReadAllTeams(), actor.userID}
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
	args = append(args, query.limit, query.offset)
	limitPosition := len(args) - 1
	offsetPosition := len(args)

	statement := `
		with project as (
			select p.id, p.organization_id, p.target_locales
			from projects p
			where p.id = $1 and p.organization_id = $2 and p.source = 'native'
				and ` + formatQaProjectTeamAccessSQL(3, 4, 2) + `
		),
		ranked as (
			select v.id as version_id, v.source_path, v.source_hash, v.commit_sha,
				v.workflow_run_id, v.created_at as uploaded_at, v.stored_file_id,
				f.metadata, f.filename, f.byte_size,
				row_number() over (
					partition by v.source_path
					order by v.created_at desc, v.id desc
				) as version_rank
			from repository_source_file_versions v
			join project p on p.id = v.project_id and p.organization_id = v.organization_id
			join stored_files f on f.id = v.stored_file_id
				and f.organization_id = v.organization_id
				and f.project_id = v.project_id
			where f.role = 'source' and f.source_kind = 'repository_file'
		),
		selected as (
			select ranked.*
			from ranked
			cross join project p
			where ` + strings.Join(filters, " and ") + `
			order by ranked.source_path
			limit $` + strconv.Itoa(limitPosition) + ` offset $` + strconv.Itoa(offsetPosition) + `
		),
		latest_jobs as (
			select distinct on (d.source_file_version_id)
				d.source_file_version_id, j.id, j.status, j.created_at, d.type
			from translation_job_details d
			join jobs j on j.id = d.job_id
			join selected s on s.version_id = d.source_file_version_id
			where j.organization_id = $2 and j.project_id = $1
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
			where j.organization_id = $2 and j.project_id = $1
			order by d.source_file_version_id, locale.value, j.created_at desc, j.id desc
		)
		select exists(select 1 from project),
			coalesce((
				select jsonb_agg(
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
					order by s.source_path
				)
				from selected s
				cross join project p
				left join latest_jobs j on j.source_file_version_id = s.version_id
			), '[]'::jsonb)`

	var exists bool
	var files json.RawMessage
	if err := api.pool.QueryRow(ctx, statement, args...).Scan(&exists, &files); err != nil {
		return nil, fmt.Errorf("list native project files: %w", err)
	}
	if !exists {
		return nil, projectNotFound()
	}
	return files, nil
}
