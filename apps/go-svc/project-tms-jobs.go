package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/tmscatalog"
)

const (
	unknownLiveJobActivityAt = "1970-01-01T00:00:00.000Z"
	liveJobCreateConcurrency = 3
	liveJobFanoutConcurrency = 5
	liveJobFilesListLimit    = 1000
	liveCreateTitleMax       = 256
	liveCreateDescriptionMax = 2048
	liveCreateLocaleMax      = 32
	liveCreateLocalesMax     = 20
	liveCreateFileIDMax      = 128
	liveCreateFileIDsMax     = 100
	liveCreateAssigneesMax   = 50
	liveCreateAssigneeIDMax  = 128
	liveJobCommentIDPrefix   = "crowdin:task-comment:"
)

type liveJobRecord struct {
	ID                    string          `json:"id"`
	ProjectID             string          `json:"projectId"`
	ProjectName           *string         `json:"projectName"`
	CreatedByUserID       *string         `json:"createdByUserId"`
	Kind                  string          `json:"kind"`
	Type                  *string         `json:"type"`
	Status                string          `json:"status"`
	CreatedAt             string          `json:"createdAt"`
	UpdatedAt             string          `json:"updatedAt"`
	CompletedAt           *string         `json:"completedAt"`
	WorkflowRunID         *string         `json:"workflowRunId"`
	LastError             *string         `json:"lastError"`
	InputPayload          json.RawMessage `json:"inputPayload"`
	OutcomeKind           *string         `json:"outcomeKind"`
	OutcomePayload        json.RawMessage `json:"outcomePayload"`
	ReviewCriteria        *string         `json:"reviewCriteria"`
	ReviewTargetLocale    *string         `json:"reviewTargetLocale"`
	SyncConnectorKind     *string         `json:"syncConnectorKind"`
	SyncDirection         *string         `json:"syncDirection"`
	AssetType             *string         `json:"assetType"`
	AssetOperation        *string         `json:"assetOperation"`
	ExternalProviderKind  string          `json:"externalProviderKind"`
	ExternalTaskID        *string         `json:"externalTaskId"`
	ExternalStatus        string          `json:"externalStatus"`
	ExternalTitle         string          `json:"externalTitle"`
	ExternalDueDate       *string         `json:"externalDueDate"`
	ExternalTargetLocales []string        `json:"externalTargetLocales"`
	ExternalAssignedUsers []string        `json:"externalAssignedUsers"`
	ExternalSyncState     *string         `json:"externalSyncState"`
}

type liveJobDetailRecord struct {
	liveJobRecord
	ExternalJobID           string         `json:"externalJobId"`
	ExternalURL             *string        `json:"externalUrl"`
	ExternalProviderPayload map[string]any `json:"externalProviderPayload"`
}

type liveJobCommentRecord struct {
	ID                string `json:"id"`
	ExternalCommentID string `json:"externalCommentId"`
	UserID            string `json:"userId"`
	TaskID            string `json:"taskId"`
	Text              string `json:"text"`
	TimeSpentSeconds  *int   `json:"timeSpentSeconds"`
	CreatedAt         string `json:"createdAt"`
	UpdatedAt         string `json:"updatedAt"`
}

type liveProjectMemberRecord struct {
	ExternalUserID string  `json:"externalUserId"`
	Username       string  `json:"username"`
	DisplayName    string  `json:"displayName"`
	AvatarURL      *string `json:"avatarUrl"`
	Role           *string `json:"role"`
}

type liveJobsQuery struct {
	mine, recent bool
}

type liveCreateJobsBody struct {
	Title                   string   `json:"title"`
	TargetLocales           []string `json:"targetLocales"`
	FileIDs                 []string `json:"fileIds"`
	AssigneeExternalUserIDs []string `json:"assigneeExternalUserIds"`
	Kind                    string   `json:"kind"`
	Description             *string  `json:"description"`
}

type liveUpdateJobBody struct {
	Title                   *string                `json:"title"`
	Description             optionalNullableString `json:"description"`
	AssigneeExternalUserIDs *[]string              `json:"assigneeExternalUserIds"`
}

type liveUpdateDescriptionBody struct {
	Description string `json:"description"`
}

