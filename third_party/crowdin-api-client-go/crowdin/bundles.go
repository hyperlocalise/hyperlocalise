package crowdin

import (
	"context"
	"fmt"

	"github.com/crowdin/crowdin-api-client-go/crowdin/model"
)

// Crowdin API docs: https://developer.crowdin.com/api/v2/#tag/Bundles
type BundlesService struct {
	client *Client
}

// List returns a list of bundles.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.bundles.getMany
func (s *BundlesService) List(ctx context.Context, projectID int, opts *model.ListOptions) (
	[]*model.Bundle, *Response, error,
) {
	res := new(model.BundlesListResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/projects/%d/bundles", projectID), opts, res)
	if err != nil {
		return nil, resp, err
	}

	list := make([]*model.Bundle, 0, len(res.Data))
	for _, bundle := range res.Data {
		list = append(list, bundle.Data)
	}

	return list, resp, err
}

// Get returns the bundle by its identifier.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.bundles.get
func (s *BundlesService) Get(ctx context.Context, projectID, bundleID int) (*model.Bundle, *Response, error) {
	res := new(model.BundleResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/projects/%d/bundles/%d", projectID, bundleID), nil, res)

	return res.Data, resp, err
}

// Add creates a new bundle.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.bundles.post
func (s *BundlesService) Add(ctx context.Context, projectID int, req *model.BundleAddRequest) (
	*model.Bundle, *Response, error,
) {
	res := new(model.BundleResponse)
	resp, err := s.client.Post(ctx, fmt.Sprintf("/api/v2/projects/%d/bundles", projectID), req, res)

	return res.Data, resp, err
}

// Edit updates the bundle.
//
// Request body:
//   - op: The operation to perform. Enum: replace, test.
//   - path (json-pointer): A JSON Pointer as defined by RFC 6901. Enum: "/name", "/format",
//     "/sourcePatterns", "/ignorePatterns", "/exportPattern", "/isMultilingual", "/labelIds",
//     "/includeProjectSourceLanguage", "/excludeLabelIds".
//   - value: The value to be used within the operations.
//     The value must be string or integer.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.bundles.patch
func (s *BundlesService) Edit(ctx context.Context, projectID, bundleID int, req []*model.UpdateRequest) (
	*model.Bundle, *Response, error,
) {
	res := new(model.BundleResponse)
	resp, err := s.client.Patch(ctx, fmt.Sprintf("/api/v2/projects/%d/bundles/%d", projectID, bundleID), req, res)

	return res.Data, resp, err
}

// Delete removes the bundle.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.bundles.delete
func (s *BundlesService) Delete(ctx context.Context, projectID, bundleID int) (*Response, error) {
	return s.client.Delete(ctx, fmt.Sprintf("/api/v2/projects/%d/bundles/%d", projectID, bundleID), nil)
}

// Download returns a download link for the bundle.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.bundles.exports.download.get
func (s *BundlesService) Download(ctx context.Context, projectID, bundleID int, exportID string) (
	*model.DownloadLink, *Response, error,
) {
	res := new(model.DownloadLinkResponse)
	path := fmt.Sprintf("/api/v2/projects/%d/bundles/%d/exports/%s/download", projectID, bundleID, exportID)
	resp, err := s.client.Get(ctx, path, nil, res)

	return res.Data, resp, err
}

// Export starts the export process for the bundle.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.bundles.exports.post
func (s *BundlesService) Export(ctx context.Context, projectID, bundleID int) (
	*model.BundleExport, *Response, error,
) {
	res := new(model.BundleExportResponse)
	resp, err := s.client.Post(ctx, fmt.Sprintf("/api/v2/projects/%d/bundles/%d/exports", projectID, bundleID), "", res)

	return res.Data, resp, err
}

// CheckExportStatus returns the status of the bundle export.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.bundles.exports.get
func (s *BundlesService) CheckExportStatus(ctx context.Context, projectID, bundleID int, exportID string) (
	*model.BundleExport, *Response, error,
) {
	res := new(model.BundleExportResponse)
	path := fmt.Sprintf("/api/v2/projects/%d/bundles/%d/exports/%s", projectID, bundleID, exportID)
	resp, err := s.client.Get(ctx, path, nil, res)

	return res.Data, resp, err
}

// ListFiles returns a list of files included in the bundle.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.bundles.files.getMany
func (s *BundlesService) ListFiles(ctx context.Context, projectID, bundleID int, opts *model.ListOptions) (
	[]*model.File, *Response, error,
) {
	res := new(model.FileListResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/projects/%d/bundles/%d/files", projectID, bundleID), opts, res)
	if err != nil {
		return nil, resp, err
	}

	list := make([]*model.File, 0, len(res.Data))
	for _, file := range res.Data {
		list = append(list, file.Data)
	}

	return list, resp, err
}

// ListBranches returns a list of branches included in the bundle.
//
// https://developer.crowdin.com/api/v2/string-based/#operation/api.projects.bundles.branches.getMany
func (s *BundlesService) ListBranches(ctx context.Context, projectID, bundleID int, opts *model.ListOptions) (
	[]*model.Branch, *Response, error,
) {
	res := new(model.BranchesListResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/projects/%d/bundles/%d/branches", projectID, bundleID), opts, res)
	if err != nil {
		return nil, resp, err
	}

	list := make([]*model.Branch, 0, len(res.Data))
	for _, branch := range res.Data {
		list = append(list, branch.Data)
	}

	return list, resp, err
}
