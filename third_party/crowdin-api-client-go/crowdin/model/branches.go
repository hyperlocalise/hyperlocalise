package model

import (
	"errors"
	"net/url"
)

// Branch represents a project branch.
type Branch struct {
	ID            int     `json:"id"`
	ProjectID     int     `json:"projectId"`
	Name          string  `json:"name"`
	Title         string  `json:"title"`
	CreatedAt     string  `json:"createdAt"`
	UpdatedAt     string  `json:"updatedAt"`
	ExportPattern *string `json:"exportPattern,omitempty"`
	Priority      *string `json:"priority,omitempty"`
}

// BranchesGetResponse describes a response with a single branch.
type BranchesGetResponse struct {
	Data *Branch `json:"data"`
}

// BranchesListResponse describes a response with a list of branches.
type BranchesListResponse struct {
	Data []*BranchesGetResponse `json:"data"`
}

// BranchesListOptions specifies the optional parameters to the
// SourceFilesService.ListBranches method.
type BranchesListOptions struct {
	// Sort branches by the specified fields.
	// Enum: id, name, title, createdAt, updatedAt, exportPattern, priority. Default: id.
	// Example: orderBy=createdAt desc,name,priority.
	// see: https://developer.crowdin.com/enterprise/api/v2/#section/Introduction/Sorting
	OrderBy string `json:"orderBy,omitempty"`
	// Name of the branch (filter branch by name).
	Name string `json:"name,omitempty"`

	ListOptions
}

// Values returns the url.Values representation of BranchesListOptions.
func (o *BranchesListOptions) Values() (url.Values, bool) {
	if o == nil {
		return nil, false
	}

	v, _ := o.ListOptions.Values()
	if o.OrderBy != "" {
		v.Add("orderBy", o.OrderBy)
	}
	if o.Name != "" {
		v.Add("name", o.Name)
	}
	return v, len(v) > 0
}

// BranchesAddRequest defines the structure of a request to create a new branch.
type BranchesAddRequest struct {
	// Branch name.
	// Note: Can't contain \ / : * ? " < > | symbols.
	Name string `json:"name"`
	// Use to provide more details for translators.
	// Title is available in UI only.
	Title string `json:"title,omitempty"`
	// Branch export pattern. Defines branch name and path in resulting
	// translations bundle. Note: Can't contain : * ? " < > | symbols.
	ExportPattern string `json:"exportPattern,omitempty"`
	// Defines priority level for each branch.
	// Enum: low, normal, high. Default: normal.
	Priority string `json:"priority,omitempty"`
}

// Validate checks if the request is valid.
// It implements the crowdin.RequestValidator interface.
func (r *BranchesAddRequest) Validate() error {
	if r == nil {
		return ErrNilRequest
	}
	if r.Name == "" {
		return errors.New("name is required")
	}
	return nil
}

// BranchMerge represents a branch merge status.
type BranchMerge struct {
	Identifier string `json:"identifier"`
	Status     string `json:"status"`
	Progress   int    `json:"progress"`
	Attributes struct {
		SourceBranchID      int  `json:"sourceBranchId"`
		DeleteAfterMerge    bool `json:"deleteAfterMerge"`
		AcceptSourceChanges bool `json:"acceptSourceChanges,omitempty"`
	} `json:"attributes"`
	CreatedAt  string `json:"createdAt"`
	UpdatedAt  string `json:"updatedAt"`
	StartedAt  string `json:"startedAt"`
	FinishedAt string `json:"finishedAt"`
}

// BranchesMergeResponse describes a response with a single branch merge status.
type BranchesMergeResponse struct {
	Data *BranchMerge `json:"data"`
}

// BranchMergeSummary represents a summary of a branch merge.
type BranchMergeSummary struct {
	Status         string         `json:"status"`
	SourceBranchID int            `json:"sourceBranchId"`
	TargetBranchID int            `json:"targetBranchId"`
	DryRun         bool           `json:"dryRun"`
	Details        map[string]int `json:"details"`
}

// BranchesMergeSummaryResponse describes a response with a single branch merge summary.
type BranchesMergeSummaryResponse struct {
	Data *BranchMergeSummary `json:"data"`
}

// BranchesMergeRequest defines the structure of a request to merge branches.
type BranchesMergeRequest struct {
	// Branch that will be merged.
	SourceBranchID int `json:"sourceBranchId"`
	// Whether to delete branch after merge. Default: false.
	DeleteAfterMerge *bool `json:"deleteAfterMerge,omitempty"`
	// Whether to accept source changes. Default: false.
	AcceptSourceChanges *bool `json:"acceptSourceChanges,omitempty"`
	// Simulate merging without making any real changes. Default: false.
	DryRun *bool `json:"dryRun,omitempty"`
}

// Validate checks if the request is valid.
// It implements the crowdin.RequestValidator interface.
func (r *BranchesMergeRequest) Validate() error {
	if r == nil {
		return ErrNilRequest
	}
	if r.SourceBranchID == 0 {
		return errors.New("sourceBranchId is required")
	}
	return nil
}

// BranchesCloneRequest defines the structure of a request to clone a branch.
type BranchesCloneRequest struct {
	// Branch name. Note: Can't contain \ / : * ? " < > | symbols.
	Name string `json:"name"`
	// Title is used to provide more details for translators.
	// It is available in UI only.
	Title string `json:"title,omitempty"`
}

// Validate checks if the request is valid.
// It implements the crowdin.RequestValidator interface.
func (r *BranchesCloneRequest) Validate() error {
	if r == nil {
		return ErrNilRequest
	}
	if r.Name == "" {
		return errors.New("name is required")
	}
	return nil
}