func (api *projectAPI) liveJobOperator(ctx context.Context, actor projectActor, project *liveProjectID) (tmscatalog.JobOperator, tmsConnection, error) {
	if api.tms == nil {
		return nil, tmsConnection{}, projectFailure(http.StatusServiceUnavailable, "tms_unavailable", "TMS projects are unavailable on this server")
	}
	conn, err := activeTMSConnection(ctx, api.pool, actor.organizationID)
	if err != nil {
		return nil, tmsConnection{}, err
	}
	if conn == nil {
		return nil, tmsConnection{}, projectFailure(http.StatusConflict, "tms_not_connected", "Connect a TMS in Integrations to see its projects")
	}
	if project != nil && !strings.EqualFold(conn.ProviderKind, project.providerKind) {
		return nil, tmsConnection{}, projectFailure(http.StatusConflict, "provider_project_unavailable", "This project's TMS is no longer connected to this workspace")
	}
	if !tmscatalog.JobsSupported(conn.ProviderKind) {
		return nil, tmsConnection{}, projectFailure(http.StatusNotImplemented, "tms_jobs_unsupported", "Jobs from "+conn.DisplayName+" aren't supported yet")
	}
	credentials, err := api.tms.credentials(ctx, api.pool, *conn, actor.organizationID, actor.userID)
	if err != nil {
		return nil, tmsConnection{}, asProjectFailure(err)
	}
	operator, err := tmscatalog.NewJobOperator(conn.ProviderKind, credentials, api.tms.http)
	if errors.Is(err, tmscatalog.ErrUnsupported) {
		return nil, tmsConnection{}, projectFailure(http.StatusNotImplemented, "tms_jobs_unsupported", "Jobs from "+conn.DisplayName+" aren't supported with this connection")
	}
	if err != nil {
		return nil, tmsConnection{}, err
	}
	return operator, *conn, nil
}

func parseLiveJobsQuery(values map[string][]string) (liveJobsQuery, error) {
	query := liveJobsQuery{}
	parseBool := func(key string, dest *bool) error {
		raw := values[key]
		if len(raw) == 0 {
			return nil
		}
		if len(raw) != 1 || (raw[0] != "true" && raw[0] != "false") {
			return projectFailure(http.StatusBadRequest, "invalid_query", "Invalid query parameters")
		}
		*dest = raw[0] == "true"
		return nil
	}
	if err := parseBool("mine", &query.mine); err != nil {
		return liveJobsQuery{}, err
	}
	if err := parseBool("recent", &query.recent); err != nil {
		return liveJobsQuery{}, err
	}
	return query, nil
}

func (api *projectAPI) liveWorkspaceJobsHandler(r *http.Request, actor projectActor) (any, int, error) {
	if !actor.canReadJobs() {
		return nil, 0, projectForbidden()
	}
	query, err := parseLiveJobsQuery(r.URL.Query())
	if err != nil {
		return nil, 0, err
	}
	ctx, cancel := context.WithTimeout(r.Context(), tmsLiveRequestTimeout)
	defer cancel()
	operator, conn, err := api.liveJobOperator(ctx, actor, nil)
	if err != nil {
		return nil, 0, err
	}
	jobs, err := api.listLiveWorkspaceJobs(ctx, actor, operator, conn, query)
	if err != nil {
		return nil, 0, liveProviderFailure(conn, err)
	}
	return map[string]any{"jobs": jobs}, http.StatusOK, nil
}

func (api *projectAPI) liveProjectJobs(r *http.Request, actor projectActor, id liveProjectID) (any, int, error) {
	if !actor.canReadJobs() {
		return nil, 0, projectForbidden()
	}
	query, err := parseLiveJobsQuery(r.URL.Query())
	if err != nil {
		return nil, 0, err
	}
	ctx, cancel := context.WithTimeout(r.Context(), tmsLiveRequestTimeout)
	defer cancel()
	operator, conn, err := api.liveJobOperator(ctx, actor, &id)
	if err != nil {
		return nil, 0, err
	}
	jobs, err := api.listLiveProjectJobs(ctx, actor, operator, conn, id, query, nil)
	if err != nil {
		return nil, 0, liveProviderFailure(conn, err)
	}
	return map[string]any{"jobs": jobs}, http.StatusOK, nil
}

func (api *projectAPI) liveOpenJobCount(r *http.Request, actor projectActor, id liveProjectID) (any, int, error) {
	if !actor.canReadJobs() {
		return nil, 0, projectForbidden()
	}
	ctx, cancel := context.WithTimeout(r.Context(), tmsLiveRequestTimeout)
	defer cancel()
	operator, conn, err := api.liveJobOperator(ctx, actor, &id)
	if err != nil {
		return nil, 0, err
	}
	jobs, err := api.listLiveProjectJobs(ctx, actor, operator, conn, id, liveJobsQuery{}, nil)
	if err != nil {
		return nil, 0, liveProviderFailure(conn, err)
	}
	count := 0
	for _, job := range jobs {
		if tmscatalog.OpenJobStatus(job.Status) {
			count++
		}
	}
	return map[string]int{"openJobCount": count}, http.StatusOK, nil
}

func (api *projectAPI) liveJobDetail(r *http.Request, actor projectActor, id liveProjectID, taskID string) (any, int, error) {
	if !actor.canReadJobs() {
		return nil, 0, projectForbidden()
	}
	ctx, cancel := context.WithTimeout(r.Context(), tmsLiveRequestTimeout)
	defer cancel()
	operator, conn, err := api.liveJobOperator(ctx, actor, &id)
	if err != nil {
		return nil, 0, err
	}
	job, err := api.getLiveJobDetail(ctx, operator, conn, id, taskID)
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"job": job}, http.StatusOK, nil
}

