package main

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/autumn"
	"github.com/stretchr/testify/require"
)

func billingJSONRequest(api *billingAPI, workosUserID, method, path, body string) *httptest.ResponseRecorder {
	mux := http.NewServeMux()
	api.register(mux, stubSessionVerifier{claims: AuthClaims{UserID: workosUserID}})
	var req *http.Request
	if body == "" {
		req = httptest.NewRequest(method, path, nil)
	} else {
		req = httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
	}
	req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "session"})
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	return rec
}

func TestBillingSnapshotWithoutAutumn(t *testing.T) {
	api, scope := billingTestAPI(t, "admin")
	rec := billingJSONRequest(api, scope.WorkOSUserID, http.MethodGet, scope.OrgPath("/billing"), "")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var snapshot workspaceBillingSnapshot
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &snapshot))
	require.Equal(t, autumn.PlanFree, snapshot.PlanID)
	require.Equal(t, "Free", snapshot.PlanName)
	require.False(t, snapshot.HasBillingAccount)
	require.Equal(t, autumn.FeatureAITokens, snapshot.AITokens.FeatureID)
}

func TestBillingSnapshotFromAutumn(t *testing.T) {
	api, scope := billingTestAPI(t, "admin")
	remaining := 4.2
	granted := 20.0
	usage := 15.8
	reset := int64(1759247877000)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "/v1/customers.get", r.URL.Path)
		email := "billing@example.com"
		name := "Growth"
		last4 := "4242"
		_ = json.NewEncoder(w).Encode(autumn.Customer{
			ID:    scope.OrganizationID,
			Email: &email,
			Subscriptions: []autumn.CustomerSubscription{{
				PlanID:           autumn.PlanGrowth,
				Status:           "active",
				CurrentPeriodEnd: &reset,
				Plan: &struct {
					Name *string `json:"name"`
				}{Name: &name},
			}},
			Balances: map[string]autumn.Balance{
				autumn.FeatureAITokens: {
					FeatureID:   autumn.FeatureAITokens,
					Remaining:   &remaining,
					Granted:     &granted,
					Usage:       &usage,
					NextResetAt: &reset,
				},
			},
			PaymentMethod: &autumn.CustomerPaymentMethod{Brand: "visa", Last4: last4, ExpMonth: 12, ExpYear: 2028},
		})
	}))
	t.Cleanup(srv.Close)
	client, err := autumn.NewClient(autumn.Config{SecretKey: "k", BaseURL: srv.URL, HTTPClient: srv.Client()})
	require.NoError(t, err)
	api.autumn = client

	rec := billingJSONRequest(api, scope.WorkOSUserID, http.MethodGet, scope.OrgPath("/billing"), "")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var snapshot workspaceBillingSnapshot
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &snapshot))
	require.Equal(t, autumn.PlanGrowth, snapshot.PlanID)
	require.Equal(t, "Growth", snapshot.PlanName)
	require.True(t, snapshot.HasBillingAccount)
	require.NotNil(t, snapshot.PaymentMethod)
	require.Equal(t, "4242", snapshot.PaymentMethod.Last4)
	require.Equal(t, 4.2, snapshot.AITokens.Remaining)
	require.Equal(t, reset, *snapshot.CurrentPeriodEnd)
}

func TestBillingCheckoutAndPortal(t *testing.T) {
	api, scope := billingTestAPI(t, "admin")
	var paths []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		paths = append(paths, r.URL.Path)
		raw, _ := io.ReadAll(r.Body)
		switch r.URL.Path {
		case "/v1/billing.attach":
			var body map[string]any
			_ = json.Unmarshal(raw, &body)
			require.Equal(t, scope.OrganizationID, body["customer_id"])
			require.Equal(t, autumn.PlanGrowth, body["plan_id"])
			_, _ = w.Write([]byte(`{"customer_id":"` + scope.OrganizationID + `","payment_url":"https://checkout.example/s"}`))
		case "/v1/billing.open_customer_portal":
			_, _ = w.Write([]byte(`{"customer_id":"` + scope.OrganizationID + `","url":"https://billing.example/p"}`))
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(srv.Close)
	client, err := autumn.NewClient(autumn.Config{SecretKey: "k", BaseURL: srv.URL, HTTPClient: srv.Client()})
	require.NoError(t, err)
	api.autumn = client

	checkout := billingJSONRequest(api, scope.WorkOSUserID, http.MethodPost, scope.OrgPath("/billing/checkout"), `{"planId":"growth","successUrl":"https://iris.example/ok"}`)
	require.Equal(t, http.StatusOK, checkout.Code, checkout.Body.String())
	require.Contains(t, checkout.Body.String(), "https://checkout.example/s")

	invalid := billingJSONRequest(api, scope.WorkOSUserID, http.MethodPost, scope.OrgPath("/billing/checkout"), `{"planId":"pro"}`)
	require.Equal(t, http.StatusBadRequest, invalid.Code)

	portal := billingJSONRequest(api, scope.WorkOSUserID, http.MethodPost, scope.OrgPath("/billing/portal"), `{"returnUrl":"https://iris.example/billing"}`)
	require.Equal(t, http.StatusOK, portal.Code, portal.Body.String())
	require.Contains(t, portal.Body.String(), "https://billing.example/p")

	topup := billingJSONRequest(api, scope.WorkOSUserID, http.MethodPost, scope.OrgPath("/billing/topup"), `{}`)
	require.Equal(t, http.StatusOK, topup.Code, topup.Body.String())
	require.Equal(t, []string{"/v1/billing.attach", "/v1/billing.open_customer_portal", "/v1/billing.open_customer_portal"}, paths)
}

func TestBillingInvoices(t *testing.T) {
	api, scope := billingTestAPI(t, "admin")
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "/v1/invoices.list", r.URL.Path)
		_, _ = w.Write([]byte(`{"list":[{"id":"inv_1","status":"paid","total":29.99,"currency":"usd","created_at":1759247877000,"hosted_invoice_url":"https://invoice.example/1"}]}`))
	}))
	t.Cleanup(srv.Close)
	client, err := autumn.NewClient(autumn.Config{SecretKey: "k", BaseURL: srv.URL, HTTPClient: srv.Client()})
	require.NoError(t, err)
	api.autumn = client

	rec := billingJSONRequest(api, scope.WorkOSUserID, http.MethodGet, scope.OrgPath("/billing/invoices"), "")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var body struct {
		Invoices []workspaceInvoice `json:"invoices"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Len(t, body.Invoices, 1)
	require.Equal(t, 29.99, body.Invoices[0].Total)
	require.Equal(t, int64(1759247877000), body.Invoices[0].CreatedAt)
}

func TestBillingCheckoutForbiddenForMembers(t *testing.T) {
	api, scope := billingTestAPI(t, "member")
	rec := billingJSONRequest(api, scope.WorkOSUserID, http.MethodPost, scope.OrgPath("/billing/checkout"), `{"planId":"growth"}`)
	require.Equal(t, http.StatusForbidden, rec.Code)
	require.Contains(t, rec.Body.String(), "billing_write_forbidden")
}
