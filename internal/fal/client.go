package fal

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// Client is a low-level fal.ai queue HTTP client.
type Client struct {
	queueBaseURL string
	apiKey       string
	httpClient   *http.Client
	pollInterval time.Duration
}

// QueuedRequest is the submit response from the fal queue.
type QueuedRequest struct {
	RequestID   string `json:"request_id"`
	StatusURL   string `json:"status_url"`
	ResponseURL string `json:"response_url"`
	CancelURL   string `json:"cancel_url"`
}

// Status is a queue status snapshot.
type Status struct {
	Status        string `json:"status"`
	RequestID     string `json:"request_id"`
	ResponseURL   string `json:"response_url"`
	StatusURL     string `json:"status_url"`
	CancelURL     string `json:"cancel_url"`
	QueuePosition int    `json:"queue_position"`
	Error         string `json:"error"`
}

// NewClient constructs a fal.ai queue client.
func NewClient(cfg Config) (*Client, error) {
	if err := cfg.validate(); err != nil {
		return nil, err
	}
	return &Client{
		queueBaseURL: cfg.queueBaseURL(),
		apiKey:       strings.TrimSpace(cfg.APIKey),
		httpClient:   cfg.httpClient(),
		pollInterval: cfg.pollInterval(),
	}, nil
}

// NewClientWithHTTPClient is primarily for tests and custom transport wiring.
func NewClientWithHTTPClient(cfg Config, httpClient *http.Client) (*Client, error) {
	if httpClient == nil {
		return nil, fmt.Errorf("fal: http client must not be nil")
	}
	cfg.HTTPClient = httpClient
	return NewClient(cfg)
}

// Submit enqueues a model request and returns poll URLs.
func (c *Client) Submit(ctx context.Context, endpointID string, input any) (QueuedRequest, error) {
	path, err := normalizeEndpoint(endpointID)
	if err != nil {
		return QueuedRequest{}, err
	}
	body, err := c.do(ctx, http.MethodPost, c.queueBaseURL+"/"+path, input)
	if err != nil {
		return QueuedRequest{}, err
	}
	var queued QueuedRequest
	if err := json.Unmarshal(body, &queued); err != nil || strings.TrimSpace(queued.RequestID) == "" {
		return QueuedRequest{}, newError(ErrorCodeInvalidResponse, "fal returned an invalid submit response", path, 0)
	}
	return queued, nil
}

// Status polls one queue status URL or reconstructs it from the endpoint and request id.
func (c *Client) Status(ctx context.Context, queued QueuedRequest, endpointID string) (Status, error) {
	target, err := c.resolvedURL(queued.StatusURL, endpointID, queued.RequestID, "/status")
	if err != nil {
		return Status{}, err
	}
	body, err := c.do(ctx, http.MethodGet, target, nil)
	if err != nil {
		return Status{}, err
	}
	var status Status
	if err := json.Unmarshal(body, &status); err != nil {
		return Status{}, newError(ErrorCodeInvalidResponse, "fal returned invalid status JSON", target, 0)
	}
	if strings.TrimSpace(status.RequestID) == "" {
		status.RequestID = queued.RequestID
	}
	if strings.TrimSpace(status.ResponseURL) == "" {
		status.ResponseURL = queued.ResponseURL
	}
	return status, nil
}

// Result fetches the completed payload for a queued request.
func (c *Client) Result(ctx context.Context, queued QueuedRequest, endpointID string) (json.RawMessage, error) {
	target, err := c.resolvedURL(queued.ResponseURL, endpointID, queued.RequestID, "")
	if err != nil {
		return nil, err
	}
	return c.do(ctx, http.MethodGet, target, nil)
}

