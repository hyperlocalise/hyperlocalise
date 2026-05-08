package crowdin

import (
	"context"
	"fmt"

	"github.com/crowdin/crowdin-api-client-go/crowdin/model"
)

// Use API to list, add, edit or remove string comments.
//
// Crowdin API docs: https://developer.crowdin.com/api/v2/#tag/String-Comments
type StringCommentsService struct {
	client *Client
}

// List returns a list of string comments.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.comments.getMany
func (s *StringCommentsService) List(ctx context.Context, projectID int, opts *model.StringCommentsListOptions) (
	[]*model.StringComment, *Response, error,
) {
	res := new(model.StringCommentsListResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/projects/%d/comments", projectID), opts, res)
	if err != nil {
		return nil, resp, err
	}

	list := make([]*model.StringComment, 0, len(res.Data))
	for _, comment := range res.Data {
		list = append(list, comment.Data)
	}

	return list, resp, nil
}

// String Comment Batch Operations.
//
// Request body:
//   - op: The operation to perform. Enum: replace, remove, add.
//   - path: A JSON Pointer as defined by RFC 6901. Enum: "/{commentId}/text", "/{commentId}/issueStatus".
//   - value: The value to be used within the operations.
//     The value must be string.
//
// https://support.crowdin.com/developer/api/v2/#tag/String-Comments/operation/api.projects.comments.batchPatch
func (s *StringCommentsService) BatchOperations(ctx context.Context, projectID int, req []*model.UpdateRequest) (
	[]*model.StringComment, *Response, error,
) {
	res := new(model.StringCommentsListResponse)
	resp, err := s.client.Patch(ctx, fmt.Sprintf("/api/v2/projects/%d/comments", projectID), req, res)
	if err != nil {
		return nil, resp, err
	}

	list := make([]*model.StringComment, 0, len(res.Data))
	for _, comment := range res.Data {
		list = append(list, comment.Data)
	}

	return list, resp, nil
}

// Get returns a string comment by its ID.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.comments.post
func (s *StringCommentsService) Get(ctx context.Context, projectID, commentID int) (
	*model.StringComment, *Response, error,
) {
	res := new(model.StringCommentsResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/projects/%d/comments/%d", projectID, commentID), nil, res)

	return res.Data, resp, err
}

// Add creates a new string comment.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.comments.post
func (s *StringCommentsService) Add(ctx context.Context, projectID int, req *model.StringCommentsAddRequest) (
	*model.StringComment, *Response, error,
) {
	res := new(model.StringCommentsResponse)
	resp, err := s.client.Post(ctx, fmt.Sprintf("/api/v2/projects/%d/comments", projectID), req, res)

	return res.Data, resp, err
}

// Edit updates a string comment.
//
// Request body:
//   - op: The operation to perform. Enum: replace, test.
//   - path: A JSON Pointer as defined by RFC 6901. Enum: "/text", "/issueStatus".
//   - value: The value to be used within the operations.
//     The value must be string.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.comments.patch
func (s *StringCommentsService) Edit(ctx context.Context, projectID, commentID int, req []*model.UpdateRequest) (
	*model.StringComment, *Response, error,
) {
	res := new(model.StringCommentsResponse)
	resp, err := s.client.Patch(ctx, fmt.Sprintf("/api/v2/projects/%d/comments/%d", projectID, commentID), req, res)

	return res.Data, resp, err
}

// Delete removes a string comment.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.comments.delete
func (s *StringCommentsService) Delete(ctx context.Context, projectID, commentID int) (*Response, error) {
	return s.client.Delete(ctx, fmt.Sprintf("/api/v2/projects/%d/comments/%d", projectID, commentID), nil)
}
