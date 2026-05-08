package crowdin

import (
	"context"
	"fmt"

	"github.com/crowdin/crowdin-api-client-go/crowdin/model"
)

// Source strings are the text units for translation. Instead of modifying source files,
// you can manage source strings one by one.
// Use API to add, edit, or delete some specific strings in the source-based and
// files-based projects (available only for the following file formats: CSV, RESX, JSON,
// Android XML, iOS strings, PROPERTIES, XLIFF).
//
// Crowdin API docs: https://developer.crowdin.com/api/v2/#tag/Source-Strings
type SourceStringsService struct {
	client *Client
}

// List returns a list of source strings.
// Use optional parameters to filter the list.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.strings.getMany
func (s *SourceStringsService) List(ctx context.Context, projectID int, opts *model.SourceStringsListOptions) (
	[]*model.SourceString, *Response, error,
) {
	res := new(model.SourceStringsListResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/projects/%d/strings", projectID), opts, res)
	if err != nil {
		return nil, resp, err
	}

	list := make([]*model.SourceString, 0, len(res.Data))
	for _, str := range res.Data {
		list = append(list, str.Data)
	}

	return list, resp, nil
}

// Get returns a specific source string by its identifier.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.strings.get
func (s *SourceStringsService) Get(ctx context.Context, projectID, stringID int, opts *model.SourceStringsGetOptions) (
	*model.SourceString, *Response, error,
) {
	res := new(model.SourceStringsGetResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/projects/%d/strings/%d", projectID, stringID), opts, res)

	return res.Data, resp, err
}

// Add creates a new string.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.strings.post
func (s *SourceStringsService) Add(ctx context.Context, projectID int, req *model.SourceStringsAddRequest) (
	*model.SourceString, *Response, error,
) {
	res := new(model.SourceStringsGetResponse)
	resp, err := s.client.Post(ctx, fmt.Sprintf("/api/v2/projects/%d/strings", projectID), req, res)

	return res.Data, resp, err
}

// BatchOperations allows performing multiple operations on source strings.
//
// Request body:
//
//   - op: The operation to perform. Enum: add, replace, remove
//   - path: A JSON Pointer as defined in RFC 6901. Enum: "/{stringId}/identifier", "/{stringId}/text",
//     "/{stringId}/context", "/{stringId}/isHidden", "/{stringId}/maxLength", "/{stringId}/labelIds"
//   - value: The value to be used within the operations. The value must be one of string, integer,
//     boolean or map
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.strings.batchPatch
func (s *SourceStringsService) BatchOperations(ctx context.Context, projectID int, req []*model.UpdateRequest) (
	[]*model.SourceString, *Response, error,
) {
	res := new(model.SourceStringsListResponse)
	resp, err := s.client.Patch(ctx, fmt.Sprintf("/api/v2/projects/%d/strings", projectID), req, res)
	if err != nil {
		return nil, resp, err
	}

	list := make([]*model.SourceString, 0, len(res.Data))
	for _, str := range res.Data {
		list = append(list, str.Data)
	}

	return list, resp, nil
}

// Edit updates a specific string by its identifier.
//
// Request body:
//
//   - op: The operation to perform. Enum: replace, test
//   - path: A JSON Pointer as defined in RFC 6901. Enum: "/identifier", "/text", "/context",
//     "/isHidden" "/maxLength" "/labelIds"
//   - value: The value to be used within the operations. The value must be one of string, integer,
//     boolean or object
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.strings.patch
func (s *SourceStringsService) Edit(ctx context.Context, projectID, stringID int, req []*model.UpdateRequest) (
	*model.SourceString, *Response, error,
) {
	res := new(model.SourceStringsGetResponse)
	resp, err := s.client.Patch(ctx, fmt.Sprintf("/api/v2/projects/%d/strings/%d", projectID, stringID), req, res)

	return res.Data, resp, err
}

// Delete removes a specific string by its identifier.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.strings.delete
func (s *SourceStringsService) Delete(ctx context.Context, projectID, stringID int) (*Response, error) {
	return s.client.Delete(ctx, fmt.Sprintf("/api/v2/projects/%d/strings/%d", projectID, stringID), nil)
}

// GetUploadStatus returns the status of the uploaded strings.
//
// https://developer.crowdin.com/api/v2/string-based/#operation/api.projects.strings.uploads.get
func (s *SourceStringsService) GetUploadStatus(ctx context.Context, projectID int, uploadID string) (
	*model.SourceStringsUpload, *Response, error,
) {
	res := new(model.SourceStringsUploadResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/projects/%d/strings/uploads/%s", projectID, uploadID), nil, res)

	return res.Data, resp, err
}

// Upload uploads strings to the project.
//
// https://developer.crowdin.com/api/v2/string-based/#operation/api.projects.strings.uploads.post
func (s *SourceStringsService) Upload(ctx context.Context, projectID int, req *model.SourceStringsUploadRequest) (
	*model.SourceStringsUpload, *Response, error,
) {
	res := new(model.SourceStringsUploadResponse)
	resp, err := s.client.Post(ctx, fmt.Sprintf("/api/v2/projects/%d/strings/uploads", projectID), req, res)

	return res.Data, resp, err
}
