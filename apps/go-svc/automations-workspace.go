package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

var workspaceAutomationStatuses = map[string]struct{}{
	"active":   {},
	"paused":   {},
	"archived": {},
}

var workspaceAutomationCreateKeys = map[string]struct{}{
	"kind":             {},
	"status":           {},
	"name":             {},
	"instructions":     {},
	"skillIds":         {},
	"model":            {},
	"nextRunAt":        {},
	"projectId":        {},
	"triggerConfig":    {},
	"repositoryTarget": {},
	"toolConfig":       {},
	"syncConfig":       {},
}

var workspaceAutomationUpdateKeys = map[string]struct{}{
	"status":           {},
	"name":             {},
	"instructions":     {},
	"skillIds":         {},
	"model":            {},
	"nextRunAt":        {},
	"projectId":        {},
	"triggerConfig":    {},
	"repositoryTarget": {},
	"toolConfig":       {},
	"syncConfig":       {},
	"authorUserId":     {},
}

type workspaceAutomationRecord struct {
	ID               string          `json:"id"`
	OrganizationID   string          `json:"organizationId"`
	AuthorUserID     *string         `json:"authorUserId"`
	AuthorName       *string         `json:"authorName"`
	Status           string          `json:"status"`
	Kind             string          `json:"kind"`
	Name             string          `json:"name"`
	Instructions     string          `json:"instructions"`
	Model            string          `json:"model"`
	ProjectID        *string         `json:"projectId"`
	TriggerConfig    json.RawMessage `json:"triggerConfig"`
	RepositoryTarget json.RawMessage `json:"repositoryTarget"`
	ToolConfig       json.RawMessage `json:"toolConfig"`
	SkillIDs         []string        `json:"skillIds"`
	SyncConfig       json.RawMessage `json:"syncConfig"`
	ConfigVersion    int             `json:"configVersion"`
	NextRunAt        *string         `json:"nextRunAt"`
	LastRunStatus    *string         `json:"lastRunStatus,omitempty"`
	LastRunError     *string         `json:"lastRunError,omitempty"`
	LastRunAt        *string         `json:"lastRunAt,omitempty"`
	CreatedAt        string          `json:"createdAt"`
	UpdatedAt        string          `json:"updatedAt"`
}

type workspaceAutomationRunRecord struct {
	ID                              string          `json:"id"`
	AutomationID                    string          `json:"automationId"`
	OrganizationID                  string          `json:"organizationId"`
	TriggerSource                   string          `json:"triggerSource"`
	Status                          string          `json:"status"`
	IdempotencyKey                  *string         `json:"idempotencyKey"`
	InputSnapshot                   json.RawMessage `json:"inputSnapshot"`
	OutputSummary                   json.RawMessage `json:"outputSummary"`
	Error                           json.RawMessage `json:"error"`
	GithubRepositoryAutomationJobID *string         `json:"githubRepositoryAutomationJobId"`
	StartedAt                       *string         `json:"startedAt"`
	CompletedAt                     *string         `json:"completedAt"`
	CreatedAt                       string          `json:"createdAt"`
	UpdatedAt                       string          `json:"updatedAt"`
}

type workspaceAutomationWrite struct {
	kind             string
	status           string
	name             string
	instructions     string
	model            string
	projectID        *string
	triggerConfig    json.RawMessage
	repositoryTarget json.RawMessage
	toolConfig       json.RawMessage
	skillIDs         []string
	syncConfig       json.RawMessage
	nextRunAt        *time.Time
	setNextRunAt     bool
	authorUserID     *string
	has              struct {
		status, name, instructions, model, projectID, triggerConfig, repositoryTarget, toolConfig, skillIDs, syncConfig, authorUserID bool
	}
}

