package autumn

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCheckAllow(t *testing.T) {
	t.Parallel()

	var gotAuth, gotVersion, gotContentType string
	var body map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/balances.check" {
			t.Errorf("path = %s", r.URL.Path)
		}
		if r.Method != http.MethodPost {
			t.Errorf("method = %s", r.Method)
		}
		gotAuth = r.Header.Get("Authorization")
		gotVersion = r.Header.Get("x-api-version")
		gotContentType = r.Header.Get("Content-Type")
		raw, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(raw, &body)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"allowed":true,"customer_id":"org_1","balance":{"feature_id":"queries-board","remaining":1}}`))
	}))
	t.Cleanup(srv.Close)

	client, err := NewClient(Config{
		SecretKey:  "am_sk_test",
		BaseURL:    srv.URL,
		HTTPClient: srv.Client(),
	})
	if err != nil {
		t.Fatal(err)
	}
	res, err := client.Check(context.Background(), CheckRequest{
		CustomerID: "org_1",
		FeatureID:  QueriesBoard,
	})
	if err != nil {
		t.Fatalf("Check: %v", err)
	}
	if !res.Allowed {
		t.Fatal("expected allowed")
	}
	if gotAuth != "Bearer am_sk_test" {
		t.Fatalf("Authorization = %q", gotAuth)
	}
	if gotVersion != defaultAPIVersion {
		t.Fatalf("x-api-version = %q", gotVersion)
	}
	if !strings.HasPrefix(gotContentType, "application/json") {
		t.Fatalf("Content-Type = %q", gotContentType)
	}
	if body["customer_id"] != "org_1" || body["feature_id"] != QueriesBoard {
		t.Fatalf("body = %#v", body)
	}
	if res.Balance == nil || res.Balance.FeatureID != QueriesBoard {
		t.Fatalf("balance = %#v", res.Balance)
	}
}

func TestCheckDeny(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"allowed":false}`))
	}))
	t.Cleanup(srv.Close)

	client, err := NewClient(Config{SecretKey: "k", BaseURL: srv.URL, HTTPClient: srv.Client()})
	if err != nil {
		t.Fatal(err)
	}
	res, err := client.Check(context.Background(), CheckRequest{CustomerID: "org", FeatureID: QueriesBoard})
	if err != nil {
		t.Fatal(err)
	}
	if res.Allowed {
		t.Fatal("expected denied")
	}
	if IsBooleanFeatureEnabled(context.Background(), client, "org", QueriesBoard) {
		t.Fatal("IsBooleanFeatureEnabled should be false when denied")
	}
}

func TestCheckHTTPError(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "nope", http.StatusBadGateway)
	}))
	t.Cleanup(srv.Close)

	client, err := NewClient(Config{SecretKey: "k", BaseURL: srv.URL, HTTPClient: srv.Client()})
	if err != nil {
		t.Fatal(err)
	}
	_, err = client.Check(context.Background(), CheckRequest{CustomerID: "org", FeatureID: QueriesBoard})
	if err == nil {
		t.Fatal("expected error")
	}
	ae, ok := err.(*apiError)
	if !ok || ae.StatusCode != http.StatusBadGateway {
		t.Fatalf("err = %v", err)
	}
	if IsBooleanFeatureEnabled(context.Background(), client, "org", QueriesBoard) {
		t.Fatal("fail-closed on HTTP error")
	}
}

