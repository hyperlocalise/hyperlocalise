package crowdin

import (
	"context"
	"fmt"

	"github.com/crowdin/crowdin-api-client-go/crowdin/model"
)

// Webhooks allow to collect information about events that happen in your Crowdin account.
// It is possible to select request type, content type, and add custom payload, which allows to
// create integrations with other systems on your own.
//
// Webhooks can be configured for the following events:
//   - Project is created
//   - Project is deleted
//
// Use API to create, modify, and delete specific webhooks.
//
// CrowdIn API docs: https://developer.crowdin.com/api/v2/#tag/Organization-Webhooks
type OrganizationWebhooksService struct {
	client *Client
}

// List returns a list of webhooks for an organization.
//
// https://developer.crowdin.com/api/v2/#operation/api.webhooks.getMany
func (s *OrganizationWebhooksService) List(ctx context.Context, opts *model.ListOptions) (
	[]*model.Webhook, *Response, error,
) {
	res := new(model.WebhooksListResponse)
	resp, err := s.client.Get(ctx, "/api/v2/webhooks", opts, res)
	if err != nil {
		return nil, resp, err
	}

	list := make([]*model.Webhook, 0, len(res.Data))
	for _, wh := range res.Data {
		list = append(list, wh.Data)
	}

	return list, resp, err
}

// Get returns a specific webhook for an organization.
//
// https://developer.crowdin.com/api/v2/#operation/api.webhooks.get
func (s *OrganizationWebhooksService) Get(ctx context.Context, organizationWebhookID int) (*model.Webhook, *Response, error) {
	res := new(model.WebhookResponse)
	resp, err := s.client.Get(ctx, fmt.Sprintf("/api/v2/webhooks/%d", organizationWebhookID), nil, res)

	return res.Data, resp, err
}

// Add creates a new webhook.
//
// https://developer.crowdin.com/api/v2/#operation/api.webhooks.post
func (s *OrganizationWebhooksService) Add(ctx context.Context, projectID int, req *model.WebhookAddRequest) (
	*model.Webhook, *Response, error,
) {
	res := new(model.WebhookResponse)
	resp, err := s.client.Post(ctx, fmt.Sprintf("/api/v2/projects/%d/webhooks", projectID), req, res)

	return res.Data, resp, err
}

// Edit modifies a webhook.
//
// Request body:
//   - Op (string): operation to perform. Enum: replace, test.
//   - Path (string <json-pointer>): a JSON Pointer to the target location.
//     Enum: "/name", "/url", "/isActive", "/batchingEnabled", "/contentType",
//     "/events", "/headers", "/requestType", "/payload".
//   - Value (any): new value to set.
//
// https://developer.crowdin.com/api/v2/#operation/api.webhooks.patch
func (s *OrganizationWebhooksService) Edit(ctx context.Context, organizationWebhookID int, req []*model.UpdateRequest) (
	*model.Webhook, *Response, error,
) {
	res := new(model.WebhookResponse)
	resp, err := s.client.Patch(ctx, fmt.Sprintf("/api/v2/webhooks/%d", organizationWebhookID), req, res)

	return res.Data, resp, err
}

// Delete removes a webhook.
//
// https://developer.crowdin.com/api/v2/#operation/api.webhooks.delete
func (s *OrganizationWebhooksService) Delete(ctx context.Context, organizationWebhookID int) (*Response, error) {
	return s.client.Delete(ctx, fmt.Sprintf("/api/v2/webhooks/%d", organizationWebhookID), nil)
}
