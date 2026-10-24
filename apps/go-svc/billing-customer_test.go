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
	var listed []map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "/v1/invoices.list", r.URL.Path)
		raw, _ := io.ReadAll(r.Body)
		var body map[string]any
		require.NoError(t, json.Unmarshal(raw, &body))
		listed = append(listed, body)
		if body["start_cursor"] == "cur_1" {
			_, _ = w.Write([]byte(`{"list":[{"id":"inv_2","status":"paid","total":9.99,"currency":"usd","created_at":1759247878000}],"next_cursor":null}`))
			return
		}
		_, _ = w.Write([]byte(`{"list":[{"id":"inv_1","status":"paid","total":29.99,"currency":"usd","created_at":1759247877000,"hosted_invoice_url":"https://invoice.example/1"}],"next_cursor":"cur_1"}`))
	}))
	t.Cleanup(srv.Close)
	client, err := autumn.NewClient(autumn.Config{SecretKey: "k", BaseURL: srv.URL, HTTPClient: srv.Client()})
	require.NoError(t, err)
	api.autumn = client

	first := billingJSONRequest(api, scope.WorkOSUserID, http.MethodGet, scope.OrgPath("/billing/invoices"), "")
	require.Equal(t, http.StatusOK, first.Code, first.Body.String())
	var firstBody struct {
		Invoices   []workspaceInvoice `json:"invoices"`
		NextCursor *string            `json:"nextCursor"`
	}
	require.NoError(t, json.Unmarshal(first.Body.Bytes(), &firstBody))
	require.Len(t, firstBody.Invoices, 1)
	require.Equal(t, 29.99, firstBody.Invoices[0].Total)
	require.Equal(t, int64(1759247877000), firstBody.Invoices[0].CreatedAt)
	require.NotNil(t, firstBody.NextCursor)
	require.Equal(t, "cur_1", *firstBody.NextCursor)

	second := billingJSONRequest(api, scope.WorkOSUserID, http.MethodGet, scope.OrgPath("/billing/invoices")+"?cursor=cur_1", "")
	require.Equal(t, http.StatusOK, second.Code, second.Body.String())
	var secondBody struct {
		Invoices   []workspaceInvoice `json:"invoices"`
		NextCursor *string            `json:"nextCursor"`
	}
	require.NoError(t, json.Unmarshal(second.Body.Bytes(), &secondBody))
	require.Len(t, secondBody.Invoices, 1)
	require.Equal(t, "inv_2", secondBody.Invoices[0].ID)
	require.Nil(t, secondBody.NextCursor)
	require.Len(t, listed, 2)
	require.Equal(t, "cur_1", listed[1]["start_cursor"])
}

func TestBillingAutumnAuthMappedToGateway(t *testing.T) {
	for _, tc := range []struct {
		name       string
		status     int
		path       string
		wantStatus int
	}{
		{name: "invoices unauthorized", status: http.StatusUnauthorized, path: "/billing/invoices", wantStatus: http.StatusBadGateway},
		{name: "invoices forbidden", status: http.StatusForbidden, path: "/billing/invoices", wantStatus: http.StatusBadGateway},
		{name: "snapshot unauthorized", status: http.StatusUnauthorized, path: "/billing", wantStatus: http.StatusBadGateway},
		{name: "snapshot forbidden", status: http.StatusForbidden, path: "/billing", wantStatus: http.StatusBadGateway},
		{name: "invoices bad request", status: http.StatusBadRequest, path: "/billing/invoices", wantStatus: http.StatusBadRequest},
	} {
		t.Run(tc.name, func(t *testing.T) {
			api, scope := billingTestAPI(t, "admin")
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				http.Error(w, "upstream", tc.status)
			}))
			t.Cleanup(srv.Close)
			client, err := autumn.NewClient(autumn.Config{SecretKey: "k", BaseURL: srv.URL, HTTPClient: srv.Client()})
			require.NoError(t, err)
			api.autumn = client

			rec := billingJSONRequest(api, scope.WorkOSUserID, http.MethodGet, scope.OrgPath(tc.path), "")
			require.Equal(t, tc.wantStatus, rec.Code, rec.Body.String())
			require.Contains(t, rec.Body.String(), "billing_upstream_error")
		})
	}
}

func TestMapAutumnBillingError(t *testing.T) {
	t.Parallel()

	err := mapAutumnBillingError(io.EOF, "Unable to load billing")
	var failure *billingError
	require.ErrorAs(t, err, &failure)
	require.Equal(t, http.StatusBadGateway, failure.status)
	require.Equal(t, "billing_upstream_error", failure.code)

	for _, tc := range []struct {
		status int
		want   int
	}{
		{http.StatusUnauthorized, http.StatusBadGateway},
		{http.StatusForbidden, http.StatusBadGateway},
		{http.StatusConflict, http.StatusConflict},
		{http.StatusInternalServerError, http.StatusBadGateway},
	} {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(tc.status)
		}))
		t.Cleanup(srv.Close)
		client, clientErr := autumn.NewClient(autumn.Config{SecretKey: "k", BaseURL: srv.URL, HTTPClient: srv.Client()})
		require.NoError(t, clientErr)
		_, getErr := client.GetCustomer(t.Context(), "org_1")
		require.Error(t, getErr)
		mapped := mapAutumnBillingError(getErr, "Unable to load billing")
		require.ErrorAs(t, mapped, &failure)
		require.Equal(t, tc.want, failure.status, tc.status)
		require.Equal(t, "billing_upstream_error", failure.code)
	}
}