func (api *automationAPI) listWorkspaceAutomations(r *http.Request, actor automationActor) (any, int, error) {
	status, projectID, limit, offset, err := parseAutomationListQuery(r, workspaceAutomationStatuses)
	if err != nil {
		return nil, 0, err
	}
	records, err := api.loadWorkspaceAutomations(r.Context(), actor.organizationID, status, projectID, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	if records == nil {
		records = []workspaceAutomationRecord{}
	}
	return map[string]any{"automations": records}, http.StatusOK, nil
}

func (api *automationAPI) getWorkspaceAutomation(r *http.Request, actor automationActor) (any, int, error) {
	id, err := automationIDParam(r, "automationId", "workspace_automation_not_found")
	if err != nil {
		return nil, 0, err
	}
	record, err := api.loadWorkspaceAutomation(r.Context(), actor.organizationID, id)
	if err != nil {
		return nil, 0, err
	}
	runs, err := api.loadWorkspaceAutomationRuns(r.Context(), actor.organizationID, id, automationRecentRunLimit)
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"automation": record, "recentRuns": runs}, http.StatusOK, nil
}

func (api *automationAPI) createWorkspaceAutomation(r *http.Request, actor automationActor) (any, int, error) {
	write, err := parseWorkspaceAutomationCreate(r)
	if err != nil {
		return nil, 0, err
	}
	if err := api.validateWorkspaceProject(r.Context(), actor.organizationID, write.projectID); err != nil {
		return nil, 0, err
	}
	record, err := api.insertWorkspaceAutomation(r.Context(), actor, write)
	if err != nil {
		return nil, 0, err
	}
	api.publishActivity(r.Context(), activityLogEventInput{
		ActorKind:      "user",
		ActorUserID:    actor.userID,
		EventType:      "automation_created",
		OrganizationID: actor.organizationID,
		Payload: map[string]any{
			"automationId": record.ID,
			"name":         record.Name,
			"status":       record.Status,
		},
		TargetID:   record.ID,
		TargetKind: "automation",
	})
	return map[string]any{"automation": record, "recentRuns": []workspaceAutomationRunRecord{}}, http.StatusCreated, nil
}

func (api *automationAPI) patchWorkspaceAutomation(r *http.Request, actor automationActor) (any, int, error) {
	id, err := automationIDParam(r, "automationId", "workspace_automation_not_found")
	if err != nil {
		return nil, 0, err
	}
	existing, err := api.loadWorkspaceAutomation(r.Context(), actor.organizationID, id)
	if err != nil {
		return nil, 0, err
	}
	write, err := parseWorkspaceAutomationUpdate(r, existing)
	if err != nil {
		return nil, 0, err
	}
	if err := api.validateWorkspaceProject(r.Context(), actor.organizationID, write.projectID); err != nil {
		return nil, 0, err
	}
	if write.has.authorUserID && write.authorUserID != nil {
		if err := api.validateAssignableAuthor(r.Context(), actor.organizationID, *write.authorUserID); err != nil {
			return nil, 0, err
		}
	}
	record, err := api.updateWorkspaceAutomation(r.Context(), actor.organizationID, existing, write)
	if err != nil {
		return nil, 0, err
	}
	if write.has.status && write.status != existing.Status && (write.status == "active" || write.status == "paused" || existing.Status == "active" || existing.Status == "paused") {
		eventType := "automation_disabled"
		if record.Status == "active" {
			eventType = "automation_enabled"
		}
		api.publishActivity(r.Context(), activityLogEventInput{
			ActorKind:      "user",
			ActorUserID:    actor.userID,
			EventType:      eventType,
			OrganizationID: actor.organizationID,
			Payload: map[string]any{
				"automationId": record.ID,
				"name":         record.Name,
				"status":       record.Status,
			},
			TargetID:   record.ID,
			TargetKind: "automation",
		})
	}
	runs, err := api.loadWorkspaceAutomationRuns(r.Context(), actor.organizationID, record.ID, automationRecentRunLimit)
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"automation": record, "recentRuns": runs}, http.StatusOK, nil
}

