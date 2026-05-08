package crowdin

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"github.com/crowdin/crowdin-api-client-go/crowdin/model"
)

const (
	baseURL = "https://api.crowdin.com/"

	userAgent = "crowdin-api-client-go/0.18.0"
)

// Client is a Crowdin API client.
type Client struct {
	baseURL      *url.URL
	token        string
	organization string
	userAgent    string
	httpClient   *http.Client

	GraphQL *GraphQL

	AI                        *AIService
	Applications              *ApplicationsService
	Branches                  *BranchesService
	Bundles                   *BundlesService
	Dictionaries              *DictionariesService
	Distributions             *DistributionsService
	Fields                    *FieldsService
	Groups                    *GroupsService
	Glossaries                *GlossariesService
	Labels                    *LabelsService
	Languages                 *LanguagesService
	MachineTranslationEngines *MachineTranslationEnginesService
	Notifications             *NotificationsService
	OrganizationWebhooks      *OrganizationWebhooksService
	Projects                  *ProjectsService
	Reports                   *ReportsService
	Screenshots               *ScreenshotsService
	SecurityLogs              *SecurityLogsService
	SourceFiles               *SourceFilesService
	SourceStrings             *SourceStringsService
	Storages                  *StorageService
	StringComments            *StringCommentsService
	StringTranslations        *StringTranslationsService
	Tasks                     *TasksService
	Teams                     *TeamsService
	TranslationMemory         *TranslationMemoryService
	TranslationStatus         *TranslationStatusService
	Translations              *TranslationsService
	Users                     *UsersService
	Vendors                   *VendorsService
	Webhooks                  *WebhooksService
	Workflows                 *WorkflowsService
}

// NewClient creates a new Crowdin API client with provided options (ex. WithHTTPClient).
// `token` is a personal access token. To create a client, use the following code:
//
//	client, err := crowdin.NewClient("token")
//
// To create an Enterprise client, use the WithOrganization() option as below:
//
//	client, err := crowdin.NewClient("token", crowdin.WithOrganization("organization"))
func NewClient(token string, opts ...ClientOption) (*Client, error) {
	if token == "" {
		return nil, errors.New("token cannot be empty")
	}
	u, _ := url.Parse(baseURL)
	c := &Client{
		token:     token,
		baseURL:   u,
		userAgent: userAgent,
	}

	for _, opt := range opts {
		if err := opt(c); err != nil {
			return nil, err
		}
	}

	if c.httpClient == nil {
		c.httpClient = http.DefaultClient
	}
	if c.organization != "" {
		c.baseURL.Host = fmt.Sprintf("%s.%s", c.organization, c.baseURL.Host)
	}

	// Initialize services.
	c.AI = &AIService{client: c}
	c.Applications = &ApplicationsService{client: c}
	c.Branches = &BranchesService{client: c}
	c.Bundles = &BundlesService{client: c}
	c.Dictionaries = &DictionariesService{client: c}
	c.Distributions = &DistributionsService{client: c}
	c.Fields = &FieldsService{client: c}
	c.Groups = &GroupsService{client: c}
	c.Glossaries = &GlossariesService{client: c}
	c.Labels = &LabelsService{client: c}
	c.Languages = &LanguagesService{client: c}
	c.MachineTranslationEngines = &MachineTranslationEnginesService{client: c}
	c.Notifications = &NotificationsService{client: c}
	c.OrganizationWebhooks = &OrganizationWebhooksService{client: c}
	c.Projects = &ProjectsService{client: c}
	c.Reports = &ReportsService{client: c}
	c.Screenshots = &ScreenshotsService{client: c}
	c.SecurityLogs = &SecurityLogsService{client: c}
	c.SourceFiles = &SourceFilesService{client: c}
	c.SourceStrings = &SourceStringsService{client: c}
	c.Storages = &StorageService{client: c}
	c.StringComments = &StringCommentsService{client: c}
	c.StringTranslations = &StringTranslationsService{client: c}
	c.Tasks = &TasksService{client: c}
	c.Teams = &TeamsService{client: c}
	c.TranslationMemory = &TranslationMemoryService{client: c}
	c.TranslationStatus = &TranslationStatusService{client: c}
	c.Translations = &TranslationsService{client: c}
	c.Users = &UsersService{client: c}
	c.Vendors = &VendorsService{client: c}
	c.Webhooks = &WebhooksService{client: c}
	c.Workflows = &WorkflowsService{client: c}

	c.GraphQL = &GraphQL{client: c}

	return c, nil
}