func (api *projectAPI) liveJobStatus(r *http.Request, actor projectActor, id liveProjectID, taskID string) (any, int, error) {
	if !actor.canReadJobs() {
		return nil, 0, projectForbidden()
	}
	ctx, cancel := context.WithTimeout(r.Context(), tmsLiveRequestTimeout)
	defer cancel()
	operator, conn, err := api.liveJobOperator(ctx, actor, &id)
	if err != nil {
		return nil, 0, err
	}
	detail, err := api.getLiveJobDetail(ctx, operator, conn, id, taskID)
	if err != nil {
		return nil, 0, err
	}
	envelope := publicJobStatusEnvelope{
		ID:          detail.ID,
		ProjectID:   stringPtrValue(detail.ProjectID),
		Kind:        detail.Kind,
		Type:        detail.Type,
		Status:      detail.Status,
		CreatedAt:   detail.CreatedAt,
		UpdatedAt:   detail.UpdatedAt,
		CompletedAt: detail.CompletedAt,
		LastError:   detail.LastError,
	}
	return map[string]publicJobStatusEnvelope{"job": envelope}, http.StatusOK, nil
}

func (api *projectAPI) liveProjectMembersHandler(r *http.Request, actor projectActor) (any, int, error) {
	if !actor.canReadJobs() {
		return nil, 0, projectForbidden()
	}
	id, live := parseLiveProjectID(r.PathValue("projectId"))
	if !live {
		return nil, 0, projectNotFound()
	}
	ctx, cancel := context.WithTimeout(r.Context(), tmsLiveRequestTimeout)
	defer cancel()
	operator, conn, err := api.liveJobOperator(ctx, actor, &id)
	if err != nil {
		return nil, 0, err
	}
	if !tmscatalog.JobFeaturesFor(conn.ProviderKind).Members {
		return nil, 0, projectFailure(http.StatusNotImplemented, "provider_members_unsupported", "Listing project members is not supported for "+conn.ProviderKind)
	}
	project, err := operator.GetProject(ctx, id.externalProjectID)
	if err != nil {
		return nil, 0, liveProviderFailure(conn, err)
	}
	if project == nil {
		return nil, 0, projectNotFound()
	}
	members, err := operator.ListMembers(ctx, id.externalProjectID)
	if err != nil {
		return nil, 0, liveProviderFailure(conn, err)
	}
	records := make([]liveProjectMemberRecord, 0, len(members))
	for _, member := range members {
		records = append(records, liveProjectMemberRecord{
			ExternalUserID: member.ExternalUserID,
			Username:       member.Username,
			DisplayName:    member.DisplayName,
			AvatarURL:      member.AvatarURL,
			Role:           member.Role,
		})
	}
	return map[string]any{"members": records}, http.StatusOK, nil
}

func (api *projectAPI) projectJobsCreateHandler(r *http.Request, actor projectActor) (any, int, error) {
	id, live := parseLiveProjectID(r.PathValue("projectId"))
	if !live {
		return nil, 0, projectFailure(http.StatusNotImplemented, "job_create_deferred", "Creating native jobs is not available on this server")
	}
	if !actor.canCreateJobs() {
		return nil, 0, projectForbidden()
	}
	var body liveCreateJobsBody
	if err := decodeProjectBody(r, &body); err != nil {
		return nil, 0, projectFailure(http.StatusBadRequest, "invalid_request_body", "Invalid create job payload")
	}
	title := strings.TrimSpace(body.Title)
	if title == "" || utf16Length(title) > liveCreateTitleMax {
		return nil, 0, projectFailure(http.StatusBadRequest, "invalid_request_body", "Invalid create job payload")
	}
	kind := strings.TrimSpace(body.Kind)
	if kind == "" {
		kind = "translation"
	}
	switch kind {
	case "translation", "proofread":
	default:
		return nil, 0, projectFailure(http.StatusBadRequest, "invalid_request_body", "Invalid create job payload")
	}
	locales := uniqueTrimmed(body.TargetLocales, liveCreateLocaleMax)
	if len(locales) == 0 || len(locales) > liveCreateLocalesMax {
		return nil, 0, projectFailure(http.StatusBadRequest, "invalid_request_body", "Invalid create job payload")
	}
	fileIDs := uniqueTrimmed(body.FileIDs, liveCreateFileIDMax)
	if len(fileIDs) == 0 || len(fileIDs) > liveCreateFileIDsMax {
		return nil, 0, projectFailure(http.StatusBadRequest, "invalid_request_body", "Invalid create job payload")
	}
	if id.providerKind == "crowdin" && !positiveCrowdinIDs(fileIDs) {
		return nil, 0, projectFailure(http.StatusBadRequest, "invalid_request_body", "Invalid create job payload")
	}
	assignees := uniqueTrimmed(body.AssigneeExternalUserIDs, liveCreateAssigneeIDMax)
	if len(assignees) > liveCreateAssigneesMax {
		return nil, 0, projectFailure(http.StatusBadRequest, "invalid_request_body", "Invalid create job payload")
	}
	if id.providerKind == "crowdin" && !positiveCrowdinIDs(assignees) {
		return nil, 0, projectFailure(http.StatusBadRequest, "invalid_request_body", "Invalid create job payload")
	}
	var description *string
	if body.Description != nil {
		trimmed := strings.TrimSpace(*body.Description)
		if utf16Length(trimmed) > liveCreateDescriptionMax {
			return nil, 0, projectFailure(http.StatusBadRequest, "invalid_request_body", "Invalid create job payload")
		}
		if trimmed != "" {
			description = &trimmed
		}
	}
	ctx, cancel := context.WithTimeout(r.Context(), tmsLiveRequestTimeout)
	defer cancel()
	operator, conn, err := api.liveJobOperator(ctx, actor, &id)
	if err != nil {
		return nil, 0, err
	}
	if !tmscatalog.JobFeaturesFor(conn.ProviderKind).Create {
		return nil, 0, projectFailure(http.StatusNotImplemented, "provider_task_create_unsupported", "Creating jobs is not supported for "+conn.ProviderKind)
	}
	project, err := operator.GetProject(ctx, id.externalProjectID)
	if err != nil {
		return nil, 0, liveProviderFailure(conn, err)
	}
	if project == nil {
		return nil, 0, projectNotFound()
	}
	jobs, partialMessage, err := createLiveJobs(ctx, operator, conn.ProviderKind, *project, liveCreateJobsBody{
		Title:                   title,
		TargetLocales:           locales,
		FileIDs:                 fileIDs,
		AssigneeExternalUserIDs: assignees,
		Kind:                    kind,
		Description:             description,
	})
	if err != nil {
		return nil, 0, liveProviderFailure(conn, err)
	}
	if partialMessage != "" {
		return map[string]any{
			"error":        "provider_task_create_partial",
			"message":      partialMessage,
			"createdCount": len(jobs),
			"jobs":         jobs,
		}, http.StatusMultiStatus, nil
	}
	return map[string]any{"jobs": jobs}, http.StatusCreated, nil
}

