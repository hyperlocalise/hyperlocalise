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
)

const (
	projectBodyLimit = 256 << 10

	projectLocalFallbackLimit = 1

	defaultNativeProjectMemoryNameFallback = "Translation memory"
	maxNativeProjectMemoryNameLength       = 200

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

func resolveProjectTeam(ctx context.Context, tx dictionaryDB, actor projectActor, teamID *string) (string, error) {
	if teamID != nil {
		var found string
		var err error
		if actor.canReadAllTeams() {
			err = tx.QueryRow(ctx, `select id from teams where id=$1 and organization_id=$2`,
				*teamID, actor.organizationID).Scan(&found)
		} else {
			err = tx.QueryRow(ctx, `
				select t.id from teams t join team_memberships m on m.team_id=t.id
				where t.id=$1 and t.organization_id=$2 and m.user_id=$3`,
				*teamID, actor.organizationID, actor.userID).Scan(&found)
		}
		if isNoRows(err) {
			return "", invalidProjectTeam()
		}
		if err != nil {
			return "", err
		}
		return found, nil
	}

	var activeTeamID string
	var err error
	if actor.canReadAllTeams() {
		err = tx.QueryRow(ctx, `select id from teams where organization_id=$1 order by slug limit 1`,
			actor.organizationID).Scan(&activeTeamID)
	} else {
		err = tx.QueryRow(ctx, `
			select t.id from teams t join team_memberships m on m.team_id=t.id
			where t.organization_id=$1 and m.user_id=$2
			order by t.slug limit 1`,
			actor.organizationID, actor.userID).Scan(&activeTeamID)
	}
	if err == nil {
		return activeTeamID, nil
	}
	if !isNoRows(err) {
		return "", err
	}

	var defaultTeamID string
	err = tx.QueryRow(ctx, `
		insert into teams(organization_id,slug,name) values($1,'default','Default team')
		on conflict(organization_id,slug) do update set slug=excluded.slug
		returning id`,
		actor.organizationID).Scan(&defaultTeamID)
	if err != nil {
		return "", err
	}
	return defaultTeamID, nil
}

func defaultNativeProjectMemoryName(projectName string) string {
	name := trimDictionaryInput(projectName)
	if name == "" {
		return defaultNativeProjectMemoryNameFallback
	}
	if utf16Length(name) > maxNativeProjectMemoryNameLength {
		runes := []rune(name)
		if len(runes) > maxNativeProjectMemoryNameLength {
			return string(runes[:maxNativeProjectMemoryNameLength])
		}
	}
	return name
}

func ensureDefaultNativeProjectMemory(ctx context.Context, tx dictionaryDB, organizationID, projectID, projectName, createdByUserID string) error {
	var hasMemory bool
	if err := tx.QueryRow(ctx, `select exists(select 1 from project_memories where project_id=$1)`, projectID).Scan(&hasMemory); err != nil {
		return err
	}
	if hasMemory {
		return nil
	}
	var memoryID string
	if err := tx.QueryRow(ctx, `
		insert into memories(organization_id,created_by_user_id,name,description,source)
		values($1,$2,$3,'','native') returning id`,
		organizationID, createdByUserID, defaultNativeProjectMemoryName(projectName)).Scan(&memoryID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
		insert into project_memories(organization_id,project_id,memory_id,priority) values($1,$2,$3,0)`,
		organizationID, projectID, memoryID); err != nil {
		return err
	}
	return nil
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
	input, err := req.validate()
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

	teamID, err := resolveProjectTeam(ctx, tx, actor, input.teamID)
	if err != nil {
		return nil, 0, err
	}

	targetLocalesJSON, err := json.Marshal(input.targetLocales)
	if err != nil {
		return nil, 0, err
	}

	projectID := "project_" + uuid.NewString()
	createdID, err := insertProjectWithAllocatedIdentifier(ctx, tx, actor.organizationID, input.name,
		func(ctx context.Context, identifier string) (string, error) {
			var id string
			err := tx.QueryRow(ctx, `
				insert into projects (
					id, organization_id, team_id, created_by_user_id, name, identifier,
					description, translation_context, source, source_locale, target_locales
				) values ($1,$2,$3,$4,$5,$6,$7,$8,'native',$9,$10::jsonb)
				on conflict (organization_id, identifier) do nothing
				returning id`,
				projectID, actor.organizationID, teamID, actor.userID, input.name, identifier,
				input.description, input.translationContext, input.sourceLocale, targetLocalesJSON,
			).Scan(&id)
			return id, err
		},
	)
	if err != nil {
		return nil, 0, err
	}

	if err := ensureDefaultNativeProjectMemory(ctx, tx, actor.organizationID, createdID, input.name, actor.userID); err != nil {
		return nil, 0, err
	}

	if !actor.canReadAllTeams() {
		if _, err := tx.Exec(ctx, `
			insert into team_memberships(team_id,user_id,role) values($1,$2,'member')
			on conflict(team_id,user_id) do nothing`,
			teamID, actor.userID); err != nil {
			return nil, 0, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, 0, err
	}

	api.publishActivity(ctx, activityLogEventInput{
		ActorUserID:    actor.userID,
		EventType:      "project_created",
		OrganizationID: actor.organizationID,
		Payload: map[string]any{
			"name":       input.name,
			"resourceId": createdID,
			"source":     "native",
		},
		TargetID:   createdID,
		TargetKind: "project",
	})

	project, err := api.fetchProjectResponse(ctx, actor.organizationID, createdID)
	if err != nil {
		return nil, 0, err
	}
	return map[string]json.RawMessage{"project": project}, http.StatusCreated, nil
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
	AutomaticallyGroupIdenticalStrings *bool `json:"automaticallyGroupIdenticalStrings"`
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
	if req.AutomaticallyGroupIdenticalStrings == nil {
		return nil, 0, invalidProjectPayload()
	}

	ctx := r.Context()
	var automaticallyGroupIdenticalStrings bool
	var groupingRevision int
	err = api.pool.QueryRow(ctx, `
		update projects p
		set automatically_group_identical_strings=$3,
			cat_grouping_revision=cat_grouping_revision+1,
			updated_by_user_id=$4,
			updated_at=now()
		where `+nativeProjectOwnedWhere+formatQaProjectTeamAccessSQL(5, 6, 2)+`
			and p.automatically_group_identical_strings is distinct from $3
		returning p.automatically_group_identical_strings, p.cat_grouping_revision`,
		projectID, actor.organizationID, *req.AutomaticallyGroupIdenticalStrings, actor.userID,
		actor.canReadAllTeams(), actor.userID,
	).Scan(&automaticallyGroupIdenticalStrings, &groupingRevision)
	if isNoRows(err) {
		err = api.pool.QueryRow(ctx, `
			select p.automatically_group_identical_strings, p.cat_grouping_revision
			from projects p
			where `+nativeProjectOwnedWhere+formatQaProjectTeamAccessSQL(3, 4, 2),
			projectID, actor.organizationID, actor.canReadAllTeams(), actor.userID,
		).Scan(&automaticallyGroupIdenticalStrings, &groupingRevision)
		if isNoRows(err) {
			return nil, 0, projectNotFound()
		}
	}
	if err != nil {
		return nil, 0, err
	}

	return map[string]any{
		"contentEditorBehavior": map[string]any{
			"automaticallyGroupIdenticalStrings": automaticallyGroupIdenticalStrings,
			"groupingRevision":                   groupingRevision,
			"canManage":                          true,
		},
	}, http.StatusOK, nil
}