// ClientOption is a client functional option.
type ClientOption func(*Client) error

// WithOrganization sets the organization name.
func WithOrganization(organization string) ClientOption {
	return func(c *Client) error {
		c.organization = organization
		return nil
	}
}

// WithHTTPClient sets the custom HTTP client. If not set http.DefaultClient will be used.
func WithHTTPClient(hc *http.Client) ClientOption {
	return func(c *Client) error {
		c.httpClient = hc
		return nil
	}
}

// RequestOption represents an option that can be used to modify a http.Request.
type RequestOption func(*http.Request) error

// Header sets a header as an option for the request.
func Header(key, value string) RequestOption {
	return func(r *http.Request) error {
		if value != "" {
			r.Header.Set(key, value)
		}
		return nil
	}
}

// newRequest creates a new HTTP request with the provided method, path and body (if any).
func (c *Client) newRequest(ctx context.Context, method, path string, body any, opts ...RequestOption) (*http.Request, error) {
	rel, err := url.Parse(path)
	if err != nil {
		return nil, err
	}
	u := c.baseURL.ResolveReference(rel)

	var buf io.ReadWriter
	if body != nil && body != "" {
		buf = new(bytes.Buffer)
		err := json.NewEncoder(buf).Encode(body)
		if err != nil {
			return nil, err
		}
	}
	req, err := http.NewRequestWithContext(ctx, method, u.String(), buf)
	if err != nil {
		return nil, err
	}

	req.Header.Set("User-Agent", c.userAgent)
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", c.token))
	if body != nil && body != "" {
		req.Header.Set("Content-Type", "application/json")
	}

	for _, opt := range opts {
		if err := opt(req); err != nil {
			return nil, err
		}
	}

	return req, nil
}

// newUploadRequest creates an upload request.
func (c *Client) newUploadRequest(ctx context.Context, method, path string, body io.Reader, opts ...RequestOption) (*http.Request, error) {
	rel, err := url.Parse(path)
	if err != nil {
		return nil, err
	}
	u := c.baseURL.ResolveReference(rel)

	req, err := http.NewRequestWithContext(ctx, method, u.String(), body)
	if err != nil {
		return nil, err
	}

	req.Header.Set("User-Agent", c.userAgent)
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", c.token))

	for _, opt := range opts {
		if err := opt(req); err != nil {
			return nil, err
		}
	}

	if req.Header.Get("Content-Type") == "" {
		req.Header.Set("Content-Type", "application/octet-stream")
	}

	return req, nil
}

// do sends an API request and returns the API response.
func (c *Client) do(r *http.Request, v any) (*Response, error) {
	resp, err := c.httpClient.Do(r)
	if err != nil {
		return nil, err
	}

	defer func() {
		if rerr := resp.Body.Close(); err == nil {
			err = rerr
		}
	}()

	response := &Response{Response: resp}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return response, fmt.Errorf("client: error reading response body: %w", err)
	}

	if resp.StatusCode == http.StatusNoContent {
		return response, nil
	}

	if code := resp.StatusCode; code >= http.StatusBadRequest && code <= 599 {
		return response, handleErrorResponse(r, resp, body)
	}

	if r.Method == http.MethodGet || r.Method == http.MethodPost {
		if err = response.populatePagination(body); err != nil {
			return response, fmt.Errorf("client: error parsing pagination: %w", err)
		}
	}

	if v != nil {
		err = json.NewDecoder(bytes.NewReader(body)).Decode(v)
	}

	return response, err
}

// RequestValidator is an interface for validating requests.
type RequestValidator interface {
	Validate() error
}

// Post makes a POST request to the specified path.
func (c *Client) Post(ctx context.Context, path string, body, v any, opts ...RequestOption) (*Response, error) {
	if body == nil {
		return nil, errors.New("body cannot be nil")
	}
	if rv, ok := body.(RequestValidator); ok {
		if err := rv.Validate(); err != nil {
			return nil, err
		}
	}

	req, err := c.newRequest(ctx, "POST", path, body, opts...)
	if err != nil {
		return nil, err
	}

	return c.do(req, v)
}

