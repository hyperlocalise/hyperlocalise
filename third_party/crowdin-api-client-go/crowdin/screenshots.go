package crowdin

import (
	"context"
	"errors"
	"fmt"

	"github.com/crowdin/crowdin-api-client-go/crowdin/model"
)

// Screenshots provide translators with additional context for the source strings.
// Screenshot tags allow specifying which source strings are displayed on each screenshot.
//
// Use API to manage screenshots and their tags.
//
// Crowdin API docs: https://developer.crowdin.com/api/v2/#tag/Screenshots
type ScreenshotsService struct {
	client *Client
}

// GetScreenshot returns a specific screenshot by its identifier.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.screenshots.get
func (s *ScreenshotsService) GetScreenshot(ctx context.Context, projectID, screenshotID int) (
	*model.Screenshot, *Response, error,
) {
	res := new(model.ScreenshotResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/projects/%d/screenshots/%d", projectID, screenshotID), nil, res)

	return res.Data, resp, err
}

// ListScreenshots returns a list of all screenshots in the project.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.screenshots.getMany
func (s *ScreenshotsService) ListScreenshots(ctx context.Context, projectID int, opts *model.ScreenshotListOptions) (
	[]*model.Screenshot, *Response, error,
) {
	res := new(model.ScreenshotListResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/projects/%d/screenshots", projectID), opts, res)
	if err != nil {
		return nil, resp, err
	}

	list := make([]*model.Screenshot, 0, len(res.Data))
	for _, screenshot := range res.Data {
		list = append(list, screenshot.Data)
	}

	return list, resp, err
}

// AddScreenshot adds a new screenshot to the project.
//
// https://developer.crowdin.com/enterprise/api/v2/#operation/api.projects.screenshots.post
func (s *ScreenshotsService) AddScreenshot(ctx context.Context, projectID int, req *model.ScreenshotAddRequest) (
	*model.Screenshot, *Response, error,
) {
	res := new(model.ScreenshotResponse)
	resp, err := s.client.Post(ctx, fmt.Sprintf("/api/v2/projects/%d/screenshots", projectID), req, res)

	return res.Data, resp, err
}

// UpdateScreenshot updates a specific screenshot by its identifier.
//
// https://developer.crowdin.com/enterprise/api/v2/#operation/api.projects.screenshots.put
func (s *ScreenshotsService) UpdateScreenshot(ctx context.Context, projectID, screenshotID int, req *model.ScreenshotUpdateRequest) (
	*model.Screenshot, *Response, error,
) {
	res := new(model.ScreenshotResponse)
	resp, err := s.client.Put(ctx, fmt.Sprintf("/api/v2/projects/%d/screenshots/%d", projectID, screenshotID), req, res)

	return res.Data, resp, err
}

// EditScreenshot edit a specific screenshot by its identifier.
//
// Request body:
//   - op (string): Operation to perform with the screenshot. Enum: replace, test
//   - path (string <json-pointer>): JSON path to the field that needs to be updated (RFC 6901).
//     Enum: "/name", "labelIds"
//   - value (string): New value for the field. Must be a string.
//
// https://developer.crowdin.com/enterprise/api/v2/#operation/api.projects.screenshots.patch
func (s *ScreenshotsService) EditScreenshot(ctx context.Context, projectID, screenshotID int, req []*model.UpdateRequest) (
	*model.Screenshot, *Response, error,
) {
	res := new(model.ScreenshotResponse)
	resp, err := s.client.Patch(ctx, fmt.Sprintf("/api/v2/projects/%d/screenshots/%d", projectID, screenshotID), req, res)

	return res.Data, resp, err
}

// DeleteScreenshot deletes a specific screenshot by its identifier.
//
// https://developer.crowdin.com/enterprise/api/v2/#operation/api.projects.screenshots.delete
func (s *ScreenshotsService) DeleteScreenshot(ctx context.Context, projectID, screenshotID int) (*Response, error) {
	return s.client.Delete(ctx, fmt.Sprintf("/api/v2/projects/%d/screenshots/%d", projectID, screenshotID), nil)
}

// ListTags returns a list of all tags for the screenshot.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.screenshots.tags.getMany
func (s *ScreenshotsService) ListTags(ctx context.Context, projectID, screenshotID int, opts *model.ListOptions) (
	[]*model.Tag, *Response, error,
) {
	res := new(model.TagListResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/projects/%d/screenshots/%d/tags", projectID, screenshotID), opts, res)
	if err != nil {
		return nil, resp, err
	}

	list := make([]*model.Tag, 0, len(res.Data))
	for _, tag := range res.Data {
		list = append(list, tag.Data)
	}

	return list, resp, err
}

// GetTag returns a specific tag by its identifier.
//
// https://developer.crowdin.com/enterprise/api/v2/#operation/api.projects.screenshots.tags.get
func (s *ScreenshotsService) GetTag(ctx context.Context, projectID, screenshotID, tagID int) (
	*model.Tag, *Response, error,
) {
	res := new(model.TagResponse)
	path := fmt.Sprintf("/api/v2/projects/%d/screenshots/%d/tags/%d", projectID, screenshotID, tagID)
	resp, err := s.client.Get(ctx, path, nil, res)

	return res.Data, resp, err
}

// AddTag adds a new tag to the screenshot.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.screenshots.tags.post
func (s *ScreenshotsService) AddTag(ctx context.Context, projectID, screenshotID int, req *model.TagAddRequest) (
	*model.Tag, *Response, error,
) {
	res := new(model.TagResponse)
	path := fmt.Sprintf("/api/v2/projects/%d/screenshots/%d/tags", projectID, screenshotID)
	resp, err := s.client.Post(ctx, path, req, res)

	return res.Data, resp, err
}

// ReplaceTags replaces all tags on the screenshot.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.screenshots.tags.putMany
func (s *ScreenshotsService) ReplaceTags(ctx context.Context, projectID, screenshotID int, req []*model.ReplaceTagsRequest) (
	*Response, error,
) {
	if len(req) == 0 {
		return nil, errors.New("request is required")
	}

	for _, r := range req {
		if err := r.Validate(); err != nil {
			return nil, err
		}
	}

	return s.client.Put(ctx, fmt.Sprintf("/api/v2/projects/%d/screenshots/%d/tags", projectID, screenshotID), req, nil)
}

// AutoTag automatically tags the screenshot with the source strings that are displayed on it.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.screenshots.tags.putMany
func (s *ScreenshotsService) AutoTag(ctx context.Context, projectID, screenshotID int, req *model.AutoTagRequest) (
	*Response, error,
) {
	return s.client.Put(ctx, fmt.Sprintf("/api/v2/projects/%d/screenshots/%d/tags", projectID, screenshotID), req, nil)
}

// EditTag edit a specific tag by its identifier.
//
// Request body:
//   - op (string): Operation to perform with the tag. Enum: replace, test
//   - path (string <json-pointer>): JSON path to the field that needs to be updated (RFC 6901).
//     Enum: "/stringId", "/position"
//   - value (string or int): New value for the field. Must be a string or int.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.screenshots.tags.patch
func (s *ScreenshotsService) EditTag(ctx context.Context, projectID, screenshotID, tagID int, req []*model.UpdateRequest) (
	*model.Tag, *Response, error,
) {
	res := new(model.TagResponse)
	path := fmt.Sprintf("/api/v2/projects/%d/screenshots/%d/tags/%d", projectID, screenshotID, tagID)
	resp, err := s.client.Patch(ctx, path, req, res)

	return res.Data, resp, err
}

// ClearTags deletes all tags from the screenshot.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.screenshots.tags.deleteMany
func (s *ScreenshotsService) ClearTags(ctx context.Context, projectID, screenshotID int) (*Response, error) {
	return s.client.Delete(ctx, fmt.Sprintf("/api/v2/projects/%d/screenshots/%d/tags", projectID, screenshotID), nil)
}

// DeleteTag deletes a specific tag by its identifier.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.screenshots.tags.delete
func (s *ScreenshotsService) DeleteTag(ctx context.Context, projectID, screenshotID, tagID int) (*Response, error) {
	return s.client.Delete(ctx, fmt.Sprintf("/api/v2/projects/%d/screenshots/%d/tags/%d", projectID, screenshotID, tagID), nil)
}
