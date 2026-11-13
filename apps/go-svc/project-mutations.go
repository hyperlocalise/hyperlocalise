package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/autumn"
	"github.com/hyperlocalise/hyperlocalise/internal/nativeproject"
	"github.com/hyperlocalise/hyperlocalise/internal/projecttemplate"
)

const (
	projectBodyLimit = 256 << 10

	projectLocalFallbackLimit = 1

	maxProjectNameLength               = 200
	maxProjectDescriptionLength        = 10_000
	maxProjectTranslationContextLength = 20_000
)

func invalidProjectPayload() error {
	return projectFailure(400, "invalid_project_payload", "Invalid project payload")
}

func invalidProjectTeam() error {
	return projectFailure(400, "invalid_project_payload", "Invalid project payload")
}

func projectPayloadTooLarge() error {
	return projectFailure(http.StatusRequestEntityTooLarge, "payload_too_large", "Request body exceeds maximum allowed size")
}

func workspaceResourceLimitReached() error {
	return projectFailure(409, "workspace_resource_limit_reached", "Project limit reached for your current plan.")
}

func workspaceResourceLimitCheckFailed() error {
	return projectFailure(503, "workspace_resource_limit_check_failed", "Unable to verify project limits. Try again later.")
}

func decodeProjectBody(r *http.Request, target any) error {
	decoder := json.NewDecoder(r.Body)
	if err := decoder.Decode(target); err != nil {
		if isRequestBodyTooLarge(err) {
			return projectPayloadTooLarge()
		}
		return invalidProjectPayload()
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		if isRequestBodyTooLarge(err) {
			return projectPayloadTooLarge()
		}
		return invalidProjectPayload()
	}
	return nil
}

type createProjectRequest struct {
	Name               string   `json:"name"`
	Description        *string  `json:"description"`
	TranslationContext *string  `json:"translationContext"`
	TeamID             *string  `json:"teamId"`
	SourceLocale       string   `json:"sourceLocale"`
	TargetLocales      []string `json:"targetLocales"`
	// TemplateID starts the project from a project template. Fields left out come from it.
	TemplateID *string `json:"templateId"`
}

type projectCreateInput struct {
	name               string
	description        string
	translationContext string
	teamID             *string
	sourceLocale       string
	targetLocales      []string
}

func (req createProjectRequest) validate() (projectCreateInput, error) {
	name := trimDictionaryInput(req.Name)
	if name == "" || utf16Length(name) > maxProjectNameLength {
		return projectCreateInput{}, invalidProjectPayload()
	}

	description := ""
	if req.Description != nil {
		description = *req.Description
		if utf16Length(description) > maxProjectDescriptionLength {
			return projectCreateInput{}, invalidProjectPayload()
		}
	}

	translationContext := ""
	if req.TranslationContext != nil {
		translationContext = *req.TranslationContext
		if utf16Length(translationContext) > maxProjectTranslationContextLength {
			return projectCreateInput{}, invalidProjectPayload()
		}
	}

	sourceLocale, ok := parseCanonicalLocale(req.SourceLocale)
	if !ok {
		return projectCreateInput{}, invalidProjectPayload()
	}

	targetLocales, err := normalizeProjectTargetLocales(req.TargetLocales)
	if err != nil {
		return projectCreateInput{}, err
	}

	if sourceLocaleInTargets(sourceLocale, targetLocales) {
		return projectCreateInput{}, invalidProjectPayload()
	}

	var teamID *string
	if req.TeamID != nil {
		trimmed := strings.TrimSpace(*req.TeamID)
		if _, err := uuid.Parse(trimmed); err != nil {
			return projectCreateInput{}, invalidProjectPayload()
		}
		teamID = &trimmed
	}

	return projectCreateInput{
		name:               name,
		description:        description,
		translationContext: translationContext,
		teamID:             teamID,
		sourceLocale:       sourceLocale,
		targetLocales:      targetLocales,
	}, nil
}

