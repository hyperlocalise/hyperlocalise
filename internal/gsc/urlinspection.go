package gsc

import (
	"context"
	"net/http"
	"strings"
)

type inspectURLResponse struct {
	InspectionResult *URLInspectionResult `json:"inspectionResult"`
}

// InspectURL runs urlInspection.index.inspect for a single URL.
func (c *Client) InspectURL(
	ctx context.Context,
	siteURL string,
	inspectionURL string,
	languageCode string,
) (*URLInspectionResult, error) {
	siteURL = strings.TrimSpace(siteURL)
	inspectionURL = strings.TrimSpace(inspectionURL)
	if siteURL == "" || inspectionURL == "" {
		return nil, newError(
			ErrorCodeValidation,
			"siteUrl and inspectionUrl are required",
			"/urlInspection/index:inspect",
			0,
			"",
		)
	}

	body := InspectURLRequest{
		SiteURL:       siteURL,
		InspectionURL: inspectionURL,
	}
	if trimmed := strings.TrimSpace(languageCode); trimmed != "" {
		body.LanguageCode = trimmed
	}

	path := c.urlInspectionBaseURL + "/urlInspection/index:inspect"
	var response inspectURLResponse
	if err := c.request(ctx, http.MethodPost, path, body, &response); err != nil {
		return nil, err
	}
	if response.InspectionResult == nil {
		return nil, nil
	}
	return response.InspectionResult, nil
}

// InspectURLs inspects up to maxURLs URLs, returning per-URL results. Errors for
// individual URLs are returned in the result slice; a connection-level failure
// aborts the whole call.
func (c *Client) InspectURLs(
	ctx context.Context,
	siteURL string,
	inspectionURLs []string,
	languageCode string,
) ([]URLInspectionOutcome, error) {
	if len(inspectionURLs) == 0 {
		return nil, newError(
			ErrorCodeValidation,
			"at least one inspection URL is required",
			"/urlInspection/index:inspect",
			0,
			"",
		)
	}

	outcomes := make([]URLInspectionOutcome, 0, len(inspectionURLs))
	for _, inspectionURL := range inspectionURLs {
		result, err := c.InspectURL(ctx, siteURL, inspectionURL, languageCode)
		outcomes = append(outcomes, URLInspectionOutcome{
			InspectionURL: inspectionURL,
			Result:        result,
			Error:         err,
		})
		if err != nil {
			if typed, ok := AsError(err); ok && (typed.Code == ErrorCodeAuthFailed || typed.StatusCode == 401 || typed.StatusCode == 403) {
				return outcomes, err
			}
		}
	}
	return outcomes, nil
}

// URLInspectionOutcome is one URL in a batch inspection call.
type URLInspectionOutcome struct {
	InspectionURL string
	Result        *URLInspectionResult
	Error         error
}

// ErrorString returns a human-readable error for the outcome, if any.
func (o URLInspectionOutcome) ErrorString() string {
	if o.Error == nil {
		return ""
	}
	return o.Error.Error()
}
