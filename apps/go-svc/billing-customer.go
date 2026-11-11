package main

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/autumn"
)

const (
	autumnCheckoutRedirectAlways = "always"
	billingInvoiceLimit          = 50
)

type workspaceBillingSnapshot struct {
	PlanID            string                   `json:"planId"`
	PlanName          string                   `json:"planName"`
	Status            *string                  `json:"status"`
	BillingPeriod     *string                  `json:"billingPeriod"`
	CanceledAt        *int64                   `json:"canceledAt"`
	CurrentPeriodEnd  *int64                   `json:"currentPeriodEnd"`
	HasBillingAccount bool                     `json:"hasBillingAccount"`
	Email             *string                  `json:"email"`
	TaxID             *string                  `json:"taxId"`
	Address           *workspaceBillingAddress `json:"address"`
	PaymentMethod     *workspacePaymentMethod  `json:"paymentMethod"`
	AITokens          workspaceAITokenBalance  `json:"aiTokens"`
}

type workspaceBillingAddress struct {
	LegalName  string `json:"legalName"`
	Line1      string `json:"line1"`
	Line2      string `json:"line2"`
	City       string `json:"city"`
	State      string `json:"state"`
	PostalCode string `json:"postalCode"`
	Country    string `json:"country"`
}

type workspacePaymentMethod struct {
	Brand    string `json:"brand"`
	Last4    string `json:"last4"`
	ExpMonth int    `json:"expMonth"`
	ExpYear  int    `json:"expYear"`
}

type workspaceAITokenBalance struct {
	FeatureID   string  `json:"featureId"`
	Remaining   float64 `json:"remaining"`
	Granted     float64 `json:"granted"`
	Usage       float64 `json:"usage"`
	Unlimited   bool    `json:"unlimited"`
	NextResetAt *int64  `json:"nextResetAt"`
}

type workspaceInvoice struct {
	ID        string  `json:"id"`
	Status    string  `json:"status"`
	Total     float64 `json:"total"`
	Currency  string  `json:"currency"`
	CreatedAt int64   `json:"createdAt"`
	HostedURL *string `json:"hostedUrl"`
}

type billingCheckoutBody struct {
	PlanID     string `json:"planId"`
	SuccessURL string `json:"successUrl"`
	CancelURL  string `json:"cancelUrl"`
	ReturnURL  string `json:"returnUrl"`
}

type billingPortalBody struct {
	ReturnURL string `json:"returnUrl"`
}

var paidAutumnPlans = map[string]string{
	autumn.PlanGrowth:     "Growth",
	autumn.PlanEnterprise: "Enterprise",
}

func (api *billingAPI) serveBilling(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	ctx, cancel := context.WithTimeout(r.Context(), billingRequestTimeout)
	defer cancel()
	r = r.WithContext(ctx)
	actor, ok := api.authorize(w, r, "billing:read", "billing_read_forbidden", "Billing settings require workspace admin access")
	if !ok {
		return
	}
	snapshot, err := api.billingSnapshot(ctx, actor.organizationID)
	if err != nil {
		writeBillingError(w, r, "customer", err)
		return
	}
	writeJSON(w, http.StatusOK, snapshot)
}

