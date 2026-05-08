package crowdin

import (
	"context"
	"fmt"

	"github.com/crowdin/crowdin-api-client-go/crowdin/model"
)

// Crowdin Apps are web applications that can be integrated with Crowdin to extend
// its functionality.
//
// Use the API to manage the necessary app data.
//
// Crowdin API docs: https://developer.crowdin.com/api/v2/#tag/Applications
type ApplicationsService struct {
	client *Client
}

// ListInstallations returns a list of application installations.
//
// https://developer.crowdin.com/api/v2/#operation/api.applications.installations.getMany
func (s *ApplicationsService) ListInstallations(ctx context.Context, opt *model.ListOptions) ([]*model.Installation, *Response, error) {
	res := new(model.InstallationsListResponse)
	resp, err := s.client.Get(ctx, "/api/v2/applications/installations", opt, res)
	if err != nil {
		return nil, resp, err
	}

	list := make([]*model.Installation, 0, len(res.Data))
	for _, installation := range res.Data {
		list = append(list, installation.Data)
	}

	return list, resp, err
}

// GetInstallation returns information about an application installation.
//
// https://developer.crowdin.com/api/v2/#operation/api.applications.installations.get
func (s *ApplicationsService) GetInstallation(ctx context.Context, applicationID string) (*model.Installation, *Response, error) {
	res := new(model.InstallationResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/applications/installations/%s", applicationID), nil, res)

	return res.Data, resp, err
}

// Install installs an application.
//
// https://developer.crowdin.com/api/v2/#operation/api.applications.installations.post
func (s *ApplicationsService) Install(ctx context.Context, req *model.InstallApplicationRequest) (
	*model.Installation, *Response, error,
) {
	res := new(model.InstallationResponse)
	resp, err := s.client.Post(ctx, "/api/v2/applications/installations", req, res)

	return res.Data, resp, err
}

// EditInstallation updates an application installation.
//
// Request body:
//   - op (string): operation to perform. Enum: replace.
//   - path (string <json-pointer>): path to the field to update.
//     Enum: "/permissions", "/modules/{moduleKey}/permissions".
//   - value (model.InstallationReplaceValue): object with values to update.
//
// https://developer.crowdin.com/api/v2/#operation/api.applications.installations.patch
func (s *ApplicationsService) EditInstallation(ctx context.Context, applicationID string, req []*model.UpdateRequest) (
	*model.Installation, *Response, error,
) {
	res := new(model.InstallationResponse)
	resp, err := s.client.Patch(ctx, fmt.Sprintf("/api/v2/applications/installations/%s", applicationID), req, res)

	return res.Data, resp, err
}

// DeleteInstallation deletes an application installation.
//
//	id: application identifier
//	force: if true, force to delete application installation
//
// https://developer.crowdin.com/api/v2/#operation/api.applications.installations.delete
func (s *ApplicationsService) DeleteInstallation(ctx context.Context, applicationID string, force bool) (*Response, error) {
	path := fmt.Sprintf("/api/v2/applications/installations/%s", applicationID)
	if force {
		path += "?force=true"
	}

	return s.client.Delete(ctx, path, nil)
}

// GetData returns application data.
//
// https://developer.crowdin.com/api/v2/#operation/api.applications.api.get
func (s *ApplicationsService) GetData(ctx context.Context, applicationID, path string) (any, *Response, error) {
	res := new(model.ApplicationDataResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/applications/%s/api/%s", applicationID, path), nil, res)

	return res.Data, resp, err
}

// AddData adds application data.
//
// https://developer.crowdin.com/api/v2/#operation/api.applications.api.post
func (s *ApplicationsService) AddData(ctx context.Context, applicationID, path string, req map[string]any) (
	any, *Response, error,
) {
	res := new(model.ApplicationDataResponse)
	resp, err := s.client.Post(ctx, fmt.Sprintf("/api/v2/applications/%s/api/%s", applicationID, path), req, res)

	return res.Data, resp, err
}

// UpdateOrRestoreData updates or restores application data.
//
// https://developer.crowdin.com/api/v2/#operation/api.applications.api.put
func (s *ApplicationsService) UpdateOrRestoreData(ctx context.Context, applicationID, path string, req map[string]any) (
	any, *Response, error,
) {
	res := new(model.ApplicationDataResponse)
	resp, err := s.client.Put(ctx, fmt.Sprintf("/api/v2/applications/%s/api/%s", applicationID, path), req, res)

	return res.Data, resp, err
}

// EditData updates application data.
//
// https://developer.crowdin.com/api/v2/#operation/api.applications.api.patch
func (s *ApplicationsService) EditData(ctx context.Context, applicationID, path string, req map[string]any) (
	any, *Response, error,
) {
	res := new(model.ApplicationDataResponse)
	resp, err := s.client.Patch(ctx, fmt.Sprintf("/api/v2/applications/%s/api/%s", applicationID, path), req, res)

	return res.Data, resp, err
}

// DeleteData deletes application data.
//
// https://developer.crowdin.com/api/v2/#operation/api.applications.api.delete
func (s *ApplicationsService) DeleteData(ctx context.Context, applicationID, path string) (*Response, error) {
	return s.client.Delete(ctx, fmt.Sprintf("/api/v2/applications/%s/api/%s", applicationID, path), nil)
}
