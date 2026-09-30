package autumn

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
	defaultBaseURL    = "https://api.useautumn.com"
	defaultAPIVersion = "2.2.0"
	// tokensAPIVersion matches apps/hyperlocalise-web managed-ai-credit.ts.
	tokensAPIVersion = "2.3.0"

	// QueriesBoard is the Autumn feature ID for issue-sheet / Queries.
	QueriesBoard = "queries-board"
)

// HTTPDoer is the subset of http.Client used by Client.
type HTTPDoer interface {
	Do(req *http.Request) (*http.Response, error)
}

// Config configures an Autumn API client.
type Config struct {
	// SecretKey is the Autumn API secret (AUTUMN_API_KEY). APIKey is an alias.
	SecretKey  string
	APIKey     string
	BaseURL    string
	APIVersion string
	HTTPClient HTTPDoer
}

// Client talks to the Autumn balances API.
type Client struct {
	secretKey  string
	baseURL    string
	apiVersion string
	http       HTTPDoer
}

// NewClient constructs a Client. An empty secret key is allowed so callers can
// fail closed at Check / IsBooleanFeatureEnabled time (matching TypeScript).
func NewClient(cfg Config) (*Client, error) {
	secret := strings.TrimSpace(cfg.SecretKey)
	if secret == "" {
		secret = strings.TrimSpace(cfg.APIKey)
	}
	baseURL := strings.TrimRight(strings.TrimSpace(cfg.BaseURL), "/")
	if baseURL == "" {
		baseURL = defaultBaseURL
	}
	apiVersion := strings.TrimSpace(cfg.APIVersion)
	if apiVersion == "" {
		apiVersion = defaultAPIVersion
	}
	httpClient := cfg.HTTPClient
	if httpClient == nil {
		httpClient = http.DefaultClient
	}
	return &Client{
		secretKey:  secret,
		baseURL:    baseURL,
		apiVersion: apiVersion,
		http:       httpClient,
	}, nil
}

// HasSecretKey reports whether the client has a non-empty API key.
func (c *Client) HasSecretKey() bool {
	return c != nil && c.secretKey != ""
}

type apiError struct {
	StatusCode int
	Body       string
}

func (e *apiError) Error() string {
	if e.Body == "" {
		return fmt.Sprintf("autumn: HTTP %d", e.StatusCode)
	}
	return fmt.Sprintf("autumn: HTTP %d: %s", e.StatusCode, e.Body)
}

func (c *Client) post(ctx context.Context, path, apiVersion string, payload any, out any) error {
	if c == nil {
		return fmt.Errorf("autumn: nil client")
	}
	if c.secretKey == "" {
		return fmt.Errorf("autumn: missing API key")
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+path, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.secretKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-version", apiVersion)
	res, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer func() { _ = res.Body.Close() }()
	raw, err := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if err != nil {
		return err
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return &apiError{StatusCode: res.StatusCode, Body: strings.TrimSpace(string(raw))}
	}
	if out == nil || len(raw) == 0 {
		return nil
	}
	if err := json.Unmarshal(raw, out); err != nil {
		return fmt.Errorf("autumn: decode response: %w", err)
	}
	return nil
}
