package autumn

import (
	"context"
	"strings"
)

// CheckRequest is a balances.check call.
type CheckRequest struct {
	CustomerID      string
	FeatureID       string
	RequiredBalance *float64
	WithPreview     bool
}

// Balance is a subset of Autumn balance fields returned by Check.
type Balance struct {
	FeatureID string   `json:"feature_id"`
	Granted   *float64 `json:"granted"`
	Usage     *float64 `json:"usage"`
	Remaining *float64 `json:"remaining"`
	Unlimited bool     `json:"unlimited"`
}

// CheckResponse is the subset of balances.check used for gating.
type CheckResponse struct {
	Allowed  bool     `json:"allowed"`
	Balance  *Balance `json:"balance"`
	Customer string   `json:"customer_id"`
}

type checkBody struct {
	CustomerID      string   `json:"customer_id"`
	FeatureID       string   `json:"feature_id"`
	RequiredBalance *float64 `json:"required_balance,omitempty"`
	WithPreview     bool     `json:"with_preview,omitempty"`
}

// Check calls POST /v1/balances.check.
func (c *Client) Check(ctx context.Context, req CheckRequest) (CheckResponse, error) {
	var out CheckResponse
	err := c.post(ctx, "/v1/balances.check", c.apiVersion, checkBody(req), &out)
	return out, err
}

// IsBooleanFeatureEnabled is a fail-closed entitlement check.
// Nil client, missing key, empty IDs, transport/API errors, or allowed != true all deny.
func IsBooleanFeatureEnabled(ctx context.Context, client *Client, organizationID, featureID string) bool {
	if client == nil || !client.HasSecretKey() {
		return false
	}
	organizationID = strings.TrimSpace(organizationID)
	featureID = strings.TrimSpace(featureID)
	if organizationID == "" || featureID == "" {
		return false
	}
	res, err := client.Check(ctx, CheckRequest{
		CustomerID: organizationID,
		FeatureID:  featureID,
	})
	if err != nil {
		return false
	}
	return res.Allowed
}