func TestCheckInvalidJSON(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{not-json`))
	}))
	t.Cleanup(srv.Close)

	client, err := NewClient(Config{SecretKey: "k", BaseURL: srv.URL, HTTPClient: srv.Client()})
	if err != nil {
		t.Fatal(err)
	}
	_, err = client.Check(context.Background(), CheckRequest{CustomerID: "org", FeatureID: QueriesBoard})
	if err == nil {
		t.Fatal("expected decode error")
	}
	if IsBooleanFeatureEnabled(context.Background(), client, "org", QueriesBoard) {
		t.Fatal("fail-closed on decode error")
	}
}

func TestCheckCanceledContext(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		t.Error("server should not be reached")
	}))
	t.Cleanup(srv.Close)

	client, err := NewClient(Config{SecretKey: "k", BaseURL: srv.URL, HTTPClient: srv.Client()})
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err = client.Check(ctx, CheckRequest{CustomerID: "org", FeatureID: QueriesBoard})
	if err == nil {
		t.Fatal("expected canceled error")
	}
	if !errors.Is(err, context.Canceled) && !strings.Contains(err.Error(), "canceled") {
		t.Fatalf("err = %v", err)
	}
}

func TestTrackSuccess(t *testing.T) {
	t.Parallel()

	var body map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/balances.track" {
			t.Errorf("path = %s", r.URL.Path)
		}
		raw, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(raw, &body)
		w.WriteHeader(http.StatusOK)
	}))
	t.Cleanup(srv.Close)

	client, err := NewClient(Config{APIKey: "am_sk_test", BaseURL: srv.URL, HTTPClient: srv.Client()})
	if err != nil {
		t.Fatal(err)
	}
	err = client.Track(context.Background(), TrackRequest{
		CustomerID:     "org_1",
		FeatureID:      "translation_jobs",
		Value:          1,
		IdempotencyKey: "op:1",
		Properties:     map[string]any{"source": "test"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if body["customer_id"] != "org_1" || body["feature_id"] != "translation_jobs" {
		t.Fatalf("body = %#v", body)
	}
	if body["value"] != float64(1) || body["idempotency_key"] != "op:1" {
		t.Fatalf("body = %#v", body)
	}
	props, _ := body["properties"].(map[string]any)
	if props["source"] != "test" {
		t.Fatalf("properties = %#v", props)
	}
}

func TestTrackHTTPError(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "quota", http.StatusTooManyRequests)
	}))
	t.Cleanup(srv.Close)

	client, err := NewClient(Config{SecretKey: "k", BaseURL: srv.URL, HTTPClient: srv.Client()})
	if err != nil {
		t.Fatal(err)
	}
	err = client.Track(context.Background(), TrackRequest{CustomerID: "org", FeatureID: "f", Value: 1})
	if err == nil {
		t.Fatal("expected error")
	}
	ae, ok := err.(*apiError)
	if !ok || ae.StatusCode != http.StatusTooManyRequests {
		t.Fatalf("err = %v", err)
	}
}

func TestTrackTokensUsesAPIVersion230(t *testing.T) {
	t.Parallel()

	var gotVersion string
	var body map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/balances.track_tokens" {
			t.Errorf("path = %s", r.URL.Path)
		}
		gotVersion = r.Header.Get("x-api-version")
		raw, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(raw, &body)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"value":0.01}`))
	}))
	t.Cleanup(srv.Close)

	client, err := NewClient(Config{SecretKey: "k", BaseURL: srv.URL, HTTPClient: srv.Client()})
	if err != nil {
		t.Fatal(err)
	}
	cacheRead := 2
	err = client.TrackTokens(context.Background(), TrackTokensRequest{
		CustomerID:      "org_1",
		FeatureID:       "ai_tokens",
		ModelID:         "openai/gpt-6-luna",
		InputTokens:     40,
		OutputTokens:    12,
		CacheReadTokens: &cacheRead,
	})
	if err != nil {
		t.Fatal(err)
	}
	if gotVersion != tokensAPIVersion {
		t.Fatalf("x-api-version = %q, want %q", gotVersion, tokensAPIVersion)
	}
	if body["model_id"] != "openai/gpt-6-luna" || body["input_tokens"] != float64(40) {
		t.Fatalf("body = %#v", body)
	}
	if body["cache_read_tokens"] != float64(2) {
		t.Fatalf("cache_read_tokens = %#v", body["cache_read_tokens"])
	}
}