func (api *billingAPI) serveInvoices(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	ctx, cancel := context.WithTimeout(r.Context(), billingRequestTimeout)
	defer cancel()
	r = r.WithContext(ctx)
	actor, ok := api.authorize(w, r, "billing:read", "billing_read_forbidden", "Billing settings require workspace admin access")
	if !ok {
		return
	}
	if api.autumn == nil || !api.autumn.HasSecretKey() {
		writeJSON(w, http.StatusOK, emptyInvoicePage())
		return
	}
	listed, err := api.autumn.ListInvoices(ctx, autumn.ListInvoicesRequest{
		CustomerID:  actor.organizationID,
		Limit:       billingInvoiceLimit,
		StartCursor: strings.TrimSpace(r.URL.Query().Get("cursor")),
	})
	if err != nil {
		if autumn.IsNotFound(err) {
			writeJSON(w, http.StatusOK, emptyInvoicePage())
			return
		}
		writeBillingError(w, r, "invoices", mapAutumnBillingError(err, "Unable to load invoices"))
		return
	}
	invoices := make([]workspaceInvoice, 0, len(listed.List))
	for _, invoice := range listed.List {
		invoices = append(invoices, workspaceInvoice{
			ID:        invoice.ID,
			Status:    invoice.Status,
			Total:     invoice.Total,
			Currency:  invoice.Currency,
			CreatedAt: invoice.CreatedAt,
			HostedURL: invoice.HostedInvoiceURL,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"invoices": invoices, "nextCursor": listed.NextCursor})
}

func (api *billingAPI) serveCheckout(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if denyBrowserMutation(r) {
		writeBillingError(w, r, "origin", billingFailure(403, "forbidden", "Cross-origin request denied"))
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), billingRequestTimeout)
	defer cancel()
	r = r.WithContext(ctx)
	actor, ok := api.authorize(w, r, "billing:write", "billing_write_forbidden", "Only workspace admins can change plans or open the billing portal")
	if !ok {
		return
	}
	var body billingCheckoutBody
	if err := decodeBillingJSON(r, &body); err != nil {
		writeBillingError(w, r, "payload", billingFailure(400, "invalid_billing_payload", "Invalid billing payload"))
		return
	}
	planID := strings.ToLower(strings.TrimSpace(body.PlanID))
	if _, ok := paidAutumnPlans[planID]; !ok {
		writeBillingError(w, r, "plan", billingFailure(400, "invalid_plan", "Checkout only supports growth or enterprise"))
		return
	}
	if api.autumn == nil || !api.autumn.HasSecretKey() {
		writeBillingError(w, r, "availability", billingFailure(503, "billing_unavailable", "Billing is unavailable"))
		return
	}
	attached, err := api.autumn.Attach(ctx, autumn.AttachRequest{
		CustomerID:   actor.organizationID,
		PlanID:       planID,
		SuccessURL:   strings.TrimSpace(body.SuccessURL),
		RedirectMode: autumnCheckoutRedirectAlways,
	})
	if err != nil {
		writeBillingError(w, r, "attach", mapAutumnBillingError(err, "Unable to start checkout"))
		return
	}
	url := strings.TrimSpace(derefBillingString(attached.PaymentURL))
	if url == "" {
		url = strings.TrimSpace(body.SuccessURL)
	}
	if url == "" {
		writeBillingError(w, r, "attach", billingFailure(502, "billing_checkout_url_missing", "Checkout did not return a payment URL"))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"url": url, "planId": planID})
}

func (api *billingAPI) servePortal(w http.ResponseWriter, r *http.Request) {
	api.openPortal(w, r)
}

func (api *billingAPI) serveTopup(w http.ResponseWriter, r *http.Request) {
	api.openPortal(w, r)
}

func (api *billingAPI) openPortal(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if denyBrowserMutation(r) {
		writeBillingError(w, r, "origin", billingFailure(403, "forbidden", "Cross-origin request denied"))
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), billingRequestTimeout)
	defer cancel()
	r = r.WithContext(ctx)
	actor, ok := api.authorize(w, r, "billing:write", "billing_write_forbidden", "Only workspace admins can change plans or open the billing portal")
	if !ok {
		return
	}
	var body billingPortalBody
	if r.ContentLength != 0 {
		if err := decodeBillingJSON(r, &body); err != nil && err != io.EOF {
			writeBillingError(w, r, "payload", billingFailure(400, "invalid_billing_payload", "Invalid billing payload"))
			return
		}
	}
	if api.autumn == nil || !api.autumn.HasSecretKey() {
		writeBillingError(w, r, "availability", billingFailure(503, "billing_unavailable", "Billing is unavailable"))
		return
	}
	opened, err := api.autumn.OpenPortal(ctx, autumn.OpenPortalRequest{
		CustomerID: actor.organizationID,
		ReturnURL:  strings.TrimSpace(body.ReturnURL),
	})
	if err != nil {
		writeBillingError(w, r, "portal", mapAutumnBillingError(err, "Unable to open the billing portal"))
		return
	}
	if strings.TrimSpace(opened.URL) == "" {
		writeBillingError(w, r, "portal", billingFailure(502, "billing_portal_url_missing", "Billing portal did not return a URL"))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"url": opened.URL})
}

func (api *billingAPI) billingSnapshot(ctx context.Context, organizationID string) (workspaceBillingSnapshot, error) {
	snapshot := emptyBillingSnapshot()
	if api.autumn == nil || !api.autumn.HasSecretKey() {
		return snapshot, nil
	}
	customer, err := api.autumn.GetCustomer(ctx, organizationID, "payment_method", "billing_details", "subscriptions.plan")
	if err != nil {
		if autumn.IsNotFound(err) {
			return snapshot, nil
		}
		return workspaceBillingSnapshot{}, mapAutumnBillingError(err, "Unable to load billing")
	}
	return billingSnapshotFromCustomer(customer), nil
}

func emptyBillingSnapshot() workspaceBillingSnapshot {
	return workspaceBillingSnapshot{
		PlanID:            autumn.PlanFree,
		PlanName:          "Free",
		HasBillingAccount: false,
		AITokens: workspaceAITokenBalance{
			FeatureID: autumn.FeatureAITokens,
		},
	}
}