func (api *automationAPI) deleteWorkspaceAutomation(r *http.Request, actor automationActor) (any, int, error) {
	id, err := automationIDParam(r, "automationId", "workspace_automation_not_found")
	if err != nil {
		return nil, 0, err
	}
	existing, err := api.loadWorkspaceAutomation(r.Context(), actor.organizationID, id)
	if err != nil {
		return nil, 0, err
	}
	record, err := api.archiveWorkspaceAutomation(r.Context(), actor.organizationID, existing)
	if err != nil {
		return nil, 0, err
	}
	if existing.Status != "archived" {
		api.publishActivity(r.Context(), activityLogEventInput{
			ActorKind:      "user",
			ActorUserID:    actor.userID,
			EventType:      "automation_deleted",
			OrganizationID: actor.organizationID,
			Payload: map[string]any{
				"automationId": record.ID,
				"name":         record.Name,
				"status":       "archived",
			},
			TargetID:   record.ID,
			TargetKind: "automation",
		})
	}
	return nil, http.StatusNoContent, nil
}

func parseWorkspaceAutomationCreate(r *http.Request) (workspaceAutomationWrite, error) {
	fields, err := readJSONObject(r)
	if err != nil {
		return workspaceAutomationWrite{}, invalidWorkspaceAutomationPayload()
	}
	if err := rejectUnknownJSONKeys(fields, workspaceAutomationCreateKeys, "invalid_workspace_automation_payload", "Automation payload is invalid."); err != nil {
		return workspaceAutomationWrite{}, err
	}
	write := workspaceAutomationWrite{
		kind:             "agent",
		status:           "active",
		model:            automationDefaultModel,
		triggerConfig:    emptyJSONObject,
		repositoryTarget: json.RawMessage(`{"kind":"none"}`),
		toolConfig:       emptyJSONObject,
		syncConfig:       emptyJSONObject,
		skillIDs:         []string{},
	}
	if raw, ok := fields["kind"]; ok {
		kind, valid := decodeJSONString(raw)
		if !valid || (kind != "agent" && kind != "content_sync") {
			return workspaceAutomationWrite{}, invalidWorkspaceAutomationPayload()
		}
		write.kind = kind
	}
	if err := applyWorkspaceAutomationFields(&write, fields, true); err != nil {
		return workspaceAutomationWrite{}, err
	}
	if write.kind == "content_sync" {
		write.instructions = ""
		write.skillIDs = []string{}
		if write.projectID == nil || strings.TrimSpace(*write.projectID) == "" {
			return workspaceAutomationWrite{}, automationFailure(http.StatusBadRequest, "project_required", "Choose a Hyperlocalise project for this automation.")
		}
		if !write.has.syncConfig {
			return workspaceAutomationWrite{}, invalidWorkspaceAutomationPayload()
		}
	} else if strings.TrimSpace(write.instructions) == "" && len(write.skillIDs) == 0 {
		return workspaceAutomationWrite{}, automationFailure(http.StatusBadRequest, "invalid_workspace_automation_payload", "Instructions are required when no skill is attached")
	}
	if strings.TrimSpace(write.name) == "" {
		return workspaceAutomationWrite{}, invalidWorkspaceAutomationPayload()
	}
	return write, nil
}

