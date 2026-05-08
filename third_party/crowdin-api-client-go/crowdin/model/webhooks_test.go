package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestWebhookAddRequestValidate(t *testing.T) {
	tests := []struct {
		name  string
		req   *WebhookAddRequest
		err   string
		valid bool
	}{
		{
			name: "nil request",
			req:  nil,
			err:  "request cannot be nil",
		},
		{
			name: "empty request",
			req:  &WebhookAddRequest{},
			err:  "name is required",
		},
		{
			name: "url is required",
			req:  &WebhookAddRequest{Name: "Proofread"},
			err:  "url is required",
		},
		{
			name: "events is required",
			req:  &WebhookAddRequest{Name: "Proofread", URL: "https://example.com/webhook/9da7ea7595c9"},
			err:  "events is required",
		},
		{
			name: "requestType is required",
			req: &WebhookAddRequest{Name: "Proofread", URL: "https://example.com/webhook/9da7ea7595c9",
				Events: []Event{FileApproved}},
			err: "requestType is required",
		},
		{
			name: "requestType is invalid",
			req: &WebhookAddRequest{Name: "Proofread", URL: "https://example.com/webhook/9da7ea7595c9",
				Events: []Event{FileApproved}, RequestType: "PUT"},
			err: "requestType must be GET or POST",
		},
		{
			name: "valid request",
			req: &WebhookAddRequest{Name: "Proofread", URL: "https://example.com/webhook/9da7ea7595c9",
				Events: []Event{FileApproved}, RequestType: "POST"},
			valid: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if err := tt.req.Validate(); tt.valid {
				assert.NoError(t, err)
			} else {
				assert.EqualError(t, err, tt.err)
			}
		})
	}
}

func TestWebhookUnmarshalJSON(t *testing.T) {
	tests := []struct {
		name     string
		data     []byte
		expected *Webhook
		err      string
	}{
		{
			name: "valid JSON with headers as array",
			data: []byte(`{"headers": [], "name": "Proofread", "requestType": "GET"}`),
			expected: &Webhook{
				Name:        "Proofread",
				RequestType: "GET",
				Headers:     make(map[string]string),
			},
		},
		{
			name: "valid JSON with headers as object",
			data: []byte(`{"headers": {"Content-Type": "application/json"}, "name": "Proofread", "requestType": "POST"}`),
			expected: &Webhook{
				Name:        "Proofread",
				RequestType: "POST",
				Headers:     map[string]string{"Content-Type": "application/json"},
			},
		},
		{
			name:     "valid JSON with headers as object",
			data:     []byte(`{"headers": "Content-Type", "name": "Proofread", "requestType": "POST"}`),
			expected: &Webhook{Name: "Proofread", RequestType: "POST"},
			err:      "webhook headers unmarshal error: json: cannot unmarshal string into Go value of type map[string]string",
		},
		{
			name:     "invalid JSON",
			data:     []byte(`{"name": "Proofread", "requestType": POST}`),
			expected: &Webhook{},
			err:      "webhook unmarshal error: invalid character 'P' looking for beginning of value",
		},
		{
			name:     "invalid headers JSON",
			data:     []byte(`{"headers": "invalid", "name": "Proofread", "events": ["FileApproved"], "requestType": "POST"`),
			expected: &Webhook{},
			err:      "webhook unmarshal error: unexpected end of JSON input",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			actual := &Webhook{}
			err := actual.UnmarshalJSON(tt.data)

			if tt.err != "" {
				assert.EqualError(t, err, tt.err)
				assert.Equal(t, tt.expected, actual)
			} else {
				assert.NoError(t, err)
				assert.Equal(t, tt.expected, actual)
			}
		})
	}
}
