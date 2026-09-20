package autumn

import (
	"context"
)

// TrackRequest is a balances.track call.
type TrackRequest struct {
	CustomerID     string
	FeatureID      string
	Value          float64
	IdempotencyKey string
	Properties     map[string]any
}

type trackBody struct {
	CustomerID     string         `json:"customer_id"`
	FeatureID      string         `json:"feature_id"`
	Value          float64        `json:"value"`
	IdempotencyKey string         `json:"idempotency_key"`
	Properties     map[string]any `json:"properties,omitempty"`
}

// Track calls POST /v1/balances.track.
func (c *Client) Track(ctx context.Context, req TrackRequest) error {
	return c.post(ctx, "/v1/balances.track", c.apiVersion, trackBody(req), nil)
}

// TrackTokensRequest mirrors autumn-js trackTokens / managed-ai-credit.ts.
type TrackTokensRequest struct {
	CustomerID        string
	FeatureID         string
	ModelID           string
	InputTokens       int
	OutputTokens      int
	CacheReadTokens   *int
	CacheWriteTokens  *int
	ReasoningTokens   *int
	AudioInputTokens  *int
	AudioOutputTokens *int
	Properties        map[string]any
}

type trackTokensBody struct {
	CustomerID        string         `json:"customer_id"`
	FeatureID         string         `json:"feature_id,omitempty"`
	ModelID           string         `json:"model_id"`
	InputTokens       int            `json:"input_tokens"`
	OutputTokens      int            `json:"output_tokens"`
	CacheReadTokens   *int           `json:"cache_read_tokens,omitempty"`
	CacheWriteTokens  *int           `json:"cache_write_tokens,omitempty"`
	ReasoningTokens   *int           `json:"reasoning_tokens,omitempty"`
	AudioInputTokens  *int           `json:"audio_input_tokens,omitempty"`
	AudioOutputTokens *int           `json:"audio_output_tokens,omitempty"`
	Properties        map[string]any `json:"properties,omitempty"`
}

// TrackTokens calls POST /v1/balances.track_tokens with API version 2.3.0.
func (c *Client) TrackTokens(ctx context.Context, req TrackTokensRequest) error {
	return c.post(ctx, "/v1/balances.track_tokens", tokensAPIVersion, trackTokensBody(req), nil)
}