func (api *projectAPI) orgJobUpdateHandler(r *http.Request, actor projectActor) (any, int, error) {
	job, ok := parseLiveJobID(r.PathValue("jobId"))
	if !ok {
		return nil, 0, projectFailure(http.StatusNotImplemented, "job_update_deferred", "Updating native jobs is not available on this server")
	}
	if !actor.canWriteJobs() {
		return nil, 0, projectForbidden()
	}
	var body liveUpdateJobBody
	if err := decodeProjectBody(r, &body); err != nil {
		return nil, 0, projectFailure(http.StatusBadRequest, "invalid_job_update", "Invalid provider job update payload")
	}
	if body.Title != nil {
		trimmed := strings.TrimSpace(*body.Title)
		if trimmed == "" || utf16Length(trimmed) > liveCreateTitleMax {
			return nil, 0, projectFailure(http.StatusBadRequest, "invalid_job_update", "Invalid provider job update payload")
		}
		body.Title = &trimmed
	}
	var description *string
	if body.Description.Present {
		trimmed := ""
		if body.Description.Value != nil {
			trimmed = strings.TrimSpace(*body.Description.Value)
			if utf16Length(trimmed) > liveCreateDescriptionMax {
				return nil, 0, projectFailure(http.StatusBadRequest, "invalid_job_update", "Invalid provider job update payload")
			}
		}
		description = &trimmed
	}
	if body.AssigneeExternalUserIDs != nil {
		ids := uniqueTrimmed(*body.AssigneeExternalUserIDs, liveCreateAssigneeIDMax)
		if len(ids) > liveCreateAssigneesMax {
			return nil, 0, projectFailure(http.StatusBadRequest, "invalid_job_update", "Invalid provider job update payload")
		}
		if job.providerKind == "crowdin" && !canonicalCrowdinIDs(ids) {
			return nil, 0, projectFailure(http.StatusBadRequest, "invalid_crowdin_assignee_id", "Assignee ids must be canonical positive Crowdin member ids.")
		}
		body.AssigneeExternalUserIDs = &ids
	}
	if body.Title == nil && !body.Description.Present && body.AssigneeExternalUserIDs == nil {
		return nil, 0, projectFailure(http.StatusBadRequest, "invalid_job_update", "At least one of title, description, or assigneeExternalUserIds is required")
	}
	return api.updateLiveJob(r, actor, job, tmscatalog.TaskUpdate{
		Title:        body.Title,
		Description:  description,
		AssigneeIDs:  derefStrings(body.AssigneeExternalUserIDs),
		HasAssignees: body.AssigneeExternalUserIDs != nil,
	})
}

func (api *projectAPI) orgJobDescriptionHandler(r *http.Request, actor projectActor) (any, int, error) {
	job, ok := parseLiveJobID(r.PathValue("jobId"))
	if !ok {
		return nil, 0, projectFailure(http.StatusNotImplemented, "job_update_deferred", "Updating native jobs is not available on this server")
	}
	if !actor.canWriteJobs() {
		return nil, 0, projectForbidden()
	}
	var body liveUpdateDescriptionBody
	if err := decodeProjectBody(r, &body); err != nil {
		return nil, 0, projectFailure(http.StatusBadRequest, "invalid_request_body", "Invalid job description payload")
	}
	if utf16Length(body.Description) > liveCreateDescriptionMax {
		return nil, 0, projectFailure(http.StatusBadRequest, "invalid_request_body", "Invalid job description payload")
	}
	description := strings.TrimSpace(body.Description)
	return api.updateLiveJob(r, actor, job, tmscatalog.TaskUpdate{Description: &description})
}