func parseWorkspaceAutomationUpdate(r *http.Request, existing workspaceAutomationRecord) (workspaceAutomationWrite, error) {
	fields, err := readJSONObject(r)
	if err != nil {
		return workspaceAutomationWrite{}, invalidWorkspaceAutomationPayload()
	}
	if len(fields) == 0 {
		return workspaceAutomationWrite{}, automationFailure(http.StatusBadRequest, "invalid_workspace_automation_payload", "Expected at least one automation field")
	}
	if err := rejectUnknownJSONKeys(fields, workspaceAutomationUpdateKeys, "invalid_workspace_automation_payload", "Automation payload is invalid."); err != nil {
		return workspaceAutomationWrite{}, err
	}
	write := workspaceAutomationWrite{
		kind:             existing.Kind,
		status:           existing.Status,
		name:             existing.Name,
		instructions:     existing.Instructions,
		model:            existing.Model,
		projectID:        existing.ProjectID,
		triggerConfig:    jsonRawObject(existing.TriggerConfig),
		repositoryTarget: jsonRawObject(existing.RepositoryTarget),
		toolConfig:       jsonRawObject(existing.ToolConfig),
		skillIDs:         append([]string(nil), existing.SkillIDs...),
		syncConfig:       jsonRawObject(existing.SyncConfig),
	}
	if err := applyWorkspaceAutomationFields(&write, fields, false); err != nil {
		return workspaceAutomationWrite{}, err
	}
	if write.kind != "content_sync" && (write.has.instructions || write.has.skillIDs) &&
		strings.TrimSpace(write.instructions) == "" && len(write.skillIDs) == 0 {
		return workspaceAutomationWrite{}, automationFailure(http.StatusBadRequest, "instructions_or_skill_required", "Add a skill or write instructions.")
	}
	return write, nil
}

func applyWorkspaceAutomationFields(write *workspaceAutomationWrite, fields map[string]json.RawMessage, creating bool) error {
	if raw, ok := fields["status"]; ok {
		status, valid := decodeJSONString(raw)
		if !valid {
			return invalidWorkspaceAutomationPayload()
		}
		if _, allowed := workspaceAutomationStatuses[status]; !allowed {
			return invalidWorkspaceAutomationPayload()
		}
		write.status = status
		write.has.status = true
	}
	if raw, ok := fields["name"]; ok {
		name, valid := decodeJSONString(raw)
		if !valid {
			return invalidWorkspaceAutomationPayload()
		}
		name = strings.TrimSpace(name)
		if name == "" || utf16Length(name) > automationNameMaxChars {
			return invalidWorkspaceAutomationPayload()
		}
		write.name = name
		write.has.name = true
	} else if creating {
		return invalidWorkspaceAutomationPayload()
	}
	if raw, ok := fields["instructions"]; ok {
		instructions, valid := decodeJSONString(raw)
		if !valid {
			return invalidWorkspaceAutomationPayload()
		}
		if utf16Length(instructions) > automationInstructionsMax {
			return invalidWorkspaceAutomationPayload()
		}
		write.instructions = instructions
		write.has.instructions = true
	}
	if raw, ok := fields["model"]; ok {
		model, valid := decodeJSONString(raw)
		if !valid || strings.TrimSpace(model) == "" {
			return invalidWorkspaceAutomationPayload()
		}
		if model == "openai/gpt-5.6-luna" {
			model = automationDefaultModel
		}
		write.model = model
		write.has.model = true
	}
	if raw, ok := fields["projectId"]; ok {
		if bytesEqualNull(raw) {
			write.projectID = nil
		} else {
			projectID, valid := decodeJSONString(raw)
			if !valid {
				return invalidWorkspaceAutomationPayload()
			}
			projectID = strings.TrimSpace(projectID)
			if projectID == "" {
				write.projectID = nil
			} else {
				write.projectID = &projectID
			}
		}
		write.has.projectID = true
	}
	if raw, ok := fields["triggerConfig"]; ok {
		if !requireJSONObjectField(raw) {
			return invalidWorkspaceAutomationPayload()
		}
		write.triggerConfig = jsonRawObject(raw)
		write.has.triggerConfig = true
	}
	if raw, ok := fields["repositoryTarget"]; ok {
		if !requireJSONObjectField(raw) {
			return invalidWorkspaceAutomationPayload()
		}
		write.repositoryTarget = jsonRawObject(raw)
		write.has.repositoryTarget = true
	}
	if raw, ok := fields["toolConfig"]; ok {
		if !requireJSONObjectField(raw) {
			return invalidWorkspaceAutomationPayload()
		}
		write.toolConfig = jsonRawObject(raw)
		write.has.toolConfig = true
	}
	if raw, ok := fields["syncConfig"]; ok {
		if !requireJSONObjectField(raw) {
			return invalidWorkspaceAutomationPayload()
		}
		write.syncConfig = jsonRawObject(raw)
		write.has.syncConfig = true
	}
	if raw, ok := fields["skillIds"]; ok {
		ids, err := parseSkillIDs(raw)
		if err != nil {
			return err
		}
		write.skillIDs = ids
		write.has.skillIDs = true
	}
	if raw, ok := fields["nextRunAt"]; ok {
		write.setNextRunAt = true
		if bytesEqualNull(raw) {
			write.nextRunAt = nil
		} else {
			value, valid := decodeJSONString(raw)
			if !valid {
				return invalidWorkspaceAutomationPayload()
			}
			parsed, err := time.Parse(time.RFC3339, value)
			if err != nil {
				parsed, err = time.Parse(automationTimeLayout, value)
			}
			if err != nil {
				return invalidWorkspaceAutomationPayload()
			}
			write.nextRunAt = &parsed
		}
	}
	if raw, ok := fields["authorUserId"]; ok {
		authorID, valid := decodeJSONString(raw)
		if !valid || !apiKeyIDPattern.MatchString(authorID) {
			return invalidWorkspaceAutomationPayload()
		}
		write.authorUserID = &authorID
		write.has.authorUserID = true
	}
	return nil
}

