package dataforseo

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// Client is a low-level DataForSEO HTTP client. Higher-level feature methods are
// grouped on Labs, SERP, and AI sub-clients.
type Client struct {
	baseURL    string
	httpClient *http.Client
	authHeader string
	maxRetries int
}

// Labs exposes keyword research and domain overview endpoints.
type Labs struct {
	client *Client
}

// SERP exposes live and queued organic SERP endpoints.
type SERP struct {
	client *Client
}

// AI exposes LLM mentions (brand lookup) and LLM response (prompt explorer) endpoints.
type AI struct {
	client *httpClientBundle
}

type httpClientBundle struct {
	client *Client
}

// NewClient constructs a DataForSEO API client.
func NewClient(cfg Config) (*Client, error) {
	if err := cfg.validate(); err != nil {
		return nil, err
	}

	timeout := cfg.timeout()
	httpClient := &http.Client{Timeout: timeout}
	if httpClient.Transport == nil {
		httpClient.Transport = http.DefaultTransport
	}

	return &Client{
		baseURL:    cfg.baseURL(),
		httpClient: httpClient,
		authHeader: "Basic " + cfg.authorizationValue(),
		maxRetries: cfg.maxRetries(),
	}, nil
}

// NewClientWithHTTPClient is primarily for tests and custom transport wiring.
func NewClientWithHTTPClient(cfg Config, httpClient *http.Client) (*Client, error) {
	if httpClient == nil {
		return nil, fmt.Errorf("dataforseo: http client must not be nil")
	}
	client, err := NewClient(cfg)
	if err != nil {
		return nil, err
	}
	client.httpClient = httpClient
	return client, nil
}

func (c *Client) Labs() *Labs {
	return &Labs{client: c}
}

func (c *Client) SERP() *SERP {
	return &SERP{client: c}
}

func (c *Client) AI() *AI {
	return &AI{client: &httpClientBundle{client: c}}
}

type postOptions struct {
	okTaskStatusCode      int
	treatNoResultsAsEmpty bool
	allowNonRetryablePost bool
}

func (c *Client) post(ctx context.Context, path string, payload any, opts postOptions) (*Task, error) {
	response, err := c.postResponse(ctx, path, payload, opts)
	if err != nil {
		return nil, err
	}
	return assertResponse(response, path, assertTaskOptions{
		okTaskStatusCode:      opts.okTaskStatusCode,
		treatNoResultsAsEmpty: opts.treatNoResultsAsEmpty,
	})
}

func (c *Client) postResponse(ctx context.Context, path string, payload any, opts postOptions) (*APIResponse, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("dataforseo: marshal request: %w", err)
	}

	url := c.baseURL + path
	maxAttempts := c.maxRetries + 1
	if opts.allowNonRetryablePost {
		maxAttempts = 1
	}

	var lastErr error
	for attempt := 0; attempt < maxAttempts; attempt++ {
		if attempt > 0 {
			backoff := time.Duration(attempt) * 250 * time.Millisecond
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(backoff):
			}
		}

		req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
		if err != nil {
			return nil, fmt.Errorf("dataforseo: build request: %w", err)
		}
		req.Header.Set("Authorization", c.authHeader)
		req.Header.Set("Content-Type", "application/json")

		resp, err := c.httpClient.Do(req)
		if err != nil {
			lastErr = err
			continue
		}

		responseBody, readErr := io.ReadAll(resp.Body)
		_ = resp.Body.Close()
		if readErr != nil {
			lastErr = readErr
			continue
		}

		if resp.StatusCode >= 500 && attempt < maxAttempts-1 {
			lastErr = httpError(resp.StatusCode, path, string(responseBody))
			continue
		}
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			return nil, httpError(resp.StatusCode, path, string(responseBody))
		}

		var parsed APIResponse
		if err := json.Unmarshal(responseBody, &parsed); err != nil {
			return nil, newError(
				ErrorCodeInvalidResponse,
				"DataForSEO returned invalid JSON",
				path,
				resp.StatusCode,
			)
		}
		return &parsed, nil
	}

	if lastErr == nil {
		lastErr = fmt.Errorf("dataforseo: request failed")
	}
	return nil, lastErr
}

func (c *Client) getResponse(ctx context.Context, path string) (*APIResponse, error) {
	url := c.baseURL + path

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("dataforseo: build request: %w", err)
	}
	req.Header.Set("Authorization", c.authHeader)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, httpError(resp.StatusCode, path, string(responseBody))
	}

	var parsed APIResponse
	if err := json.Unmarshal(responseBody, &parsed); err != nil {
		return nil, newError(
			ErrorCodeInvalidResponse,
			"DataForSEO returned invalid JSON",
			path,
			resp.StatusCode,
		)
	}
	return &parsed, nil
}

func clampLimit(value, min, max int) int {
	if value < min {
		return min
	}
	if value > max {
		return max
	}
	return value
}

func clampSerpDepth(depth int) int {
	return clampLimit(depth, 10, 100)
}

func normalizeKeyword(keyword string) string {
	return strings.TrimSpace(keyword)
}
