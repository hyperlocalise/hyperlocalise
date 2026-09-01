package gsc

import (
	"context"
	"net/http"
)

type listSitesResponse struct {
	SiteEntry []Site `json:"siteEntry"`
}

// ListSites returns verified properties on the connected grant.
func (c *Client) ListSites(ctx context.Context) ([]Site, error) {
	var response listSitesResponse
	if err := c.request(ctx, http.MethodGet, c.webmastersBaseURL+"/sites", nil, &response); err != nil {
		return nil, err
	}
	if response.SiteEntry == nil {
		return []Site{}, nil
	}
	return response.SiteEntry, nil
}