func (api *projectAPI) orgJobDeleteHandler(r *http.Request, actor projectActor) (any, int, error) {
	job, ok := parseLiveJobID(r.PathValue("jobId"))
	if !ok {
		return nil, 0, projectFailure(http.StatusNotImplemented, "job_delete_deferred", "Deleting native jobs is not available on this server")
	}
	if !actor.canWriteJobs() {
		return nil, 0, projectForbidden()
	}
	ctx, cancel := context.WithTimeout(r.Context(), tmsLiveRequestTimeout)
	defer cancel()
	operator, conn, err := api.liveJobOperator(ctx, actor, &job.liveProjectID)
	if err != nil {
		return nil, 0, err
	}
	if !tmscatalog.JobFeaturesFor(conn.ProviderKind).Delete {
		return nil, 0, projectFailure(http.StatusNotImplemented, "provider_task_delete_unsupported", "Deleting jobs is not supported for "+conn.ProviderKind)
	}
	task, err := operator.GetTask(ctx, job.externalProjectID, job.externalJobID)
	if err != nil {
		return nil, 0, liveProviderFailure(conn, err)
	}
	if task == nil {
		return nil, 0, projectJobNotFound()
	}
	if err := operator.DeleteTask(ctx, job.externalProjectID, job.externalJobID); err != nil {
		return nil, 0, liveProviderFailure(conn, err)
	}
	return nil, http.StatusNoContent, nil
}

func (api *projectAPI) projectJobFilesHandler(r *http.Request, actor projectActor) (any, int, error) {
	project, jobID, live := api.liveProjectJobID(r)
	if !live {
		return nil, 0, projectNotFound()
	}
	if jobID == "" {
		return nil, 0, projectJobNotFound()
	}
	return api.liveJobFiles(r, actor, project, jobID)
}

func (api *projectAPI) orgJobFilesHandler(r *http.Request, actor projectActor) (any, int, error) {
	job, ok := parseLiveJobID(r.PathValue("jobId"))
	if !ok {
		return nil, 0, projectJobNotFound()
	}
	return api.liveJobFiles(r, actor, job.liveProjectID, job.externalJobID)
}

func (api *projectAPI) projectJobCommentsHandler(r *http.Request, actor projectActor) (any, int, error) {
	project, jobID, live := api.liveProjectJobID(r)
	if !live {
		return nil, 0, projectNotFound()
	}
	if jobID == "" {
		return nil, 0, projectJobNotFound()
	}
	return api.liveJobComments(r, actor, project, jobID)
}

func (api *projectAPI) orgJobCommentsHandler(r *http.Request, actor projectActor) (any, int, error) {
	job, ok := parseLiveJobID(r.PathValue("jobId"))
	if !ok {
		return nil, 0, projectJobNotFound()
	}
	return api.liveJobComments(r, actor, job.liveProjectID, job.externalJobID)
}

func (api *projectAPI) updateLiveJob(r *http.Request, actor projectActor, job liveJobID, update tmscatalog.TaskUpdate) (any, int, error) {
	ctx, cancel := context.WithTimeout(r.Context(), tmsLiveRequestTimeout)
	defer cancel()
	operator, conn, err := api.liveJobOperator(ctx, actor, &job.liveProjectID)
	if err != nil {
		return nil, 0, err
	}
	if update.HasAssignees && !tmscatalog.JobFeaturesFor(conn.ProviderKind).Assignees {
		return nil, 0, projectFailure(http.StatusBadRequest, "unsupported_job_field_update", "Assignee updates are not supported for Smartling jobs.")
	}
	updated, err := operator.UpdateTask(ctx, job.externalProjectID, job.externalJobID, update)
	if err != nil {
		var providerErr *tmscatalog.ProviderError
		if errors.As(err, &providerErr) && providerErr.Status == http.StatusNotFound {
			return nil, 0, projectJobNotFound()
		}
		return nil, 0, liveProviderFailure(conn, err)
	}
	if updated == nil {
		return nil, 0, projectJobNotFound()
	}
	project, err := operator.GetProject(ctx, job.externalProjectID)
	if err != nil {
		return nil, 0, liveProviderFailure(conn, err)
	}
	name := "Unknown project"
	if project != nil {
		name = project.Name
	}
	return map[string]any{"job": liveJobDetail(conn.ProviderKind, job.externalProjectID, name, *updated)}, http.StatusOK, nil
}

