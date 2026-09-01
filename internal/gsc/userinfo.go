package gsc

import (
	"context"
	"net/http"
	"strings"
)

// UserInfoEmail returns the Google account email for the connected grant.
func (c *Client) UserInfoEmail(ctx context.Context) (string, error) {
	var response UserInfo
	if err := c.request(ctx, http.MethodGet, c.userInfoURL, nil, &response); err != nil {
		return "", err
	}
	email := strings.TrimSpace(response.Email)
	if email == "" {
		return "", nil
	}
	return email, nil
}
