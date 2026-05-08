package crowdin

import (
	"context"
	"fmt"

	"github.com/crowdin/crowdin-api-client-go/crowdin/model"
)

// Source branches are resources for translation. Use API to manage project branches.
// Note: Make sure your master branch is the first one you integrate with Crowdin.
type BranchesService struct {
	client *Client
}

// List returns a list of project branches.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.branches.getMany
func (s *BranchesService) List(ctx context.Context, projectID int, opts *model.BranchesListOptions) (
	[]*model.Branch, *Response, error,
) {
	res := new(model.BranchesListResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/projects/%d/branches", projectID), opts, res)

	branches := make([]*model.Branch, 0, len(res.Data))
	for _, b := range res.Data {
		branches = append(branches, b.Data)
	}

	return branches, resp, err
}

// Get returns a single project branch.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.branches.get
func (s *BranchesService) Get(ctx context.Context, projectID, branchID int) (*model.Branch, *Response, error) {
	res := new(model.BranchesGetResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/projects/%d/branches/%d", projectID, branchID), nil, res)

	return res.Data, resp, err
}

// Add creates a new project branch.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.branches.post
func (s *BranchesService) Add(ctx context.Context, projectID int, req *model.BranchesAddRequest) (
	*model.Branch, *Response, error,
) {
	res := new(model.BranchesGetResponse)
	resp, err := s.client.Post(ctx, fmt.Sprintf("/api/v2/projects/%d/branches", projectID), req, res)

	return res.Data, resp, err
}

// Edit updates a project branch.
//
// Request body:
// - op: The operation to perform. Enum: replace, test.
// - path: A JSON Pointer as defined in RFC 6901.  Enum: "/name", "/title", "/exportPattern", "/priority".
// - value: The value to be used within the operations. The value must be one of string.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.branches.patch
func (s *BranchesService) Edit(ctx context.Context, projectID, branchID int, req []*model.UpdateRequest) (
	*model.Branch, *Response, error,
) {
	res := new(model.BranchesGetResponse)
	resp, err := s.client.Patch(ctx, fmt.Sprintf("/api/v2/projects/%d/branches/%d", projectID, branchID), req, res)

	return res.Data, resp, err
}

// Delete deletes a project branch.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.branches.delete
func (s *BranchesService) Delete(ctx context.Context, projectID, branchID int) (*Response, error) {
	return s.client.Delete(ctx, fmt.Sprintf("/api/v2/projects/%d/branches/%d", projectID, branchID), nil)
}

// Merge merges a project branch.
//
// https://developer.crowdin.com/api/v2/string-based/#operation/api.projects.branches.merges.post
func (s *BranchesService) Merge(ctx context.Context, projectID, branchID int, req *model.BranchesMergeRequest) (
	*model.BranchMerge, *Response, error,
) {
	res := new(model.BranchesMergeResponse)
	resp, err := s.client.Post(ctx, fmt.Sprintf("/api/v2/projects/%d/branches/%d/merges", projectID, branchID), req, res)

	return res.Data, resp, err
}

// CheckMergeStatus checks the status of a branch merge.
//
// https://developer.crowdin.com/api/v2/string-based/#operation/api.projects.branches.merges.get
func (s *BranchesService) CheckMergeStatus(ctx context.Context, projectID, branchID int, mergeID string) (
	*model.BranchMerge, *Response, error,
) {
	res := new(model.BranchesMergeResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/projects/%d/branches/%d/merges/%s", projectID, branchID, mergeID), nil, res)

	return res.Data, resp, err
}

// GetMergeSummary returns a summary of a branch merge.
//
// https://developer.crowdin.com/api/v2/string-based/#operation/api.projects.branches.merges.summary.get
func (s *BranchesService) GetMergeSummary(ctx context.Context, projectID, branchID int, mergeID string) (
	*model.BranchMergeSummary, *Response, error,
) {
	path := fmt.Sprintf("/api/v2/projects/%d/branches/%d/merges/%s/summary", projectID, branchID, mergeID)
	res := new(model.BranchesMergeSummaryResponse)
	resp, err := s.client.Get(ctx, path, nil, res)

	return res.Data, resp, err
}

// Clone clones a project branch.
// Note: Only the main branch (oldest branch) can be cloned.
//
// https://developer.crowdin.com/api/v2/string-based/#operation/api.projects.branches.clones.post
func (s *BranchesService) Clone(ctx context.Context, projectID, branchID int, req *model.BranchesCloneRequest) (
	*model.BranchMerge, *Response, error,
) {
	path := fmt.Sprintf("/api/v2/projects/%d/branches/%d/clones", projectID, branchID)
	res := new(model.BranchesMergeResponse)
	resp, err := s.client.Post(ctx, path, req, res)

	return res.Data, resp, err
}

// GetClone returns a cloned project branch.
//
// https://developer.crowdin.com/api/v2/string-based/#operation/api.projects.branches.clones.branch.get
func (s *BranchesService) GetClone(ctx context.Context, projectID, branchID int, cloneID string) (*model.Branch, *Response, error) {
	path := fmt.Sprintf("/api/v2/projects/%d/branches/%d/clones/%s/branch", projectID, branchID, cloneID)
	res := new(model.BranchesGetResponse)
	resp, err := s.client.Get(ctx, path, nil, res)

	return res.Data, resp, err
}

// CheckCloneStatus checks the status of a branch clone.
//
// https://developer.crowdin.com/api/v2/string-based/#operation/api.projects.branches.clones.get
func (s *BranchesService) CheckCloneStatus(ctx context.Context, projectID, branchID int, cloneID string) (
	*model.BranchMerge, *Response, error,
) {
	path := fmt.Sprintf("/api/v2/projects/%d/branches/%d/clones/%s", projectID, branchID, cloneID)
	res := new(model.BranchesMergeResponse)
	resp, err := s.client.Get(ctx, path, nil, res)

	return res.Data, resp, err
}
