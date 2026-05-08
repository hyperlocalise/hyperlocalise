package crowdin

import (
	"context"
	"fmt"

	"github.com/crowdin/crowdin-api-client-go/crowdin/model"
)

// FieldsService provides access to the Fields API.
//
// Crowdin API docs: https://developer.crowdin.com/enterprise/api/v2/#tag/Fields
type FieldsService struct {
	client *Client
}

// List returns a list of fields.
//
// https://developer.crowdin.com/enterprise/api/v2/#operation/api.fields.getMany
func (s *FieldsService) List(ctx context.Context, opts *model.FieldsListOptions) ([]*model.Field, *Response, error) {
	res := new(model.FieldsListResponse)
	resp, err := s.client.Get(ctx, "/api/v2/fields", opts, res)
	if err != nil {
		return nil, resp, err
	}

	list := make([]*model.Field, 0, len(res.Data))
	for _, item := range res.Data {
		list = append(list, item.Data)
	}

	return list, resp, nil
}

// Get returns a field by its identifier.
//
// https://developer.crowdin.com/enterprise/api/v2/#operation/api.fields.get
func (s *FieldsService) Get(ctx context.Context, fieldID int) (*model.Field, *Response, error) {
	res := new(model.FieldResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/fields/%d", fieldID), nil, res)

	return res.Data, resp, err
}

// Add creates a new field.
//
// https://developer.crowdin.com/enterprise/api/v2/#operation/api.fields.post
func (s *FieldsService) Add(ctx context.Context, req *model.FieldAddRequest) (*model.Field, *Response, error) {
	res := new(model.FieldResponse)
	resp, err := s.client.Post(ctx, "/api/v2/fields", req, res)

	return res.Data, resp, err
}

// Edit updates a field.
//
// Request body:
//   - Op (string): operation to perform. Enum: replace.
//   - Path (string <json-pointer>): path to the field to update. Enum: "/name", "/description", "/config", "/entities".
//   - Value (string): new value to set.
//
// https://developer.crowdin.com/enterprise/api/v2/#operation/api.fields.patch
func (s *FieldsService) Edit(ctx context.Context, fieldID int, req []*model.UpdateRequest) (*model.Field, *Response, error) {
	res := new(model.FieldResponse)
	resp, err := s.client.Patch(ctx, fmt.Sprintf("/api/v2/fields/%d", fieldID), req, res)

	return res.Data, resp, err
}

// Delete deletes a field.
//
// https://developer.crowdin.com/enterprise/api/v2/#operation/api.fields.delete
func (s *FieldsService) Delete(ctx context.Context, fieldID int) (*Response, error) {
	return s.client.Delete(ctx, fmt.Sprintf("/api/v2/fields/%d", fieldID), nil)
}
