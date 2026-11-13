package aisdk

import (
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"
)

const (
	defaultEvaluateBaseURL = "https://ai-gateway.vercel.sh/v4/ai"
	defaultAPIKeyEnv       = "AI_GATEWAY_API_KEY"
	defaultEvaluateBaseEnv = "AI_GATEWAY_EVALUATE_BASE_URL"
	defaultRequestTimeout  = 30 * time.Second
	defaultMaxRetries      = 2
	evaluatePath           = "/evaluation-model"
	gatewayProtocolVersion = "0.0.1"
	evaluationSpecVersion  = "4"
	userAgent              = "hyperlocalise-aisdk ai/7.0.105 ai-sdk/gateway/4.0.85"
)

// Client calls AI Gateway evaluation models using the AI SDK v4 protocol.
type Client struct {
	baseURL    string
	apiKey     string
	httpClient *http.Client
	maxRetries int
	headers    map[string]string
}

// Option configures a Client.
type Option func(*Client)

// WithBaseURL sets the Gateway evaluation base URL, including the /v4/ai
// prefix. Defaults to https://ai-gateway.vercel.sh/v4/ai.
func WithBaseURL(baseURL string) Option {
	return func(c *Client) {
		c.baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	}
}

// WithAPIKey sets the AI Gateway API key.
func WithAPIKey(apiKey string) Option {
	return func(c *Client) {
		c.apiKey = strings.TrimSpace(apiKey)
	}
}

// WithHTTPClient replaces the default HTTP client.
func WithHTTPClient(httpClient *http.Client) Option {
	return func(c *Client) {
		c.httpClient = httpClient
	}
}

// WithMaxRetries sets the default retry count for transient failures.
func WithMaxRetries(maxRetries int) Option {
	return func(c *Client) {
		c.maxRetries = maxRetries
	}
}

// WithHeaders adds headers sent on every request.
func WithHeaders(headers map[string]string) Option {
	return func(c *Client) {
		c.headers = headers
	}
}

// NewClient constructs an evaluation client. Missing API key and base URL
// fall back to AI_GATEWAY_API_KEY and AI_GATEWAY_EVALUATE_BASE_URL.
func NewClient(opts ...Option) (*Client, error) {
	client := &Client{
		maxRetries: defaultMaxRetries,
	}
	for _, opt := range opts {
		opt(client)
	}
	if client.apiKey == "" {
		client.apiKey = strings.TrimSpace(os.Getenv(defaultAPIKeyEnv))
	}
	if client.baseURL == "" {
		client.baseURL = strings.TrimRight(strings.TrimSpace(os.Getenv(defaultEvaluateBaseEnv)), "/")
	}
	if client.baseURL == "" {
		client.baseURL = defaultEvaluateBaseURL
	}
	if client.apiKey == "" {
		return nil, invalidArgument("API key is required (" + defaultAPIKeyEnv + ")")
	}
	if client.httpClient == nil {
		client.httpClient = &http.Client{Timeout: defaultRequestTimeout}
	}
	if client.maxRetries < 0 {
		client.maxRetries = 0
	}
	return client, nil
}

func (c *Client) evaluateURL() string {
	return c.baseURL + evaluatePath
}

func (c *Client) requestHeaders(modelID string, extra map[string]string) http.Header {
	headers := http.Header{}
	headers.Set("Authorization", "Bearer "+c.apiKey)
	headers.Set("Content-Type", "application/json")
	headers.Set("User-Agent", userAgent)
	headers.Set("ai-gateway-protocol-version", gatewayProtocolVersion)
	headers.Set("ai-gateway-auth-method", "api-key")
	headers.Set("ai-evaluation-model-specification-version", evaluationSpecVersion)
	headers.Set("ai-model-id", modelID)
	for key, value := range c.headers {
		if strings.TrimSpace(key) == "" {
			continue
		}
		headers.Set(key, value)
	}
	for key, value := range extra {
		if strings.TrimSpace(key) == "" {
			continue
		}
		headers.Set(key, value)
	}
	return headers
}

func retryAttempts(maxRetries int) int {
	if maxRetries < 0 {
		return 1
	}
	return maxRetries + 1
}

func formatRetryError(err error, attempts int) error {
	if attempts <= 1 {
		return err
	}
	return fmt.Errorf("%w (after %d attempts)", err, attempts)
}
