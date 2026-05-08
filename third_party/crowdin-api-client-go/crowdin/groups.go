package crowdin

import (
	"context"
	"fmt"

	"github.com/crowdin/crowdin-api-client-go/crowdin/model"
)

// Groups allow you to organize your projects based on specific characteristics.
// Use API to manage projects and groups, change their settings, or remove them
// from organization if required.
//
// Crowdin API docs:
// https://developer.crowdin.com/enterprise/api/v2/#tag/Projects-and-Groups
type GroupsService struct {
	client *Client
}

// List returns a list of groups.
//
// https://developer.crowdin.com/enterprise/api/v2/#operation/api.groups.getMany
func (s *GroupsService) List(ctx context.Context, opts *model.GroupsListOptions) ([]*model.Group, *Response, error) {
	res := new(model.GroupsListResponse)
	resp, err := s.client.Get(ctx, "/api/v2/groups", opts, res)
	if err != nil {
		return nil, resp, err
	}

	groups := make([]*model.Group, 0, len(res.Data))
	for _, group := range res.Data {
		groups = append(groups, group.Data)
	}

	return groups, resp, nil
}

// Get returns a group by its identifier.
//
// https://developer.crowdin.com/enterprise/api/v2/#operation/api.groups.get
func (s *GroupsService) Get(ctx context.Context, id int) (*model.Group, *Response, error) {
	res := new(model.GroupsGetResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/groups/%d", id), nil, res)

	return res.Data, resp, err
}

// Add creates a new group.
//
// https://developer.crowdin.com/enterprise/api/v2/#operation/api.groups.post
func (s *GroupsService) Add(ctx context.Context, req *model.GroupsAddRequest) (*model.Group, *Response, error) {
	res := new(model.GroupsGetResponse)
	resp, err := s.client.Post(ctx, "/api/v2/groups", req, res)

	return res.Data, resp, err
}

// Edit updates a group.
//
// Request body:
//   - op: The operation to perform. Enum: replace, test.
//   - path: A JSON Pointer as defined in RFC 6901. Enum: "/name", "/description", "/parentId".
//   - value: The value to be used within the operations. The value must be one of string or integer.
//
// https://developer.crowdin.com/enterprise/api/v2/#operation/api.groups.patch
func (s *GroupsService) Edit(ctx context.Context, id int, req []*model.UpdateRequest) (*model.Group, *Response, error) {
	res := new(model.GroupsGetResponse)
	resp, err := s.client.Patch(ctx, fmt.Sprintf("/api/v2/groups/%d", id), req, res)

	return res.Data, resp, err
}

// Delete removes a group from the organization.
//
// https://developer.crowdin.com/enterprise/api/v2/#operation/api.groups.delete
func (s *GroupsService) Delete(ctx context.Context, id int) (*Response, error) {
	return s.client.Delete(ctx, fmt.Sprintf("/api/v2/groups/%d", id), nil)
}
