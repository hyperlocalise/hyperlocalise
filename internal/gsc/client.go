package gsc

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"golang.org/x/oauth2"
)

// Client is a low-level Google Search Console HTTP client.
type Client struct {
	tokenSource          oauth2.TokenSource
	httpClient           *http.Client
	webmastersBaseURL    string
	urlInspectionBaseURL string
	userInfoURL          string
}

// NewClient constructs a Search Console API client.
func NewClient(cfg Config) (*Client, error) {
	if err := cfg.validate(); err != nil {
		return nil, err
	}
	return &Client{
		tokenSource:          cfg.TokenSource,
		httpClient:           cfg.httpClient(),
		webmastersBaseURL:    cfg.webmastersBaseURL(),
		urlInspectionBaseURL: cfg.urlInspectionBaseURL(),
		userInfoURL:          cfg.userInfoURL(),
	}, nil
}

// NewClientWithHTTPClient is primarily for tests and custom transport wiring.
func NewClientWithHTTPClient(cfg Config, httpClient *http.Client) (*Client, error) {
	if httpClient == nil {
		return nil, fmt.Errorf("gsc: http client must not be nil")
	}
	client, err := NewClient(cfg)
	if err != nil {
		return nil, err
	}
	client.httpClient = httpClient
	return client, nil
}

func (c *Client) request(ctx context.Context, method, url string, body any, out any) error {
	var payload io.Reader
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("gsc: marshal request: %w", err)
		}
		payload = bytes.NewReader(encoded)
	}

	req, err := http.NewRequestWithContext(ctx, method, url, payload)
	if err != nil {
		return fmt.Errorf("gsc: build request: %w", err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	token, err := c.tokenSource.Token()
	if err != nil {
		return newError(
			ErrorCodeAuthFailed,
			"Could not mint a Search Console access token (grant revoked or expired).",
			req.URL.Path,
			0,
			err.Error(),
		)
	}
	if strings.TrimSpace(token.AccessToken) == "" {
		return newError(
			ErrorCodeAuthFailed,
			"Search Console returned no access token (grant revoked or expired).",
			req.URL.Path,
			0,
			"",
		)
	}
	req.Header.Set("Authorization", "Bearer "+token.AccessToken)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return httpError(resp.StatusCode, req.URL.Path, string(responseBody))
	}
	if out == nil {
		return nil
	}
	if err := json.Unmarshal(responseBody, out); err != nil {
		return newError(
			ErrorCodeAPI,
			"Search Console returned invalid JSON",
			req.URL.Path,
			resp.StatusCode,
			string(responseBody),
		)
	}
	return nil
}

func encodeSiteURL(siteURL string) string {
	// Match encodeURIComponent so both sc-domain: and URL-prefix properties work.
	return strings.ReplaceAll(url.QueryEscape(siteURL), "+", "%20")
}
