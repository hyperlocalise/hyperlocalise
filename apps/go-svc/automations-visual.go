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

var visualWorkflowStatuses = map[string]struct{}{
	"draft":    {},
	"active":   {},
	"paused":   {},
	"archived": {},
}

var visualWorkflowCreateKeys = map[string]struct{}{
	"name":       {},
	"projectId":  {},
	"status":     {},
	"definition": {},
}

var visualWorkflowUpdateKeys = map[string]struct{}{
	"expectedRevision": {},
	"name":             {},
	"projectId":        {},
	"status":           {},
	"definition":       {},
}

type visualWorkflowRecord struct {
	ID                  string           `json:"id"`
	OrganizationID      string           `json:"organizationId"`
	AuthorUserID        *string          `json:"authorUserId"`
	ProjectID           *string          `json:"projectId"`
	Status              string           `json:"status"`
	Name                string           `json:"name"`
	Definition          json.RawMessage  `json:"definition"`
	DefinitionVersion   int              `json:"definitionVersion"`
	Revision            int              `json:"revision"`
	PublishedVersion    *int             `json:"publishedVersion"`
	PublishedDefinition *json.RawMessage `json:"publishedDefinition"`
	TriggerFingerprint  *string          `json:"triggerFingerprint"`
	NextRunAt           *string          `json:"nextRunAt"`
	CreatedAt           string           `json:"createdAt"`
	UpdatedAt           string           `json:"updatedAt"`
}

type visualWorkflowWrite struct {
	name                string
	projectID           *string
	status              string
	definition          json.RawMessage
	expectedRevision    int
	hasName             bool
	hasProjectID        bool
	hasStatus           bool
	hasDefinition       bool
	hasExpectedRevision bool
}

func (api *automationAPI) listVisualWorkflows(r *http.Request, actor automationActor) (any, int, error) {
	status, projectID, limit, offset, err := parseAutomationListQuery(r, visualWorkflowStatuses)
	if err != nil {
		return nil, 0, err
	}
	records, err := api.loadVisualWorkflows(r.Context(), actor.organizationID, status, projectID, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	if records == nil {
		records = []visualWorkflowRecord{}
	}
	return map[string]any{"visualWorkflows": records}, http.StatusOK, nil
}

func (api *automationAPI) getVisualWorkflow(r *http.Request, actor automationActor) (any, int, error) {
	id, err := automationIDParam(r, "visualWorkflowId", "visual_workflow_not_found")
	if err != nil {
		return nil, 0, err
	}
	record, err := api.loadVisualWorkflow(r.Context(), actor.organizationID, id)
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"visualWorkflow": record}, http.StatusOK, nil
}

func (api *automationAPI) createVisualWorkflow(r *http.Request, actor automationActor) (any, int, error) {
	write, err := parseVisualWorkflowCreate(r)
	if err != nil {
		return nil, 0, err
	}
	if err := api.validateWorkspaceProject(r.Context(), actor.organizationID, write.projectID); err != nil {
		return nil, 0, err
	}
	record, err := api.insertVisualWorkflow(r.Context(), actor, write)
	if err != nil {
		return nil, 0, err
	}
	api.publishActivity(r.Context(), activityLogEventInput{
		ActorKind:      "user",
		ActorUserID:    actor.userID,
		EventType:      "visual_workflow_created",
		OrganizationID: actor.organizationID,
		Payload: map[string]any{
			"name":             record.Name,
			"status":           "draft",
			"visualWorkflowId": record.ID,
		},
		TargetID:   record.ID,
		TargetKind: "visual_workflow",
	})
	return map[string]any{"visualWorkflow": record}, http.StatusCreated, nil
}

