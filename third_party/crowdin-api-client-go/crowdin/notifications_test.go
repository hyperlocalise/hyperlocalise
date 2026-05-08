package crowdin

import (
	"context"
	"net/http"
	"testing"

	"github.com/crowdin/crowdin-api-client-go/crowdin/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNotificationsService_NotifyProjectMembers(t *testing.T) {
	tests := []struct {
		name string
		req  *model.Notification
		body string
	}{
		{
			name: "by user IDs",
			req: &model.Notification{
				UserIDs: []int{1, 2, 3},
				Message: "notification message",
			},
			body: `{"message":"notification message","userIds":[1,2,3]}` + "\n",
		},
		{
			name: "by role",
			req: &model.Notification{
				Role:    "owner",
				Message: "notification message",
			},
			body: `{"message":"notification message","role":"owner"}` + "\n",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			client, mux, teardown := setupClient()
			defer teardown()

			mux.HandleFunc("/api/v2/projects/2/notify", func(w http.ResponseWriter, r *http.Request) {
				testMethod(t, r, http.MethodPost)
				testURL(t, r, "/api/v2/projects/2/notify")
				testBody(t, r, tt.body)

				w.WriteHeader(http.StatusNoContent)
			})

			resp, err := client.Notifications.NotifyProjectMembers(context.Background(), 2, tt.req)
			require.NoError(t, err)
			assert.NotNil(t, resp)
		})
	}
}

func TestNotificationsService_Notify(t *testing.T) {
	tests := []struct {
		name string
		req  *model.Notification
		body string
	}{
		{
			name: "authenticated user",
			req: &model.Notification{
				Message: "notification message",
			},
			body: `{"message":"notification message"}` + "\n",
		},
		{
			name: "organization members by user IDs",
			req: &model.Notification{
				UserIDs: []int{1, 2, 3},
				Message: "notification message",
			},
			body: `{"message":"notification message","userIds":[1,2,3]}` + "\n",
		},
		{
			name: "organization members by role",
			req: &model.Notification{
				Role:    "owner",
				Message: "notification message",
			},
			body: `{"message":"notification message","role":"owner"}` + "\n",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			client, mux, teardown := setupClient()
			defer teardown()

			mux.HandleFunc("/api/v2/notify", func(w http.ResponseWriter, r *http.Request) {
				testMethod(t, r, http.MethodPost)
				testURL(t, r, "/api/v2/notify")
				testBody(t, r, tt.body)

				w.WriteHeader(http.StatusNoContent)
			})

			resp, err := client.Notifications.Notify(context.Background(), tt.req)
			require.NoError(t, err)
			assert.NotNil(t, resp)
		})
	}
}
