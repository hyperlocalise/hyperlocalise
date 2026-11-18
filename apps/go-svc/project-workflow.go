package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/tmsauth"
)

const projectWorkflowPath = "/api/internal/iris/project-action"
const projectWorkflowTimeout = 2 * time.Minute

// callProjectWorkflow asks the web app to run a file, job, QA, or query action
// with the signed-in member. The web app keeps the workflow and storage code.
func callProjectWorkflow(ctx context.Context, action string, payload map[string]any) (any, int, error) {
	baseURL := strings.TrimRight(tmsauth.BaseURLFromEnv(), "/")
	if baseURL == "" || strings.TrimSpace(os.Getenv("WORKOS_COOKIE_PASSWORD")) == "" {
		return nil, 0, projectFailure(http.StatusServiceUnavailable, "project_workflow_unconfigured", "This action needs the web app workflow service.")
	}
	body, err := json.Marshal(map[string]any{"action": action, "payload": payload})
	if err != nil {
		return nil, 0, err
	}
	ctx, cancel := context.WithTimeout(ctx, projectWorkflowTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, baseURL+projectWorkflowPath, bytes.NewReader(body))
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set(serverCallTokenHeader, serverCallToken())
	client := &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	resp, err := client.Do(req)
	if err != nil {
		return nil, 0, projectFailure(http.StatusBadGateway, "project_workflow_unavailable", "The web app workflow service did not respond.")
	}
	defer func() { _ = resp.Body.Close() }()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 32<<20))
	if err != nil {
		return nil, 0, err
	}
	var decoded map[string]any
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &decoded); err != nil {
			return nil, 0, fmt.Errorf("project workflow: %w", err)
		}
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		code, _ := decoded["error"].(string)
		message, _ := decoded["message"].(string)
		if code == "" {
			code = "project_workflow_failed"
		}
		if message == "" {
			message = "The web app workflow service rejected the action."
		}
		return nil, 0, projectFailure(resp.StatusCode, code, message)
	}
	if result, ok := decoded["result"]; ok {
		return result, resp.StatusCode, nil
	}
	return decoded, resp.StatusCode, nil
}

func workflowPayload(actor projectActor, projectID string, extra map[string]any) map[string]any {
	payload := map[string]any{
		"organizationId": actor.organizationID,
		"userId":         actor.userID,
		"projectId":      projectID,
	}
	for key, value := range extra {
		payload[key] = value
	}
	return payload
}

func (api *projectAPI) uploadFileHandler(r *http.Request, actor projectActor) (any, int, error) {
	if !actor.canMutateProjects() {
		return nil, 0, projectForbidden()
	}
	return api.forwardFileAction(r, actor, "upload_file")
}

func (api *projectAPI) downloadFileHandler(r *http.Request, actor projectActor) (any, int, error) {
	projectID := strings.TrimSpace(r.PathValue("projectId"))
	query := r.URL.Query()
	return callProjectWorkflow(r.Context(), "download_file", workflowPayload(actor, projectID, map[string]any{
		"sourcePath": query.Get("sourcePath"),
		"locale":     query.Get("locale"),
	}))
}

func (api *projectAPI) importTranslationsHandler(r *http.Request, actor projectActor) (any, int, error) {
	if !actor.canMutateProjects() {
		return nil, 0, projectForbidden()
	}
	return api.forwardFileAction(r, actor, "import_translations")
}

func (api *projectAPI) translateFileHandler(r *http.Request, actor projectActor) (any, int, error) {
	if !actor.canCreateJobs() {
		return nil, 0, projectForbidden()
	}
	return api.forwardFileAction(r, actor, "translate_file")
}

func (api *projectAPI) fileSettingsGetHandler(r *http.Request, actor projectActor) (any, int, error) {
	projectID := strings.TrimSpace(r.PathValue("projectId"))
	query := r.URL.Query()
	return callProjectWorkflow(r.Context(), "file_settings_get", workflowPayload(actor, projectID, map[string]any{
		"sourcePath": query.Get("sourcePath"),
		"kind":       query.Get("kind"),
	}))
}

func (api *projectAPI) fileSettingsPatchHandler(r *http.Request, actor projectActor) (any, int, error) {
	if !actor.canMutateProjects() {
		return nil, 0, projectForbidden()
	}
	return api.forwardFileAction(r, actor, "file_settings_patch")
}

func (api *projectAPI) useTranslationAsSourceHandler(r *http.Request, actor projectActor) (any, int, error) {
	if !actor.canMutateProjects() {
		return nil, 0, projectForbidden()
	}
	return api.forwardFileAction(r, actor, "use_translation_as_source")
}

func (api *projectAPI) nativeJobActionHandler(r *http.Request, actor projectActor) (any, int, error) {
	if !actor.canWriteJobs() {
		return nil, 0, projectForbidden()
	}
	projectID := strings.TrimSpace(r.PathValue("projectId"))
	var body map[string]any
	if err := decodeProjectBody(r, &body); err != nil {
		return nil, 0, err
	}
	body["jobId"] = r.PathValue("jobId")
	return callProjectWorkflow(r.Context(), "job_action", workflowPayload(actor, projectID, body))
}

func (api *projectAPI) forwardFileAction(r *http.Request, actor projectActor, action string) (any, int, error) {
	projectID := strings.TrimSpace(r.PathValue("projectId"))
	var body map[string]any
	if err := decodeProjectBody(r, &body); err != nil {
		return nil, 0, err
	}
	return callProjectWorkflow(r.Context(), action, workflowPayload(actor, projectID, body))
}

func (api *projectAPI) importQueriesHandler(r *http.Request, actor projectActor) (any, int, error) {
	if !actor.canMutateProjects() {
		return nil, 0, projectForbidden()
	}
	return api.forwardFileAction(r, actor, "import_queries")
}

func (api *qaReportAPI) startProjectQaScanHandler(r *http.Request, actor qaReportActor) (any, int, error) {
	if !actor.canPromoteFindings() {
		return nil, 0, qaReportFailure(http.StatusForbidden, "forbidden", "Forbidden")
	}
	result, status, err := callProjectWorkflow(r.Context(), "qa_start", map[string]any{
		"organizationId": actor.organizationID,
		"userId":         actor.userID,
		"projectId":      strings.TrimSpace(r.PathValue("projectId")),
	})
	if err != nil {
		var failure *projectError
		if errors.As(err, &failure) {
			return nil, 0, qaReportFailure(failure.status, failure.code, failure.message)
		}
		return nil, 0, err
	}
	return result, status, nil
}

func (api *projectAPI) nativeJobCreate(r *http.Request, actor projectActor) (any, int, error) {
	if !actor.canCreateJobs() {
		return nil, 0, projectForbidden()
	}
	return api.forwardFileAction(r, actor, "create_job")
}
