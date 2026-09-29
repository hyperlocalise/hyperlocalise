package main

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/autumn"
)

const (
	projectBodyLimit = 64 << 10

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
	return projectFailure(400, "invalid_project_team", "Invalid team for this project")
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
		return invalidProjectPayload()
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
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

	var defaultTeamID string
	err := tx.QueryRow(ctx, `
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