// Upload makes a POST request to the specified path with a file.
func (c *Client) Upload(ctx context.Context, path string, file io.Reader, v any, opts ...RequestOption) (*Response, error) {
	req, err := c.newUploadRequest(ctx, "POST", path, file, opts...)
	if err != nil {
		return nil, err
	}

	return c.do(req, v)
}

// Patch makes a PATCH request to the specified path.
func (c *Client) Patch(ctx context.Context, path string, body, v any) (*Response, error) {
	// Body can be a single object or a slice of objects.
	// Check if the body is a slice of RequestValidator and validate each item.
	switch body := body.(type) {
	case []*model.UpdateRequest:
		if len(body) == 0 {
			return nil, errors.New("body cannot be empty or nil")
		}
		for _, req := range body {
			if err := req.Validate(); err != nil {
				return nil, err
			}
		}
	case RequestValidator:
		if err := body.Validate(); err != nil {
			return nil, err
		}
	}

	req, err := c.newRequest(ctx, "PATCH", path, body)
	if err != nil {
		return nil, err
	}

	return c.do(req, v)
}

// Put makes a PUT request to the specified path.
func (c *Client) Put(ctx context.Context, path string, body, v any) (*Response, error) {
	if rv, ok := body.(RequestValidator); ok {
		if err := rv.Validate(); err != nil {
			return nil, err
		}
	}

	req, err := c.newRequest(ctx, "PUT", path, body)
	if err != nil {
		return nil, err
	}

	return c.do(req, v)
}

// ListOptionsProvider interface provides query parameters for list methods.
// The Values method returns the url.Values representation of the optional
// query parameters and a boolean indicating whether they are set.
type ListOptionsProvider interface {
	Values() (url.Values, bool)
}

// Get makes a GET request to the specified path.
func (c *Client) Get(ctx context.Context, path string, params ListOptionsProvider, v any) (*Response, error) {
	if params != nil {
		if opts, ok := params.Values(); ok {
			path += "?" + opts.Encode()
		}
	}

	req, err := c.newRequest(ctx, "GET", path, nil)
	if err != nil {
		return nil, err
	}

	return c.do(req, v)
}

// Delete makes a DELETE request to the specified path.
// If the provided parameter v is not nil, the result will be unmarshaled into it.
func (c *Client) Delete(ctx context.Context, path string, v any) (*Response, error) {
	req, err := c.newRequest(ctx, "DELETE", path, nil)
	if err != nil {
		return nil, err
	}

	return c.do(req, v)
}

// handleErrorResponse checks the API response for errors and returns
// them if they are found.
func handleErrorResponse(res *http.Request, resp *http.Response, body []byte) error {
	errorResp := determineErrorType(res, resp, body)
	if err := json.Unmarshal(body, errorResp); err != nil {
		return fmt.Errorf("client: server returned %d status code", resp.StatusCode)
	}
	return errorResp
}

func determineErrorType(res *http.Request, resp *http.Response, body []byte) error {
	switch resp.StatusCode {
	case http.StatusBadRequest:
		if strings.Contains(res.URL.Path, "graphql") {
			return &model.GraphQLErrorResponse{}
		}

		var b map[string]any
		if err := json.Unmarshal(body, &b); err != nil {
			return err
		}

		if errors, ok := b["errors"].([]any); ok && len(errors) > 0 {
			if firstErr, ok := errors[0].(map[string]any); ok {
				if _, ok := firstErr["index"]; ok {
					return &model.BatchValidationErrorResponse{Response: resp, Status: resp.StatusCode}
				}
			}
			return &model.ValidationErrorResponse{Response: resp, Status: resp.StatusCode}
		}
		return fmt.Errorf("client: error while determining error type")
	default:
		return &model.ErrorResponse{Response: resp}
	}
}

// Response is a Crowdin response that wraps http.Response.
type Response struct {
	*http.Response

	Pagination model.Pagination
}

// populatePagination reads the pagination information from the response
// body and sets it to the Response struct.
func (r *Response) populatePagination(body []byte) error {
	p := new(model.PaginationResponse)
	if err := json.Unmarshal(body, p); err != nil {
		return err
	}
	r.Pagination = p.Pagination
	return nil
}

// ToPtr is a helper function that returns a pointer
// to the provided input.
func ToPtr[T any](v T) *T {
	return &v
}
