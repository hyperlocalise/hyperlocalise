package tmscatalog

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
)

type crowdinTask struct {
	ID               int     `json:"id"`
	ProjectID        int     `json:"projectId"`
	Type             int     `json:"type"`
	Status           string  `json:"status"`
	Title            string  `json:"title"`
	Description      *string `json:"description"`
	LanguageID       *string `json:"languageId"`
	SourceLanguageID *string `json:"sourceLanguageId"`
	TargetLanguageID *string `json:"targetLanguageId"`
	TargetLanguages  []struct {
		ID *string `json:"id"`
	} `json:"targetLanguages"`
	FileIDs   []int `json:"fileIds"`
	Assignees []struct {
		ID       int    `json:"id"`
		Username string `json:"username"`
	} `json:"assignees"`
	Deadline   *string `json:"deadline"`
	WebURL     string  `json:"webUrl"`
	CreatedAt  *string `json:"createdAt"`
	UpdatedAt  *string `json:"updatedAt"`
	StartedAt  *string `json:"startedAt"`
	ResolvedAt *string `json:"resolvedAt"`
	StringIDs  []int   `json:"stringIds"`
}

type crowdinMember struct {
	ID        int     `json:"id"`
	Username  string  `json:"username"`
	FullName  *string `json:"fullName"`
	FirstName *string `json:"firstName"`
	LastName  *string `json:"lastName"`
	AvatarURL *string `json:"avatarUrl"`
	Role      *string `json:"role"`
}

type crowdinTaskComment struct {
	ID        int    `json:"id"`
	UserID    int    `json:"userId"`
	TaskID    int    `json:"taskId"`
	Text      string `json:"text"`
	TimeSpent *int   `json:"timeSpent"`
	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
}

type crowdinUser struct {
	ID       int    `json:"id"`
	Username string `json:"username"`
}

type crowdinTaskPatch struct {
	Op    string `json:"op"`
	Path  string `json:"path"`
	Value any    `json:"value"`
}

func (c *crowdin) UsesPerUserAuth() bool {
	return crowdinUsesPerUserAuth(c.credentials.AuthMode)
}

func (c *crowdin) GetUser(ctx context.Context) (*User, error) {
	user, err := crowdinGet[crowdinUser](ctx, c, "/user")
	if err != nil {
		return nil, err
	}
	return &User{ID: strconv.Itoa(user.ID), Username: user.Username}, nil
}

func (c *crowdin) ListTasks(ctx context.Context, projectID string, options TaskListOptions) ([]Task, error) {
	id, ok := crowdinProjectID(projectID)
	if !ok {
		return nil, fmt.Errorf("crowdin: invalid project id %q", projectID)
	}
	raw, err := c.listTasks(ctx, "/projects/"+strconv.Itoa(id)+"/tasks", options, 0)
	if err != nil {
		return nil, err
	}
	return mapCrowdinTasks(raw), nil
}

func (c *crowdin) ListUserTasks(ctx context.Context, projectID string, options TaskListOptions) ([]Task, error) {
	projectQuery := 0
	if strings.TrimSpace(projectID) != "" {
		id, ok := crowdinProjectID(projectID)
		if !ok {
			return nil, fmt.Errorf("crowdin: invalid project id %q", projectID)
		}
		projectQuery = id
	}
	raw, err := c.listTasks(ctx, "/user/tasks", options, projectQuery)
	if err != nil {
		return nil, err
	}
	return mapCrowdinTasks(raw), nil
}

func (c *crowdin) listTasks(ctx context.Context, path string, options TaskListOptions, projectID int) ([]crowdinTask, error) {
	limit := crowdinLiveTaskListLimit
	orderBy := crowdinLiveTaskListOrderBy
	if options.FetchAll {
		limit = crowdinSyncTaskPageLimit
		orderBy = ""
	} else if options.Recent {
		orderBy = crowdinRecentTaskListOrderBy
	}
	tasks := []crowdinTask{}
	separator := "?"
	if strings.Contains(path, "?") {
		separator = "&"
	}
	for offset := 0; ; {
		params := url.Values{}
		params.Set("limit", strconv.Itoa(limit))
		params.Set("offset", strconv.Itoa(offset))
		if orderBy != "" {
			params.Set("orderBy", orderBy)
		}
		if projectID > 0 {
			params.Set("projectId", strconv.Itoa(projectID))
		}
		var page struct {
			Data []struct {
				Data crowdinTask `json:"data"`
			} `json:"data"`
		}
		if err := c.doJSON(ctx, http.MethodGet, path+separator+params.Encode(), nil, &page); err != nil {
			return nil, err
		}
		for _, item := range page.Data {
			tasks = append(tasks, item.Data)
		}
		if !options.FetchAll || len(page.Data) < limit {
			return tasks, nil
		}
		offset += limit
	}
}

