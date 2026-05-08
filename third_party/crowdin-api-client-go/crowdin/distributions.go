package crowdin

import (
	"context"
	"fmt"

	"github.com/crowdin/crowdin-api-client-go/crowdin/model"
)

// DistributionsService provides access to the Distributions API methods.
//
// Crowdin API docs: https://developer.crowdin.com/api/v2/#tag/Distributions
type DistributionsService struct {
	client *Client
}

// List returns a list of distributions in the project.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.distributions.getMany
func (s *DistributionsService) List(ctx context.Context, projectID int, opts *model.ListOptions) (
	[]*model.Distribution, *Response, error,
) {
	res := new(model.DistributionsListResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/projects/%d/distributions", projectID), opts, res)
	if err != nil {
		return nil, resp, err
	}

	list := make([]*model.Distribution, 0, len(res.Data))
	for _, item := range res.Data {
		list = append(list, item.Data)
	}

	return list, resp, nil
}

// Get returns information about a distribution.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.distributions.get
func (s *DistributionsService) Get(ctx context.Context, projectID int, hash string) (*model.Distribution, *Response, error) {
	res := new(model.DistributionResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/projects/%d/distributions/%s", projectID, hash), nil, res)

	return res.Data, resp, err
}

// Add creates a new distribution.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.distributions.post
func (s *DistributionsService) Add(ctx context.Context, projectID int, req *model.DistributionAddRequest) (
	*model.Distribution, *Response, error,
) {
	res := new(model.DistributionResponse)
	resp, err := s.client.Post(ctx, fmt.Sprintf("/api/v2/projects/%d/distributions", projectID), req, res)

	return res.Data, resp, err
}

// Edit updates a distribution in the project.
//
// Request body:
//   - Op (string) - Operation to perform. Enum: replace.
//   - Path (string) - JSON path to the field to update. Enum: "/exportMode", "/name", "/fileIds", "/bundleIds".
//   - Value (string) - New alue to set.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.distributions.patch
func (s *DistributionsService) Edit(ctx context.Context, projectID int, hash string, req []*model.UpdateRequest) (
	*model.Distribution, *Response, error,
) {
	res := new(model.DistributionResponse)
	resp, err := s.client.Patch(ctx, fmt.Sprintf("/api/v2/projects/%d/distributions/%s", projectID, hash), req, res)

	return res.Data, resp, err
}

// Delete removes a distribution from the project.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.distributions.delete
func (s *DistributionsService) Delete(ctx context.Context, projectID int, hash string) (*Response, error) {
	return s.client.Delete(ctx, fmt.Sprintf("/api/v2/projects/%d/distributions/%s", projectID, hash), nil)
}

// GetRelease returns information about the distribution release.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.distributions.release.get
func (s *DistributionsService) GetRelease(ctx context.Context, projectID int, hash string) (
	*model.DistributionRelease, *Response, error,
) {
	res := new(model.DistributionReleaseResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/projects/%d/distributions/%s/release", projectID, hash), nil, res)

	return res.Data, resp, err
}

// Release releases the distribution.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.distributions.release.post
func (s *DistributionsService) Release(ctx context.Context, projectID int, hash string) (
	*model.DistributionRelease, *Response, error,
) {
	res := new(model.DistributionReleaseResponse)
	resp, err := s.client.Post(ctx, fmt.Sprintf("/api/v2/projects/%d/distributions/%s/release", projectID, hash), "", res)

	return res.Data, resp, err
}