func (api *projectAPI) liveJobFiles(r *http.Request, actor projectActor, id liveProjectID, taskID string) (any, int, error) {
	if !actor.canReadJobs() {
		return nil, 0, projectForbidden()
	}
	ctx, cancel := context.WithTimeout(r.Context(), tmsLiveRequestTimeout)
	defer cancel()
	operator, conn, err := api.liveJobOperator(ctx, actor, &id)
	if err != nil {
		return nil, 0, err
	}
	task, err := operator.GetTask(ctx, id.externalProjectID, taskID)
	if err != nil {
		return nil, 0, liveProviderFailure(conn, err)
	}
	if task == nil {
		return nil, 0, projectJobNotFound()
	}
	if len(task.FileIDs) == 0 {
		return map[string]any{"files": []liveFileRecord{}}, http.StatusOK, nil
	}
	project, err := operator.GetProject(ctx, id.externalProjectID)
	if err != nil {
		return nil, 0, liveProviderFailure(conn, err)
	}
	if project == nil {
		return map[string]any{"files": []liveFileRecord{}}, http.StatusOK, nil
	}
	files, err := operator.ListFiles(ctx, *project, "", liveJobFilesListLimit)
	if err != nil {
		return nil, 0, liveProviderFailure(conn, err)
	}
	byID := map[string]tmscatalog.File{}
	for _, file := range files {
		byID[file.ExternalResourceID] = file
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	records := []liveFileRecord{}
	for _, fileID := range task.FileIDs {
		file, ok := byID[fileID]
		if !ok {
			continue
		}
		records = append(records, liveFile(conn.ProviderKind, id.externalProjectID, file, now))
	}
	return map[string]any{"files": records}, http.StatusOK, nil
}

func (api *projectAPI) liveJobComments(r *http.Request, actor projectActor, id liveProjectID, taskID string) (any, int, error) {
	if !actor.canReadJobs() {
		return nil, 0, projectForbidden()
	}
	ctx, cancel := context.WithTimeout(r.Context(), tmsLiveRequestTimeout)
	defer cancel()
	operator, conn, err := api.liveJobOperator(ctx, actor, &id)
	if err != nil {
		return nil, 0, err
	}
	if !tmscatalog.JobFeaturesFor(conn.ProviderKind).Comments {
		return nil, 0, projectFailure(http.StatusNotImplemented, "provider_comments_read_unsupported", "Task comments are not available for "+conn.ProviderKind)
	}
	comments, err := operator.ListTaskComments(ctx, id.externalProjectID, taskID)
	if err != nil {
		return nil, 0, liveProviderFailure(conn, err)
	}
	if comments == nil {
		return nil, 0, projectJobNotFound()
	}
	records := make([]liveJobCommentRecord, 0, len(comments))
	for _, comment := range comments {
		records = append(records, liveJobCommentRecord{
			ID:                liveJobCommentIDPrefix + comment.ID,
			ExternalCommentID: comment.ID,
			UserID:            comment.UserID,
			TaskID:            comment.TaskID,
			Text:              comment.Text,
			TimeSpentSeconds:  comment.TimeSpent,
			CreatedAt:         comment.CreatedAt,
			UpdatedAt:         comment.UpdatedAt,
		})
	}
	return map[string]any{"comments": records}, http.StatusOK, nil
}

func (api *projectAPI) listLiveWorkspaceJobs(ctx context.Context, actor projectActor, operator tmscatalog.JobOperator, conn tmsConnection, query liveJobsQuery) ([]liveJobRecord, error) {
	projects, err := operator.ListProjects(ctx)
	if err != nil {
		return nil, err
	}
	if query.mine && operator.UsesPerUserAuth() {
		return api.listLiveUserJobs(ctx, operator, conn.ProviderKind, projects, "", query)
	}
	active := make([]tmscatalog.Project, 0, len(projects))
	for _, project := range projects {
		if project.IsActive {
			active = append(active, project)
		}
	}
	var candidates []string
	if query.mine {
		candidates, err = api.providerAssigneeCandidates(ctx, actor)
		if err != nil {
			return nil, err
		}
		if len(candidates) == 0 {
			return []liveJobRecord{}, nil
		}
	}
	listed, err := mapLiveProjectJobs(ctx, active, func(ctx context.Context, project tmscatalog.Project) ([]liveJobRecord, error) {
		id := liveProjectID{providerKind: conn.ProviderKind, externalProjectID: project.ExternalID}
		return api.listLiveProjectJobs(ctx, actor, operator, conn, id, query, &project)
	})
	if err != nil {
		return nil, err
	}
	jobs := []liveJobRecord{}
	for _, group := range listed {
		jobs = append(jobs, group...)
	}
	return jobs, nil
}

func (api *projectAPI) listLiveUserJobs(ctx context.Context, operator tmscatalog.JobOperator, providerKind string, projects []tmscatalog.Project, projectID string, query liveJobsQuery) ([]liveJobRecord, error) {
	tasks, err := operator.ListUserTasks(ctx, projectID, tmscatalog.TaskListOptions{Recent: query.recent})
	if err != nil {
		return nil, err
	}
	names := map[string]string{}
	for _, project := range projects {
		names[project.ExternalID] = project.Name
	}
	jobs := []liveJobRecord{}
	for _, task := range tasks {
		taskProjectID := strings.TrimSpace(task.ProjectID)
		if taskProjectID == "" {
			taskProjectID = projectID
		}
		if taskProjectID == "" {
			continue
		}
		if projectID != "" && taskProjectID != projectID {
			continue
		}
		name := names[taskProjectID]
		if name == "" {
			name = "Unknown project"
		}
		jobs = append(jobs, liveJob(providerKind, taskProjectID, name, task))
	}
	return jobs, nil
}

func (api *projectAPI) listLiveProjectJobs(ctx context.Context, actor projectActor, operator tmscatalog.JobOperator, conn tmsConnection, id liveProjectID, query liveJobsQuery, known *tmscatalog.Project) ([]liveJobRecord, error) {
	if query.mine && operator.UsesPerUserAuth() {
		project := known
		if project == nil {
			loaded, err := operator.GetProject(ctx, id.externalProjectID)
			if err != nil {
				return nil, err
			}
			if loaded == nil {
				return []liveJobRecord{}, nil
			}
			project = loaded
		}
		return api.listLiveUserJobs(ctx, operator, conn.ProviderKind, []tmscatalog.Project{*project}, id.externalProjectID, query)
	}
	project := known
	if project == nil {
		loaded, err := operator.GetProject(ctx, id.externalProjectID)
		if err != nil {
			return nil, err
		}
		if loaded == nil {
			return []liveJobRecord{}, nil
		}
		project = loaded
	}
	tasks, err := operator.ListTasks(ctx, id.externalProjectID, tmscatalog.TaskListOptions{Recent: query.recent})
	if err != nil {
		return nil, err
	}
	if query.mine {
		candidates, err := api.providerAssigneeCandidates(ctx, actor)
		if err != nil {
			return nil, err
		}
		if len(candidates) == 0 {
			return []liveJobRecord{}, nil
		}
		tasks = filterTasksByAssignees(tasks, candidates)
	}
	jobs := make([]liveJobRecord, 0, len(tasks))
	for _, task := range tasks {
		jobs = append(jobs, liveJob(conn.ProviderKind, id.externalProjectID, project.Name, task))
	}
	return jobs, nil
}

func (api *projectAPI) getLiveJobDetail(ctx context.Context, operator tmscatalog.JobOperator, conn tmsConnection, id liveProjectID, taskID string) (liveJobDetailRecord, error) {
	task, err := operator.GetTask(ctx, id.externalProjectID, taskID)
	if err != nil {
		return liveJobDetailRecord{}, liveProviderFailure(conn, err)
	}
	if task == nil {
		return liveJobDetailRecord{}, projectJobNotFound()
	}
	project, err := operator.GetProject(ctx, id.externalProjectID)
	if err != nil {
		return liveJobDetailRecord{}, liveProviderFailure(conn, err)
	}
	name := "Unknown project"
	if project != nil {
		name = project.Name
	}
	return liveJobDetail(conn.ProviderKind, id.externalProjectID, name, *task), nil
}

func createLiveJobs(ctx context.Context, operator tmscatalog.JobOperator, providerKind string, project tmscatalog.Project, body liveCreateJobsBody) ([]liveJobRecord, string, error) {
	created := make([]*tmscatalog.Task, len(body.TargetLocales))
	failures := make([]error, len(body.TargetLocales))
	var (
		next int
		stop bool
		mu   sync.Mutex
		wg   sync.WaitGroup
	)
	workers := min(liveJobCreateConcurrency, len(body.TargetLocales))
	for range workers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				mu.Lock()
				if stop || next >= len(body.TargetLocales) {
					mu.Unlock()
					return
				}
				index := next
				next++
				mu.Unlock()
				task, err := operator.CreateTask(ctx, project.ExternalID, tmscatalog.CreateTask{
					Title:       body.Title,
					LanguageID:  body.TargetLocales[index],
					Kind:        body.Kind,
					Description: body.Description,
					FileIDs:     body.FileIDs,
					Assignees:   body.AssigneeExternalUserIDs,
				})
				mu.Lock()
				if err != nil {
					stop = true
					failures[index] = err
				} else {
					created[index] = task
				}
				mu.Unlock()
			}
		}()
	}
	wg.Wait()
	jobs := []liveJobRecord{}
	for _, task := range created {
		if task != nil {
			jobs = append(jobs, liveJob(providerKind, project.ExternalID, project.Name, *task))
		}
	}
	var first error
	for _, err := range failures {
		if err != nil {
			first = err
			break
		}
	}
	if first != nil {
		if len(jobs) > 0 {
			return jobs, "Created " + strconv.Itoa(len(jobs)) + " of " + strconv.Itoa(len(body.TargetLocales)) + " jobs, then failed: " + first.Error(), nil
		}
		return nil, "", first
	}
	return jobs, "", nil
}