func (c *crowdin) GetTask(ctx context.Context, projectID, taskID string) (*Task, error) {
	project, ok := crowdinProjectID(projectID)
	if !ok {
		return nil, fmt.Errorf("crowdin: invalid project id %q", projectID)
	}
	id, err := crowdinIntID(taskID, "taskId")
	if err != nil {
		return nil, nil
	}
	raw, err := crowdinGet[crowdinTask](ctx, c, "/projects/"+strconv.Itoa(project)+"/tasks/"+strconv.Itoa(id))
	if err != nil {
		var providerErr *ProviderError
		if errors.As(err, &providerErr) && providerErr.Status == http.StatusNotFound {
			return nil, nil
		}
		return nil, err
	}
	task := mapCrowdinTask(raw)
	return &task, nil
}

func (c *crowdin) CreateTask(ctx context.Context, projectID string, task CreateTask) (*Task, error) {
	project, ok := crowdinProjectID(projectID)
	if !ok {
		return nil, fmt.Errorf("crowdin: invalid project id %q", projectID)
	}
	payload, err := crowdinCreateTaskPayload(task)
	if err != nil {
		return nil, err
	}
	raw, err := crowdinSend[crowdinTask](ctx, c, http.MethodPost, "/projects/"+strconv.Itoa(project)+"/tasks", payload)
	if err != nil {
		return nil, err
	}
	created := mapCrowdinTask(raw)
	return &created, nil
}

func (c *crowdin) UpdateTask(ctx context.Context, projectID, taskID string, update TaskUpdate) (*Task, error) {
	project, ok := crowdinProjectID(projectID)
	if !ok {
		return nil, fmt.Errorf("crowdin: invalid project id %q", projectID)
	}
	id, err := crowdinIntID(taskID, "taskId")
	if err != nil {
		return nil, nil
	}
	patches := []crowdinTaskPatch{}
	if update.Title != nil {
		patches = append(patches, crowdinTaskPatch{Op: "replace", Path: "/title", Value: *update.Title})
	}
	if update.Description != nil {
		patches = append(patches, crowdinTaskPatch{Op: "replace", Path: "/description", Value: *update.Description})
	}
	if update.HasAssignees {
		assignees := make([]map[string]int, 0, len(update.AssigneeIDs))
		for _, rawID := range update.AssigneeIDs {
			assigneeID, parseErr := crowdinCanonicalID(rawID, "assigneeId")
			if parseErr != nil {
				return nil, parseErr
			}
			assignees = append(assignees, map[string]int{"id": assigneeID})
		}
		patches = append(patches, crowdinTaskPatch{Op: "replace", Path: "/assignees", Value: assignees})
	}
	path := "/projects/" + strconv.Itoa(project) + "/tasks/" + strconv.Itoa(id)
	if len(patches) == 0 {
		return c.GetTask(ctx, projectID, taskID)
	}
	raw, err := crowdinSend[crowdinTask](ctx, c, http.MethodPatch, path, patches)
	if err != nil {
		return nil, err
	}
	updated := mapCrowdinTask(raw)
	return &updated, nil
}

func (c *crowdin) DeleteTask(ctx context.Context, projectID, taskID string) error {
	project, ok := crowdinProjectID(projectID)
	if !ok {
		return fmt.Errorf("crowdin: invalid project id %q", projectID)
	}
	id, err := crowdinIntID(taskID, "taskId")
	if err != nil {
		return nil
	}
	err = c.doJSON(ctx, http.MethodDelete, "/projects/"+strconv.Itoa(project)+"/tasks/"+strconv.Itoa(id), nil, nil)
	var providerErr *ProviderError
	if errors.As(err, &providerErr) && providerErr.Status == http.StatusNotFound {
		return nil
	}
	return err
}

