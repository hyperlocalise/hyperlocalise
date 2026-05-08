package model

import (
	"errors"
	"fmt"
	"net/url"
)

// TaskStatus represents the status of a task.
type TaskStatus string

const (
	TaskStatusTodo       TaskStatus = "todo"
	TaskStatusInProgress TaskStatus = "in_progress"
	TaskStatusDone       TaskStatus = "done"
	TaskStatusClosed     TaskStatus = "closed"
)

type (
	// Task represents a task in Crowdin.
	Task struct {
		ID               int                 `json:"id"`
		ProjectID        int                 `json:"projectId"`
		CreatorID        int                 `json:"creatorId"`
		Type             int                 `json:"type"`
		Status           TaskStatus          `json:"status"`
		Title            string              `json:"title"`
		Assignees        []*TaskAssignee     `json:"assignees"`
		AssignedTeams    []*TaskAssignedTeam `json:"assignedTeams"`
		Progress         TaskProgress        `json:"progress"`
		SourceLanguageID string              `json:"sourceLanguageId"`
		TargetLanguageID string              `json:"targetLanguageId"`
		Description      string              `json:"description"`
		TranslationURL   string              `json:"translationUrl"`
		WebURL           string              `json:"webUrl"`
		WordsCount       int                 `json:"wordsCount"`
		CommentsCount    int                 `json:"commentsCount"`
		Deadline         string              `json:"deadline"`
		StartedAt        string              `json:"startedAt"`
		ResolvedAt       string              `json:"resolvedAt"`
		TimeRange        string              `json:"timeRange"`
		WorkflowStepID   int                 `json:"workflowStepId"`
		BuyURL           string              `json:"buyUrl"`
		CreatedAt        string              `json:"createdAt"`
		UpdatedAt        string              `json:"updatedAt"`
		SourceLanguage   *Language           `json:"sourceLanguage"`
		TargetLanguages  []*Language         `json:"targetLanguages"`
		LabelIDs         []int               `json:"labelIds"`
		ExcludeLabelIDs  []int               `json:"excludeLabelIds"`
		PrecedingTaskID  int                 `json:"precedingTaskId"`
		FilesCount       int                 `json:"filesCount"`
		FileIDs          []int               `json:"fileIds,omitempty"`
		Vendor           string              `json:"vendor,omitempty"`
		BranchIDs        []int               `json:"branchIds,omitempty"`
		IsArchived       *bool               `json:"isArchived,omitempty"`
		Fields           any                 `json:"fields,omitempty"`
	}

	// TaskAssignee represents an assignee of a task.
	TaskAssignee struct {
		ID         int    `json:"id"`
		Username   string `json:"username"`
		FullName   string `json:"fullName"`
		AvatarURL  string `json:"avatarUrl"`
		WordsCount int    `json:"wordsCount"`
		WordsLeft  int    `json:"wordsLeft"`
	}

	// TaskAssignedTeam represents a team assigned to a task.
	TaskAssignedTeam struct {
		ID         int `json:"id"`
		WordsCount int `json:"wordsCount"`
	}

	// TaskProgress represents the progress of a task.
	TaskProgress struct {
		Total   int `json:"total"`
		Done    int `json:"done"`
		Percent int `json:"percent"`
	}
)

// TaskResponse defines the structure of the response
// when getting a task.
type TaskResponse struct {
	Data *Task `json:"data"`
}

// TasksListResponse defines the structure of the response
// when getting a list of tasks.
type TasksListResponse struct {
	Data []*TaskResponse `json:"data"`
}

// TasksListOptions specifies the optional parameters to the
// TasksService.List method.
type TasksListOptions struct {
	// Sort a list of tasks by a specified field.
	// Enum: id, type, title, status, description, createdAt,
	// updatedAt, deadline, startedAt, resolvedAt. Default: id.
	// Example: orderBy=createdAt desc,title
	OrderBy string `json:"orderBy,omitempty"`
	// List tasks with specified statuses. It can be one status
	// or a list of status values.
	// Enum: todo, in_progress, done, closed.
	Status []TaskStatus `json:"status,omitempty"`
	// List tasks for specified assignee.
	AssigneeID int `json:"assigneeId,omitempty"`

	ListOptions
}

// Values returns the url.Values representation of TasksListOptions.
// It implements the crowdin.ListOptionsProvider interface.
func (o *TasksListOptions) Values() (url.Values, bool) {
	if o == nil {
		return nil, false
	}

	v, _ := o.ListOptions.Values()

	if o.OrderBy != "" {
		v.Add("orderBy", o.OrderBy)
	}
	if len(o.Status) > 0 {
		v.Add("status", JoinSlice(o.Status))
	}
	if o.AssigneeID > 0 {
		v.Add("assigneeId", fmt.Sprintf("%d", o.AssigneeID))
	}

	return v, len(v) > 0
}

// TaskType represents the type of a task.
type TaskType int

