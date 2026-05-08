package crowdin

import (
	"context"
	"fmt"

	"github.com/crowdin/crowdin-api-client-go/crowdin/model"
)

// Create and assign tasks to get files translated or proofread by specific people.
// You can set the due dates, split words between people, and receive notifications
// about the changes and updates on tasks. Tasks are project-specific, so you’ll
// have to create them within a project.
//
// Use API to create, modify, and delete specific tasks.
//
// API docs: https://developer.crowdin.com/api/v2/#tag/Tasks
type TasksService struct {
	client *Client
}

// List returns a list of tasks in a project.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.tasks.getMany
func (s *TasksService) List(ctx context.Context, projectID int, opts *model.TasksListOptions) ([]*model.Task, *Response, error) {
	res := new(model.TasksListResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/projects/%d/tasks", projectID), opts, res)
	if err != nil {
		return nil, resp, err
	}

	list := make([]*model.Task, 0, len(res.Data))
	for _, task := range res.Data {
		list = append(list, task.Data)
	}

	return list, resp, err
}

// Get returns a single task in a project by its identifier.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.tasks.get
func (s *TasksService) Get(ctx context.Context, projectID, taskID int) (*model.Task, *Response, error) {
	res := new(model.TaskResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/projects/%d/tasks/%d", projectID, taskID), nil, res)

	return res.Data, resp, err
}

// Add creates a new task in a project.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.tasks.post
func (s *TasksService) Add(ctx context.Context, projectID int, req model.TaskAddRequester) (*model.Task, *Response, error) {
	res := new(model.TaskResponse)
	resp, err := s.client.Post(ctx, fmt.Sprintf("/api/v2/projects/%d/tasks", projectID), req, res)

	return res.Data, resp, err
}

// Edit updates a task in a project by its identifier.
//
// Request body (one of the following):
// 1. TaskOperation
//   - op (string): Operation to perform. Enum: replace, test.
//   - path (string <json-pointer>): JSON path to the field to be updated. Enum: "/status", "/title",
//     "/description", "/deadline", "/startedAt", "/resolvedAt", "/splitFiles", "/splitContent",
//     "/fileIds", "/stringIds", "/assignees", "/dateFrom", "/dateTo", "/labelIds", "/excludeLabelIds".
//   - value (any): Value to be set. Enum: string, bool, array of integers, array of objects.
//
// 2. VendorTaskOperation
//   - op (string): Operation to perform. Enum: replace, test.
//   - path (string <json-pointer>): JSON path to the field to be updated.
//     Enum: "/title", "/description", "/sttaus".
//   - value (any): Value to be set. Enum: string, bool, array of integers, array of objects.
//
// 3. PendingTaskOperation
//   - op (string): Operation to perform. Enum: replace, test.
//   - path (string <json-pointer>): JSON path to the field to be updated.
//     Enum: "/title", "/description", "/assignees", "/deadline".
//   - value (any): Value to be set. Enum: string, bool, array of integers, array of objects.
//
// 4. VendorPendingTaskOperation
//   - op (string): Operation to perform. Enum: replace, test.
//   - path (string <json-pointer>): JSON path to the field to be updated. Enum: "/title", "/description".
//   - value (any): Value to be set. Enum: string, bool, array of integers, array of objects.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.tasks.patch
func (s *TasksService) Edit(ctx context.Context, projectID, taskID int, req []*model.UpdateRequest) (*model.Task, *Response, error) {
	res := new(model.TaskResponse)
	resp, err := s.client.Patch(ctx, fmt.Sprintf("/api/v2/projects/%d/tasks/%d", projectID, taskID), req, res)

	return res.Data, resp, err
}

// Delete removes a task from a project by its identifier.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.tasks.delete
func (s *TasksService) Delete(ctx context.Context, projectID, taskID int) (*Response, error) {
	return s.client.Delete(ctx, fmt.Sprintf("/api/v2/projects/%d/tasks/%d", projectID, taskID), nil)
}

// ListUserTasks returns a list of tasks assigned to the user.
//
// https://developer.crowdin.com/api/v2/#operation/api.user.tasks.getMany
func (s *TasksService) ListUserTasks(ctx context.Context, opts *model.UserTasksListOptions) ([]*model.Task, *Response, error) {
	res := new(model.TasksListResponse)
	resp, err := s.client.Get(ctx, "/api/v2/user/tasks", opts, res)
	if err != nil {
		return nil, resp, err
	}

	list := make([]*model.Task, 0, len(res.Data))
	for _, task := range res.Data {
		list = append(list, task.Data)
	}

	return list, resp, err
}

// EditArchivedStatus changes the archived status of the task.
//
// Request body:
// - op (string): Operation to perform. Enum: replace.
// - path (string <json-pointer>): JSON path to the field to be updated. Enum: "/isArchived".
// - value (bool): Value to be set. Enum: true - archive task, false - move a task from archived
// to a list of all tasks
//
// https://developer.crowdin.com/api/v2/#operation/api.user.tasks.patch
func (s *TasksService) EditArchivedStatus(ctx context.Context, projectID, taskID int, req []*model.UpdateRequest) (
	*model.Task, *Response, error,
) {
	res := new(model.TaskResponse)
	resp, err := s.client.Patch(ctx, fmt.Sprintf("/api/v2/tasks/%d?projectId=%d", taskID, projectID), req, res)

	return res.Data, resp, err
}

// ExportStrings returns a download link.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.tasks.exports.post
func (s *TasksService) ExportStrings(ctx context.Context, projectID, taskID int) (*model.DownloadLink, *Response, error) {
	res := new(model.DownloadLinkResponse)
	resp, err := s.client.Post(ctx, fmt.Sprintf("/api/v2/projects/%d/tasks/%d/exports", projectID, taskID), "", res)

	return res.Data, resp, err
}

// ListSettingsTemplates returns a list of task settings templates in a project.
//
// https://developer.crowdin.com/api/v2/string-based/#operation/api.projects.tasks.settings-templates.getMany
func (s *TasksService) ListSettingsTemplates(ctx context.Context, projectID int, opts *model.ListOptions) (
	[]*model.TaskSettingsTemplate, *Response, error,
) {
	res := new(model.TaskSettingsTemplatesListResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/projects/%d/tasks/settings-templates", projectID), opts, res)
	if err != nil {
		return nil, resp, err
	}

	list := make([]*model.TaskSettingsTemplate, 0, len(res.Data))
	for _, task := range res.Data {
		list = append(list, task.Data)
	}

	return list, resp, err
}

// GetSettingsTemplate returns a single task settings template in a project by its identifier.
//
// https://developer.crowdin.com/api/v2/string-based/#operation/api.projects.tasks.settings-templates.get
func (s *TasksService) GetSettingsTemplate(ctx context.Context, projectID, taskSettingTemplateID int) (
	*model.TaskSettingsTemplate, *Response, error,
) {
	path := fmt.Sprintf("/api/v2/projects/%d/tasks/settings-templates/%d", projectID, taskSettingTemplateID)
	res := new(model.TaskSettingsTemplateResponse)
	resp, err := s.client.Get(ctx, path, nil, res)

	return res.Data, resp, err
}

// AddSettingsTemplate creates a new task settings template in a project.
//
// https://developer.crowdin.com/api/v2/string-based/#operation/api.projects.tasks.settings-templates.post
func (s *TasksService) AddSettingsTemplate(ctx context.Context, projectID int, req *model.TaskSettingsTemplateAddRequest) (
	*model.TaskSettingsTemplate, *Response, error,
) {
	res := new(model.TaskSettingsTemplateResponse)
	resp, err := s.client.Post(ctx, fmt.Sprintf("/api/v2/projects/%d/tasks/settings-templates", projectID), req, res)

	return res.Data, resp, err
}

// EditSettingsTemplate updates a task settings template in a project by its identifier.
//
// Request body:
// - op (string): Operation to perform. Enum: replace, test.
// - path (string <json-pointer>): JSON path to the field to be updated. Enum: "/name", "/config".
// - value (string|int): Value to be set. Enum: string, integer.
//
// https://developer.crowdin.com/api/v2/string-based/#operation/api.projects.tasks.settings-templates.patch
func (s *TasksService) EditSettingsTemplate(ctx context.Context, projectID, taskSettingTemplateID int, req []*model.UpdateRequest) (
	*model.TaskSettingsTemplate, *Response, error,
) {
	path := fmt.Sprintf("/api/v2/projects/%d/tasks/settings-templates/%d", projectID, taskSettingTemplateID)
	res := new(model.TaskSettingsTemplateResponse)
	resp, err := s.client.Patch(ctx, path, req, res)

	return res.Data, resp, err
}

// DeleteSettingsTemplate removes a task settings template from a project by its identifier.
//
// https://developer.crowdin.com/api/v2/string-based/#operation/api.projects.tasks.settings-templates.delete
func (s *TasksService) DeleteSettingsTemplate(ctx context.Context, projectID, taskSettingTemplateID int) (*Response, error) {
	return s.client.Delete(ctx, fmt.Sprintf("/api/v2/projects/%d/tasks/settings-templates/%d", projectID, taskSettingTemplateID), nil)
}

// ListComments returns a list of task comments in a project.
//
// https://support.crowdin.com/developer/api/v2/#tag/Tasks/operation/api.projects.tasks.comments.getMany
func (s *TasksService) ListComments(ctx context.Context, projectID, taskID int, opts *model.ListOptions) (
	[]*model.TaskComment, *Response, error,
) {
	res := new(model.TaskCommentsListResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/projects/%d/tasks/%d/comments", projectID, taskID), opts, res)
	if err != nil {
		return nil, resp, err
	}

	list := make([]*model.TaskComment, 0, len(res.Data))
	for _, task := range res.Data {
		list = append(list, task.Data)
	}

	return list, resp, err
}

// GetComment returns a single task comment in a project by its identifier.
//
// https://support.crowdin.com/developer/api/v2/#tag/Tasks/operation/api.projects.tasks.comments.get
func (s *TasksService) GetComment(ctx context.Context, projectID, taskID, commentID int) (
	*model.TaskComment, *Response, error,
) {
	path := fmt.Sprintf("/api/v2/projects/%d/tasks/%d/comments/%d", projectID, taskID, commentID)
	res := new(model.TaskCommentResponse)
	resp, err := s.client.Get(ctx, path, nil, res)

	return res.Data, resp, err
}

// AddComment creates a new comment for a specific task in a project.
//
// https://support.crowdin.com/developer/api/v2/#tag/Tasks/operation/api.projects.tasks.comments.post
func (s *TasksService) AddComment(ctx context.Context, projectID, taskID int, req *model.TaskCommentAddRequest) (
	*model.TaskComment, *Response, error,
) {
	res := new(model.TaskCommentResponse)
	resp, err := s.client.Post(ctx, fmt.Sprintf("/api/v2/projects/%d/tasks/%d/comments", projectID, taskID), req, res)

	return res.Data, resp, err
}

// EditComment updates a comment for a specific task in a project by its identifier.
//
// https://support.crowdin.com/developer/api/v2/#tag/Tasks/operation/api.projects.tasks.comments.patch
func (s *TasksService) EditComment(ctx context.Context, projectID, taskID, commentID int, req []*model.UpdateRequest) (
	*model.TaskComment, *Response, error,
) {
	res := new(model.TaskCommentResponse)
	resp, err := s.client.Patch(ctx, fmt.Sprintf("/api/v2/projects/%d/tasks/%d/comments/%d", projectID, taskID, commentID), req, res)

	return res.Data, resp, err
}

// DeleteComment removes a comment from a specific task in a project by its identifier.
//
// https://support.crowdin.com/developer/api/v2/#tag/Tasks/operation/api.projects.tasks.comments.delete
func (s *TasksService) DeleteComment(ctx context.Context, projectID, taskID, commentID int) (*Response, error) {
	return s.client.Delete(ctx, fmt.Sprintf("/api/v2/projects/%d/tasks/%d/comments/%d", projectID, taskID, commentID), nil)
}
