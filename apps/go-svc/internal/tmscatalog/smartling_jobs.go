package tmscatalog

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
)

type smartlingJob struct {
	TranslationJobUID string   `json:"translationJobUid"`
	JobName           string   `json:"jobName"`
	JobStatus         string   `json:"jobStatus"`
	Description       *string  `json:"description"`
	DueDate           *string  `json:"dueDate"`
	TargetLocaleIDs   []string `json:"targetLocaleIds"`
	CreatedDate       *string  `json:"createdDate"`
	ModifiedDate      *string  `json:"modifiedDate"`
	ReferenceNumber   *string  `json:"referenceNumber"`
	JobNumber         *string  `json:"jobNumber"`
}

type smartlingJobFile struct {
	FileURI string `json:"fileUri"`
}

func (s *smartling) UsesPerUserAuth() bool {
	return false
}

func (s *smartling) GetUser(context.Context) (*User, error) {
	return &User{}, nil
}

func (s *smartling) ListTasks(ctx context.Context, projectID string, _ TaskListOptions) ([]Task, error) {
	projectID = strings.TrimSpace(projectID)
	if projectID == "" {
		return nil, fmt.Errorf("smartling: invalid project id %q", projectID)
	}
	details, err := s.projectDetails(ctx, projectID)
	if err != nil {
		return nil, err
	}
	jobs, err := smartlingList[smartlingJob](ctx, s, smartlingJobsAPI+"/projects/"+url.PathEscape(projectID)+"/jobs", nil, smartlingListPageLimit)
	if err != nil {
		return nil, err
	}
	out := make([]Task, 0, len(jobs))
	for _, job := range jobs {
		out = append(out, mapSmartlingJob(job, details, projectID, nil))
	}
	return out, nil
}

func (s *smartling) ListUserTasks(ctx context.Context, projectID string, options TaskListOptions) ([]Task, error) {
	if strings.TrimSpace(projectID) == "" {
		return []Task{}, nil
	}
	return s.ListTasks(ctx, projectID, options)
}

func (s *smartling) GetTask(ctx context.Context, projectID, taskID string) (*Task, error) {
	projectID = strings.TrimSpace(projectID)
	taskID = strings.TrimSpace(taskID)
	if projectID == "" || taskID == "" {
		return nil, nil
	}
	var job smartlingJob
	if err := s.doData(ctx, http.MethodGet, smartlingJobPath(projectID, taskID), nil, &job); err != nil {
		var providerErr *ProviderError
		if errors.As(err, &providerErr) && providerErr.Status == http.StatusNotFound {
			return nil, nil
		}
		return nil, err
	}
	details, err := s.projectDetails(ctx, projectID)
	if err != nil {
		return nil, err
	}
	fileIDs := s.jobFileIDs(ctx, projectID, taskID)
	task := mapSmartlingJob(job, details, projectID, &fileIDs)
	return &task, nil
}

func (s *smartling) CreateTask(context.Context, string, CreateTask) (*Task, error) {
	return nil, &ProviderError{Status: http.StatusNotImplemented, Message: "Creating jobs is not supported for Smartling"}
}

func (s *smartling) UpdateTask(ctx context.Context, projectID, taskID string, update TaskUpdate) (*Task, error) {
	projectID = strings.TrimSpace(projectID)
	taskID = strings.TrimSpace(taskID)
	if projectID == "" || taskID == "" {
		return nil, nil
	}
	if update.HasAssignees {
		return nil, &ProviderError{Status: http.StatusBadRequest, Message: "Assignee updates are not supported for Smartling jobs"}
	}
	if update.Title == nil && update.Description == nil {
		return s.GetTask(ctx, projectID, taskID)
	}
	body := map[string]string{}
	if update.Title != nil {
		body["jobName"] = strings.TrimSpace(*update.Title)
	}
	if update.Description != nil {
		body["description"] = *update.Description
	}
	var job smartlingJob
	if err := s.doData(ctx, http.MethodPut, smartlingJobPath(projectID, taskID), body, &job); err != nil {
		var providerErr *ProviderError
		if errors.As(err, &providerErr) && providerErr.Status == http.StatusNotFound {
			return nil, nil
		}
		return nil, err
	}
	details, err := s.projectDetails(ctx, projectID)
	if err != nil {
		return nil, err
	}
	task := mapSmartlingJob(job, details, projectID, nil)
	return &task, nil
}