// Run submits a request, waits until it completes, and returns the result JSON.
func (c *Client) Run(ctx context.Context, endpointID string, input any) (json.RawMessage, error) {
	queued, err := c.Submit(ctx, endpointID, input)
	if err != nil {
		return nil, err
	}
	for {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		status, err := c.Status(ctx, queued, endpointID)
		if err != nil {
			return nil, err
		}
		switch strings.ToUpper(strings.TrimSpace(status.Status)) {
		case "COMPLETED":
			if message := strings.TrimSpace(status.Error); message != "" {
				return nil, newError(ErrorCodeUpstream, message, endpointID, 0)
			}
			queued.ResponseURL = firstNonEmpty(status.ResponseURL, queued.ResponseURL)
			return c.Result(ctx, queued, endpointID)
		case "FAILED", "CANCELLED", "CANCELED":
			message := strings.TrimSpace(status.Error)
			if message == "" {
				message = "fal request " + strings.ToLower(status.Status)
			}
			return nil, newError(ErrorCodeUpstream, message, endpointID, 0)
		}
		timer := time.NewTimer(c.pollInterval)
		select {
		case <-ctx.Done():
			timer.Stop()
			return nil, ctx.Err()
		case <-timer.C:
		}
	}
}

func (c *Client) do(ctx context.Context, method, rawURL string, payload any) ([]byte, error) {
	var body io.Reader
	if payload != nil {
		encoded, err := json.Marshal(payload)
		if err != nil {
			return nil, fmt.Errorf("fal: marshal request: %w", err)
		}
		body = bytes.NewReader(encoded)
	}
	req, err := http.NewRequestWithContext(ctx, method, rawURL, body)
	if err != nil {
		return nil, fmt.Errorf("fal: build request: %w", err)
	}
	req.Header.Set("Authorization", "Key "+c.apiKey)
	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer func() { _ = resp.Body.Close() }()
	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, httpError(resp.StatusCode, req.URL.Path, string(responseBody))
	}
	return responseBody, nil
}

func (c *Client) resolvedURL(rawURL, endpointID, requestID, suffix string) (string, error) {
	if trimmed := strings.TrimSpace(rawURL); trimmed != "" {
		if err := c.validateQueueURL(trimmed); err != nil {
			return "", err
		}
		return trimmed, nil
	}
	path, err := ownerAppPath(endpointID)
	if err != nil {
		return "", err
	}
	if strings.TrimSpace(requestID) == "" {
		return "", newError(ErrorCodeValidation, "request id is required", endpointID, 0)
	}
	target := c.queueBaseURL + "/" + path + "/requests/" + url.PathEscape(requestID)
	if suffix != "" {
		target += suffix
	}
	return target, nil
}

func (c *Client) validateQueueURL(rawURL string) error {
	parsed, err := url.Parse(rawURL)
	if err != nil || parsed.Host == "" {
		return newError(ErrorCodeValidation, "fal returned an invalid poll URL", rawURL, 0)
	}
	allowed, err := url.Parse(c.queueBaseURL)
	if err != nil {
		return newError(ErrorCodeValidation, "fal queue base URL is invalid", c.queueBaseURL, 0)
	}
	if !strings.EqualFold(parsed.Scheme, allowed.Scheme) || !strings.EqualFold(parsed.Host, allowed.Host) {
		return newError(ErrorCodeValidation, "fal poll URL host does not match the configured queue", parsed.Host, 0)
	}
	return nil
}

func normalizeEndpoint(endpointID string) (string, error) {
	trimmed := strings.Trim(strings.TrimSpace(endpointID), "/")
	if trimmed == "" {
		return "", newError(ErrorCodeValidation, "endpoint id is required", "", 0)
	}
	return trimmed, nil
}

func ownerAppPath(endpointID string) (string, error) {
	trimmed, err := normalizeEndpoint(endpointID)
	if err != nil {
		return "", err
	}
	parts := strings.Split(trimmed, "/")
	if len(parts) < 2 {
		return "", newError(ErrorCodeValidation, "endpoint id must include owner and app", endpointID, 0)
	}
	return parts[0] + "/" + parts[1], nil
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}
