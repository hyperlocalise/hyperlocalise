package crowdin

import (
	"context"
	"fmt"

	"github.com/crowdin/crowdin-api-client-go/crowdin/model"
)

// SecurityLogsService provides access to the Security Logs API methods.
//
// Crowdin API docs: https://developer.crowdin.com/api/v2/#tag/Security-Logs
type SecurityLogsService struct {
	client *Client
}

// https://developer.crowdin.com/api/v2/#operation/api.users.security-logs.getMany
func (s *SecurityLogsService) ListUserLogs(ctx context.Context, userID int, opts *model.SecurityLogsListOptions) (
	[]*model.SecurityLog, *Response, error,
) {
	return s.listSecurityLogs(ctx, fmt.Sprintf("/api/v2/users/%d/security-logs", userID), opts)
}

// https://developer.crowdin.com/enterprise/api/v2/#operation/api.users.security-logs.getMany
func (s *SecurityLogsService) ListOrganizationLogs(ctx context.Context, opts *model.SecurityLogsListOptions) (
	[]*model.SecurityLog, *Response, error,
) {
	return s.listSecurityLogs(ctx, "/api/v2/security-logs", opts)
}

// https://developer.crowdin.com/api/v2/#operation/api.users.security-logs.get
func (s *SecurityLogsService) GetUserLog(ctx context.Context, userID, logID int) (*model.SecurityLog, *Response, error) {
	return s.getSecurityLog(ctx, fmt.Sprintf("/api/v2/users/%d/security-logs/%d", userID, logID))
}

// https://developer.crowdin.com/enterprise/api/v2/#operation/api.security-logs.get
func (s *SecurityLogsService) GetOrganizationLog(ctx context.Context, logID int) (*model.SecurityLog, *Response, error) {
	return s.getSecurityLog(ctx, fmt.Sprintf("/api/v2/security-logs/%d", logID))
}

// Generic method to list security logs.
func (s *SecurityLogsService) listSecurityLogs(ctx context.Context, path string, opts *model.SecurityLogsListOptions) (
	[]*model.SecurityLog, *Response, error,
) {
	res := new(model.SecurityLogsListResponse)
	resp, err := s.client.Get(ctx, path, opts, res)
	if err != nil {
		return nil, resp, err
	}

	list := make([]*model.SecurityLog, 0, len(res.Data))
	for _, log := range res.Data {
		list = append(list, log.Data)
	}

	return list, resp, nil
}

// Generic method to get a security log.
func (s *SecurityLogsService) getSecurityLog(ctx context.Context, path string) (*model.SecurityLog, *Response, error) {
	res := new(model.SecurityLogResponse)
	resp, err := s.client.Get(ctx, path, nil, res)

	return res.Data, resp, err
}