func (s *smartling) DeleteTask(context.Context, string, string) error {
	return &ProviderError{Status: http.StatusNotImplemented, Message: "Deleting jobs is not supported for Smartling"}
}

func (s *smartling) ListMembers(context.Context, string) ([]Member, error) {
	return nil, &ProviderError{Status: http.StatusNotImplemented, Message: "Listing project members is not supported for Smartling"}
}

func (s *smartling) ListTaskComments(context.Context, string, string) ([]TaskComment, error) {
	return nil, &ProviderError{Status: http.StatusNotImplemented, Message: "Task comments are not available for Smartling"}
}

func (s *smartling) jobFileIDs(ctx context.Context, projectID, jobUID string) []string {
	files, err := smartlingList[smartlingJobFile](ctx, s, smartlingJobPath(projectID, jobUID)+"/files", nil, smartlingListPageLimit)
	if err != nil {
		return []string{}
	}
	ids := make([]string, 0, len(files))
	for _, file := range files {
		if uri := strings.TrimSpace(file.FileURI); uri != "" {
			ids = append(ids, uri)
		}
	}
	return ids
}

func smartlingJobPath(projectID, jobUID string) string {
	return smartlingJobsAPI + "/projects/" + url.PathEscape(projectID) + "/jobs/" + url.PathEscape(jobUID)
}

func mapSmartlingJob(job smartlingJob, details smartlingProjectDetails, projectID string, fileIDs *[]string) Task {
	targets := job.TargetLocaleIDs
	if targets == nil {
		targets = []string{}
	}
	ids := []string{}
	if fileIDs != nil {
		ids = *fileIDs
	}
	payload := map[string]any{
		"description":     optionalJSONString(job.Description),
		"createdDate":     optionalJSONString(job.CreatedDate),
		"modifiedDate":    optionalJSONString(job.ModifiedDate),
		"referenceNumber": optionalJSONString(job.ReferenceNumber),
		"jobNumber":       optionalJSONString(job.JobNumber),
		"rawJobStatus":    job.JobStatus,
	}
	if fileIDs != nil {
		payload["fileIds"] = ids
	}
	project := firstNonBlank(details.ProjectID, projectID)
	return Task{
		ExternalID:      job.TranslationJobUID,
		ProjectID:       project,
		Status:          job.JobStatus,
		Title:           job.JobName,
		Description:     trimmedPtr(job.Description),
		Kind:            smartlingJobKind(job.JobStatus),
		TargetLocales:   targets,
		AssignedUsers:   []string{},
		AssigneeIDs:     []string{},
		FileIDs:         ids,
		DueDate:         trimmedPtr(job.DueDate),
		URL:             smartlingJobURL(details.AccountUID, project, job.TranslationJobUID),
		CreatedAt:       trimmedPtr(job.CreatedDate),
		UpdatedAt:       firstNonEmpty(job.ModifiedDate, job.CreatedDate),
		ProviderPayload: payload,
	}
}

func smartlingJobKind(status string) string {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case "in_review", "in-review", "in review", "in_edit", "in-edit", "in edit":
		return "review"
	default:
		return "translation"
	}
}

func smartlingJobURL(accountUID, projectID, jobUID string) *string {
	accountUID = strings.TrimSpace(accountUID)
	projectID = strings.TrimSpace(projectID)
	jobUID = strings.TrimSpace(jobUID)
	if accountUID == "" || projectID == "" || jobUID == "" {
		return nil
	}
	jobURL := "https://dashboard.smartling.com/app/accounts/" + encodeURIComponent(accountUID) + "/project/" + encodeURIComponent(projectID) + "/jobs/" + encodeURIComponent(jobUID)
	return &jobURL
}