func (api *automationAPI) patchVisualWorkflow(r *http.Request, actor automationActor) (any, int, error) {
	id, err := automationIDParam(r, "visualWorkflowId", "visual_workflow_not_found")
	if err != nil {
		return nil, 0, err
	}
	existing, err := api.loadVisualWorkflow(r.Context(), actor.organizationID, id)
	if err != nil {
		return nil, 0, err
	}
	if existing.Status == "archived" {
		return nil, 0, automationFailure(http.StatusNotFound, "visual_workflow_not_found", "Visual workflow not found")
	}
	write, err := parseVisualWorkflowUpdate(r, existing)
	if err != nil {
		return nil, 0, err
	}
	if write.expectedRevision != existing.Revision {
		return nil, 0, automationFailure(http.StatusConflict, "version_conflict", "Workflow changed. Reload before saving.")
	}
	if err := api.validateWorkspaceProject(r.Context(), actor.organizationID, write.projectID); err != nil {
		return nil, 0, err
	}
	if write.status == "active" && publishedDefinitionEmpty(existing.PublishedDefinition) {
		return nil, 0, automationFailure(http.StatusBadRequest, "invalid_definition", "Publish a version before activating.")
	}
	record, err := api.updateVisualWorkflow(r.Context(), actor.organizationID, existing, write)
	if err != nil {
		return nil, 0, err
	}
	if write.hasStatus && write.status != existing.Status && (write.status == "active" || write.status == "paused" || write.status == "archived") {
		eventType := "visual_workflow_disabled"
		if write.status == "active" {
			eventType = "visual_workflow_enabled"
		}
		api.publishActivity(r.Context(), activityLogEventInput{
			ActorKind:      "user",
			ActorUserID:    actor.userID,
			EventType:      eventType,
			OrganizationID: actor.organizationID,
			Payload: map[string]any{
				"name":             record.Name,
				"status":           write.status,
				"visualWorkflowId": record.ID,
			},
			TargetID:   record.ID,
			TargetKind: "visual_workflow",
		})
	}
	return map[string]any{"visualWorkflow": record}, http.StatusOK, nil
}

func (api *automationAPI) deleteVisualWorkflow(r *http.Request, actor automationActor) (any, int, error) {
	id, err := automationIDParam(r, "visualWorkflowId", "visual_workflow_not_found")
	if err != nil {
		return nil, 0, err
	}
	existing, err := api.loadVisualWorkflow(r.Context(), actor.organizationID, id)
	if err != nil {
		return nil, 0, err
	}
	if existing.Status != "archived" {
		if err := api.archiveVisualWorkflow(r.Context(), actor.organizationID, existing.ID); err != nil {
			return nil, 0, err
		}
		api.publishActivity(r.Context(), activityLogEventInput{
			ActorKind:      "user",
			ActorUserID:    actor.userID,
			EventType:      "visual_workflow_deleted",
			OrganizationID: actor.organizationID,
			Payload: map[string]any{
				"name":             existing.Name,
				"status":           "archived",
				"visualWorkflowId": existing.ID,
			},
			TargetID:   existing.ID,
			TargetKind: "visual_workflow",
		})
	}
	return nil, http.StatusNoContent, nil
}

func parseVisualWorkflowCreate(r *http.Request) (visualWorkflowWrite, error) {
	fields, err := readJSONObject(r)
	if err != nil {
		return visualWorkflowWrite{}, invalidVisualWorkflowPayload()
	}
	if err := rejectUnknownJSONKeys(fields, visualWorkflowCreateKeys, "invalid_visual_workflow_payload", "Visual workflow payload is invalid."); err != nil {
		return visualWorkflowWrite{}, err
	}
	write := visualWorkflowWrite{status: "draft", name: "Untitled workflow"}
	if raw, ok := fields["name"]; ok {
		name, valid := decodeJSONString(raw)
		if !valid {
			return visualWorkflowWrite{}, invalidVisualWorkflowPayload()
		}
		name = strings.TrimSpace(name)
		if name == "" || utf16Length(name) > automationNameMaxChars {
			return visualWorkflowWrite{}, invalidVisualWorkflowPayload()
		}
		write.name = name
		write.hasName = true
	}
	if raw, ok := fields["projectId"]; ok {
		if bytesEqualNull(raw) {
			write.projectID = nil
		} else {
			projectID, valid := decodeJSONString(raw)
			if !valid {
				return visualWorkflowWrite{}, invalidVisualWorkflowPayload()
			}
			projectID = strings.TrimSpace(projectID)
			if projectID == "" {
				write.projectID = nil
			} else {
				write.projectID = &projectID
			}
		}
		write.hasProjectID = true
	}
	if raw, ok := fields["definition"]; ok {
		definition, name, err := normalizeVisualWorkflowDefinition(raw, write.name)
		if err != nil {
			return visualWorkflowWrite{}, err
		}
		write.definition = definition
		write.name = name
		write.hasDefinition = true
	} else {
		write.definition = emptyVisualWorkflowDefinition(write.name)
	}
	return write, nil
}

