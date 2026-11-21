package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
)

type visualWorkflowRunRecord struct {
	ID                string          `json:"id"`
	TraceID           string          `json:"traceId"`
	ParentRunID       *string         `json:"parentRunId"`
	ParentNodeID      *string         `json:"parentNodeId"`
	VisualWorkflowID  string          `json:"visualWorkflowId"`
	OrganizationID    string          `json:"organizationId"`
	TriggerSource     string          `json:"triggerSource"`
	Mode              string          `json:"mode"`
	RealNodeIDs       json.RawMessage `json:"realNodeIds,omitempty"`
	Status            string          `json:"status"`
	IdempotencyKey    *string         `json:"idempotencyKey"`
	DefinitionVersion int             `json:"definitionVersion"`
	InputSnapshot     json.RawMessage `json:"inputSnapshot"`
	OutputSummary     json.RawMessage `json:"outputSummary"`
	Error             json.RawMessage `json:"error"`
	StartedAt         *string         `json:"startedAt"`
	CompletedAt       *string         `json:"completedAt"`
	CreatedAt         string          `json:"createdAt"`
	UpdatedAt         string          `json:"updatedAt"`
}

func (api *automationAPI) listWorkspaceAutomationRuns(r *http.Request, actor automationActor) (any, int, error) {
	id, err := automationIDParam(r, "automationId", "workspace_automation_not_found")
	if err != nil {
		return nil, 0, err
	}
	if _, err := api.loadWorkspaceAutomation(r.Context(), actor.organizationID, id); err != nil {
		return nil, 0, err
	}
	limit, offset, err := parseAutomationRunsQuery(r, automationWorkspaceRunsDefault)
	if err != nil {
		return nil, 0, err
	}
	runs, err := api.loadWorkspaceAutomationRuns(r.Context(), actor.organizationID, id, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	if runs == nil {
		runs = []workspaceAutomationRunRecord{}
	}
	return map[string]any{"automationRuns": runs}, http.StatusOK, nil
}

func (api *automationAPI) createWorkspaceAutomationRun(r *http.Request, actor automationActor) (any, int, error) {
	id, err := automationIDParam(r, "automationId", "workspace_automation_not_found")
	if err != nil {
		return nil, 0, err
	}
	if _, err := api.loadWorkspaceAutomation(r.Context(), actor.organizationID, id); err != nil {
		return nil, 0, err
	}
	body, err := readAutomationJSONMap(r)
	if err != nil {
		return nil, 0, err
	}
	return callAutomationWorkflow(r.Context(), "run_workspace_automation", automationWorkflowPayload(actor, map[string]any{
		"automationId":   id,
		"idempotencyKey": body["idempotencyKey"],
		"inputSnapshot":  body["inputSnapshot"],
	}))
}

func (api *automationAPI) publishVisualWorkflow(r *http.Request, actor automationActor) (any, int, error) {
	id, err := automationIDParam(r, "visualWorkflowId", "visual_workflow_not_found")
	if err != nil {
		return nil, 0, err
	}
	if _, err := api.loadVisualWorkflow(r.Context(), actor.organizationID, id); err != nil {
		return nil, 0, err
	}
	body, err := readAutomationJSONMap(r)
	if err != nil {
		return nil, 0, err
	}
	return callAutomationWorkflow(r.Context(), "publish_visual_workflow", automationWorkflowPayload(actor, map[string]any{
		"visualWorkflowId": id,
		"expectedRevision": body["expectedRevision"],
	}))
}

func (api *automationAPI) testVisualWorkflow(r *http.Request, actor automationActor) (any, int, error) {
	id, err := automationIDParam(r, "visualWorkflowId", "visual_workflow_not_found")
	if err != nil {
		return nil, 0, err
	}
	if _, err := api.requireMutableVisualWorkflow(r.Context(), actor.organizationID, id); err != nil {
		return nil, 0, err
	}
	body, err := readAutomationJSONMap(r)
	if err != nil {
		return nil, 0, err
	}
	return callAutomationWorkflow(r.Context(), "test_visual_workflow", automationWorkflowPayload(actor, map[string]any{
		"visualWorkflowId": id,
		"idempotencyKey":   body["idempotencyKey"],
		"definition":       body["definition"],
		"mode":             body["mode"],
		"inputSnapshot":    body["inputSnapshot"],
		"mockOutputs":      body["mockOutputs"],
		"realNodeIds":      body["realNodeIds"],
		"mockFailures":     body["mockFailures"],
	}))
}

func (api *automationAPI) createVisualWorkflowRun(r *http.Request, actor automationActor) (any, int, error) {
	id, err := automationIDParam(r, "visualWorkflowId", "visual_workflow_not_found")
	if err != nil {
		return nil, 0, err
	}
	if _, err := api.requireMutableVisualWorkflow(r.Context(), actor.organizationID, id); err != nil {
		return nil, 0, err
	}
	body, err := readAutomationJSONMap(r)
	if err != nil {
		return nil, 0, err
	}
	return callAutomationWorkflow(r.Context(), "run_visual_workflow", automationWorkflowPayload(actor, map[string]any{
		"visualWorkflowId": id,
		"idempotencyKey":   body["idempotencyKey"],
		"inputSnapshot":    body["inputSnapshot"],
	}))
}

func (api *automationAPI) listVisualWorkflowRuns(r *http.Request, actor automationActor) (any, int, error) {
	id, err := automationIDParam(r, "visualWorkflowId", "visual_workflow_not_found")
	if err != nil {
		return nil, 0, err
	}
	if _, err := api.loadVisualWorkflow(r.Context(), actor.organizationID, id); err != nil {
		return nil, 0, err
	}
	limit, offset, err := parseAutomationRunsQuery(r, automationVisualRunsDefault)
	if err != nil {
		return nil, 0, err
	}
	runs, err := api.loadVisualWorkflowRuns(r.Context(), actor.organizationID, id, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	if runs == nil {
		runs = []visualWorkflowRunRecord{}
	}
	return map[string]any{"runs": runs}, http.StatusOK, nil
}

func (api *automationAPI) getVisualWorkflowRun(r *http.Request, actor automationActor) (any, int, error) {
	id, err := automationIDParam(r, "visualWorkflowId", "visual_workflow_not_found")
	if err != nil {
		return nil, 0, err
	}
	runID, err := automationIDParam(r, "runId", "visual_workflow_run_not_found")
	if err != nil {
		return nil, 0, err
	}
	if _, err := api.loadVisualWorkflow(r.Context(), actor.organizationID, id); err != nil {
		return nil, 0, err
	}
	run, err := api.loadVisualWorkflowRun(r.Context(), actor.organizationID, id, runID)
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"run": run}, http.StatusOK, nil
}

func (api *automationAPI) requireMutableVisualWorkflow(ctx context.Context, organizationID, visualWorkflowID string) (visualWorkflowRecord, error) {
	record, err := api.loadVisualWorkflow(ctx, organizationID, visualWorkflowID)
	if err != nil {
		return visualWorkflowRecord{}, err
	}
	if record.Status == "archived" {
		return visualWorkflowRecord{}, automationFailure(http.StatusNotFound, "visual_workflow_not_found", "Visual workflow not found")
	}
	return record, nil
}

func (api *automationAPI) loadVisualWorkflowRuns(ctx context.Context, organizationID, visualWorkflowID string, limit, offset int) ([]visualWorkflowRunRecord, error) {
	rows, err := api.pool.Query(ctx, visualWorkflowRunSelect+`
        from visual_workflow_runs
        where organization_id=$1 and visual_workflow_id=$2
        order by created_at desc
        limit $3 offset $4`, organizationID, visualWorkflowID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	runs := make([]visualWorkflowRunRecord, 0)
	for rows.Next() {
		run, err := scanVisualWorkflowRun(rows)
		if err != nil {
			return nil, err
		}
		runs = append(runs, run)
	}
	return runs, rows.Err()
}

func (api *automationAPI) loadVisualWorkflowRun(ctx context.Context, organizationID, visualWorkflowID, runID string) (visualWorkflowRunRecord, error) {
	row := api.pool.QueryRow(ctx, visualWorkflowRunSelect+`
        from visual_workflow_runs
        where organization_id=$1 and visual_workflow_id=$2 and id=$3`, organizationID, visualWorkflowID, runID)
	run, err := scanVisualWorkflowRun(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return visualWorkflowRunRecord{}, automationFailure(http.StatusNotFound, "visual_workflow_run_not_found", "Visual workflow run not found")
	}
	return run, err
}

const visualWorkflowRunSelect = `
        select id::text, trace_id::text, parent_run_id::text, parent_node_id, visual_workflow_id::text,
               organization_id::text, trigger_source, mode, real_node_ids, status, idempotency_key,
               definition_version, coalesce(input_snapshot, '{}'::jsonb), coalesce(output_summary, '{}'::jsonb),
               error, started_at, completed_at, created_at, updated_at
`

type visualWorkflowRunScanner interface {
	Scan(dest ...any) error
}

func scanVisualWorkflowRun(row visualWorkflowRunScanner) (visualWorkflowRunRecord, error) {
	var (
		run                                                 visualWorkflowRunRecord
		realNodeIDs, inputSnapshot, outputSummary, errorRaw []byte
		createdAt, updatedAt                                time.Time
		startedAtPtr, completedAtPtr                        *time.Time
	)
	if err := row.Scan(
		&run.ID, &run.TraceID, &run.ParentRunID, &run.ParentNodeID, &run.VisualWorkflowID,
		&run.OrganizationID, &run.TriggerSource, &run.Mode, &realNodeIDs, &run.Status, &run.IdempotencyKey,
		&run.DefinitionVersion, &inputSnapshot, &outputSummary, &errorRaw, &startedAtPtr, &completedAtPtr,
		&createdAt, &updatedAt,
	); err != nil {
		return visualWorkflowRunRecord{}, err
	}
	if len(bytesTrim(realNodeIDs)) > 0 && string(bytesTrim(realNodeIDs)) != "null" {
		run.RealNodeIDs = json.RawMessage(append([]byte(nil), realNodeIDs...))
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
	return run, nil
}
