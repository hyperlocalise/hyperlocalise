package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"

	"github.com/jackc/pgx/v5"
)

// Org-level native job lifecycle actions match the web app routes Iris calls
// (`POST /v1/orgs/.../jobs/{jobId}/retry`, etc.). Mutations run in the web
// workflow service; this layer resolves the job's project and returns fresh
// job detail like the Hono API.

func (api *projectAPI) orgJobRetryHandler(r *http.Request, actor projectActor) (any, int, error) {
	return api.forwardOrgJobLifecycle(r, actor, "retry")
}

func (api *projectAPI) orgJobCancelHandler(r *http.Request, actor projectActor) (any, int, error) {
	return api.forwardOrgJobLifecycle(r, actor, "cancel")
}

func (api *projectAPI) orgJobMarkFailedHandler(r *http.Request, actor projectActor) (any, int, error) {
	return api.forwardOrgJobLifecycle(r, actor, "mark_failed")
}

func (api *projectAPI) orgJobMarkDoneHandler(r *http.Request, actor projectActor) (any, int, error) {
	return api.forwardOrgJobLifecycle(r, actor, "mark_done")
}

func (api *projectAPI) forwardOrgJobLifecycle(r *http.Request, actor projectActor, action string) (any, int, error) {
	if !actor.canWriteJobs() {
		return nil, 0, projectForbidden()
	}
	jobID, ok := jobIDParam(r.PathValue("jobId"))
	if !ok {
		return nil, 0, projectJobNotFound()
	}
	projectID, err := api.orgNativeJobProjectID(r.Context(), actor, jobID)
	if err != nil {
		return nil, 0, err
	}
	if _, _, err := callProjectWorkflow(r.Context(), "job_action", workflowPayload(actor, projectID, map[string]any{
		"jobId":  jobID,
		"action": action,
	})); err != nil {
		return nil, 0, err
	}
	return api.orgJobDetailHandler(r, actor)
}

// orgNativeJobProjectID resolves a native (non-TMS) job the actor may mutate.
func (api *projectAPI) orgNativeJobProjectID(ctx context.Context, actor projectActor, jobID string) (string, error) {
	if api.pool == nil {
		return "", projectFailure(http.StatusServiceUnavailable, "projects_unavailable", "Projects are unavailable")
	}
	var projectID *string
	var err error
	if actor.isVendor() {
		err = api.pool.QueryRow(ctx, `
            select j.project_id
            from jobs j
            where `+vendorJobSQL(1, 2)+` and j.id = $3 and j.project_id is not null
            limit 1`,
			actor.organizationID, actor.userID, jobID,
		).Scan(&projectID)
	} else {
		err = api.pool.QueryRow(ctx, `
            select j.project_id
            from jobs j
            left join external_job_details e on e.job_id = j.id
            where (`+overviewJobsVisibleSQL()+` or `+ownedFileTaskSQL(1, 3, true)+`)
                and j.id = $4 and j.project_id is not null and e.job_id is null
            limit 1`,
			actor.organizationID, actor.canReadAllTeams(), actor.userID, jobID,
		).Scan(&projectID)
	}
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && (projectID == nil || *projectID == "")) {
		return "", projectJobNotFound()
	}
	if err != nil {
		return "", fmt.Errorf("resolve native job project: %w", err)
	}
	return *projectID, nil
}
