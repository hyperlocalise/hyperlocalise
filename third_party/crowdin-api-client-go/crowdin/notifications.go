package crowdin

import (
	"context"
	"fmt"

	"github.com/crowdin/crowdin-api-client-go/crowdin/model"
)

// NotificationsService provides access to the Notifications API methods.
type NotificationsService struct {
	client *Client
}

// Notify sends a notification to authenticated user or organization members.
//
// To send a notification to an authenticated user, pass the request body with the `Message`.
// To send a notification to organization members, pass the request
// body with the `Message` and `UserIDs` or `Role`.
//
// Send a notification to an authenticated user.
//
//	&model.Notification{
//		Message: "notification message",
//	}
//
// Send a notification to organization members by user IDs (for enterprise client).
//
//	&model.Notification{
//		UserIDs: []int{1, 2, 3},
//		Message: "notification message",
//	}
//
// Send a notification to organization members by role (for enterprise client).
//
//	&model.Notification{
//		Role:    "owner",
//		Message: "notification message",
//	}
//
// https://developer.crowdin.com/enterprise/api/v2/#operation/api.notify.post
func (s *NotificationsService) Notify(ctx context.Context, req *model.Notification) (*Response, error) {
	return s.client.Post(ctx, "/api/v2/notify", req, nil)
}

// NotifyProjectMembers sends a notification to project members.
//
// The request body can be either by user IDs or by role.
// To send by user IDs, pass the request body with the `UserIDs` and `Message`.
// To send by role, pass the request body with the `Role` and `Message`.
//
// https://developer.crowdin.com/api/v2/#operation/api.projects.notify.post
func (s *NotificationsService) NotifyProjectMembers(ctx context.Context, projectID int, req *model.Notification) (
	*Response, error,
) {
	return s.client.Post(ctx, fmt.Sprintf("/api/v2/projects/%d/notify", projectID), req, nil)
}