func (c *crowdin) ListMembers(ctx context.Context, projectID string) ([]Member, error) {
	project, ok := crowdinProjectID(projectID)
	if !ok {
		return nil, fmt.Errorf("crowdin: invalid project id %q", projectID)
	}
	raw, err := crowdinList[crowdinMember](ctx, c, "/projects/"+strconv.Itoa(project)+"/members")
	if err != nil {
		return nil, err
	}
	out := make([]Member, 0, len(raw))
	for _, member := range raw {
		displayName := strings.TrimSpace(deref(member.FullName))
		if displayName == "" {
			displayName = strings.TrimSpace(strings.TrimSpace(deref(member.FirstName) + " " + deref(member.LastName)))
		}
		if displayName == "" {
			displayName = member.Username
		}
		out = append(out, Member{
			ExternalUserID: strconv.Itoa(member.ID),
			Username:       member.Username,
			DisplayName:    displayName,
			AvatarURL:      trimmedPtr(member.AvatarURL),
			Role:           trimmedPtr(member.Role),
		})
	}
	return out, nil
}

func (c *crowdin) ListTaskComments(ctx context.Context, projectID, taskID string) ([]TaskComment, error) {
	project, ok := crowdinProjectID(projectID)
	if !ok {
		return nil, fmt.Errorf("crowdin: invalid project id %q", projectID)
	}
	id, err := crowdinIntID(taskID, "taskId")
	if err != nil {
		return nil, nil
	}
	raw, err := crowdinList[crowdinTaskComment](ctx, c, "/projects/"+strconv.Itoa(project)+"/tasks/"+strconv.Itoa(id)+"/comments")
	if err != nil {
		var providerErr *ProviderError
		if errors.As(err, &providerErr) && providerErr.Status == http.StatusNotFound {
			return nil, nil
		}
		return nil, err
	}
	out := make([]TaskComment, 0, len(raw))
	for _, comment := range raw {
		out = append(out, TaskComment{
			ID:        strconv.Itoa(comment.ID),
			UserID:    strconv.Itoa(comment.UserID),
			TaskID:    strconv.Itoa(comment.TaskID),
			Text:      comment.Text,
			TimeSpent: comment.TimeSpent,
			CreatedAt: comment.CreatedAt,
			UpdatedAt: comment.UpdatedAt,
		})
	}
	return out, nil
}

func crowdinCreateTaskPayload(task CreateTask) (map[string]any, error) {
	title := strings.TrimSpace(task.Title)
	if title == "" {
		return nil, fmt.Errorf("crowdin: task title is required")
	}
	languageID := strings.TrimSpace(task.LanguageID)
	if languageID == "" {
		return nil, fmt.Errorf("crowdin: task target locale is required")
	}
	fileIDs, err := crowdinIntIDs(task.FileIDs, "fileIds")
	if err != nil {
		return nil, err
	}
	stringIDs, err := crowdinIntIDs(task.StringIDs, "stringIds")
	if err != nil {
		return nil, err
	}
	branchIDs, err := crowdinIntIDs(task.BranchIDs, "branchIds")
	if err != nil {
		return nil, err
	}
	scopes := 0
	if len(fileIDs) > 0 {
		scopes++
	}
	if len(stringIDs) > 0 {
		scopes++
	}
	if len(branchIDs) > 0 {
		scopes++
	}
	if scopes == 0 {
		return nil, fmt.Errorf("crowdin: task needs file, string, or branch ids")
	}
	if scopes > 1 {
		return nil, fmt.Errorf("crowdin: task cannot mix file, string, and branch ids")
	}
	taskType := 0
	switch strings.ToLower(strings.TrimSpace(task.Kind)) {
	case "", "translation":
		taskType = 0
	case "proofread":
		taskType = 1
	case "review":
		return nil, fmt.Errorf("crowdin: review tasks are not supported")
	default:
		return nil, fmt.Errorf("crowdin: unsupported task kind %q", task.Kind)
	}
	payload := map[string]any{"title": title, "languageId": languageID, "type": taskType}
	if len(fileIDs) > 0 {
		payload["fileIds"] = fileIDs
	}
	if len(stringIDs) > 0 {
		payload["stringIds"] = stringIDs
	}
	if len(branchIDs) > 0 {
		payload["branchIds"] = branchIDs
	}
	if description := strings.TrimSpace(deref(task.Description)); description != "" {
		payload["description"] = description
	}
	if status := strings.TrimSpace(task.Status); status != "" {
		payload["status"] = status
	}
	if len(task.Assignees) > 0 {
		assignees := make([]map[string]int, 0, len(task.Assignees))
		for _, rawID := range task.Assignees {
			assigneeID, parseErr := crowdinIntID(rawID, "assigneeId")
			if parseErr != nil {
				return nil, parseErr
			}
			assignees = append(assignees, map[string]int{"id": assigneeID})
		}
		payload["assignees"] = assignees
	}
	return payload, nil
}