const (
	TaskTypeTranslate         TaskType = 0
	TaskTypeProofread         TaskType = 1
	TaskTypeTranslateByVendor TaskType = 2
	TaskTypeProofreadByVendor TaskType = 3
)

// TaskVendor represents the vendor of a task.
type TaskVendor string

const (
	TaskVendorCrowdinLanguageService   TaskVendor = "crowdin_language_service"
	TaskVendorOht                      TaskVendor = "oht"
	TaskVendorGengo                    TaskVendor = "gengo"
	TaskVendorManual                   TaskVendor = "manual"
	TaskVendorAlconost                 TaskVendor = "alconost"
	TaskVendorBabbleon                 TaskVendor = "babbleon"
	TaskVendorTomedes                  TaskVendor = "tomedes"
	TaskVendorE2f                      TaskVendor = "e2f"
	TaskVendorWritePathAdmin           TaskVendor = "write_path_admin"
	TaskVendorInlingo                  TaskVendor = "inlingo"
	TaskVendorAcclaro                  TaskVendor = "acclaro"
	TaskVendorTranslateByHumans        TaskVendor = "translate_by_humans"
	TaskVendorLingo24                  TaskVendor = "lingo24"
	TaskVendorAssertioLanguageServices TaskVendor = "assertio_language_services"
	TaskVendorGteLocalize              TaskVendor = "gte_localize"
	TaskVendorKettuSolutions           TaskVendor = "kettu_solutions"
	TaskVendorLanguageLineSolutions    TaskVendor = "languageline_solutions"
)

// TaskAddRequester is an interface encapsulating a request for task addition.
// The request body must conform to one of the following struct types:
//
//	TaskCreateForm
//	LanguageServiceTaskCreateForm
//	VendorOhtTaskCreateForm
//	VendorGengoTaskCreateForm
//	VendorManualTaskCreateForm
//	PendingTaskCreateForm
//	LanguageServicePendingTaskCreateForm
//	VendorManualPendingTaskCreateForm
//
// For the Enterprise API, the request body should be one of the following structs:
//
//	EnterpriseTaskCreateForm
//	EnterpriseVendorTaskCreateForm
//	EnterprisePendingTaskCreateForm
type TaskAddRequester interface {
	ValidateRequest() error
}

type CrowdinTaskAssignee struct {
	// Project member identifier.
	ID int `json:"id"`
	// Defines how many words (starting from 1) are assigned
	// to each task assignee. Note: Can be used only when
	// `splitContent` parameter is specified.
	WordsCount int `json:"wordsCount,omitempty"`
}

