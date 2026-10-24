package autumn

import (
	"context"
	"strings"
)

const (
	PlanFree       = "free"
	PlanGrowth     = "growth"
	PlanEnterprise = "enterprise"

	// FeatureAITokens is the workspace AI-credit balance (alias of AITokens).
	FeatureAITokens = AITokens
)

// Customer is the subset of customers.get used by workspace billing.
type Customer struct {
	ID             string                  `json:"id"`
	Name           *string                 `json:"name"`
	Email          *string                 `json:"email"`
	Subscriptions  []CustomerSubscription  `json:"subscriptions"`
	Balances       map[string]Balance      `json:"balances"`
	PaymentMethod  *CustomerPaymentMethod  `json:"payment_method"`
	BillingDetails *CustomerBillingDetails `json:"billing_details"`
}

type CustomerSubscription struct {
	PlanID           string `json:"plan_id"`
	Status           string `json:"status"`
	CanceledAt       *int64 `json:"canceled_at"`
	CurrentPeriodEnd *int64 `json:"current_period_end"`
	Plan             *struct {
		Name *string `json:"name"`
	} `json:"plan"`
}

type CustomerPaymentMethod struct {
	Brand    string `json:"brand"`
	Last4    string `json:"last4"`
	ExpMonth int    `json:"exp_month"`
	ExpYear  int    `json:"exp_year"`
}

type CustomerBillingDetails struct {
	Name    *string                 `json:"name"`
	Email   *string                 `json:"email"`
	TaxID   *string                 `json:"tax_id"`
	Address *CustomerBillingAddress `json:"address"`
}

type CustomerBillingAddress struct {
	Line1      *string `json:"line1"`
	Line2      *string `json:"line2"`
	City       *string `json:"city"`
	State      *string `json:"state"`
	PostalCode *string `json:"postal_code"`
	Country    *string `json:"country"`
}

type getCustomerBody struct {
	CustomerID string   `json:"customer_id"`
	Expand     []string `json:"expand,omitempty"`
}

// GetCustomer calls POST /v1/customers.get.
func (c *Client) GetCustomer(ctx context.Context, customerID string, expand ...string) (Customer, error) {
	var out Customer
	err := c.post(ctx, "/v1/customers.get", c.apiVersion, getCustomerBody{
		CustomerID: strings.TrimSpace(customerID),
		Expand:     expand,
	}, &out)
	return out, err
}

type AttachRequest struct {
	CustomerID   string
	PlanID       string
	SuccessURL   string
	RedirectMode string
}

type AttachResponse struct {
	CustomerID string  `json:"customer_id"`
	PaymentURL *string `json:"payment_url"`
}

type attachBody struct {
	CustomerID   string `json:"customer_id"`
	PlanID       string `json:"plan_id"`
	SuccessURL   string `json:"success_url,omitempty"`
	RedirectMode string `json:"redirect_mode,omitempty"`
}

// Attach calls POST /v1/billing.attach.
func (c *Client) Attach(ctx context.Context, req AttachRequest) (AttachResponse, error) {
	var out AttachResponse
	err := c.post(ctx, "/v1/billing.attach", c.apiVersion, attachBody{
		CustomerID:   strings.TrimSpace(req.CustomerID),
		PlanID:       strings.TrimSpace(req.PlanID),
		SuccessURL:   strings.TrimSpace(req.SuccessURL),
		RedirectMode: strings.TrimSpace(req.RedirectMode),
	}, &out)
	return out, err
}

type OpenPortalRequest struct {
	CustomerID string
	ReturnURL  string
}

type OpenPortalResponse struct {
	CustomerID string `json:"customer_id"`
	URL        string `json:"url"`
}

type openPortalBody struct {
	CustomerID string `json:"customer_id"`
	ReturnURL  string `json:"return_url,omitempty"`
}

// OpenPortal calls POST /v1/billing.open_customer_portal.
func (c *Client) OpenPortal(ctx context.Context, req OpenPortalRequest) (OpenPortalResponse, error) {
	var out OpenPortalResponse
	err := c.post(ctx, "/v1/billing.open_customer_portal", c.apiVersion, openPortalBody{
		CustomerID: strings.TrimSpace(req.CustomerID),
		ReturnURL:  strings.TrimSpace(req.ReturnURL),
	}, &out)
	return out, err
}

type Invoice struct {
	ID               string  `json:"id"`
	Status           string  `json:"status"`
	Total            float64 `json:"total"`
	Currency         string  `json:"currency"`
	CreatedAt        int64   `json:"created_at"`
	HostedInvoiceURL *string `json:"hosted_invoice_url"`
}

type ListInvoicesRequest struct {
	CustomerID  string
	Limit       int
	StartCursor string
}

type ListInvoicesResponse struct {
	List       []Invoice `json:"list"`
	NextCursor *string   `json:"next_cursor"`
}

type listInvoicesBody struct {
	CustomerID  string `json:"customer_id"`
	Limit       int    `json:"limit,omitempty"`
	StartCursor string `json:"start_cursor,omitempty"`
}

// ListInvoices calls POST /v1/invoices.list.
func (c *Client) ListInvoices(ctx context.Context, req ListInvoicesRequest) (ListInvoicesResponse, error) {
	var out ListInvoicesResponse
	err := c.post(ctx, "/v1/invoices.list", c.apiVersion, listInvoicesBody{
		CustomerID:  strings.TrimSpace(req.CustomerID),
		Limit:       req.Limit,
		StartCursor: strings.TrimSpace(req.StartCursor),
	}, &out)
	if out.List == nil {
		out.List = []Invoice{}
	}
	return out, err
}

func IsNotFound(err error) bool {
	status, ok := HTTPStatus(err)
	return ok && status == 404
}