func parseSkillIDs(raw json.RawMessage) ([]string, error) {
	var values []string
	if err := json.Unmarshal(raw, &values); err != nil {
		return nil, invalidWorkspaceAutomationPayload()
	}
	if len(values) > automationSkillMaxCount {
		return nil, invalidWorkspaceAutomationPayload()
	}
	seen := make(map[string]struct{}, len(values))
	ids := make([]string, 0, len(values))
	for _, value := range values {
		id := strings.TrimSpace(value)
		if id == "" || utf16Length(id) > automationSkillIDMax {
			return nil, invalidWorkspaceAutomationPayload()
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		ids = append(ids, id)
	}
	return ids, nil
}

func invalidWorkspaceAutomationPayload() error {
	return automationFailure(http.StatusBadRequest, "invalid_workspace_automation_payload", "Automation payload is invalid.")
}

func bytesEqualNull(raw json.RawMessage) bool {
	return string(bytesTrim(raw)) == "null"
}

func bytesTrim(raw json.RawMessage) []byte {
	return []byte(strings.TrimSpace(string(raw)))
}

func githubInstallationRepositoryID(target json.RawMessage) *string {
	var parsed struct {
		Kind                           string `json:"kind"`
		GithubInstallationRepositoryID string `json:"githubInstallationRepositoryId"`
	}
	if err := json.Unmarshal(target, &parsed); err != nil {
		return nil
	}
	if parsed.Kind != "github" || !apiKeyIDPattern.MatchString(parsed.GithubInstallationRepositoryID) {
		return nil
	}
	return &parsed.GithubInstallationRepositoryID
}

func (api *automationAPI) validateWorkspaceProject(ctx context.Context, organizationID string, projectID *string) error {
	if projectID == nil || strings.TrimSpace(*projectID) == "" {
		return nil
	}
	var found bool
	err := api.pool.QueryRow(ctx, `select exists(select 1 from projects where organization_id=$1 and id=$2)`, organizationID, *projectID).Scan(&found)
	if err != nil {
		return err
	}
	if !found {
		return automationFailure(http.StatusNotFound, "project_not_found", "Project not found")
	}
	return nil
}

func (api *automationAPI) validateAssignableAuthor(ctx context.Context, organizationID, authorUserID string) error {
	var found bool
	err := api.pool.QueryRow(ctx, `
        select exists(
            select 1 from users u
            join organization_memberships m on m.user_id = u.id
            where u.id=$1 and m.organization_id=$2
              and m.workos_membership_id is not null
              and m.workos_membership_id not in ('', 'replacing')
              and m.workos_membership_id not like 'replacing:%'
        )`, authorUserID, organizationID).Scan(&found)
	if err != nil {
		return err
	}
	if !found {
		return automationFailure(http.StatusBadRequest, "invalid_workspace_automation_payload", "Automation payload is invalid.")
	}
	return nil
}

const workspaceAutomationSelect = `
        a.id::text, a.organization_id::text, a.author_user_id::text, a.status, a.kind, a.name, a.instructions, a.model,
        a.project_id, a.trigger_config, a.repository_target, a.tool_config, coalesce(a.skill_ids, '[]'::jsonb),
        coalesce(a.sync_config, '{}'::jsonb), a.config_version, a.next_run_at, a.created_at, a.updated_at,
        u.first_name, u.last_name, u.email`

func scanWorkspaceAutomation(scanner interface {
	Scan(dest ...any) error
},
) (workspaceAutomationRecord, error) {
	var (
		record                                                            workspaceAutomationRecord
		authorID, projectID                                               *string
		triggerConfig, repositoryTarget, toolConfig, skillRaw, syncConfig []byte
		createdAt, updatedAt                                              time.Time
		nextRunAtPtr                                                      *time.Time
		firstName, lastName, email                                        *string
	)
	err := scanner.Scan(
		&record.ID, &record.OrganizationID, &authorID, &record.Status, &record.Kind, &record.Name, &record.Instructions, &record.Model,
		&projectID, &triggerConfig, &repositoryTarget, &toolConfig, &skillRaw, &syncConfig, &record.ConfigVersion, &nextRunAtPtr,
		&createdAt, &updatedAt, &firstName, &lastName, &email,
	)
	if err != nil {
		return workspaceAutomationRecord{}, err
	}
	record.AuthorUserID = authorID
	record.AuthorName = formatAutomationAuthorName(firstName, lastName, email)
	record.ProjectID = projectID
	record.TriggerConfig = jsonRawObject(triggerConfig)
	record.RepositoryTarget = jsonRawObject(repositoryTarget)
	record.ToolConfig = jsonRawObject(toolConfig)
	record.SyncConfig = jsonRawObject(syncConfig)
	if err := json.Unmarshal(jsonRawArray(skillRaw), &record.SkillIDs); err != nil {
		record.SkillIDs = []string{}
	}
	if record.SkillIDs == nil {
		record.SkillIDs = []string{}
	}
	record.NextRunAt = formatAutomationTimePtr(nextRunAtPtr)
	record.CreatedAt = formatAutomationTime(createdAt)
	record.UpdatedAt = formatAutomationTime(updatedAt)
	if record.Kind == "" {
		record.Kind = "agent"
	}
	if record.Model == "" {
		record.Model = automationDefaultModel
	}
	return record, nil
}

func (api *automationAPI) loadWorkspaceAutomations(ctx context.Context, organizationID, status, projectID string, limit, offset int) ([]workspaceAutomationRecord, error) {
	args := []any{organizationID, limit, offset}
	filters := `a.organization_id=$1`
	if status != "" {
		args = append(args, status)
		filters += ` and a.status=$` + itoa(len(args))
	}
	if projectID != "" {
		args = append(args, projectID)
		n := itoa(len(args))
		filters += ` and (a.project_id=$` + n + ` or (
            a.project_id is null and (
                a.tool_config->'contentful'->>'projectId' = $` + n + `
                or a.tool_config->'translation'->>'projectId' = $` + n + `
                or a.tool_config->'github'->>'projectId' = $` + n + `
                or a.tool_config->'createNativeTmsJob'->>'projectId' = $` + n + `
            )
        ))`
	}
	rows, err := api.pool.Query(ctx, `
        select `+workspaceAutomationSelect+`
        from workspace_automations a
        left join users u on u.id = a.author_user_id
        where `+filters+`
        order by a.created_at desc
        limit $2 offset $3`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	records := make([]workspaceAutomationRecord, 0)
	for rows.Next() {
		record, err := scanWorkspaceAutomation(rows)
		if err != nil {
			return nil, err
		}
		records = append(records, record)
	}
	return records, rows.Err()
}

func (api *automationAPI) loadWorkspaceAutomation(ctx context.Context, organizationID, automationID string) (workspaceAutomationRecord, error) {
	row := api.pool.QueryRow(ctx, `
        select `+workspaceAutomationSelect+`
        from workspace_automations a
        left join users u on u.id = a.author_user_id
        where a.organization_id=$1 and a.id=$2`, organizationID, automationID)
	record, err := scanWorkspaceAutomation(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return workspaceAutomationRecord{}, automationFailure(http.StatusNotFound, "workspace_automation_not_found", "Automation not found")
	}
	return record, err
}

func (api *automationAPI) loadWorkspaceAutomationRuns(ctx context.Context, organizationID, automationID string, limit int) ([]workspaceAutomationRunRecord, error) {
	rows, err := api.pool.Query(ctx, `
        select id::text, automation_id::text, organization_id::text, trigger_source, status, idempotency_key,
               coalesce(input_snapshot, '{}'::jsonb), coalesce(output_summary, '{}'::jsonb), error,
               github_repository_automation_job_id::text, started_at, completed_at, created_at, updated_at
        from workspace_automation_runs
        where organization_id=$1 and automation_id=$2
        order by created_at desc
        limit $3`, organizationID, automationID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	runs := make([]workspaceAutomationRunRecord, 0)
	for rows.Next() {
		var (
			run                                    workspaceAutomationRunRecord
			inputSnapshot, outputSummary, errorRaw []byte
			createdAt, updatedAt                   time.Time
			startedAtPtr, completedAtPtr           *time.Time
		)
		if err := rows.Scan(
			&run.ID, &run.AutomationID, &run.OrganizationID, &run.TriggerSource, &run.Status, &run.IdempotencyKey,
			&inputSnapshot, &outputSummary, &errorRaw, &run.GithubRepositoryAutomationJobID, &startedAtPtr, &completedAtPtr,
			&createdAt, &updatedAt,
		); err != nil {
			return nil, err
		}
		run.InputSnapshot = jsonRawObject(inputSnapshot)
		run.OutputSummary = jsonRawObject(outputSummary)
		if len(bytesTrim(errorRaw)) == 0 || string(bytesTrim(errorRaw)) == "null" {
			run.Error = nil
		} else {
			run.Error = json.RawMessage(append([]byte(nil), errorRaw...))
		}
		run.StartedAt = formatAutomationTimePtr(startedAtPtr)
		run.CompletedAt = formatAutomationTimePtr(completedAtPtr)
		run.CreatedAt = formatAutomationTime(createdAt)
		run.UpdatedAt = formatAutomationTime(updatedAt)
		runs = append(runs, run)
	}
	return runs, rows.Err()
}

func (api *automationAPI) insertWorkspaceAutomation(ctx context.Context, actor automationActor, write workspaceAutomationWrite) (workspaceAutomationRecord, error) {
	id := uuid.NewString()
	repoID := githubInstallationRepositoryID(write.repositoryTarget)
	_, err := api.pool.Exec(ctx, `
        insert into workspace_automations (
            id, organization_id, author_user_id, status, kind, name, instructions, model, project_id,
            trigger_config, github_installation_repository_id, repository_target, tool_config, skill_ids,
            sync_config, next_run_at
        ) values (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12::jsonb,$13::jsonb,$14::jsonb,$15::jsonb,$16
        )`,
		id, actor.organizationID, actor.userID, write.status, write.kind, write.name, write.instructions, write.model, write.projectID,
		string(write.triggerConfig), repoID, string(write.repositoryTarget), string(write.toolConfig), string(skillIDsJSON(write.skillIDs)),
		string(write.syncConfig), write.nextRunAt,
	)
	if err != nil {
		return workspaceAutomationRecord{}, err
	}
	return api.loadWorkspaceAutomation(ctx, actor.organizationID, id)
}

func (api *automationAPI) updateWorkspaceAutomation(ctx context.Context, organizationID string, existing workspaceAutomationRecord, write workspaceAutomationWrite) (workspaceAutomationRecord, error) {
	configChanged := write.has.instructions || write.has.projectID || write.has.triggerConfig || write.has.repositoryTarget || write.has.toolConfig || write.has.skillIDs || write.has.syncConfig
	set := []string{"updated_at = now()"}
	args := []any{organizationID, existing.ID}
	add := func(expr string, value any) {
		args = append(args, value)
		set = append(set, expr+"=$"+itoa(len(args)))
	}
	addJSON := func(column string, value string) {
		args = append(args, value)
		set = append(set, column+"=$"+itoa(len(args))+"::jsonb")
	}
	if write.has.status {
		add("status", write.status)
	}
	if write.has.name {
		add("name", write.name)
	}
	if write.has.instructions {
		add("instructions", write.instructions)
	}
	if write.has.model {
		add("model", write.model)
	}
	if configChanged {
		add("project_id", write.projectID)
		addJSON("tool_config", string(write.toolConfig))
		addJSON("skill_ids", string(skillIDsJSON(write.skillIDs)))
		addJSON("sync_config", string(write.syncConfig))
		set = append(set, "config_version = config_version + 1")
	}
	if write.has.triggerConfig {
		addJSON("trigger_config", string(write.triggerConfig))
	}
	if write.has.repositoryTarget {
		addJSON("repository_target", string(write.repositoryTarget))
		add("github_installation_repository_id", githubInstallationRepositoryID(write.repositoryTarget))
	}
	if write.setNextRunAt || configChanged || write.has.status {
		add("next_run_at", write.nextRunAt)
	}
	if write.has.authorUserID {
		add("author_user_id", write.authorUserID)
	}
	filters := `organization_id=$1 and id=$2`
	if write.has.status && write.status != existing.Status {
		args = append(args, existing.Status)
		filters += ` and status=$` + itoa(len(args))
	}
	if configChanged {
		args = append(args, existing.ConfigVersion)
		filters += ` and config_version=$` + itoa(len(args))
	}
	tag, err := api.pool.Exec(ctx, `update workspace_automations set `+strings.Join(set, ", ")+` where `+filters, args...)
	if err != nil {
		return workspaceAutomationRecord{}, err
	}
	if tag.RowsAffected() == 0 {
		return api.loadWorkspaceAutomation(ctx, organizationID, existing.ID)
	}
	return api.loadWorkspaceAutomation(ctx, organizationID, existing.ID)
}

func (api *automationAPI) archiveWorkspaceAutomation(ctx context.Context, organizationID string, existing workspaceAutomationRecord) (workspaceAutomationRecord, error) {
	if existing.Status == "archived" {
		return existing, nil
	}
	write := workspaceAutomationWrite{
		kind:         existing.Kind,
		status:       "archived",
		name:         existing.Name,
		instructions: existing.Instructions,
		model:        existing.Model,
		projectID:    existing.ProjectID,
		skillIDs:     existing.SkillIDs,
		setNextRunAt: true,
	}
	write.has.status = true
	return api.updateWorkspaceAutomation(ctx, organizationID, existing, write)
}

func skillIDsJSON(ids []string) []byte {
	if ids == nil {
		ids = []string{}
	}
	raw, err := json.Marshal(ids)
	if err != nil {
		return []byte("[]")
	}
	return raw
}