// projectInput turns the request into a native project. Without a template it keeps the original
// validation; with one, the template supplies every field the request leaves out.
func (api *projectAPI) projectInput(r *http.Request, actor projectActor, req createProjectRequest) (nativeproject.Input, string, error) {
	if req.TemplateID == nil {
		input, err := req.validate()
		if err != nil {
			return nativeproject.Input{}, "", err
		}
		return nativeproject.Input{
			Name:               input.name,
			Description:        input.description,
			TranslationContext: input.translationContext,
			SourceLocale:       input.sourceLocale,
			TargetLocales:      input.targetLocales,
			TeamID:             input.teamID,
		}, "", nil
	}
	template, err := projecttemplate.Get(r.Context(), api.pool, actor.organizationID, strings.TrimSpace(*req.TemplateID))
	if err != nil {
		return nativeproject.Input{}, "", projectTemplateFailure(err)
	}
	override := projecttemplate.ProjectRequest{
		Name:               req.Name,
		Description:        req.Description,
		TranslationContext: req.TranslationContext,
		TeamID:             req.TeamID,
	}
	if strings.TrimSpace(req.SourceLocale) != "" {
		override.SourceLocale = &req.SourceLocale
	}
	if req.TargetLocales != nil {
		override.TargetLocales = &req.TargetLocales
	}
	input, err := projecttemplate.ProjectInput(&template, override)
	if err != nil {
		return nativeproject.Input{}, "", projectTemplateFailure(err)
	}
	return input, template.ID, nil
}

const projectResponseColumns = `
	jsonb_build_object(
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
	)`

func (api *projectAPI) fetchProjectResponse(ctx context.Context, organizationID, projectID string) (json.RawMessage, error) {
	var project json.RawMessage
	err := api.pool.QueryRow(ctx, `
		select `+projectResponseColumns+`
		from projects p
		left join (
			select j.project_id, count(*)::int
			from jobs j
			where j.organization_id = $2
				and j.status in ('queued', 'running', 'waiting_for_review')
			group by j.project_id
		) open_jobs on open_jobs.project_id = p.id
		where p.id = $1 and p.organization_id = $2 and p.source = 'native'`,
		projectID, organizationID,
	).Scan(&project)
	if err != nil {
		return nil, err
	}
	return project, nil
}

