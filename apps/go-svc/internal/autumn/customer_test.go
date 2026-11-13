package autumn

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestGetCustomer(t *testing.T) {
	t.Parallel()

	var body map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/customers.get" {
			t.Errorf("path = %s", r.URL.Path)
		}
		raw, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(raw, &body)
		_, _ = w.Write([]byte(`{
            "id":"org_1",
            "email":"ada@example.com",
            "subscriptions":[{"plan_id":"growth","status":"active","current_period_end":1700000000000}],
            "balances":{"ai_tokens":{"feature_id":"ai_tokens","remaining":4.2,"granted":20,"usage":15.8}}
        }`))
	}))
	t.Cleanup(srv.Close)

	client, err := NewClient(Config{SecretKey: "k", BaseURL: srv.URL, HTTPClient: srv.Client()})
	if err != nil {
		t.Fatal(err)
	}
	customer, err := client.GetCustomer(context.Background(), "org_1", "payment_method", "billing_details")
	if err != nil {
		t.Fatal(err)
	}
	if customer.ID != "org_1" || customer.Email == nil || *customer.Email != "ada@example.com" {
		t.Fatalf("customer = %#v", customer)
	}
	if len(customer.Subscriptions) != 1 || customer.Subscriptions[0].PlanID != PlanGrowth {
		t.Fatalf("subscriptions = %#v", customer.Subscriptions)
	}
	if customer.Balances[FeatureAITokens].Remaining == nil || *customer.Balances[FeatureAITokens].Remaining != 4.2 {
		t.Fatalf("balances = %#v", customer.Balances)
	}
	expand, _ := body["expand"].([]any)
	if body["customer_id"] != "org_1" || len(expand) != 2 {
		t.Fatalf("body = %#v", body)
	}
}

func TestAttach(t *testing.T) {
	t.Parallel()

	var body map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/billing.attach" {
			t.Errorf("path = %s", r.URL.Path)
		}
		raw, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(raw, &body)
		_, _ = w.Write([]byte(`{"customer_id":"org_1","payment_url":"https://checkout.example/s"}`))
	}))
	t.Cleanup(srv.Close)

	client, err := NewClient(Config{SecretKey: "k", BaseURL: srv.URL, HTTPClient: srv.Client()})
	if err != nil {
		t.Fatal(err)
	}
	res, err := client.Attach(context.Background(), AttachRequest{
		CustomerID:   "org_1",
		PlanID:       PlanGrowth,
		SuccessURL:   "https://iris.example/ok",
		RedirectMode: "always",
	})
	if err != nil {
		t.Fatal(err)
	}
	if res.PaymentURL == nil || *res.PaymentURL != "https://checkout.example/s" {
		t.Fatalf("attach = %#v", res)
	}
	if body["plan_id"] != PlanGrowth || body["success_url"] != "https://iris.example/ok" {
		t.Fatalf("body = %#v", body)
	}
}

func TestOpenPortal(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/billing.open_customer_portal" {
			t.Errorf("path = %s", r.URL.Path)
		}
		_, _ = w.Write([]byte(`{"customer_id":"org_1","url":"https://billing.example/p"}`))
	}))
	t.Cleanup(srv.Close)

	client, err := NewClient(Config{SecretKey: "k", BaseURL: srv.URL, HTTPClient: srv.Client()})
	if err != nil {
		t.Fatal(err)
	}
	res, err := client.OpenPortal(context.Background(), OpenPortalRequest{
		CustomerID: "org_1",
		ReturnURL:  "https://iris.example/billing",
	})
	if err != nil {
		t.Fatal(err)
	}
	if res.URL != "https://billing.example/p" {
		t.Fatalf("portal = %#v", res)
	}
}

func TestListInvoices(t *testing.T) {
	t.Parallel()

	var body map[string]any
	next := "cur_2"
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/invoices.list" {
			t.Errorf("path = %s", r.URL.Path)
		}
		raw, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(raw, &body)
		_, _ = w.Write([]byte(`{"list":[{"id":"inv_1","status":"paid","total":29.99,"currency":"usd","created_at":1759247877000,"hosted_invoice_url":"https://invoice.example/1"}],"next_cursor":"` + next + `"}`))
	}))
	t.Cleanup(srv.Close)

	client, err := NewClient(Config{SecretKey: "k", BaseURL: srv.URL, HTTPClient: srv.Client()})
	if err != nil {
		t.Fatal(err)
	}
	res, err := client.ListInvoices(context.Background(), ListInvoicesRequest{
		CustomerID:  "org_1",
		Limit:       50,
		StartCursor: "cur_1",
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.List) != 1 || res.List[0].Total != 29.99 || res.List[0].CreatedAt != 1759247877000 {
		t.Fatalf("invoices = %#v", res)
	}
	if res.NextCursor == nil || *res.NextCursor != next {
		t.Fatalf("next_cursor = %#v", res.NextCursor)
	}
	if body["customer_id"] != "org_1" || body["start_cursor"] != "cur_1" {
		t.Fatalf("body = %#v", body)
	}
}

func TestGetCustomerNotFound(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "missing", http.StatusNotFound)
	}))
	t.Cleanup(srv.Close)

	client, err := NewClient(Config{SecretKey: "k", BaseURL: srv.URL, HTTPClient: srv.Client()})
	if err != nil {
		t.Fatal(err)
	}
	_, err = client.GetCustomer(context.Background(), "org_missing")
	if err == nil || !IsNotFound(err) {
		t.Fatalf("err = %v", err)
	}
}
