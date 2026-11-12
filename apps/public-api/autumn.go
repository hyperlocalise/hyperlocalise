package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
)

const (
	autumnDefaultBaseURL    = "https://api.useautumn.com"
	autumnDefaultAPIVersion = "2.2.0"
	queriesBoardFeatureID   = "queries-board"
)

type autumnClient struct {
	secretKey  string
	baseURL    string
	apiVersion string
	http       *http.Client
}

func newAutumnClient(apiKey string) *autumnClient {
	key := strings.TrimSpace(apiKey)
	if key == "" {
		return nil
	}
	return &autumnClient{
		secretKey:  key,
		baseURL:    autumnDefaultBaseURL,
		apiVersion: autumnDefaultAPIVersion,
		http:       http.DefaultClient,
	}
}

func (c *autumnClient) queriesEnabled(ctx context.Context, organizationID string) bool {
	if c == nil || c.secretKey == "" {
		return false
	}
	organizationID = strings.TrimSpace(organizationID)
	if organizationID == "" {
		return false
	}
	body, err := json.Marshal(map[string]string{
		"customer_id": organizationID,
		"feature_id":  queriesBoardFeatureID,
	})
	if err != nil {
		return false
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/v1/balances.check", bytes.NewReader(body))
	if err != nil {
		return false
	}
	req.Header.Set("Authorization", "Bearer "+c.secretKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Api-Version", c.apiVersion)
	res, err := c.http.Do(req)
	if err != nil {
		return false
	}
	defer func() { _ = res.Body.Close() }()
	raw, err := io.ReadAll(io.LimitReader(res.Body, 64*1024))
	if err != nil || res.StatusCode < 200 || res.StatusCode >= 300 {
		return false
	}
	var parsed struct {
		Allowed bool `json:"allowed"`
	}
	if json.Unmarshal(raw, &parsed) != nil {
		return false
	}
	return parsed.Allowed
}

func (c *autumnClient) queriesEnabledForPermissions(ctx context.Context, organizationID string, permissions []string) entitlements {
	if !contains(permissions, "queries:read") {
		return entitlements{}
	}
	if c.queriesEnabled(ctx, organizationID) {
		return entitlements{Queries: true}
	}
	return entitlements{}
}

func autumnClientFromEnv(apiKey string) *autumnClient {
	return newAutumnClient(apiKey)
}

// errUsageCheckFailed means Autumn could not say whether the workspace has room.
var errUsageCheckFailed = errors.New("usage check failed")

// allowsUsage reports whether the workspace's balance for feature covers required units, as
// go-svc checks project creation.
func (c *autumnClient) allowsUsage(ctx context.Context, organizationID, featureID string, required float64) (bool, error) {
	body, err := json.Marshal(map[string]any{
		"customer_id":      organizationID,
		"feature_id":       featureID,
		"required_balance": required,
		"with_preview":     true,
	})
	if err != nil {
		return false, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/v1/balances.check", bytes.NewReader(body))
	if err != nil {
		return false, err
	}
	req.Header.Set("Authorization", "Bearer "+c.secretKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Api-Version", c.apiVersion)
	res, err := c.http.Do(req)
	if err != nil {
		return false, errUsageCheckFailed
	}
	defer func() { _ = res.Body.Close() }()
	raw, err := io.ReadAll(io.LimitReader(res.Body, 64*1024))
	if err != nil || res.StatusCode < 200 || res.StatusCode >= 300 {
		return false, errUsageCheckFailed
	}
	var parsed struct {
		Allowed bool `json:"allowed"`
	}
	if json.Unmarshal(raw, &parsed) != nil {
		return false, errUsageCheckFailed
	}
	return parsed.Allowed, nil
}