func parseVisualWorkflowUpdate(r *http.Request, existing visualWorkflowRecord) (visualWorkflowWrite, error) {
	fields, err := readJSONObject(r)
	if err != nil {
		return visualWorkflowWrite{}, invalidVisualWorkflowPayload()
	}
	if err := rejectUnknownJSONKeys(fields, visualWorkflowUpdateKeys, "invalid_visual_workflow_payload", "Visual workflow payload is invalid."); err != nil {
		return visualWorkflowWrite{}, err
	}
	write := visualWorkflowWrite{
		name:       existing.Name,
		projectID:  existing.ProjectID,
		status:     existing.Status,
		definition: existing.Definition,
	}
	rawRevision, ok := fields["expectedRevision"]
	if !ok {
		return visualWorkflowWrite{}, invalidVisualWorkflowPayload()
	}
	revision, valid := decodeJSONInt(rawRevision)
	if !valid || revision < 1 {
		return visualWorkflowWrite{}, invalidVisualWorkflowPayload()
	}
	write.expectedRevision = revision
	write.hasExpectedRevision = true
	if raw, ok := fields["name"]; ok {
		name, valid := decodeJSONString(raw)
		if !valid {
			return visualWorkflowWrite{}, invalidVisualWorkflowPayload()
		}
		name = strings.TrimSpace(name)
		if name == "" || utf16Length(name) > automationNameMaxChars {
			return visualWorkflowWrite{}, invalidVisualWorkflowPayload()
		}
		write.name = name
		write.hasName = true
	}
	if raw, ok := fields["projectId"]; ok {
		if bytesEqualNull(raw) {
			write.projectID = nil
		} else {
			projectID, valid := decodeJSONString(raw)
			if !valid {
				return visualWorkflowWrite{}, invalidVisualWorkflowPayload()
			}
			projectID = strings.TrimSpace(projectID)
			if projectID == "" {
				write.projectID = nil
			} else {
				write.projectID = &projectID
			}
		}
		write.hasProjectID = true
	}
	if raw, ok := fields["status"]; ok {
		status, valid := decodeJSONString(raw)
		if !valid {
			return visualWorkflowWrite{}, invalidVisualWorkflowPayload()
		}
		if _, allowed := visualWorkflowStatuses[status]; !allowed {
			return visualWorkflowWrite{}, invalidVisualWorkflowPayload()
		}
		write.status = status
		write.hasStatus = true
	}
	if raw, ok := fields["definition"]; ok {
		definition, name, err := normalizeVisualWorkflowDefinition(raw, write.name)
		if err != nil {
			return visualWorkflowWrite{}, err
		}
		write.definition = definition
		write.name = name
		write.hasDefinition = true
	} else {
		definition, name, err := normalizeVisualWorkflowDefinition(existing.Definition, write.name)
		if err != nil {
			return visualWorkflowWrite{}, err
		}
		write.definition = definition
		write.name = name
	}
	return write, nil
}

func publishedDefinitionEmpty(raw *json.RawMessage) bool {
	if raw == nil {
		return true
	}
	trimmed := bytesTrim(*raw)
	return len(trimmed) == 0 || string(trimmed) == "null"
}

func invalidVisualWorkflowPayload() error {
	return automationFailure(http.StatusBadRequest, "invalid_visual_workflow_payload", "Visual workflow payload is invalid.")
}

func decodeJSONInt(raw json.RawMessage) (int, bool) {
	var number float64
	if err := json.Unmarshal(raw, &number); err != nil {
		return 0, false
	}
	if number != float64(int(number)) || number < 1 {
		return 0, false
	}
	return int(number), true
}

const visualWorkflowSelect = `
        id::text, organization_id::text, author_user_id::text, project_id, status, name, definition,
        definition_version, revision, published_version, published_definition, trigger_fingerprint,
        next_run_at, created_at, updated_at`