type (
	TaskCreateForm struct {
		// Task title
		Title string `json:"title"`
		// Task language identifier.
		LanguageID string `json:"languageId"`
		// Task type. Enum: 0 - translate, 1 - proofread.
		Type *TaskType `json:"type"`
		// Branch identifiers.
		// One of branchIds, stringIds or fileIds is required.
		BranchIDs []int `json:"branchIds,omitempty"`
		// Task string identifiers.
		// One of branchIds, stringIds or fileIds is required.
		StringIDs []int `json:"stringIds,omitempty"`
		// Task file identifiers.
		// One of branchIds, stringIds or fileIds is required.
		FileIDs []int `json:"fileIds,omitempty"`
		// Label identifiers.
		LabelIDs []int `json:"labelIds,omitempty"`
		// Exclude label identifiers.
		ExcludeLabelIDs []int `json:"excludeLabelIds,omitempty"`
		// Task status. Enum: todo, in_progress.
		Status TaskStatus `json:"status,omitempty"`
		// Task description.
		Description string `json:"description,omitempty"`
		// Split content for task.
		SplitContent *bool `json:"splitContent,omitempty"`
		// Skip strings already included in other tasks. Default: false.
		SkipAssignedStrings *bool `json:"skipAssignedStrings,omitempty"`
		// Defines whether to export only pretranslated strings. Default: false.
		// Note: `true` value can't be used with `skipUntranslatedStrings=false`,
		// `type=0` or `type=2` in same request.
		IncludePreTranslatedStringsOnly *bool `json:"includePreTranslatedStringsOnly,omitempty"`
		// Task assignees.
		Assignees []CrowdinTaskAssignee `json:"assignees,omitempty"`
		// Task deadline date. Format: UTC, ISO 8601.
		Deadline string `json:"deadline,omitempty"`
		// Task started date. Format: UTC, ISO 8601.
		StartedAt string `json:"startedAt,omitempty"`
		// Start date for interval when strings were modified. Format: UTC, ISO 8601.
		DateFrom string `json:"dateFrom,omitempty"`
		// End date for interval when strings were modified. Format: UTC, ISO 8601.
		DateTo string `json:"dateTo,omitempty"`
	}

	LanguageServiceTaskCreateForm struct {
		// Task title.
		Title string `json:"title"`
		// Language identifier.
		LanguageID string `json:"languageId"`
		// Task type. Enum: 2 - translate by vendor, 3 - proofread by vendor.
		Type TaskType `json:"type"`
		// Task vendor. Enum: "crowdin_language_service".
		Vendor TaskVendor `json:"vendor"`
		// Branch identifiers.
		// One of branchIds, stringIds or fileIds is required.
		BranchIDs []int `json:"branchIds,omitempty"`
		// String identifiers.
		// One of branchIds, stringIds or fileIds is required.
		StringIDs []int `json:"stringIds,omitempty"`
		// File identifiers.
		// One of branchIds, stringIds or fileIds is required.
		FileIDs []int `json:"fileIds,omitempty"`
		// Label identifiers.
		LabelIDs []int `json:"labelIds,omitempty"`
		// Exclude label identifiers.
		ExcludeLabelIDs []int `json:"excludeLabelIds,omitempty"`
		// Task status. Enum: todo, in_progress.
		Status TaskStatus `json:"status,omitempty"`
		// Task description.
		Description string `json:"description,omitempty"`
		// Defines whether to include only pretranslated strings. Default: false.
		// Note: `true` value can't be used with `skipUntranslatedStrings=false` or
		// `includeUntranslatedStringsOnly=true` in the same request.
		IncludePreTranslatedStringsOnly *bool `json:"includePreTranslatedStringsOnly,omitempty"`
		// Start date for interval when strings were modified. Format: UTC, ISO 8601.
		DateFrom string `json:"dateFrom,omitempty"`
		// End date for interval when strings were modified. Format: UTC, ISO 8601.
		DateTo string `json:"dateTo,omitempty"`
	}

	VendorOhtTaskCreateForm struct {
		// Task title.
		Title string `json:"title"`
		// Language identifier.
		LanguageID string `json:"languageId"`
		// Task type. Enum: 2 - translate by vendor, 3 - proofread by vendor.
		Type TaskType `json:"type"`
		// Task vendor. Enum: "oht" - OneHourTranslation.
		Vendor TaskVendor `json:"vendor"`
		// Branch identifiers.
		// One of branchIds, stringIds or fileIds is required.
		BranchIDs []int `json:"branchIds,omitempty"`
		// String identifiers.
		// One of branchIds, stringIds or fileIds is required.
		StringIDs []int `json:"stringIds,omitempty"`
		// File identifiers.
		// One of branchIds, stringIds or fileIds is required.
		FileIDs []int `json:"fileIds,omitempty"`
		// Label identifiers.
		LabelIDs []int `json:"labelIds,omitempty"`
		// Exclude label identifiers.
		ExcludeLabelIDs []int `json:"excludeLabelIds,omitempty"`
		// Task status. Enum: todo, in_progress.
		Status TaskStatus `json:"status,omitempty"`
		// Task description.
		Description string `json:"description,omitempty"`
		// Task expertise. Default: standard.
		// Enum: standard, mobile-applications, software-it, gaming-video-games,
		// technical-engineering, marketing-consumer-media, business-finance,
		// legal-certificate, medical, ad-words-banners, automotive-aerospace,
		// scientific, scientific-academic, tourism, training-employee-handbooks,
		// forex-crypto.
		Expertise string `json:"expertise,omitempty"`
		// Enables Edit stage for all jobs. Default: false.
		EditService *bool `json:"editService,omitempty"`
		// Defines whether to include only pretranslated strings. Default: false.
		// Note: `true` value can't be used with `skipUntranslatedStrings=false` or
		// `includeUntranslatedStringsOnly=true` in the same request.
		IncludePreTranslatedStringsOnly *bool `json:"includePreTranslatedStringsOnly,omitempty"`
		// Start date for interval when strings were modified. Format: UTC, ISO 8601.
		DateFrom string `json:"dateFrom,omitempty"`
		// End date for interval when strings were modified. Format: UTC, ISO 8601.
		DateTo string `json:"dateTo,omitempty"`
	}

	VendorGengoTaskCreateForm struct {
		// Task title.
		Title string `json:"title"`
		// Language identifier.
		LanguageID string `json:"languageId"`
		// Task type. Enum: 2 - translate by vendor.
		Type TaskType `json:"type"`
		// Task vendor. Enum: "gengo" - Gengo.
		Vendor TaskVendor `json:"vendor"`
		// Branch identifiers.
		// One of branchIds, stringIds or fileIds is required.
		BranchIDs []int `json:"branchIds,omitempty"`
		// String identifiers.
		// One of branchIds, stringIds or fileIds is required.
		StringIDs []int `json:"stringIds,omitempty"`
		// File identifiers.
		// One of branchIds, stringIds or fileIds is required.
		FileIDs []int `json:"fileIds,omitempty"`
		// Label identifiers.
		LabelIDs []int `json:"labelIds,omitempty"`
		// Exclude label identifiers.
		ExcludeLabelIDs []int `json:"excludeLabelIds,omitempty"`
		// Task status. Enum: todo, in_progress.
		Status TaskStatus `json:"status,omitempty"`
		// Task description.
		Description string `json:"description,omitempty"`
		// Task expertise. Default: standard.
		// Enum: standard, pro.
		Expertise string `json:"expertise,omitempty"`
		// Task tone. Default: "".
		// Enum: "", "Informal", "Friendly", "Business", "Formal", "other".
		Tone *string `json:"tone,omitempty"`
		// Task purpose. Default: "standard".
		// Enum: "Personal use", "Business", "Online content", "App/Web localization",
		// "Media content", "Semi-technical", "other".
		Purpose string `json:"purpose,omitempty"`
		// Instructions for translators.
		CustomerMessage string `json:"customerMessage,omitempty"`
		// Use preferred translators. Default: false.
		UsePreferred *bool `json:"usePreferred,omitempty"`
		// Enables Edit stage for all jobs. Default: false.
		EditService *bool `json:"editService,omitempty"`
		// Start date for interval when strings were modified. Format: UTC, ISO 8601.
		DateFrom string `json:"dateFrom,omitempty"`
		// End date for interval when strings were modified. Format: UTC, ISO 8601.
		DateTo string `json:"dateTo,omitempty"`
	}

	VendorManualTaskCreateForm struct {
		// Task title.
		Title string `json:"title"`
		// Language identifier.
		LanguageID string `json:"languageId"`
		// Task type. Enum: 2 - translate by vendor, 3 - proofread by vendor.
		Type TaskType `json:"type"`
		// Task vendor. Enum: alconost, babbleon, tomedes, e2f, write_path_admin,
		// inlingo, acclaro, translate_by_humans, lingo24, assertio_language_services,
		// gte_localize, kettu_solutions, languageline_solutions.
		Vendor TaskVendor `json:"vendor"`
		// Branch identifiers.
		// One of branchIds, stringIds or fileIds is required.
		BranchIDs []int `json:"branchIds,omitempty"`
		// String identifiers.
		// One of branchIds, stringIds or fileIds is required.
		StringIDs []int `json:"stringIds,omitempty"`
		// File identifiers.
		// One of branchIds, stringIds or fileIds is required.
		FileIDs []int `json:"fileIds,omitempty"`
		// Label identifiers.
		LabelIDs []int `json:"labelIds,omitempty"`
		// Exclude label identifiers.
		ExcludeLabelIDs []int `json:"excludeLabelIds,omitempty"`
		// Task status. Enum: todo, in_progress.
		Status TaskStatus `json:"status,omitempty"`
		// Task description.
		Description string `json:"description,omitempty"`
		// Skip strings already included in other tasks. Default: false.
		SkipAssignedStrings *bool `json:"skipAssignedStrings,omitempty"`
		// Defines whether to export only pretranslated strings. Default: false.
		// Note: `true` value can't be used with `skipUntranslatedStrings=false`,
		// `type=0` or `type=2` in same request.
		IncludePreTranslatedStringsOnly *bool `json:"includePreTranslatedStringsOnly,omitempty"`
		// Task assignees.
		Assignees []CrowdinTaskAssignee `json:"assignees,omitempty"`
		// Task deadline date. Format: UTC, ISO 8601.
		Deadline string `json:"deadline,omitempty"`
		// Task started date. Format: UTC, ISO 8601.
		StartedAt string `json:"startedAt,omitempty"`
		// Start date for interval when strings were modified. Format: UTC, ISO 8601.
		DateFrom string `json:"dateFrom,omitempty"`
		// End date for interval when strings were modified. Format: UTC, ISO 8601.
		DateTo string `json:"dateTo,omitempty"`
	}

	PendingTaskCreateForm struct {
		// Translate task identifier.
		PrecedingTaskID int `json:"precedingTaskId"`
		// Task type. Enum: 1 - proofread.
		Type TaskType `json:"type"`
		// Task title.
		Title string `json:"title"`
		// Task description.
		Description string `json:"description,omitempty"`
		// Task assignees.
		Assignees []CrowdinTaskAssignee `json:"assignees,omitempty"`
		// Task deadline date. Format: UTC, ISO 8601.
		Deadline string `json:"deadline,omitempty"`
	}

	LanguageServicePendingTaskCreateForm struct {
		// Translate task identifier.
		PrecedingTaskID int `json:"precedingTaskId"`
		// Task type. Enum: 3 - proofread by vendor.
		Type TaskType `json:"type"`
		// Task vendor. Enum: "crowdin_language_service".
		Vendor TaskVendor `json:"vendor"`
		// Task title.
		Title string `json:"title"`
		// Task description.
		Description string `json:"description,omitempty"`
		// Task deadline date. Format: UTC, ISO 8601.
		Deadline string `json:"deadline,omitempty"`
	}

	VendorManualPendingTaskCreateForm struct {
		// Translate task identifier.
		PrecedingTaskID int `json:"precedingTaskId"`
		// Task type. Enum: 3 - proofread by vendor.
		Type TaskType `json:"type"`
		// Task vendor. Enum: alconost, babbleon, tomedes, e2f, write_path_admin,
		// inlingo, acclaro, translate_by_humans, lingo24, assertio_language_services,
		// gte_localize, kettu_solutions, languageline_solutions.
		Vendor TaskVendor `json:"vendor"`
		// Task title.
		Title string `json:"title"`
		// Task description.
		Description string `json:"description,omitempty"`
		// Task assignees.
		Assignees []CrowdinTaskAssignee `json:"assignees,omitempty"`
		// Task deadline date. Format: UTC, ISO 8601.
		Deadline string `json:"deadline,omitempty"`
	}
)