func liveJob(providerKind, externalProjectID, projectName string, task tmscatalog.Task) liveJobRecord {
	status := tmscatalog.MapJobStatus(providerKind, task.Status)
	createdAt := liveJobTimestamp(task.CreatedAt, "")
	updatedAt := liveJobTimestamp(task.UpdatedAt, createdAt)
	title := strings.TrimSpace(task.Title)
	if title == "" {
		title = "Untitled task"
	}
	targets := task.TargetLocales
	if targets == nil {
		targets = []string{}
	}
	assigned := task.AssignedUsers
	if assigned == nil {
		assigned = []string{}
	}
	var completedAt *string
	if status == "succeeded" || status == "failed" {
		completedAt = liveJobTimestampPtr(task.CompletedAt)
	}
	var reviewLocale *string
	if len(targets) > 0 {
		reviewLocale = &targets[0]
	}
	name := strings.TrimSpace(projectName)
	return liveJobRecord{
		ID:                    encodeLiveJobID(providerKind, externalProjectID, task.ExternalID),
		ProjectID:             encodeLiveProjectID(providerKind, externalProjectID),
		ProjectName:           stringPtr(name),
		Kind:                  task.Kind,
		Status:                status,
		CreatedAt:             createdAt,
		UpdatedAt:             updatedAt,
		CompletedAt:           completedAt,
		InputPayload:          json.RawMessage("null"),
		OutcomePayload:        json.RawMessage("null"),
		ReviewTargetLocale:    reviewLocale,
		ExternalProviderKind:  providerKind,
		ExternalStatus:        task.Status,
		ExternalTitle:         title,
		ExternalDueDate:       liveJobTimestampPtr(task.DueDate),
		ExternalTargetLocales: targets,
		ExternalAssignedUsers: assigned,
	}
}