func billingSnapshotFromCustomer(customer autumn.Customer) workspaceBillingSnapshot {
	snapshot := emptyBillingSnapshot()
	snapshot.HasBillingAccount = strings.TrimSpace(customer.ID) != ""
	snapshot.Email = customer.Email
	if customer.BillingDetails != nil {
		if customer.BillingDetails.Email != nil {
			snapshot.Email = customer.BillingDetails.Email
		}
		snapshot.TaxID = customer.BillingDetails.TaxID
		snapshot.Address = mapBillingAddress(customer.BillingDetails)
	}
	if customer.PaymentMethod != nil && strings.TrimSpace(customer.PaymentMethod.Last4) != "" {
		snapshot.PaymentMethod = &workspacePaymentMethod{
			Brand:    customer.PaymentMethod.Brand,
			Last4:    customer.PaymentMethod.Last4,
			ExpMonth: customer.PaymentMethod.ExpMonth,
			ExpYear:  customer.PaymentMethod.ExpYear,
		}
	}
	if subscription, ok := activeCustomerSubscription(customer.Subscriptions); ok {
		snapshot.PlanID = subscription.PlanID
		snapshot.PlanName = planDisplayName(subscription)
		snapshot.Status = optionalBillingString(subscription.Status)
		snapshot.CanceledAt = subscription.CanceledAt
		snapshot.CurrentPeriodEnd = subscription.CurrentPeriodEnd
	}
	if balance, ok := customer.Balances[autumn.FeatureAITokens]; ok {
		snapshot.AITokens = workspaceAITokenBalance{
			FeatureID:   autumn.FeatureAITokens,
			Remaining:   derefFloat(balance.Remaining),
			Granted:     derefFloat(balance.Granted),
			Usage:       derefFloat(balance.Usage),
			Unlimited:   balance.Unlimited,
			NextResetAt: balance.NextResetAt,
		}
	}
	return snapshot
}

func activeCustomerSubscription(subscriptions []autumn.CustomerSubscription) (autumn.CustomerSubscription, bool) {
	if len(subscriptions) == 0 {
		return autumn.CustomerSubscription{}, false
	}
	for _, subscription := range subscriptions {
		if subscription.Status == "active" {
			return subscription, true
		}
	}
	return subscriptions[0], true
}

func planDisplayName(subscription autumn.CustomerSubscription) string {
	if subscription.Plan != nil && subscription.Plan.Name != nil && strings.TrimSpace(*subscription.Plan.Name) != "" {
		return strings.TrimSpace(*subscription.Plan.Name)
	}
	if name, ok := paidAutumnPlans[subscription.PlanID]; ok {
		return name
	}
	if subscription.PlanID == autumn.PlanFree {
		return "Free"
	}
	return formatPlanIDLabel(subscription.PlanID)
}

func formatPlanIDLabel(planID string) string {
	parts := strings.FieldsFunc(planID, func(r rune) bool { return r == '_' || r == '-' })
	for i, part := range parts {
		if part == "" {
			continue
		}
		parts[i] = strings.ToUpper(part[:1]) + part[1:]
	}
	return strings.Join(parts, " ")
}

func mapBillingAddress(details *autumn.CustomerBillingDetails) *workspaceBillingAddress {
	if details == nil || details.Address == nil {
		return nil
	}
	address := details.Address
	mapped := &workspaceBillingAddress{
		LegalName:  derefBillingString(details.Name),
		Line1:      derefBillingString(address.Line1),
		Line2:      derefBillingString(address.Line2),
		City:       derefBillingString(address.City),
		State:      derefBillingString(address.State),
		PostalCode: derefBillingString(address.PostalCode),
		Country:    derefBillingString(address.Country),
	}
	if mapped.LegalName == "" && mapped.Line1 == "" && mapped.City == "" && mapped.Country == "" {
		return nil
	}
	return mapped
}

func emptyInvoicePage() map[string]any {
	return map[string]any{"invoices": []workspaceInvoice{}, "nextCursor": nil}
}

func mapAutumnBillingError(err error, fallback string) error {
	status, ok := autumn.HTTPStatus(err)
	if !ok {
		return billingFailure(http.StatusBadGateway, "billing_upstream_error", fallback)
	}
	switch status {
	case http.StatusUnauthorized, http.StatusForbidden:
		// Autumn rejected the server API key. Do not leak 401/403 to the caller.
		return billingFailure(http.StatusBadGateway, "billing_upstream_error", fallback)
	}
	if status >= 400 && status < 500 {
		return billingFailure(status, "billing_upstream_error", fallback)
	}
	return billingFailure(http.StatusBadGateway, "billing_upstream_error", fallback)
}

func decodeBillingJSON(r *http.Request, dest any) error {
	decoder := json.NewDecoder(io.LimitReader(r.Body, 64<<10))
	if err := decoder.Decode(dest); err != nil {
		return err
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		return io.ErrUnexpectedEOF
	}
	return nil
}

func derefBillingString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func derefFloat(value *float64) float64 {
	if value == nil {
		return 0
	}
	return *value
}

func optionalBillingString(value string) *string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}
