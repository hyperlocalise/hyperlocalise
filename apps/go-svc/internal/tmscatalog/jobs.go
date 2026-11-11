package tmscatalog

import (
	"context"
	"strings"
)

// Task is one Crowdin (or later TMS) job as the web's live job list reads it.
type Task struct {
	ExternalID       string
	ProjectID        string
	Status           string
	Title            string
	Description      *string
	Kind             string
	TargetLocales    []string
	AssignedUsers    []string
	AssigneeIDs      []string
	FileIDs          []string
	DueDate          *string
	URL              *string
	CreatedAt        *string
	UpdatedAt        *string
	CompletedAt      *string
	SourceLanguageID *string
	LanguageID       *string
	Type             int
	ProviderPayload  map[string]any
}

// Member is a TMS project member, used as a job assignee candidate.
type Member struct {
	ExternalUserID string
	Username       string
	DisplayName    string
	AvatarURL      *string
	Role           *string
}

// TaskComment is a comment on a TMS task (not a CAT string comment).
type TaskComment struct {
	ID        string
	UserID    string
	TaskID    string
	Text      string
	TimeSpent *int
	CreatedAt string
	UpdatedAt string
}

// User is the authenticated TMS user the minted token belongs to.
type User struct {
	ID       string
	Username string
}

// TaskListOptions controls a project task list, matching Crowdin's live list.
type TaskListOptions struct {
	FetchAll bool
	Recent   bool
}

// CreateTask is one Crowdin task. Crowdin accepts exactly one of FileIDs,
// StringIDs, or BranchIDs.
type CreateTask struct {
	Title       string
	LanguageID  string
	Kind        string
	Description *string
	FileIDs     []string
	StringIDs   []string
	BranchIDs   []string
	Assignees   []string
	Status      string
}

// TaskUpdate is a JSON-patch of title, description, and assignees.
type TaskUpdate struct {
	Title        *string
	Description  *string
	AssigneeIDs  []string
	HasAssignees bool
}

// JobOperator reads and mutates TMS jobs. Crowdin is first; other providers
// still stay on Hono until they implement this.
type JobOperator interface {
	ProjectReader
	ListTasks(ctx context.Context, projectID string, options TaskListOptions) ([]Task, error)
	ListUserTasks(ctx context.Context, projectID string, options TaskListOptions) ([]Task, error)
	GetTask(ctx context.Context, projectID, taskID string) (*Task, error)
	CreateTask(ctx context.Context, projectID string, task CreateTask) (*Task, error)
	UpdateTask(ctx context.Context, projectID, taskID string, update TaskUpdate) (*Task, error)
	DeleteTask(ctx context.Context, projectID, taskID string) error
	ListMembers(ctx context.Context, projectID string) ([]Member, error)
	ListTaskComments(ctx context.Context, projectID, taskID string) ([]TaskComment, error)
	GetUser(ctx context.Context) (*User, error)
	UsesPerUserAuth() bool
}

// JobsSupported reports whether NewJobOperator can run providerKind.
func JobsSupported(providerKind string) bool {
	return strings.EqualFold(providerKind, "crowdin")
}

// NewJobOperator returns the JobOperator for providerKind, or ErrUnsupported.
func NewJobOperator(providerKind string, credentials Credentials, httpClient HTTPDoer) (JobOperator, error) {
	if httpClient == nil {
		return nil, ErrUnsupported
	}
	switch strings.ToLower(providerKind) {
	case "crowdin":
		return newCrowdin(credentials, httpClient), nil
	default:
		return nil, ErrUnsupported
	}
}

// MapCrowdinStatus maps a Crowdin task status onto a native job status.
func MapCrowdinStatus(status string) string {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case "done", "closed", "completed":
		return "succeeded"
	case "in_progress", "in-progress", "inprogress", "in progress", "active":
		return "running"
	case "todo", "new", "pending", "created", "draft":
		return "queued"
	case "failed", "rejected", "error":
		return "failed"
	case "waiting_for_review", "waiting-for-review", "waiting for review", "in_review", "in-review", "in review":
		return "waiting_for_review"
	case "cancelled", "canceled", "aborted":
		return "cancelled"
	default:
		return "queued"
	}
}

// OpenJobStatus reports whether a normalized job status counts as open.
func OpenJobStatus(status string) bool {
	switch status {
	case "queued", "running", "waiting_for_review":
		return true
	default:
		return false
	}
}
