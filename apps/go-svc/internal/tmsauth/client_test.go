package tmsauth

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

const testCookiePassword = "this-is-a-test-cookie-password-at-least-32-characters"

func TestNewClientRequiresConfig(t *testing.T) {
	t.Parallel()

	if _, err := NewClient(Config{CookiePassword: testCookiePassword}); err == nil {
		t.Fatal("expected missing base URL")
	}
	if _, err := NewClient(Config{BaseURL: "https://hyperlocalise.test"}); err == nil {
		t.Fatal("expected missing cookie password")
	}
}

func TestMintSendsServiceTokenAndReturnsHeader(t *testing.T) {
	t.Parallel()

	var gotAuth, gotContentType string
	var body MintRequest
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != mintPath {
			t.Errorf("path = %s", r.URL.Path)
		}
		if r.Method != http.MethodPost {
			t.Errorf("method = %s", r.Method)
		}
		gotAuth = r.Header.Get(serverCallTokenHeader)
		gotContentType = r.Header.Get("Content-Type")
		raw, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(raw, &body)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"tmsAccessToken":{"providerKind":"phrase","credentialId":"cred-1","authMode":"api_token","baseUrl":"https://api.phrase.com/v2","headerName":"Authorization","headerValue":"token phrase-api-token","expiresAt":null,"probeUrl":"https://api.phrase.com/v2/user"}}`))
	}))
	t.Cleanup(srv.Close)

	client, err := NewClient(Config{
		BaseURL:        srv.URL,
		CookiePassword: testCookiePassword,
		HTTPClient:     srv.Client(),
	})
	if err != nil {
		t.Fatal(err)
	}

	token, err := client.Mint(context.Background(), MintRequest{
		OrganizationID: "org-1",
		ProviderKind:   "phrase",
		ActorUserID:    "user-1",
	})
	if err != nil {
		t.Fatalf("Mint: %v", err)
	}
	if gotAuth != serviceToken(testCookiePassword) {
		t.Fatalf("service token = %q", gotAuth)
	}
	if !strings.HasPrefix(gotContentType, "application/json") {
		t.Fatalf("Content-Type = %q", gotContentType)
	}
	if body.OrganizationID != "org-1" || body.ProviderKind != "phrase" || body.ActorUserID != "user-1" {
		t.Fatalf("body = %#v", body)
	}
	if token.HeaderName != "Authorization" || token.HeaderValue != "token phrase-api-token" {
		t.Fatalf("token = %#v", token)
	}
	if token.ProbeURLValue() != "https://api.phrase.com/v2/user" {
		t.Fatalf("probe URL = %q", token.ProbeURLValue())
	}
}

func TestMintMapsWebErrorEnvelope(t *testing.T) {
	t.Parallel()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte(`{"error":"provider_credential_not_found","message":"missing"}`))
	}))
	t.Cleanup(srv.Close)

	client, err := NewClient(Config{
		BaseURL:        srv.URL,
		CookiePassword: testCookiePassword,
		HTTPClient:     srv.Client(),
	})
	if err != nil {
		t.Fatal(err)
	}

	_, err = client.Mint(context.Background(), MintRequest{
		OrganizationID: "org-1",
		ProviderKind:   "crowdin",
	})
	var apiErr *Error
	if !errors.As(err, &apiErr) {
		t.Fatalf("err type %T: %v", err, err)
	}
	if apiErr.Status != http.StatusNotFound || apiErr.Code != "provider_credential_not_found" {
		t.Fatalf("error = %#v", apiErr)
	}
}

func TestProbeUsesMintedHeader(t *testing.T) {
	t.Parallel()

	var gotAuth string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/user" {
			t.Errorf("path = %s", r.URL.Path)
		}
		gotAuth = r.Header.Get("Authorization")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"id":"1"}`))
	}))
	t.Cleanup(srv.Close)

	client, err := NewClient(Config{
		BaseURL:        "https://hyperlocalise.test",
		CookiePassword: testCookiePassword,
		HTTPClient:     srv.Client(),
	})
	if err != nil {
		t.Fatal(err)
	}

	probeURL := srv.URL + "/user"
	token := &AccessToken{
		HeaderName:  "Authorization",
		HeaderValue: "token phrase-api-token",
		ProbeURL:    &probeURL,
	}
	if err := client.Probe(context.Background(), token); err != nil {
		t.Fatalf("Probe: %v", err)
	}
	if gotAuth != "token phrase-api-token" {
		t.Fatalf("Authorization = %q", gotAuth)
	}
}

func TestProbeSkipsEmptyURL(t *testing.T) {
	t.Parallel()

	client, err := NewClient(Config{
		BaseURL:        "https://hyperlocalise.test",
		CookiePassword: testCookiePassword,
		HTTPClient:     http.DefaultClient,
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := client.Probe(context.Background(), &AccessToken{HeaderName: "Authorization", HeaderValue: "Bearer x"}); err != nil {
		t.Fatalf("Probe: %v", err)
	}
}

func TestCheckMintsThenProbes(t *testing.T) {
	t.Parallel()

	var srv *httptest.Server
	mux := http.NewServeMux()
	mux.HandleFunc(mintPath, func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get(serverCallTokenHeader) != serviceToken(testCookiePassword) {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"tmsAccessToken":{"providerKind":"lokalise","credentialId":"cred-1","authMode":"api_token","baseUrl":"https://api.lokalise.com","headerName":"X-Api-Token","headerValue":"lokalise-token","expiresAt":null,"probeUrl":"` + srv.URL + `/api2/projects?limit=1"}}`))
	})
	mux.HandleFunc("/api2/projects", func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Api-Token") != "lokalise-token" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"projects":[]}`))
	})
	srv = httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	client, err := NewClient(Config{
		BaseURL:        srv.URL,
		CookiePassword: testCookiePassword,
		HTTPClient:     srv.Client(),
	})
	if err != nil {
		t.Fatal(err)
	}

	token, err := client.Check(context.Background(), MintRequest{
		OrganizationID: "org-1",
		ProviderKind:   "lokalise",
	})
	if err != nil {
		t.Fatalf("Check: %v", err)
	}
	if token.HeaderValue != "lokalise-token" {
		t.Fatalf("token = %#v", token)
	}
}

func TestAccessTokenApply(t *testing.T) {
	t.Parallel()

	header := make(http.Header)
	AccessToken{HeaderName: "X-Api-Token", HeaderValue: "abc"}.Apply(header)
	if header.Get("X-Api-Token") != "abc" {
		t.Fatalf("header = %v", header)
	}
}

func TestBaseURLFromEnv(t *testing.T) {
	t.Setenv("HYPERLOCALISE_WEB_INTERNAL_URL", "https://web.internal")
	t.Setenv("HYPERLOCALISE_PUBLIC_APP_URL", "https://hyperlocalise.com")
	if got := BaseURLFromEnv(); got != "https://web.internal" {
		t.Fatalf("got %q", got)
	}

	t.Setenv("HYPERLOCALISE_WEB_INTERNAL_URL", "")
	if got := BaseURLFromEnv(); got != "https://hyperlocalise.com" {
		t.Fatalf("got %q", got)
	}
}