func liveJobDetail(providerKind, externalProjectID, projectName string, task tmscatalog.Task) liveJobDetailRecord {
	payload := task.ProviderPayload
	if payload == nil {
		payload = map[string]any{}
	}
	return liveJobDetailRecord{
		liveJobRecord:           liveJob(providerKind, externalProjectID, projectName, task),
		ExternalJobID:           task.ExternalID,
		ExternalURL:             task.URL,
		ExternalProviderPayload: payload,
	}
}

func liveJobTimestamp(raw *string, fallback string) string {
	if value := liveJobTimestampPtr(raw); value != nil {
		return *value
	}
	if fallback != "" {
		return fallback
	}
	return unknownLiveJobActivityAt
}

func liveJobTimestampPtr(raw *string) *string {
	if raw == nil {
		return nil
	}
	value := strings.TrimSpace(*raw)
	if value == "" {
		return nil
	}
	if parsed, err := time.Parse(time.RFC3339Nano, value); err == nil {
		formatted := formatPublicJobTime(parsed)
		return &formatted
	}
	if parsed, err := time.Parse(time.RFC3339, value); err == nil {
		formatted := formatPublicJobTime(parsed)
		return &formatted
	}
	return &value
}

func filterTasksByAssignees(tasks []tmscatalog.Task, candidates []string) []tmscatalog.Task {
	wanted := map[string]bool{}
	for _, candidate := range candidates {
		wanted[strings.ToLower(strings.TrimSpace(candidate))] = true
	}
	out := []tmscatalog.Task{}
	for _, task := range tasks {
		if taskAssignedTo(task, wanted) {
			out = append(out, task)
		}
	}
	return out
}

func taskAssignedTo(task tmscatalog.Task, wanted map[string]bool) bool {
	for _, user := range task.AssignedUsers {
		if wanted[strings.ToLower(strings.TrimSpace(user))] {
			return true
		}
	}
	for _, id := range task.AssigneeIDs {
		if wanted[strings.ToLower(strings.TrimSpace(id))] {
			return true
		}
	}
	return false
}

func positiveCrowdinIDs(values []string) bool {
	for _, value := range values {
		id, err := strconv.Atoi(value)
		if err != nil || id <= 0 {
			return false
		}
	}
	return true
}

func canonicalCrowdinIDs(values []string) bool {
	for _, value := range values {
		id, err := strconv.Atoi(value)
		if err != nil || id <= 0 || strconv.Itoa(id) != value {
			return false
		}
	}
	return true
}

func uniqueTrimmed(values []string, maxLen int) []string {
	out := []string{}
	seen := map[string]bool{}
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" || utf16Length(value) > maxLen || seen[value] {
			continue
		}
		seen[value] = true
		out = append(out, value)
	}
	return out
}

func derefStrings(values *[]string) []string {
	if values == nil {
		return nil
	}
	return *values
}

func stringPtrValue(value string) *string {
	return &value
}

func mapLiveProjectJobs(ctx context.Context, projects []tmscatalog.Project, fn func(context.Context, tmscatalog.Project) ([]liveJobRecord, error)) ([][]liveJobRecord, error) {
	results := make([][]liveJobRecord, len(projects))
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	var (
		wg       sync.WaitGroup
		once     sync.Once
		firstErr error
		slots    = make(chan struct{}, liveJobFanoutConcurrency)
	)
	for index, project := range projects {
		select {
		case <-ctx.Done():
		case slots <- struct{}{}:
			wg.Add(1)
			go func() {
				defer wg.Done()
				defer func() { <-slots }()
				result, err := fn(ctx, project)
				if err != nil {
					once.Do(func() { firstErr = err; cancel() })
					return
				}
				results[index] = result
			}()
		}
	}
	wg.Wait()
	if firstErr != nil {
		return nil, firstErr
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	return results, nil
}