type (
	EnterpriseTaskCreateForm struct {
		// Task type. Enum: 0 - translate, 1 - proofread.
		// Note: Can't be used with `workflowStepId` in same request.
		Type *TaskType `json:"type"`
		// Task workflow step id.
		// Note: Can't be used with `type` in same request.
		WorkflowStepID int `json:"workflowStepId,omitempty"`
		// Task title
		Title string `json:"title"`
		// Task language identifier.
		LanguageID string `json:"languageId"`
		// Task string identifiers.
		// One of stringIds or fileIds is required.
		StringIDs []int `json:"stringIds,omitempty"`
		// Task file identifiers.
		// One of stringIds or fileIds is required.
		FileIDs []int `json:"fileIds,omitempty"`
		// Label identifiers.
		LabelIDs []int `json:"labelIds,omitempty"`
		// Exclude label identifiers.
		ExcludeLabelIDs []int `json:"excludeLabelIds,omitempty"`
		// Task status. Enum: todo, in_progress.
		Status TaskStatus `json:"status,omitempty"`
		// Task description.
		Description string `json:"description,omitempty"`
		// Split content for task.
		SplitContent *bool `json:"splitContent,omitempty"`
		// Skip strings already included in other tasks. Default: false.
		SkipAssignedStrings *bool `json:"skipAssignedStrings,omitempty"`
		// Task assignees.
		Assignees []CrowdinTaskAssignee `json:"assignees,omitempty"`
		// Task assigned teams.
		AssignedTeams []TaskAssignedTeam `json:"assignedTeams,omitempty"`
		// Defines whether to export only pretranslated strings. Default: false.
		// Note: `true` value can't be used with `skipUntranslatedStrings=false`,
		// `type=0` or `type=2` in same request.
		IncludePreTranslatedStringsOnly *bool `json:"includePreTranslatedStringsOnly,omitempty"`
		// Task deadline date. Format: UTC, ISO 8601.
		Deadline string `json:"deadline,omitempty"`
		// Task started date. Format: UTC, ISO 8601.
		StartedAt string `json:"startedAt,omitempty"`
		// Start date for interval when strings were modified. Format: UTC, ISO 8601.
		DateFrom string `json:"dateFrom,omitempty"`
		// End date for interval when strings were modified. Format: UTC, ISO 8601.
		DateTo string `json:"dateTo,omitempty"`
		// Fields for task.
		Fields map[string]any `json:"fields,omitempty"`
	}

	EnterpriseVendorTaskCreateForm struct {
		// Task workflow step id with type `Translate by Vendor` or `Proofread by Vendor`.
		WorkflowStepID int `json:"workflowStepId"`
		// Task title.
		Title string `json:"title"`
		// Language identifier.
		LanguageID string `json:"languageId"`
		// String identifiers.
		// One of stringIds or fileIds is required.
		StringIDs []int `json:"stringIds,omitempty"`
		// File identifiers.
		// One of stringIds or fileIds is required.
		FileIDs []int `json:"fileIds,omitempty"`
		// Label identifiers.
		LabelIDs []int `json:"labelIds,omitempty"`
		// Exclude label identifiers.
		ExcludeLabelIDs []int `json:"excludeLabelIds,omitempty"`
		// Task description.
		Description string `json:"description,omitempty"`
		// Skip strings already included in other tasks. Default: false.
		SkipAssignedStrings *bool `json:"skipAssignedStrings,omitempty"`
		// Defines whether to export only pretranslated strings. Default: false.
		// Note: `true` value can't be used with `skipUntranslatedStrings=false`,
		// `type=0` or `type=2` in same request.
		IncludePreTranslatedStringsOnly *bool `json:"includePreTranslatedStringsOnly,omitempty"`
		// Task deadline date. Format: UTC, ISO 8601.
		Deadline string `json:"deadline,omitempty"`
		// Task started date. Format: UTC, ISO 8601.
		StartedAt string `json:"startedAt,omitempty"`
		// End date for interval when strings were modified. Format: UTC, ISO 8601.
		DateTo string `json:"dateTo,omitempty"`
		// Fields for task.
		Fields map[string]any `json:"fields,omitempty"`
	}

	EnterprisePendingTaskCreateForm struct {
		// Translate task identifier.
		PrecedingTaskID int `json:"precedingTaskId"`
		// Task type. Enum: 1 - proofread.
		Type TaskType `json:"type"`
		// Task title.
		Title string `json:"title"`
		// Task description.
		Description string `json:"description,omitempty"`
		// Task assignees.
		Assignees []CrowdinTaskAssignee `json:"assignees,omitempty"`
		// Task assigned teams.
		AssignedTeams []TaskAssignedTeam `json:"assignedTeams,omitempty"`
		// Task deadline date. Format: UTC, ISO 8601.
		Deadline string `json:"deadline,omitempty"`
	}
)

