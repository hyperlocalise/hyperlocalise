package crowdin

import (
	"context"
	"fmt"

	"github.com/crowdin/crowdin-api-client-go/crowdin/model"
)

// Users are the members of your organization with the defined
// access levels (e.g. manager, admin, contributor).
//
// Use API to get the list of organization users and to check the
// information on a specific user.
//
// CrowdIn API docs: https://developer.crowdin.com/api/v2/#tag/Users
type UsersService struct {
	client *Client
}

// GetProjectMember returns information or permissions of a specific project member.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.members.get
func (s *UsersService) GetProjectMember(ctx context.Context, projectID, memberID int) (
	*model.ProjectMember, *Response, error,
) {
	res := new(model.ProjectMemberResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/projects/%d/members/%d", projectID, memberID), nil, res)

	return res.Data, resp, err
}

// ListProjectMembers returns a list of project members.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.members.getMany
func (s *UsersService) ListProjectMembers(ctx context.Context, projectID int, opts *model.ProjectMembersListOptions) (
	[]*model.ProjectMember, *Response, error,
) {
	res := new(model.ProjectMembersListResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/projects/%d/members", projectID), opts, res)
	if err != nil {
		return nil, resp, err
	}

	list := make([]*model.ProjectMember, 0, len(res.Data))
	for _, pm := range res.Data {
		list = append(list, pm.Data)
	}

	return list, resp, err
}

// AddProjectMember adds a new member to the project.
// Returns a list of added and skipped members.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.members.post
func (s *UsersService) AddProjectMember(ctx context.Context, projectID int, req *model.ProjectMemberAddRequest) (
	map[string][]*model.ProjectMember, *Response, error,
) {
	res := new(model.ProjectMemberAddResponse)
	resp, err := s.client.Post(ctx, fmt.Sprintf("/api/v2/projects/%d/members", projectID), req, res)
	if err != nil {
		return nil, resp, err
	}

	skipped := make([]*model.ProjectMember, 0, len(res.Skipped))
	for _, pm := range res.Skipped {
		skipped = append(skipped, pm.Data)
	}

	added := make([]*model.ProjectMember, 0, len(res.Added))
	for _, pm := range res.Added {
		added = append(added, pm.Data)
	}

	return map[string][]*model.ProjectMember{
		"skipped": skipped,
		"added":   added,
	}, resp, err
}

// ReplaceProjectMemberPermissions replaces permissions of a specific project member.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.members.put
func (s *UsersService) ReplaceProjectMemberPermissions(
	ctx context.Context, projectID, memberID int, req *model.ProjectMemberReplaceRequest,
) (*model.ProjectMember, *Response, error) {
	res := new(model.ProjectMemberResponse)
	resp, err := s.client.Put(ctx, fmt.Sprintf("/api/v2/projects/%d/members/%d", projectID, memberID), req, res)

	return res.Data, resp, err
}

// DeleteProjectMember removes a member from the project.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.members.delete
func (s *UsersService) DeleteProjectMember(ctx context.Context, projectID, memberID int) (*Response, error) {
	return s.client.Delete(ctx, fmt.Sprintf("/api/v2/projects/%d/members/%d", projectID, memberID), nil)
}

// Get returns information about a specific user.
//
// https://developer.crowdin.com/enterprise/api/v2/#operation/api.users.getById
func (s *UsersService) Get(ctx context.Context, userID int) (*model.User, *Response, error) {
	res := new(model.UserResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/users/%d", userID), nil, res)

	return res.Data, resp, err
}

// GetAuthenticated returns information about the authenticated user.
//
// https://developer.crowdin.com/api/v2/#operation/api.user.get
func (s *UsersService) GetAuthenticated(ctx context.Context) (*model.User, *Response, error) {
	res := new(model.UserResponse)
	resp, err := s.client.Get(ctx, "/api/v2/user", nil, res)

	return res.Data, resp, err
}

// List returns a list of users in the organization.
//
// https://developer.crowdin.com/enterprise/api/v2/#operation/api.users.getMany
func (s *UsersService) List(ctx context.Context, opts *model.UsersListOptions) ([]*model.User, *Response, error) {
	res := new(model.UsersListResponse)
	resp, err := s.client.Get(ctx, "/api/v2/users", opts, res)
	if err != nil {
		return nil, resp, err
	}

	list := make([]*model.User, 0, len(res.Data))
	for _, user := range res.Data {
		list = append(list, user.Data)
	}

	return list, resp, err
}

// Invite sends an invitation to a new user.
//
// https://developer.crowdin.com/enterprise/api/v2/#operation/api.users.post
func (s *UsersService) Invite(ctx context.Context, req *model.InviteUserRequest) (*model.User, *Response, error) {
	res := new(model.UserResponse)
	resp, err := s.client.Post(ctx, "/api/v2/users", req, res)

	return res.Data, resp, err
}

// Edit updates information about a specific user.
//
// Request body:
//   - op (string): Operation to perform. Enum: replace.
//   - path (string <json-pointer>): Path to the field to update.
//     Enum: "/firstName", "/lastName", "/timezone", "/status", "/adminAccess".
//   - value (string): Value to set.
//
// https://developer.crowdin.com/enterprise/api/v2/#operation/api.users.patch
func (s *UsersService) Edit(ctx context.Context, userID int, req []*model.UpdateRequest) (*model.User, *Response, error) {
	res := new(model.UserResponse)
	resp, err := s.client.Patch(ctx, fmt.Sprintf("/api/v2/users/%d", userID), req, res)

	return res.Data, resp, err
}

// Delete removes a user from the organization.
//
// https://developer.crowdin.com/enterprise/api/v2/#operation/api.users.delete
func (s *UsersService) Delete(ctx context.Context, userID int) (*Response, error) {
	return s.client.Delete(ctx, fmt.Sprintf("/api/v2/users/%d", userID), nil)
}

// List returns a list of managers.
//
// https://support.crowdin.com/developer/enterprise/api/v2/#tag/Users/operation/api.groups.managers.getMany
func (s *UsersService) ListManagers(ctx context.Context, groupID int, opts *model.ManagerListOptions) ([]*model.Manager, *Response, error) {
	res := new(model.ManagerResponse)
	url := fmt.Sprintf("/api/v2/groups/%d/managers", groupID)

	resp, err := s.client.Get(ctx, url, opts, res)
	if err != nil {
		return nil, resp, err
	}

	list := make([]*model.Manager, 0, len(res.Data))
	for _, item := range res.Data {
		list = append(list, item.Data)
	}

	return list, resp, nil
}

// Get returns a manager by its identifier.
//
// https://support.crowdin.com/developer/enterprise/api/v2/#tag/Users/operation/api.groups.managers.get
func (s *UsersService) GetManagers(ctx context.Context, groupID int) (*model.Manager, *Response, error) {
	res := new(model.ManagerGetResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/groups/%d/managers", groupID), nil, res)

	return res.Data, resp, err
}

//	Update a manager.
//
// https://support.crowdin.com/developer/enterprise/api/v2/#tag/Users/operation/api.groups.managers.patch
func (s *UsersService) EditManagers(ctx context.Context, groupID int, req []*model.UpdateRequest) ([]*model.Manager, *Response, error) {
	res := new(model.ManagerResponse)
	url := fmt.Sprintf("/api/v2/groups/%d/managers", groupID)
	resp, err := s.client.Patch(ctx, url, req, res)
	if err != nil {
		return nil, resp, err
	}

	list := make([]*model.Manager, 0, len(res.Data))
	for _, item := range res.Data {
		list = append(list, item.Data)
	}

	return list, resp, nil
}