func mapCrowdinTasks(tasks []crowdinTask) []Task {
	out := make([]Task, 0, len(tasks))
	for _, task := range tasks {
		out = append(out, mapCrowdinTask(task))
	}
	return out
}

func mapCrowdinTask(task crowdinTask) Task {
	targetLocales := crowdinTaskTargetLocales(task)
	assignedUsers := make([]string, 0, len(task.Assignees))
	assigneeIDs := make([]string, 0, len(task.Assignees))
	for _, assignee := range task.Assignees {
		assigneeIDs = append(assigneeIDs, strconv.Itoa(assignee.ID))
		if username := strings.TrimSpace(assignee.Username); username != "" {
			assignedUsers = append(assignedUsers, username)
		} else {
			assignedUsers = append(assignedUsers, strconv.Itoa(assignee.ID))
		}
	}
	fileIDs := make([]string, 0, len(task.FileIDs))
	for _, fileID := range task.FileIDs {
		fileIDs = append(fileIDs, strconv.Itoa(fileID))
	}
	createdAt := trimmedPtr(task.CreatedAt)
	updatedAt := firstNonEmpty(task.UpdatedAt, task.ResolvedAt, task.StartedAt, task.CreatedAt)
	kind := "translation"
	switch task.Type {
	case 1, 3:
		kind = "proofread"
	}
	languageID := firstNonEmpty(task.TargetLanguageID, task.LanguageID)
	fileIDPayload := task.FileIDs
	if fileIDPayload == nil {
		fileIDPayload = []int{}
	}
	return Task{
		ExternalID:       strconv.Itoa(task.ID),
		ProjectID:        strconv.Itoa(task.ProjectID),
		Status:           task.Status,
		Title:            task.Title,
		Description:      trimmedPtr(task.Description),
		Kind:             kind,
		TargetLocales:    targetLocales,
		AssignedUsers:    assignedUsers,
		AssigneeIDs:      assigneeIDs,
		FileIDs:          fileIDs,
		DueDate:          trimmedPtr(task.Deadline),
		URL:              stringPtr(task.WebURL),
		CreatedAt:        createdAt,
		UpdatedAt:        updatedAt,
		CompletedAt:      trimmedPtr(task.ResolvedAt),
		SourceLanguageID: trimmedPtr(task.SourceLanguageID),
		LanguageID:       languageID,
		Type:             task.Type,
		ProviderPayload: map[string]any{
			"projectId":               task.ProjectID,
			"type":                    task.Type,
			"description":             optionalJSONString(task.Description),
			"fileIds":                 fileIDPayload,
			"languageId":              optionalJSONString(languageID),
			"sourceLanguageId":        optionalJSONString(task.SourceLanguageID),
			"targetLanguageId":        optionalJSONString(task.TargetLanguageID),
			"targetLanguageIds":       targetLocales,
			"assigneeExternalUserIds": assigneeIDs,
			"localeReadiness":         nil,
		},
	}
}

func crowdinTaskTargetLocales(task crowdinTask) []string {
	out := []string{}
	seen := map[string]bool{}
	add := func(value string) {
		value = strings.TrimSpace(value)
		if value == "" || seen[value] {
			return
		}
		seen[value] = true
		out = append(out, value)
	}
	for _, language := range task.TargetLanguages {
		if language.ID != nil {
			add(*language.ID)
		}
	}
	if len(out) > 0 {
		return out
	}
	add(deref(task.TargetLanguageID))
	add(deref(task.LanguageID))
	return out
}

func deref(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func optionalJSONString(value *string) any {
	if trimmed := trimmedPtr(value); trimmed != nil {
		return *trimmed
	}
	return nil
}

func firstNonEmpty(values ...*string) *string {
	for _, value := range values {
		if trimmed := trimmedPtr(value); trimmed != nil {
			return trimmed
		}
	}
	return nil
}