// Validate checks if the request is valid.
func (r *TaskCreateForm) Validate() error {
	if r == nil {
		return ErrNilRequest
	}

	return r.ValidateRequest()
}

// ValidateRequest validates the request.
func (r *TaskCreateForm) ValidateRequest() error {
	if r.Title == "" {
		return errors.New("title is required")
	}
	if r.LanguageID == "" {
		return errors.New("languageId is required")
	}
	if r.Type == nil || (*r.Type != TaskTypeTranslate && *r.Type != TaskTypeProofread) {
		return fmt.Errorf("type is required and must be one of %d, %d", TaskTypeTranslate, TaskTypeProofread)
	}
	if len(r.StringIDs) == 0 && len(r.FileIDs) == 0 && len(r.BranchIDs) == 0 {
		return errors.New("one of stringIds, fileIds or branchIds is required")
	}

	return nil
}

// Validate checks if the request is valid.
func (r *LanguageServiceTaskCreateForm) Validate() error {
	if r == nil {
		return ErrNilRequest
	}

	return r.ValidateRequest()
}

// ValidateRequest validates the request.
func (r *LanguageServiceTaskCreateForm) ValidateRequest() error {
	if r.Title == "" {
		return errors.New("title is required")
	}
	if r.LanguageID == "" {
		return errors.New("languageId is required")
	}
	if r.Type != TaskTypeTranslateByVendor && r.Type != TaskTypeProofreadByVendor {
		return fmt.Errorf("type is required and must be one of %d, %d",
			TaskTypeTranslateByVendor, TaskTypeProofreadByVendor)
	}
	if r.Vendor != TaskVendorCrowdinLanguageService {
		return fmt.Errorf("vendor is required and must be %q", TaskVendorCrowdinLanguageService)
	}
	if len(r.StringIDs) == 0 && len(r.FileIDs) == 0 && len(r.BranchIDs) == 0 {
		return errors.New("one of stringIds, fileIds or branchIds is required")
	}

	return nil
}

