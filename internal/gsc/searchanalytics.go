package gsc

import (
	"context"
	"fmt"
	"net/http"
)

// QuerySearchAnalytics runs searchAnalytics.query for a property. siteURL is
// passed verbatim (for example sc-domain:example.com or https://example.com/).
func (c *Client) QuerySearchAnalytics(
	ctx context.Context,
	siteURL string,
	request SearchAnalyticsRequest,
) ([]SearchAnalyticsRow, error) {
	if err := validateSearchAnalyticsRequest(request); err != nil {
		return nil, err
	}

	path := fmt.Sprintf(
		"%s/sites/%s/searchAnalytics/query",
		c.webmastersBaseURL,
		encodeSiteURL(siteURL),
	)

	var response SearchAnalyticsResponse
	if err := c.request(ctx, http.MethodPost, path, request, &response); err != nil {
		return nil, err
	}
	if response.Rows == nil {
		return []SearchAnalyticsRow{}, nil
	}
	return response.Rows, nil
}

func validateSearchAnalyticsRequest(request SearchAnalyticsRequest) error {
	if request.StartDate == "" || request.EndDate == "" {
		return newError(
			ErrorCodeValidation,
			"startDate and endDate are required",
			"/searchAnalytics/query",
			0,
			"",
		)
	}
	return nil
}