func TestBillingSnapshotFromCustomer(t *testing.T) {
	email := "owner@example.com"
	billingEmail := "billing@example.com"
	name := "Growth"
	taxID := "ABN-1"
	line1 := "1 Market St"
	city := "Sydney"
	country := "AU"
	remaining := 4.2
	granted := 20.0
	usage := 15.8
	reset := int64(1759247877000)
	canceled := int64(1759000000000)

	snapshot := billingSnapshotFromCustomer(autumn.Customer{
		ID:    "cus_1",
		Email: &email,
		Subscriptions: []autumn.CustomerSubscription{{
			PlanID:           autumn.PlanEnterprise,
			Status:           "canceled",
			CanceledAt:       &canceled,
			CurrentPeriodEnd: &reset,
		}, {
			PlanID:           autumn.PlanGrowth,
			Status:           "active",
			CurrentPeriodEnd: &reset,
			Plan: &struct {
				Name *string `json:"name"`
			}{Name: &name},
		}},
		Balances: map[string]autumn.Balance{
			autumn.FeatureAITokens: {
				Remaining:   &remaining,
				Granted:     &granted,
				Usage:       &usage,
				NextResetAt: &reset,
			},
		},
		PaymentMethod: &autumn.CustomerPaymentMethod{Brand: "visa", Last4: "4242", ExpMonth: 12, ExpYear: 2028},
		BillingDetails: &autumn.CustomerBillingDetails{
			Name:  &name,
			Email: &billingEmail,
			TaxID: &taxID,
			Address: &autumn.CustomerBillingAddress{
				Line1:   &line1,
				City:    &city,
				Country: &country,
			},
		},
	})
	require.True(t, snapshot.HasBillingAccount)
	require.Equal(t, autumn.PlanGrowth, snapshot.PlanID)
	require.Equal(t, "Growth", snapshot.PlanName)
	require.Equal(t, "active", *snapshot.Status)
	require.Equal(t, billingEmail, *snapshot.Email)
	require.Equal(t, taxID, *snapshot.TaxID)
	require.Equal(t, "1 Market St", snapshot.Address.Line1)
	require.Equal(t, "visa", snapshot.PaymentMethod.Brand)
	require.Equal(t, 4.2, snapshot.AITokens.Remaining)
	require.Equal(t, reset, *snapshot.AITokens.NextResetAt)

	empty := billingSnapshotFromCustomer(autumn.Customer{})
	require.Equal(t, autumn.PlanFree, empty.PlanID)
	require.Equal(t, "Free", empty.PlanName)
	require.False(t, empty.HasBillingAccount)
	require.Nil(t, empty.PaymentMethod)
	require.Nil(t, empty.Address)
}

func TestBillingPlanDisplayNameAndAddress(t *testing.T) {
	named := " Custom Plan "
	require.Equal(t, "Custom Plan", planDisplayName(autumn.CustomerSubscription{
		PlanID: "other",
		Plan: &struct {
			Name *string `json:"name"`
		}{Name: &named},
	}))
	require.Equal(t, "Growth", planDisplayName(autumn.CustomerSubscription{PlanID: autumn.PlanGrowth}))
	require.Equal(t, "Free", planDisplayName(autumn.CustomerSubscription{PlanID: autumn.PlanFree}))
	require.Equal(t, "Team Plus", formatPlanIDLabel("team_plus"))
	require.Equal(t, "Pro Trial", formatPlanIDLabel("pro-trial"))

	sub, ok := activeCustomerSubscription(nil)
	require.False(t, ok)
	require.Empty(t, sub.PlanID)
	first, ok := activeCustomerSubscription([]autumn.CustomerSubscription{{PlanID: "stale", Status: "canceled"}})
	require.True(t, ok)
	require.Equal(t, "stale", first.PlanID)

	require.Nil(t, mapBillingAddress(nil))
	require.Nil(t, mapBillingAddress(&autumn.CustomerBillingDetails{Address: &autumn.CustomerBillingAddress{}}))
	page := emptyInvoicePage()
	require.Equal(t, []workspaceInvoice{}, page["invoices"])
	require.Nil(t, page["nextCursor"])
	require.Equal(t, "", derefBillingString(nil))
	require.Equal(t, 0.0, derefFloat(nil))
	require.Nil(t, optionalBillingString("  "))
	require.Equal(t, "active", *optionalBillingString(" active "))
}

func TestDecodeBillingJSON(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"planId":"growth"}`))
	var body billingCheckoutBody
	require.NoError(t, decodeBillingJSON(req, &body))
	require.Equal(t, "growth", body.PlanID)

	req = httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"planId":"growth"}{"extra":true}`))
	require.Error(t, decodeBillingJSON(req, &body))
	req = httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{`))
	require.Error(t, decodeBillingJSON(req, &body))
}

func TestBillingCheckoutForbiddenForMembers(t *testing.T) {
	api, scope := billingTestAPI(t, "member")
	rec := billingJSONRequest(api, scope.WorkOSUserID, http.MethodPost, scope.OrgPath("/billing/checkout"), `{"planId":"growth"}`)
	require.Equal(t, http.StatusForbidden, rec.Code)
	require.Contains(t, rec.Body.String(), "billing_write_forbidden")
}