func (api *projectAPI) createHandler(r *http.Request, actor projectActor) (any, int, error) {
	if !actor.canCreateProjects() {
		return nil, 0, projectForbidden()
	}

	var req createProjectRequest
	if err := decodeProjectBody(r, &req); err != nil {
		return nil, 0, err
	}
	input, templateID, err := api.projectInput(r, actor, req)
	if err != nil {
		return nil, 0, err
	}

	ctx := r.Context()
	tx, err := api.pool.Begin(ctx)
	if err != nil {
		return nil, 0, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, `select pg_advisory_xact_lock(hashtextextended($1, 0))`,
		"workspace_resource_limit:"+actor.organizationID+":projects"); err != nil {
		return nil, 0, err
	}

	var projectCount int
	if err := tx.QueryRow(ctx, `select count(*)::int from projects where organization_id=$1 and is_active=true`,
		actor.organizationID).Scan(&projectCount); err != nil {
		return nil, 0, workspaceResourceLimitCheckFailed()
	}
	requestedUsage := projectCount + 1
	if api.autumn == nil {
		if requestedUsage > projectLocalFallbackLimit {
			return nil, 0, workspaceResourceLimitReached()
		}
	} else {
		required := float64(requestedUsage)
		limit, err := api.autumn.Check(ctx, autumn.CheckRequest{
			CustomerID:      actor.organizationID,
			FeatureID:       "projects",
			RequiredBalance: &required,
			WithPreview:     true,
		})
		if err != nil {
			return nil, 0, workspaceResourceLimitCheckFailed()
		}
		if !limit.Allowed {
			return nil, 0, workspaceResourceLimitReached()
		}
	}

	createdID, err := nativeproject.Create(ctx, tx, nativeproject.Actor{
		OrganizationID:  actor.organizationID,
		UserID:          actor.userID,
		CanReadAllTeams: actor.canReadAllTeams(),
	}, input)
	if err != nil {
		return nil, 0, nativeProjectFailure(err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, 0, err
	}

	api.publishActivity(ctx, activityLogEventInput{
		ActorUserID:    actor.userID,
		EventType:      "project_created",
		OrganizationID: actor.organizationID,
		Payload:        projectCreatedPayload(input.Name, createdID, templateID),
		TargetID:       createdID,
		TargetKind:     "project",
	})

	project, err := api.fetchProjectResponse(ctx, actor.organizationID, createdID)
	if err != nil {
		return nil, 0, err
	}
	return map[string]json.RawMessage{"project": project}, http.StatusCreated, nil
}

func projectCreatedPayload(name, projectID, templateID string) map[string]any {
	payload := map[string]any{"name": name, "resourceId": projectID, "source": "native"}
	if templateID != "" {
		payload["templateId"] = templateID
	}
	return payload
}

const nativeProjectOwnedWhere = `p.id=$1 and p.organization_id=$2 and p.source='native' and `

type existingProjectSettings struct {
	identifier    string
	sourceLocale  string
	targetLocales []string
}

func (api *projectAPI) loadOwnedNativeProjectSettings(ctx context.Context, actor projectActor, projectID string) (existingProjectSettings, error) {
	var settings existingProjectSettings
	var sourceLocale *string
	var targets []byte
	err := api.pool.QueryRow(ctx, `
		select p.identifier, p.source_locale, p.target_locales
		from projects p
		where `+nativeProjectOwnedWhere+formatQaProjectTeamAccessSQL(3, 4, 2),
		projectID, actor.organizationID, actor.canReadAllTeams(), actor.userID,
	).Scan(&settings.identifier, &sourceLocale, &targets)
	if isNoRows(err) {
		return existingProjectSettings{}, projectNotFound()
	}
	if err != nil {
		return existingProjectSettings{}, err
	}
	if sourceLocale != nil {
		settings.sourceLocale = *sourceLocale
	}
	settings.targetLocales = []string{}
	if len(targets) > 0 {
		_ = json.Unmarshal(targets, &settings.targetLocales)
	}
	return settings, nil
}

func (api *projectAPI) lockOwnedNativeProject(ctx context.Context, tx dictionaryDB, actor projectActor, projectID string) error {
	var id string
	err := tx.QueryRow(ctx, `
		select p.id from projects p
		where `+nativeProjectOwnedWhere+formatQaProjectTeamAccessSQL(3, 4, 2)+`
		for update`,
		projectID, actor.organizationID, actor.canReadAllTeams(), actor.userID,
	).Scan(&id)
	if isNoRows(err) {
		return projectNotFound()
	}
	return err
}

func (api *projectAPI) lockAndLoadProjectLocales(ctx context.Context, tx dictionaryDB, actor projectActor, projectID string) (string, []string, error) {
	var sourceLocale *string
	var targets []byte
	err := tx.QueryRow(ctx, `
		select p.source_locale, p.target_locales
		from projects p
		where `+nativeProjectOwnedWhere+formatQaProjectTeamAccessSQL(3, 4, 2)+`
		for update`,
		projectID, actor.organizationID, actor.canReadAllTeams(), actor.userID,
	).Scan(&sourceLocale, &targets)
	if isNoRows(err) {
		return "", nil, projectNotFound()
	}
	if err != nil {
		return "", nil, err
	}
	resolvedSource := ""
	if sourceLocale != nil {
		resolvedSource = *sourceLocale
	}
	resolvedTargets := []string{}
	if len(targets) > 0 {
		_ = json.Unmarshal(targets, &resolvedTargets)
	}
	return resolvedSource, resolvedTargets, nil
}

func appendProjectWriteWhere(args []any, projectID string, actor projectActor) ([]any, string) {
	args = append(args, projectID)
	idIdx := len(args)
	args = append(args, actor.organizationID)
	orgIdx := len(args)
	args = append(args, actor.canReadAllTeams())
	orgWideIdx := len(args)
	args = append(args, actor.userID)
	userIdx := len(args)
	whereClause := fmt.Sprintf("p.id=$%d and p.organization_id=$%d and p.source='native' and ", idIdx, orgIdx) +
		formatQaProjectTeamAccessSQL(orgWideIdx, userIdx, orgIdx)
	return args, whereClause
}

func projectSourceLocaleAttachedGlossaries() error {
	return projectFailure(400, "project_source_locale_attached_glossaries",
		"Cannot change the project source locale while attached glossaries use a different source locale")
}

func hasAttachedGlossarySourceLocaleConflict(ctx context.Context, db dictionaryDB, projectID, sourceLocale string) (bool, error) {
	var found string
	err := db.QueryRow(ctx, `
		select g.id from project_glossaries pg
		join glossaries g on g.id = pg.glossary_id
		where pg.project_id=$1 and g.source_locale<>$2
		limit 1`,
		projectID, sourceLocale).Scan(&found)
	if err == nil {
		return true, nil
	}
	if isNoRows(err) {
		return false, nil
	}
	return false, err
}

func identifierTaken() error {
	return projectFailure(409, "identifier_taken", "This project identifier is already in use")
}

func invalidProjectIdentifier() error {
	return projectFailure(400, "invalid_identifier", "Invalid project identifier")
}

type updateProjectRequest struct {
	name               *string
	description        *string
	translationContext *string
	teamID             *string
	sourceLocale       *string
	targetLocales      *[]string
	identifier         *string
}

func decodeUpdateProjectRequest(r *http.Request) (updateProjectRequest, []string, error) {
	var fields map[string]json.RawMessage
	decoder := json.NewDecoder(r.Body)
	if err := decoder.Decode(&fields); err != nil {
		if isRequestBodyTooLarge(err) {
			return updateProjectRequest{}, nil, projectPayloadTooLarge()
		}
		return updateProjectRequest{}, nil, invalidProjectPayload()
	}
	if fields == nil {
		return updateProjectRequest{}, nil, invalidProjectPayload()
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		if isRequestBodyTooLarge(err) {
			return updateProjectRequest{}, nil, projectPayloadTooLarge()
		}
		return updateProjectRequest{}, nil, invalidProjectPayload()
	}

	var req updateProjectRequest
	var changed []string

	if raw, ok := fields["name"]; ok {
		var v string
		if err := json.Unmarshal(raw, &v); err != nil {
			return updateProjectRequest{}, nil, invalidProjectPayload()
		}
		req.name = &v
		changed = append(changed, "name")
	}
	if raw, ok := fields["description"]; ok {
		var v string
		if err := json.Unmarshal(raw, &v); err != nil {
			return updateProjectRequest{}, nil, invalidProjectPayload()
		}
		req.description = &v
		changed = append(changed, "description")
	}
	if raw, ok := fields["translationContext"]; ok {
		var v string
		if err := json.Unmarshal(raw, &v); err != nil {
			return updateProjectRequest{}, nil, invalidProjectPayload()
		}
		req.translationContext = &v
		changed = append(changed, "translationContext")
	}
	if raw, ok := fields["teamId"]; ok {
		var v string
		if err := json.Unmarshal(raw, &v); err != nil {
			return updateProjectRequest{}, nil, invalidProjectPayload()
		}
		if _, err := uuid.Parse(strings.TrimSpace(v)); err != nil {
			return updateProjectRequest{}, nil, invalidProjectPayload()
		}
		req.teamID = &v
		changed = append(changed, "teamId")
	}
	if raw, ok := fields["sourceLocale"]; ok {
		var v string
		if err := json.Unmarshal(raw, &v); err != nil {
			return updateProjectRequest{}, nil, invalidProjectPayload()
		}
		req.sourceLocale = &v
		changed = append(changed, "sourceLocale")
	}
	if raw, ok := fields["targetLocales"]; ok {
		var v []string
		if err := json.Unmarshal(raw, &v); err != nil {
			return updateProjectRequest{}, nil, invalidProjectPayload()
		}
		req.targetLocales = &v
		changed = append(changed, "targetLocales")
	}
	if raw, ok := fields["identifier"]; ok {
		var v string
		if err := json.Unmarshal(raw, &v); err != nil {
			return updateProjectRequest{}, nil, invalidProjectPayload()
		}
		req.identifier = &v
		changed = append(changed, "identifier")
	}

	if len(changed) == 0 {
		return updateProjectRequest{}, nil, invalidProjectPayload()
	}
	return req, changed, nil
}

func (api *projectAPI) updateHandler(r *http.Request, actor projectActor) (any, int, error) {
	if !actor.canMutateProjects() {
		return nil, 0, projectForbidden()
	}
	projectID, err := normalizedNativeProjectID(r.PathValue("projectId"))
	if err != nil {
		return nil, 0, err
	}

	req, changedFields, err := decodeUpdateProjectRequest(r)
	if err != nil {
		return nil, 0, err
	}

	ctx := r.Context()
	existing, err := api.loadOwnedNativeProjectSettings(ctx, actor, projectID)
	if err != nil {
		return nil, 0, err
	}

	var args []any
	arg := func(v any) string {
		args = append(args, v)
		return fmt.Sprintf("$%d", len(args))
	}
	var sets []string

	if req.name != nil {
		name := trimDictionaryInput(*req.name)
		if name == "" || utf16Length(name) > maxProjectNameLength {
			return nil, 0, invalidProjectPayload()
		}
		sets = append(sets, "name="+arg(name))
	}
	if req.description != nil {
		if utf16Length(*req.description) > maxProjectDescriptionLength {
			return nil, 0, invalidProjectPayload()
		}
		sets = append(sets, "description="+arg(*req.description))
	}
	if req.translationContext != nil {
		if utf16Length(*req.translationContext) > maxProjectTranslationContextLength {
			return nil, 0, invalidProjectPayload()
		}
		sets = append(sets, "translation_context="+arg(*req.translationContext))
	}
	if req.identifier != nil {
		normalized, ok := normalizeProjectIdentifierInput(*req.identifier)
		if !ok {
			return nil, 0, invalidProjectIdentifier()
		}
		if normalized != existing.identifier {
			taken, err := isProjectIdentifierTaken(ctx, api.pool, actor.organizationID, normalized, projectID)
			if err != nil {
				return nil, 0, err
			}
			if taken {
				return nil, 0, identifierTaken()
			}
		}
		sets = append(sets, "identifier="+arg(normalized))
	}
	if req.teamID != nil {
		teamID, err := resolveProjectTeam(ctx, api.pool, actor, req.teamID)
		if err != nil {
			return nil, 0, err
		}
		sets = append(sets, "team_id="+arg(teamID))
	}

	localeChanging := req.sourceLocale != nil || req.targetLocales != nil

	var rowsAffected int64
	if localeChanging {
		tx, err := api.pool.Begin(ctx)
		if err != nil {
			return nil, 0, err
		}
		defer func() { _ = tx.Rollback(ctx) }()

		if api.testBeforeLocaleLock != nil {
			api.testBeforeLocaleLock()
		}

		lockedSourceLocale, lockedTargetLocales, err := api.lockAndLoadProjectLocales(ctx, tx, actor, projectID)
		if err != nil {
			return nil, 0, err
		}
		patch, err := normalizeProjectLocalePatch(lockedSourceLocale, lockedTargetLocales, req.sourceLocale, req.targetLocales)
		if err != nil {
			return nil, 0, err
		}
		if patch.sourceLocale != nil {
			sets = append(sets, "source_locale="+arg(*patch.sourceLocale))
			conflict, err := hasAttachedGlossarySourceLocaleConflict(ctx, tx, projectID, *patch.sourceLocale)
			if err != nil {
				return nil, 0, err
			}
			if conflict {
				return nil, 0, projectSourceLocaleAttachedGlossaries()
			}
		}
		if patch.targetLocales != nil {
			targetLocalesJSON, jsonErr := json.Marshal(*patch.targetLocales)
			if jsonErr != nil {
				return nil, 0, jsonErr
			}
			sets = append(sets, "target_locales="+arg(targetLocalesJSON)+"::jsonb")
		}

		sets = append(sets, "updated_at=now()")
		setClause := strings.Join(sets, ", ")
		var whereClause string
		args, whereClause = appendProjectWriteWhere(args, projectID, actor)

		if api.testBeforeUpdateWrite != nil {
			api.testBeforeUpdateWrite()
		}

		tag, err := tx.Exec(ctx, `update projects p set `+setClause+` where `+whereClause, args...)
		if err != nil {
			if isUniqueViolation(err) {
				return nil, 0, identifierTaken()
			}
			return nil, 0, err
		}
		rowsAffected = tag.RowsAffected()
		if rowsAffected > 0 {
			if err := tx.Commit(ctx); err != nil {
				return nil, 0, err
			}
		}
	} else {
		sets = append(sets, "updated_at=now()")
		setClause := strings.Join(sets, ", ")
		var whereClause string
		args, whereClause = appendProjectWriteWhere(args, projectID, actor)

		if api.testBeforeUpdateWrite != nil {
			api.testBeforeUpdateWrite()
		}

		tag, err := api.pool.Exec(ctx, `update projects p set `+setClause+` where `+whereClause, args...)
		if err != nil {
			if isUniqueViolation(err) {
				return nil, 0, identifierTaken()
			}
			return nil, 0, err
		}
		rowsAffected = tag.RowsAffected()
	}
	if rowsAffected == 0 {
		return nil, 0, projectNotFound()
	}

	project, err := api.fetchProjectResponse(ctx, actor.organizationID, projectID)
	if err != nil {
		return nil, 0, err
	}

	api.publishActivity(ctx, activityLogEventInput{
		ActorUserID:    actor.userID,
		EventType:      "project_settings_changed",
		OrganizationID: actor.organizationID,
		Payload: map[string]any{
			"changedFields": changedFields,
			"projectId":     projectID,
		},
		TargetID:   projectID,
		TargetKind: "project",
	})

	return map[string]json.RawMessage{"project": project}, http.StatusOK, nil
}

func glossaryTeamProjectRequired() error {
	return projectFailure(403, "glossary_team_project_required", "Team glossaries must attach at least one accessible project")
}

func (api *projectAPI) deleteHandler(r *http.Request, actor projectActor) (any, int, error) {
	if !actor.canMutateProjects() {
		return nil, 0, projectForbidden()
	}
	projectID, err := normalizedNativeProjectID(r.PathValue("projectId"))
	if err != nil {
		return nil, 0, err
	}

	ctx := r.Context()
	tx, err := api.pool.Begin(ctx)
	if err != nil {
		return nil, 0, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if err := api.lockOwnedNativeProject(ctx, tx, actor, projectID); err != nil {
		return nil, 0, err
	}

	glossaryIDs, err := teamGlossariesAttachedToProject(ctx, tx, actor.organizationID, projectID)
	if err != nil {
		return nil, 0, err
	}

	if len(glossaryIDs) > 0 {
		lockRows, err := tx.Query(ctx, `select id from glossaries where id=any($1) for update`, glossaryIDs)
		if err != nil {
			return nil, 0, err
		}
		for lockRows.Next() {
		}
		if err := lockRows.Err(); err != nil {
			lockRows.Close()
			return nil, 0, err
		}
		lockRows.Close()

		if api.testAfterGlossaryLock != nil {
			api.testAfterGlossaryLock()
		}

		for _, glossaryID := range glossaryIDs {
			var nativeCount int
			if err := tx.QueryRow(ctx, `
				select count(*) from project_glossaries pg
				join projects p on p.id = pg.project_id
				where pg.glossary_id=$1 and p.source='native'`,
				glossaryID).Scan(&nativeCount); err != nil {
				return nil, 0, err
			}
			if nativeCount <= 1 {
				return nil, 0, glossaryTeamProjectRequired()
			}
		}
	}

	tag, err := tx.Exec(ctx, `
		delete from projects p
		where `+nativeProjectOwnedWhere+formatQaProjectTeamAccessSQL(3, 4, 2),
		projectID, actor.organizationID, actor.canReadAllTeams(), actor.userID)
	if err != nil {
		return nil, 0, err
	}
	if tag.RowsAffected() == 0 {
		return nil, 0, projectNotFound()
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, 0, err
	}

	api.publishActivity(ctx, activityLogEventInput{
		ActorUserID:    actor.userID,
		EventType:      "project_deleted",
		OrganizationID: actor.organizationID,
		Payload: map[string]any{
			"resourceId": projectID,
		},
		TargetID:   projectID,
		TargetKind: "project",
	})

	return nil, http.StatusNoContent, nil
}

func teamGlossariesAttachedToProject(ctx context.Context, db dictionaryDB, organizationID, projectID string) ([]string, error) {
	rows, err := db.Query(ctx, `
		select distinct g.id
		from glossaries g
		join project_glossaries pg on pg.glossary_id = g.id
		join projects p on p.id = pg.project_id
		where pg.project_id=$1 and pg.organization_id=$2
			and g.organization_id=$2 and g.control_level='team' and p.source='native'`,
		projectID, organizationID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

type updateContentEditorBehaviorRequest struct {
	AutomaticallyGroupIdenticalStrings *bool   `json:"automaticallyGroupIdenticalStrings"`
	ApprovedTranslationsOnSourceChange *string `json:"approvedTranslationsOnSourceChange"`
	SourceTextEditable                 *bool   `json:"sourceTextEditable"`
}

func (api *projectAPI) updateContentEditorBehaviorHandler(r *http.Request, actor projectActor) (any, int, error) {
	if !actor.canManageContentEditorBehavior() {
		return nil, 0, projectForbidden()
	}
	projectID, err := normalizedNativeProjectID(r.PathValue("projectId"))
	if err != nil {
		return nil, 0, err
	}
	var req updateContentEditorBehaviorRequest
	if err := decodeProjectBody(r, &req); err != nil {
		return nil, 0, err
	}
	if req.AutomaticallyGroupIdenticalStrings == nil && req.ApprovedTranslationsOnSourceChange == nil &&
		req.SourceTextEditable == nil {
		return nil, 0, invalidProjectPayload()
	}
	if value := req.ApprovedTranslationsOnSourceChange; value != nil && *value != "stay_approved" && *value != "needs_review" {
		return nil, 0, invalidProjectPayload()
	}

	ctx := r.Context()
	tx, err := api.pool.Begin(ctx)
	if err != nil {
		return nil, 0, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	// Only a grouping change bumps the grouping revision, so open content editors refresh only then.
	if req.AutomaticallyGroupIdenticalStrings != nil {
		if _, err := tx.Exec(ctx, `
			update projects p
			set automatically_group_identical_strings=$3,
				cat_grouping_revision=cat_grouping_revision+1,
				updated_by_user_id=$4,
				updated_at=now()
			where `+nativeProjectOwnedWhere+formatQaProjectTeamAccessSQL(5, 6, 2)+`
				and p.automatically_group_identical_strings is distinct from $3`,
			projectID, actor.organizationID, *req.AutomaticallyGroupIdenticalStrings, actor.userID,
			actor.canReadAllTeams(), actor.userID,
		); err != nil {
			return nil, 0, err
		}
	}
	if req.ApprovedTranslationsOnSourceChange != nil {
		if _, err := tx.Exec(ctx, `
			update projects p
			set approved_translations_on_source_change=$3,
				updated_by_user_id=$4,
				updated_at=now()
			where `+nativeProjectOwnedWhere+formatQaProjectTeamAccessSQL(5, 6, 2)+`
				and p.approved_translations_on_source_change is distinct from $3`,
			projectID, actor.organizationID, *req.ApprovedTranslationsOnSourceChange, actor.userID,
			actor.canReadAllTeams(), actor.userID,
		); err != nil {
			return nil, 0, err
		}
	}
	if req.SourceTextEditable != nil {
		if _, err := tx.Exec(ctx, `
			update projects p
			set source_text_editable=$3,
				updated_by_user_id=$4,
				updated_at=now()
			where `+nativeProjectOwnedWhere+formatQaProjectTeamAccessSQL(5, 6, 2)+`
				and p.source_text_editable is distinct from $3`,
			projectID, actor.organizationID, *req.SourceTextEditable, actor.userID,
			actor.canReadAllTeams(), actor.userID,
		); err != nil {
			return nil, 0, err
		}
	}
	behavior, err := loadContentEditorBehavior(ctx, tx, projectID, actor)
	if isNoRows(err) {
		return nil, 0, projectNotFound()
	}
	if err != nil {
		return nil, 0, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, 0, err
	}
	return behavior.response(actor), http.StatusOK, nil
}