// Validate checks if the request is valid.
func (r *VendorOhtTaskCreateForm) Validate() error {
	if r == nil {
		return ErrNilRequest
	}

	return r.ValidateRequest()
}

// ValidateRequest validates the request.
func (r *VendorOhtTaskCreateForm) ValidateRequest() error {
	if r.Title == "" {
		return errors.New("title is required")
	}
	if r.LanguageID == "" {
		return errors.New("languageId is required")
	}
	if r.Type != TaskTypeTranslateByVendor && r.Type != TaskTypeProofreadByVendor {
		return fmt.Errorf("type is required and must be one of %d, %d",
			TaskTypeTranslateByVendor, TaskTypeProofreadByVendor)
	}
	if r.Vendor != TaskVendorOht {
		return fmt.Errorf("vendor is required and must be %q", TaskVendorOht)
	}
	if len(r.StringIDs) == 0 && len(r.FileIDs) == 0 && len(r.BranchIDs) == 0 {
		return errors.New("one of stringIds, fileIds or branchIds is required")
	}

	return nil
}

// Validate checks if the request is valid.
func (r *VendorGengoTaskCreateForm) Validate() error {
	if r == nil {
		return ErrNilRequest
	}

	return r.ValidateRequest()
}

// ValidateRequest validates the request.
func (r *VendorGengoTaskCreateForm) ValidateRequest() error {
	if r.Title == "" {
		return errors.New("title is required")
	}
	if r.LanguageID == "" {
		return errors.New("languageId is required")
	}
	if r.Type != TaskTypeTranslateByVendor {
		return fmt.Errorf("type is required and must be %d", TaskTypeTranslateByVendor)
	}
	if r.Vendor != TaskVendorGengo {
		return fmt.Errorf("vendor is required and must be %q", TaskVendorGengo)
	}
	if len(r.StringIDs) == 0 && len(r.FileIDs) == 0 && len(r.BranchIDs) == 0 {
		return errors.New("one of stringIds, fileIds or branchIds is required")
	}

	return nil
}

// Validate checks if the request is valid.
func (r *VendorManualTaskCreateForm) Validate() error {
	if r == nil {
		return ErrNilRequest
	}

	return r.ValidateRequest()
}

