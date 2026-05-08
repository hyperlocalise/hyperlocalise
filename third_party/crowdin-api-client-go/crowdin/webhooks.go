package crowdin

import (
	"context"
	"fmt"

	"github.com/crowdin/crowdin-api-client-go/crowdin/model"
)

// Webhooks allow to collect information about events that happen in your Crowdin projects.
// It is possible to select request type, content type, and add custom payload, which allows to
// create integrations with other systems on your own.
//
// Webhooks can be configured for the following events:
//   - Project file is fully translated
//   - Project file is fully reviewed
//   - All strings in project are translated
//   - All strings in project are reviewed
//   - Final translation of string is updated (using Replace in suggestions feature)
//   - Source string is added
//   - Source string is updated
//   - Source string is deleted
//   - Source string is translated
//   - Translation for source string is updated (using Replace in suggestions feature)
//   - One of translations is deleted
//   - Translation for string is approved
//   - Approval for previously added translation is removed
//
// Use API to create, modify, and delete specific webhooks.
//
// CrowdIn API docs: https://developer.crowdin.com/api/v2/#tag/Webhooks
type WebhooksService struct {
	client *Client
}

// List returns a list of webhooks for a project.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.webhooks.getMany
func (s *WebhooksService) List(ctx context.Context, projectID int, opts *model.ListOptions) (
	[]*model.Webhook, *Response, error,
) {
	res := new(model.WebhooksListResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/projects/%d/webhooks", projectID), opts, res)
	if err != nil {
		return nil, resp, err
	}

	list := make([]*model.Webhook, 0, len(res.Data))
	for _, wh := range res.Data {
		list = append(list, wh.Data)
	}

	return list, resp, err
}

// Get returns a specific webhook for a project.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.webhooks.get
func (s *WebhooksService) Get(ctx context.Context, projectID, webhookID int) (*model.Webhook, *Response, error) {
	res := new(model.WebhookResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/projects/%d/webhooks/%d", projectID, webhookID), nil, res)

	return res.Data, resp, err
}

// Add creates a new webhook.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.webhooks.post
func (s *WebhooksService) Add(ctx context.Context, projectID int, req *model.WebhookAddRequest) (
	*model.Webhook, *Response, error,
) {
	res := new(model.WebhookResponse)
	resp, err := s.client.Post(ctx, fmt.Sprintf("/api/v2/projects/%d/webhooks", projectID), req, res)

	return res.Data, resp, err
}

// Edit modifies a specific webhook.
//
// Request body:
//   - Op (string): operation to perform. Enum: replace, test.
//   - Path (string <json-pointer>): a JSON Pointer to the target location.
//     Enum: "/name", "/url", "/isActive", "/batchingEnabled", "/contentType",
//     "/events", "/headers", "/requestType", "/payload".
//   - Value (any): new value to set.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.webhooks.patch
func (s *WebhooksService) Edit(ctx context.Context, projectID, webhookID int, req []*model.UpdateRequest) (
	*model.Webhook, *Response, error,
) {
	res := new(model.WebhookResponse)
	resp, err := s.client.Patch(ctx, fmt.Sprintf("/api/v2/projects/%d/webhooks/%d", projectID, webhookID), req, res)

	return res.Data, resp, err
}

// Delete removes a specific webhook.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.webhooks.delete
func (s *WebhooksService) Delete(ctx context.Context, projectID, webhookID int) (*Response, error) {
	return s.client.Delete(ctx, fmt.Sprintf("/api/v2/projects/%d/webhooks/%d", projectID, webhookID), nil)
}
