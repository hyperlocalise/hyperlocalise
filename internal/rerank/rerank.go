// Package rerank orders candidate passages by relevance to a query.
//
// It calls the Cohere-compatible rerank endpoint on Vercel AI Gateway with
// voyage/rerank-3-lite.
package rerank

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
	"time"
	"unicode/utf8"
)

const (
	// Model is the AI Gateway reranking model.
	Model = "voyage/rerank-3-lite"
	// MaxDocuments bounds one request well below the provider limit of 1,000.
	MaxDocuments = 64

	defaultBaseURL   = "https://ai-gateway.vercel.sh/v1"
	defaultTimeout   = 10 * time.Second
	maxResponseBytes = 1 << 20
	rerankPath       = "/rerank"
	maxErrorBody     = 300
)

var (
	ErrInvalidInput    = errors.New("invalid rerank input")
	ErrInvalidResponse = errors.New("invalid rerank response")
)

// Config is explicit connection state. The package reads no environment.
type Config struct {
	BaseURL    string
	APIKey     string
	HTTPClient *http.Client
}

// Client is safe for concurrent use.
type Client struct {
	baseURL    string
	apiKey     string
	httpClient *http.Client
}

// New validates explicit configuration.
func New(cfg Config) (*Client, error) {
	apiKey := strings.TrimSpace(cfg.APIKey)
	if apiKey == "" {
		return nil, ErrInvalidInput
	}
	baseURL := strings.TrimRight(strings.TrimSpace(cfg.BaseURL), "/")
	if baseURL == "" {
		baseURL = defaultBaseURL
	}
	httpClient := cfg.HTTPClient
	if httpClient == nil {
		httpClient = &http.Client{Timeout: defaultTimeout}
	}
	return &Client{baseURL: baseURL, apiKey: apiKey, httpClient: httpClient}, nil
}

type requestBody struct {
	Model     string   `json:"model"`
	Query     string   `json:"query"`
	Documents []string `json:"documents"`
	TopN      int      `json:"top_n"`
}

type responseBody struct {
	Results []struct {
		Index          int     `json:"index"`
		RelevanceScore float64 `json:"relevance_score"`
	} `json:"results"`
}

// Rerank returns up to topN indexes into documents, most relevant first.
func (c *Client) Rerank(ctx context.Context, query string, documents []string, topN int) ([]int, error) {
	query = strings.TrimSpace(query)
	if query == "" || !utf8.ValidString(query) || len(documents) == 0 || len(documents) > MaxDocuments || topN < 1 {
		return nil, ErrInvalidInput
	}
	for _, doc := range documents {
		if strings.TrimSpace(doc) == "" || !utf8.ValidString(doc) {
			return nil, ErrInvalidInput
		}
	}
	topN = min(topN, len(documents))
	payload, err := json.Marshal(requestBody{Model: Model, Query: query, Documents: documents, TopN: topN})
	if err != nil {
		return nil, fmt.Errorf("marshal rerank request: %w", err)
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+rerankPath, bytes.NewReader(payload))
	if err != nil {
		return nil, fmt.Errorf("build rerank request: %w", err)
	}
	httpReq.Header.Set("Authorization", "Bearer "+c.apiKey)
	httpReq.Header.Set("Content-Type", "application/json")
	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer func() { _ = resp.Body.Close() }()
	body, err := io.ReadAll(io.LimitReader(resp.Body, maxResponseBytes+1))
	if err != nil {
		return nil, fmt.Errorf("read rerank response: %w", err)
	}
	if len(body) > maxResponseBytes {
		return nil, ErrInvalidResponse
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("rerank: AI Gateway HTTP %d: %s", resp.StatusCode, truncate(strings.TrimSpace(string(body)), maxErrorBody))
	}
	var parsed responseBody
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, ErrInvalidResponse
	}
	sort.SliceStable(parsed.Results, func(i, j int) bool {
		return parsed.Results[i].RelevanceScore > parsed.Results[j].RelevanceScore
	})
	order := make([]int, 0, topN)
	seen := make(map[int]bool, topN)
	for _, result := range parsed.Results {
		if result.Index < 0 || result.Index >= len(documents) || seen[result.Index] {
			return nil, ErrInvalidResponse
		}
		seen[result.Index] = true
		order = append(order, result.Index)
		if len(order) == topN {
			break
		}
	}
	if len(order) == 0 {
		return nil, ErrInvalidResponse
	}
	return order, nil
}

func truncate(value string, max int) string {
	if len(value) <= max {
		return value
	}
	return value[:max] + "..."
}
