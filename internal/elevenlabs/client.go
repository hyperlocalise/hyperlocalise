package elevenlabs

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
)

// Client is a low-level ElevenLabs HTTP client.
type Client struct {
	baseURL    string
	apiKey     string
	httpClient *http.Client

	voicesMu sync.Mutex
	voices   map[string]string
}

// NewClient constructs an ElevenLabs API client.
func NewClient(cfg Config) (*Client, error) {
	if err := cfg.validate(); err != nil {
		return nil, err
	}
	return &Client{
		baseURL:    cfg.baseURL(),
		apiKey:     strings.TrimSpace(cfg.APIKey),
		httpClient: cfg.httpClient(),
		voices:     map[string]string{},
	}, nil
}

// NewClientWithHTTPClient is primarily for tests and custom transport wiring.
func NewClientWithHTTPClient(cfg Config, httpClient *http.Client) (*Client, error) {
	if httpClient == nil {
		return nil, fmt.Errorf("elevenlabs: http client must not be nil")
	}
	cfg.HTTPClient = httpClient
	return NewClient(cfg)
}

func (c *Client) do(
	ctx context.Context,
	method, path string,
	query url.Values,
	payload any,
) ([]byte, string, error) {
	var body io.Reader
	if payload != nil {
		encoded, err := json.Marshal(payload)
		if err != nil {
			return nil, "", fmt.Errorf("elevenlabs: marshal request: %w", err)
		}
		body = bytes.NewReader(encoded)
	}

	endpoint := c.baseURL + path
	if encoded := query.Encode(); encoded != "" {
		endpoint += "?" + encoded
	}

	req, err := http.NewRequestWithContext(ctx, method, endpoint, body)
	if err != nil {
		return nil, "", fmt.Errorf("elevenlabs: build request: %w", err)
	}
	req.Header.Set("xi-api-key", c.apiKey)
	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, "", err
	}
	defer func() { _ = resp.Body.Close() }()

	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, "", err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, "", httpError(resp.StatusCode, path, string(responseBody))
	}
	return responseBody, resp.Header.Get("Content-Type"), nil
}

func (c *Client) doJSON(ctx context.Context, method, path string, payload, out any) error {
	body, _, err := c.do(ctx, method, path, nil, payload)
	if err != nil {
		return err
	}
	if out == nil {
		return nil
	}
	if err := json.Unmarshal(body, out); err != nil {
		return newError(ErrorCodeInvalidResponse, "ElevenLabs returned invalid JSON", path, 0)
	}
	return nil
}

func audioContentType(value, fallback string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" || strings.Contains(trimmed, "json") {
		return fallback
	}
	return trimmed
}
