package crowdin

import (
	"context"
	"errors"
	"fmt"

	"github.com/crowdin/crowdin-api-client-go/crowdin/model"
)

// LabelsService provides access to the Labels API.
//
// Crowdin API docs: https://developer.crowdin.com/enterprise/api/v2/#tag/Labels
type LabelsService struct {
	client *Client
}

// Get returns a label by its identifier.
//
// https://developer.crowdin.com/enterprise/api/v2/#operation/api.projects.labels.get
func (s *LabelsService) Get(ctx context.Context, projectID, labelID int) (*model.Label, *Response, error) {
	res := new(model.LabelResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/projects/%d/labels/%d", projectID, labelID), nil, res)

	return res.Data, resp, err
}

// List returns a list of labels in the project.
//
// https://developer.crowdin.com/enterprise/api/v2/#operation/api.projects.labels.getMany
func (s *LabelsService) List(ctx context.Context, projectID int, opts *model.LabelsListOptions) (
	[]*model.Label, *Response, error,
) {
	res := new(model.LabelsListResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/projects/%d/labels", projectID), opts, res)
	if err != nil {
		return nil, resp, err
	}

	list := make([]*model.Label, 0, len(res.Data))
	for _, label := range res.Data {
		list = append(list, label.Data)
	}

	return list, resp, err
}

// Add creates a new label in the project.
//
// https://developer.crowdin.com/enterprise/api/v2/#operation/api.projects.labels.post
func (s *LabelsService) Add(ctx context.Context, projectID int, req *model.LabelAddRequest) (
	*model.Label, *Response, error,
) {
	res := new(model.LabelResponse)
	resp, err := s.client.Post(ctx, fmt.Sprintf("/api/v2/projects/%d/labels", projectID), req, res)

	return res.Data, resp, err
}

// Edit updates a label by its identifier.
//
// Request body:
// - op - operation to perform with the label. Enum: replace, test.
// - path (json-pointer) - path to the field to update. Enum: "/title".
// - value (string) - new value for the field. Must be a string.
//
// https://developer.crowdin.com/enterprise/api/v2/#operation/api.projects.labels.patch
func (s *LabelsService) Edit(ctx context.Context, projectID, labelID int, req []*model.UpdateRequest) (
	*model.Label, *Response, error,
) {
	res := new(model.LabelResponse)
	resp, err := s.client.Patch(ctx, fmt.Sprintf("/api/v2/projects/%d/labels/%d", projectID, labelID), req, res)

	return res.Data, resp, err
}

// Delete removes a label by its identifier.
//
// https://developer.crowdin.com/enterprise/api/v2/#operation/api.projects.labels.delete
func (s *LabelsService) Delete(ctx context.Context, projectID, labelID int) (*Response, error) {
	return s.client.Delete(ctx, fmt.Sprintf("/api/v2/projects/%d/labels/%d", projectID, labelID), nil)
}

// AssignToStrings assigns label to strings and returns a list of strings
// which the label was assigned to.
// Note: You can assign up to 500 strings at a time.
//
// https://developer.crowdin.com/enterprise/api/v2/#operation/api.projects.labels.strings.post
func (s *LabelsService) AssignToStrings(ctx context.Context, projectID, labelID int, stringIDs []int) (
	[]*model.SourceString, *Response, error,
) {
	var (
		req = &model.AssignToStringsRequest{StringIDs: stringIDs}
		res = &model.SourceStringsListResponse{}
	)

	resp, err := s.client.Post(ctx, fmt.Sprintf("/api/v2/projects/%d/labels/%d/strings", projectID, labelID), req, res)
	if err != nil {
		return nil, resp, err
	}

	list := make([]*model.SourceString, 0, len(res.Data))
	for _, item := range res.Data {
		list = append(list, item.Data)
	}

	return list, resp, err
}

// UnassignFromStrings unassigns label from strings and returns a list of strings
// which the label was unassigned from.
// Note: You can unassign up to 500 strings at a time.
//
// https://developer.crowdin.com/enterprise/api/v2/#operation/api.projects.labels.strings.deleteMany
func (s *LabelsService) UnassignFromStrings(ctx context.Context, projectID, labelID int, stringIDs []int) (
	[]*model.SourceString, *Response, error,
) {
	if len(stringIDs) == 0 {
		return nil, nil, errors.New("stringIDs cannot be empty")
	}

	res := new(model.SourceStringsListResponse)
	path := "/api/v2/projects/%d/labels/%d/strings?stringIds=%s"
	resp, err := s.client.Delete(ctx, fmt.Sprintf(path, projectID, labelID, model.JoinSlice(stringIDs)), res)
	if err != nil {
		return nil, resp, err
	}

	list := make([]*model.SourceString, 0, len(res.Data))
	for _, item := range res.Data {
		list = append(list, item.Data)
	}

	return list, resp, err
}

// AssignToScreenshots assigns label to screenshots and returns a list of screenshots
// which the label was assigned to.
// Note: You can assign up to 500 screenshots at a time.
//
// https://developer.crowdin.com/enterprise/api/v2/#operation/api.projects.labels.screenshots.post
func (s *LabelsService) AssignToScreenshots(ctx context.Context, projectID, labelID int, screenshotIDs []int) (
	[]*model.Screenshot, *Response, error,
) {
	var (
		req = &model.AssignToScreenshotsRequest{ScreenshotIDs: screenshotIDs}
		res = &model.ScreenshotListResponse{}
	)

	resp, err := s.client.Post(ctx, fmt.Sprintf("/api/v2/projects/%d/labels/%d/screenshots", projectID, labelID), req, res)
	if err != nil {
		return nil, resp, err
	}

	list := make([]*model.Screenshot, 0, len(res.Data))
	for _, item := range res.Data {
		list = append(list, item.Data)
	}

	return list, resp, err
}

// UnassignFromScreenshots unassigns label from screenshots and returns a list of screenshots
// which the label was unassigned from.
// Note: You can unassign up to 500 screenshots at a time.
//
// https://developer.crowdin.com/enterprise/api/v2/#operation/api.projects.labels.screenshots.deleteMany
func (s *LabelsService) UnassignFromScreenshots(ctx context.Context, projectID, labelID int, screenshotIDs []int) (
	[]*model.Screenshot, *Response, error,
) {
	if len(screenshotIDs) == 0 {
		return nil, nil, errors.New("screenshotIDs cannot be empty")
	}

	res := new(model.ScreenshotListResponse)
	path := "/api/v2/projects/%d/labels/%d/screenshots?screenshotIds=%s"
	resp, err := s.client.Delete(ctx, fmt.Sprintf(path, projectID, labelID, model.JoinSlice(screenshotIDs)), res)
	if err != nil {
		return nil, resp, err
	}

	list := make([]*model.Screenshot, 0, len(res.Data))
	for _, item := range res.Data {
		list = append(list, item.Data)
	}

	return list, resp, err
}