// ValidateRequest validates the request.
func (r *VendorManualTaskCreateForm) ValidateRequest() error {
	if r.Title == "" {
		return errors.New("title is required")
	}
	if r.LanguageID == "" {
		return errors.New("languageId is required")
	}
	if r.Type != TaskTypeTranslateByVendor && r.Type != TaskTypeProofreadByVendor {
		return fmt.Errorf("type is required and must be one of %d, %d",
			TaskTypeTranslateByVendor, TaskTypeProofreadByVendor)
	}
	if r.Vendor == "" {
		return errors.New("vendor is required")
	}
	if len(r.StringIDs) == 0 && len(r.FileIDs) == 0 && len(r.BranchIDs) == 0 {
		return errors.New("one of stringIds, fileIds or branchIds is required")
	}

	return nil
}

// Validate checks if the request is valid.
func (r *PendingTaskCreateForm) Validate() error {
	if r == nil {
		return ErrNilRequest
	}

	return r.ValidateRequest()
}

// ValidateRequest validates the request.
func (r *PendingTaskCreateForm) ValidateRequest() error {
	if r.PrecedingTaskID == 0 {
		return errors.New("precedingTaskId is required")
	}
	if r.Type != TaskTypeProofread {
		return fmt.Errorf("type is required and must be %d", TaskTypeProofread)
	}
	if r.Title == "" {
		return errors.New("title is required")
	}

	return nil
}

// Validate checks if the request is valid.
func (r *LanguageServicePendingTaskCreateForm) Validate() error {
	if r == nil {
		return ErrNilRequest
	}

	return r.ValidateRequest()
}

// ValidateRequest validates the request.
func (r *LanguageServicePendingTaskCreateForm) ValidateRequest() error {
	if r.PrecedingTaskID == 0 {
		return errors.New("precedingTaskId is required")
	}
	if r.Type != TaskTypeProofreadByVendor {
		return fmt.Errorf("type is required and must be %d", TaskTypeProofreadByVendor)
	}
	if r.Title == "" {
		return errors.New("title is required")
	}

	return nil
}

// Validate checks if the request is valid.
func (r *VendorManualPendingTaskCreateForm) Validate() error {
	if r == nil {
		return ErrNilRequest
	}

	return r.ValidateRequest()
}

// ValidateRequest validates the request.
func (r *VendorManualPendingTaskCreateForm) ValidateRequest() error {
	if r.PrecedingTaskID == 0 {
		return errors.New("precedingTaskId is required")
	}
	if r.Type != TaskTypeProofreadByVendor {
		return fmt.Errorf("type is required and must be %d", TaskTypeProofreadByVendor)
	}
	if r.Vendor == "" {
		return errors.New("vendor is required")
	}
	if r.Title == "" {
		return errors.New("title is required")
	}

	return nil
}

// Validate checks if the request is valid.
func (r *EnterpriseTaskCreateForm) Validate() error {
	if r == nil {
		return ErrNilRequest
	}

	return r.ValidateRequest()
}

// ValidateRequest validates the request.
func (r *EnterpriseTaskCreateForm) ValidateRequest() error {
	if r.WorkflowStepID == 0 && r.Type == nil {
		return errors.New("workflowStepId or type is required")
	}
	if r.WorkflowStepID > 0 && r.Type != nil {
		return errors.New("workflowStepId and type can't be used in the same request")
	}
	if r.Type != nil && (*r.Type != TaskTypeTranslate && *r.Type != TaskTypeProofread) {
		return fmt.Errorf("type must be one of %d, %d", TaskTypeTranslate, TaskTypeProofread)
	}
	if r.Title == "" {
		return errors.New("title is required")
	}
	if r.LanguageID == "" {
		return errors.New("languageId is required")
	}
	if len(r.StringIDs) == 0 && len(r.FileIDs) == 0 {
		return errors.New("one of stringIds or fileIds is required")
	}

	return nil
}

// Validate checks if the request is valid.
func (r *EnterpriseVendorTaskCreateForm) Validate() error {
	if r == nil {
		return ErrNilRequest
	}

	return r.ValidateRequest()
}

// ValidateRequest validates the request.
func (r *EnterpriseVendorTaskCreateForm) ValidateRequest() error {
	if r.WorkflowStepID == 0 {
		return errors.New("workflowStepId is required")
	}
	if r.Title == "" {
		return errors.New("title is required")
	}
	if r.LanguageID == "" {
		return errors.New("languageId is required")
	}
	if len(r.StringIDs) == 0 && len(r.FileIDs) == 0 {
		return errors.New("one of stringIds or fileIds is required")
	}

	return nil
}

// Validate checks if the request is valid.
func (r *EnterprisePendingTaskCreateForm) Validate() error {
	if r == nil {
		return ErrNilRequest
	}

	return r.ValidateRequest()
}