func scanVisualWorkflow(scanner interface {
	Scan(dest ...any) error
},
) (visualWorkflowRecord, error) {
	var (
		record                           visualWorkflowRecord
		authorID, projectID, fingerprint *string
		definition, published            []byte
		publishedVersion                 *int
		nextRunAt                        *time.Time
		createdAt, updatedAt             time.Time
	)
	if err := scanner.Scan(
		&record.ID, &record.OrganizationID, &authorID, &projectID, &record.Status, &record.Name, &definition,
		&record.DefinitionVersion, &record.Revision, &publishedVersion, &published, &fingerprint, &nextRunAt,
		&createdAt, &updatedAt,
	); err != nil {
		return visualWorkflowRecord{}, err
	}
	record.AuthorUserID = authorID
	record.ProjectID = projectID
	record.Definition = json.RawMessage(append([]byte(nil), definition...))
	record.PublishedVersion = publishedVersion
	if len(bytesTrim(published)) == 0 || string(bytesTrim(published)) == "null" {
		record.PublishedDefinition = nil
	} else {
		raw := json.RawMessage(append([]byte(nil), published...))
		record.PublishedDefinition = &raw
	}
	record.TriggerFingerprint = fingerprint
	record.NextRunAt = formatAutomationTimePtr(nextRunAt)
	record.CreatedAt = formatAutomationTime(createdAt)
	record.UpdatedAt = formatAutomationTime(updatedAt)
	return record, nil
}

func (api *automationAPI) loadVisualWorkflows(ctx context.Context, organizationID, status, projectID string, limit, offset int) ([]visualWorkflowRecord, error) {
	args := []any{organizationID, limit, offset}
	filters := `organization_id=$1`
	if status != "" {
		args = append(args, status)
		filters += ` and status=$` + itoa(len(args))
	} else {
		filters += ` and status <> 'archived'`
	}
	if projectID != "" {
		args = append(args, projectID)
		filters += ` and project_id=$` + itoa(len(args))
	}
	rows, err := api.pool.Query(ctx, `
        select `+visualWorkflowSelect+`
        from visual_workflows
        where `+filters+`
        order by updated_at desc
        limit $2 offset $3`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	records := make([]visualWorkflowRecord, 0)
	for rows.Next() {
		record, err := scanVisualWorkflow(rows)
		if err != nil {
			return nil, err
		}
		records = append(records, record)
	}
	return records, rows.Err()
}

func (api *automationAPI) loadVisualWorkflow(ctx context.Context, organizationID, workflowID string) (visualWorkflowRecord, error) {
	row := api.pool.QueryRow(ctx, `
        select `+visualWorkflowSelect+`
        from visual_workflows
        where organization_id=$1 and id=$2`, organizationID, workflowID)
	record, err := scanVisualWorkflow(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return visualWorkflowRecord{}, automationFailure(http.StatusNotFound, "visual_workflow_not_found", "Visual workflow not found")
	}
	return record, err
}

func (api *automationAPI) insertVisualWorkflow(ctx context.Context, actor automationActor, write visualWorkflowWrite) (visualWorkflowRecord, error) {
	id := uuid.NewString()
	_, err := api.pool.Exec(ctx, `
        insert into visual_workflows (
            id, organization_id, author_user_id, project_id, status, name, definition, definition_version, revision
        ) values ($1,$2,$3,$4,'draft',$5,$6::jsonb,1,1)`,
		id, actor.organizationID, actor.userID, write.projectID, write.name, string(write.definition),
	)
	if err != nil {
		return visualWorkflowRecord{}, err
	}
	return api.loadVisualWorkflow(ctx, actor.organizationID, id)
}

func (api *automationAPI) updateVisualWorkflow(ctx context.Context, organizationID string, existing visualWorkflowRecord, write visualWorkflowWrite) (visualWorkflowRecord, error) {
	definitionChanged := string(existing.Definition) != string(write.definition)
	definitionVersion := existing.DefinitionVersion
	if definitionChanged {
		definitionVersion++
	}
	tag, err := api.pool.Exec(ctx, `
        update visual_workflows
        set name=$4, project_id=$5, status=$6, definition=$7::jsonb, revision=revision+1,
            definition_version=$8, updated_at=now()
        where organization_id=$1 and id=$2 and revision=$3 and status <> 'archived'`,
		organizationID, existing.ID, existing.Revision, write.name, write.projectID, write.status,
		string(write.definition), definitionVersion,
	)
	if err != nil {
		return visualWorkflowRecord{}, err
	}
	if tag.RowsAffected() == 0 {
		return visualWorkflowRecord{}, automationFailure(http.StatusConflict, "version_conflict", "Workflow changed. Reload before saving.")
	}
	return api.loadVisualWorkflow(ctx, organizationID, existing.ID)
}

func (api *automationAPI) archiveVisualWorkflow(ctx context.Context, organizationID, workflowID string) error {
	_, err := api.pool.Exec(ctx, `
        update visual_workflows
        set status='archived', trigger_fingerprint=null, next_run_at=null, updated_at=now()
        where organization_id=$1 and id=$2`, organizationID, workflowID)
	return err
}
