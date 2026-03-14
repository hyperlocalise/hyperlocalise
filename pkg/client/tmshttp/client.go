package tmshttp

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	openapi "github.com/quiet-circles/hyperlocalise/pkg/api/openapi"
)

type Client struct {
	baseURL    string
	httpClient *http.Client
}

func New(baseURL string, httpClient *http.Client) *Client {
	if httpClient == nil {
		httpClient = http.DefaultClient
	}

	return &Client{
		baseURL:    baseURL,
		httpClient: httpClient,
	}
}

func (c *Client) ListProjects(ctx context.Context) ([]openapi.Project, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+openapi.ProjectsPath, http.NoBody)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("do request: %w", err)
	}
	defer resp.Body.Close()

	var payload openapi.ProjectListResponse
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}

	return payload.Items, nil
}
