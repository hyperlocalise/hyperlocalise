package exa

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

const (
	pathSearch   = "/search"
	pathContents = "/contents"
	pathAnswer   = "/answer"
)

// Client is a low-level Exa HTTP client.
type Client struct {
	baseURL    string
	apiKey     string
	httpClient *http.Client
}

// NewClient constructs an Exa API client.
func NewClient(cfg Config) (*Client, error) {
	if err := cfg.validate(); err != nil {
		return nil, err
	}
	return &Client{
		baseURL:    cfg.baseURL(),
		apiKey:     strings.TrimSpace(cfg.APIKey),
		httpClient: cfg.httpClient(),
	}, nil
}

// NewClientWithHTTPClient is primarily for tests and custom transport wiring.
func NewClientWithHTTPClient(cfg Config, httpClient *http.Client) (*Client, error) {
	if httpClient == nil {
		return nil, fmt.Errorf("exa: http client must not be nil")
	}
	cfg.HTTPClient = httpClient
	return NewClient(cfg)
}

// Search runs POST /search and returns ranked pages, optional contents, and
// synthesized output when OutputSchema is set.
func (c *Client) Search(ctx context.Context, req SearchRequest) (SearchResponse, error) {
	if strings.TrimSpace(req.Query) == "" {
		return SearchResponse{}, newError(ErrorCodeValidation, "query is required", pathSearch, 0)
	}
	if req.UserLocation != nil && req.UserLocation.IsZero() {
		req.UserLocation = nil
	}
	var out SearchResponse
	if err := c.doJSON(ctx, http.MethodPost, pathSearch, req, &out); err != nil {
		return SearchResponse{}, err
	}
	return out, nil
}

// GetContents runs POST /contents for known URLs or document IDs.
func (c *Client) GetContents(ctx context.Context, req ContentsRequest) (ContentsResponse, error) {
	if len(req.URLs) == 0 && len(req.IDs) == 0 {
		return ContentsResponse{}, newError(ErrorCodeValidation, "urls or ids are required", pathContents, 0)
	}
	var out ContentsResponse
	if err := c.doJSON(ctx, http.MethodPost, pathContents, req, &out); err != nil {
		return ContentsResponse{}, err
	}
	return out, nil
}

// Answer runs POST /answer and returns a cited answer. With OutputSchema the
// Answer field is structured JSON instead of a string.
func (c *Client) Answer(ctx context.Context, req AnswerRequest) (AnswerResponse, error) {
	if strings.TrimSpace(req.Query) == "" {
		return AnswerResponse{}, newError(ErrorCodeValidation, "query is required", pathAnswer, 0)
	}
	if req.UserLocation != nil && req.UserLocation.IsZero() {
		req.UserLocation = nil
	}
	var out AnswerResponse
	if err := c.doJSON(ctx, http.MethodPost, pathAnswer, req, &out); err != nil {
		return AnswerResponse{}, err
	}
	return out, nil
}

func (c *Client) doJSON(ctx context.Context, method, path string, payload, out any) error {
	encoded, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("exa: marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, bytes.NewReader(encoded))
	if err != nil {
		return fmt.Errorf("exa: build request: %w", err)
	}
	req.Header.Set("x-api-key", c.apiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer func() { _ = resp.Body.Close() }()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return httpError(
			resp.StatusCode,
			path,
			string(body),
			resp.Header.Get("x-request-id"),
			resp.Header.Get("Retry-After"),
		)
	}
	if out == nil {
		return nil
	}
	if err := json.Unmarshal(body, out); err != nil {
		return newError(ErrorCodeInvalidResponse, "Exa returned invalid JSON", path, resp.StatusCode)
	}
	return nil
}