func TestTrackTokensHTTPError(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "nope", http.StatusInternalServerError)
	}))
	t.Cleanup(srv.Close)

	client, err := NewClient(Config{SecretKey: "k", BaseURL: srv.URL, HTTPClient: srv.Client()})
	if err != nil {
		t.Fatal(err)
	}
	err = client.TrackTokens(context.Background(), TrackTokensRequest{
		CustomerID: "org", ModelID: "m", InputTokens: 1, OutputTokens: 1,
	})
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestIsBooleanFeatureEnabledMissingKey(t *testing.T) {
	t.Parallel()

	client, err := NewClient(Config{})
	if err != nil {
		t.Fatal(err)
	}
	if client.HasSecretKey() {
		t.Fatal("expected empty key")
	}
	if IsBooleanFeatureEnabled(context.Background(), client, "org", QueriesBoard) {
		t.Fatal("missing key must fail closed")
	}
	if IsBooleanFeatureEnabled(context.Background(), nil, "org", QueriesBoard) {
		t.Fatal("nil client must fail closed")
	}

	_, err = client.Check(context.Background(), CheckRequest{CustomerID: "org", FeatureID: QueriesBoard})
	if err == nil {
		t.Fatal("Check with empty key should error")
	}
}

func TestIsBooleanFeatureEnabledEmptyIDs(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		t.Error("should not call Autumn for empty IDs")
	}))
	t.Cleanup(srv.Close)

	client, err := NewClient(Config{SecretKey: "k", BaseURL: srv.URL, HTTPClient: srv.Client()})
	if err != nil {
		t.Fatal(err)
	}
	if IsBooleanFeatureEnabled(context.Background(), client, "", QueriesBoard) {
		t.Fatal("empty org must deny")
	}
	if IsBooleanFeatureEnabled(context.Background(), client, "org", "") {
		t.Fatal("empty feature must deny")
	}
	if IsBooleanFeatureEnabled(context.Background(), client, "  ", "  ") {
		t.Fatal("whitespace IDs must deny")
	}
}

func TestCheckOptionalFields(t *testing.T) {
	t.Parallel()

	var body map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(raw, &body)
		_, _ = w.Write([]byte(`{"allowed":true}`))
	}))
	t.Cleanup(srv.Close)

	client, err := NewClient(Config{SecretKey: "k", BaseURL: srv.URL, HTTPClient: srv.Client()})
	if err != nil {
		t.Fatal(err)
	}
	required := 3.0
	_, err = client.Check(context.Background(), CheckRequest{
		CustomerID:      "org",
		FeatureID:       "f",
		RequiredBalance: &required,
		WithPreview:     true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if body["required_balance"] != 3.0 || body["with_preview"] != true {
		t.Fatalf("body = %#v", body)
	}
}

func TestNewClientDefaults(t *testing.T) {
	t.Parallel()

	client, err := NewClient(Config{SecretKey: " k "})
	if err != nil {
		t.Fatal(err)
	}
	if !client.HasSecretKey() || client.secretKey != "k" {
		t.Fatalf("secret = %q", client.secretKey)
	}
	if client.baseURL != defaultBaseURL {
		t.Fatalf("baseURL = %q", client.baseURL)
	}
	if client.apiVersion != defaultAPIVersion {
		t.Fatalf("apiVersion = %q", client.apiVersion)
	}

	client, err = NewClient(Config{APIKey: "from-api-key", BaseURL: "https://example.test/", APIVersion: "9.9.9"})
	if err != nil {
		t.Fatal(err)
	}
	if client.secretKey != "from-api-key" || client.baseURL != "https://example.test" || client.apiVersion != "9.9.9" {
		t.Fatalf("client = %#v", client)
	}
}

func TestAPIErrorMessage(t *testing.T) {
	t.Parallel()
	err := &apiError{StatusCode: 502, Body: "bad gateway"}
	if got := err.Error(); got != "autumn: HTTP 502: bad gateway" {
		t.Fatalf("Error() = %q", got)
	}
	err = &apiError{StatusCode: 500}
	if got := err.Error(); got != "autumn: HTTP 500" {
		t.Fatalf("Error() = %q", got)
	}
}