// ValidateRequest validates the request.
func (r *EnterprisePendingTaskCreateForm) ValidateRequest() error {
	if r.PrecedingTaskID == 0 {
		return errors.New("precedingTaskId is required")
	}
	if r.Type != TaskTypeProofread {
		return fmt.Errorf("type is required and must be %d", TaskTypeProofread)
	}
	if r.Title == "" {
		return errors.New("title is required")
	}

	return nil
}

// UserTasksListOptions specifies the optional parameters to the
// TasksService.ListUserTasks method.
type UserTasksListOptions struct {
	// Sort a list of user tasks by a specified field.
	// Enum: id, title, description, createdAt, updatedAt,
	// deadline, startedAt, resolvedAt. Default: id.
	// Example: orderBy=createdAt desc,title
	OrderBy string `json:"orderBy,omitempty"`
	// List tasks with specified statuses. It can be one status
	// or a list of status values.
	// Enum: todo, in_progress, done, closed.
	Status []TaskStatus `json:"status,omitempty"`
	// List archived/not archived tasks for the authorized user.
	// Enum: 1 - archived, 0 - not archived. Default: 0.
	IsArchived *int `json:"isArchived,omitempty"`

	ListOptions
}

// Values returns the url.Values representation of UserTasksListOptions.
// It implements the crowdin.ListOptionsProvider interface.
func (o *UserTasksListOptions) Values() (url.Values, bool) {
	if o == nil {
		return nil, false
	}

	v, _ := o.ListOptions.Values()

	if o.OrderBy != "" {
		v.Add("orderBy", o.OrderBy)
	}
	if len(o.Status) > 0 {
		v.Add("status", JoinSlice(o.Status))
	}
	if o.IsArchived != nil {
		v.Add("isArchived", fmt.Sprintf("%d", *o.IsArchived))
	}

	return v, len(v) > 0
}

type (
	// TaskSettingsTemplate represents a task settings template.
	TaskSettingsTemplate struct {
		ID        int                        `json:"id"`
		Name      string                     `json:"name"`
		Config    TaskSettingsTemplateConfig `json:"config"`
		CreatedAt string                     `json:"createdAt"`
		UpdatedAt string                     `json:"updatedAt"`
	}

	// TaskSettingsTemplateConfig represents the configuration of a task
	// settings template.
	TaskSettingsTemplateConfig struct {
		Languages []TaskSettingsTemplateLanguage `json:"languages"`
	}

	// TaskSettingsTemplateLanguage represents the language settings of a
	// task settings template.
	TaskSettingsTemplateLanguage struct {
		LanguageID string   `json:"languageId"`
		UserIDs    []UserID `json:"userIds"`
		TeamIDs    []int    `json:"teamIds,omitempty"`
	}
)

// TaskSettingsTemplateResponse defines the structure of the response
// when getting a task settings template.
type TaskSettingsTemplateResponse struct {
	Data *TaskSettingsTemplate `json:"data"`
}

// TaskSettingsTemplatesListResponse defines the structure of the response
// when getting a list of task settings templates.
type TaskSettingsTemplatesListResponse struct {
	Data []*TaskSettingsTemplateResponse `json:"data"`
}

// TaskSettingsTemplateAddRequest defines the structure of the request
// when adding a new task settings template.
type TaskSettingsTemplateAddRequest struct {
	// Template name
	Name string `json:"name"`
	// Defines task config
	Config TaskSettingsTemplateConfig `json:"config"`
}

// Validate checks if the request is valid.
// It implements the crowdin.Validator interface.
func (r *TaskSettingsTemplateAddRequest) Validate() error {
	if r == nil {
		return ErrNilRequest
	}

	if r.Name == "" {
		return errors.New("name is required")
	}
	if len(r.Config.Languages) == 0 {
		return errors.New("config languages is required")
	}

	return nil
}

// TaskComment represents a comment on a task.
type TaskComment struct {
	ID        int    `json:"id"`
	UserID    int    `json:"userId"`
	TaskID    int    `json:"taskId"`
	Text      string `json:"text"`
	TimeSpent int    `json:"timeSpent"`
	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
}

// TaskCommentResponse defines the structure of the response
// when getting a task comment.
type TaskCommentResponse struct {
	Data *TaskComment `json:"data"`
}

// TaskCommentsListResponse defines the structure of the response
// when getting a list of task comments.
type TaskCommentsListResponse struct {
	Data []*TaskCommentResponse `json:"data"`
}

// TaskCommentAddRequest defines the structure of the request
// when adding a new comment to a task.
type TaskCommentAddRequest struct {
	// Comment text
	Text string `json:"text,omitempty"`
	// Specifies the time spent on the task in seconds
	TimeSpent int `json:"timeSpent,omitempty"`
}

// Validate checks if the request is valid.
// It implements the crowdin.Validator interface.
func (r *TaskCommentAddRequest) Validate() error {
	if r == nil {
		return ErrNilRequest
	}

	return nil
}
