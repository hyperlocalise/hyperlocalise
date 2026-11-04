// Package tmsauth mints short-lived TMS credentials from the web app.
package tmsauth

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

const (
	mintPath               = "/api/internal/tms/access-token"
	serverCallTokenHeader  = "X-Go-Svc-Research-Token"
	serverCallTokenMessage = "go-svc-research"
	defaultTimeout         = 30 * time.Second
	maxErrorBodyBytes      = 1 << 20
)

// HTTPDoer is the subset of http.Client used by Client.
type HTTPDoer interface {
	Do(req *http.Request) (*http.Response, error)
}

// Config configures a TMS access-token client.
type Config struct {
	// BaseURL is the web app origin, for example https://hyperlocalise.com.
	BaseURL string
	// CookiePassword is WORKOS_COOKIE_PASSWORD. It must match the web app.
	CookiePassword string
	HTTPClient     HTTPDoer
}

// Client mints short-lived TMS tokens from the web app and calls TMS with them.
type Client struct {
	baseURL        string
	cookiePassword string
	http           HTTPDoer
}

// MintRequest names the organization credential to mint.
type MintRequest struct {
	OrganizationID string `json:"organizationId"`
	ProviderKind   string `json:"providerKind"`
	CredentialID   string `json:"credentialId,omitempty"`
	ActorUserID    string `json:"actorUserId,omitempty"`
}

// AccessToken is a ready-to-send TMS credential. It never includes refresh
// tokens, client secrets, or the master encryption key.
type AccessToken struct {
	ProviderKind string  `json:"providerKind"`
	CredentialID string  `json:"credentialId"`
	AuthMode     string  `json:"authMode"`
	BaseURL      string  `json:"baseUrl"`
	HeaderName   string  `json:"headerName"`
	HeaderValue  string  `json:"headerValue"`
	ExpiresAt    *string `json:"expiresAt"`
	ProbeURL     *string `json:"probeUrl"`
}

type mintResponse struct {
	TmsAccessToken AccessToken `json:"tmsAccessToken"`
}

type errorBody struct {
	Error   string `json:"error"`
	Message string `json:"message"`
}

// Error is a mint or probe failure.
type Error struct {
	Status  int
	Code    string
	Message string
}

func (e *Error) Error() string {
	if e == nil {
		return "tmsauth: error"
	}
	if e.Message != "" {
		return fmt.Sprintf("tmsauth: %s", e.Message)
	}
	if e.Code != "" {
		return fmt.Sprintf("tmsauth: %s", e.Code)
	}
	return fmt.Sprintf("tmsauth: HTTP %d", e.Status)
}

// BaseURLFromEnv returns HYPERLOCALISE_WEB_INTERNAL_URL, or the public web
// origin when that is unset.
func BaseURLFromEnv() string {
	if value := strings.TrimSpace(os.Getenv("HYPERLOCALISE_WEB_INTERNAL_URL")); value != "" {
		return value
	}
	return strings.TrimSpace(os.Getenv("HYPERLOCALISE_PUBLIC_APP_URL"))
}

// NewClient constructs a Client.
func NewClient(cfg Config) (*Client, error) {
	baseURL := strings.TrimRight(strings.TrimSpace(cfg.BaseURL), "/")
	if baseURL == "" {
		return nil, fmt.Errorf("tmsauth: missing web base URL")
	}
	password := strings.TrimSpace(cfg.CookiePassword)
	if password == "" {
		return nil, fmt.Errorf("tmsauth: missing cookie password")
	}
	httpClient := cfg.HTTPClient
	if httpClient == nil {
		httpClient = &http.Client{
			Timeout: defaultTimeout,
			CheckRedirect: func(*http.Request, []*http.Request) error {
				return http.ErrUseLastResponse
			},
		}
	}
	return &Client{
		baseURL:        baseURL,
		cookiePassword: password,
		http:           httpClient,
	}, nil
}

// Mint asks the web app to decrypt and refresh the stored TMS credential, then
// returns a short-lived access token go-svc can send to the provider.
func (c *Client) Mint(ctx context.Context, request MintRequest) (*AccessToken, error) {
	if c == nil {
		return nil, fmt.Errorf("tmsauth: nil client")
	}
	request.OrganizationID = strings.TrimSpace(request.OrganizationID)
	request.ProviderKind = strings.TrimSpace(request.ProviderKind)
	request.CredentialID = strings.TrimSpace(request.CredentialID)
	request.ActorUserID = strings.TrimSpace(request.ActorUserID)
	if request.OrganizationID == "" || request.ProviderKind == "" {
		return nil, fmt.Errorf("tmsauth: organizationId and providerKind are required")
	}

	payload, err := json.Marshal(request)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+mintPath, bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set(serverCallTokenHeader, serviceToken(c.cookiePassword))

	res, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer func() { _ = res.Body.Close() }()
	raw, err := io.ReadAll(io.LimitReader(res.Body, maxErrorBodyBytes))
	if err != nil {
		return nil, err
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return nil, decodeError(res.StatusCode, raw)
	}

	var body mintResponse
	if err := json.Unmarshal(raw, &body); err != nil {
		return nil, fmt.Errorf("tmsauth: decode response: %w", err)
	}
	if strings.TrimSpace(body.TmsAccessToken.HeaderName) == "" || strings.TrimSpace(body.TmsAccessToken.HeaderValue) == "" {
		return nil, fmt.Errorf("tmsauth: access token missing authorization header")
	}
	return &body.TmsAccessToken, nil
}

// Apply sets the minted TMS credential on an outbound request.
func (t AccessToken) Apply(header http.Header) {
	if strings.TrimSpace(t.HeaderName) == "" || strings.TrimSpace(t.HeaderValue) == "" {
		return
	}
	header.Set(t.HeaderName, t.HeaderValue)
}

// ProbeURLValue returns the optional provider identity URL.
func (t AccessToken) ProbeURLValue() string {
	if t.ProbeURL == nil {
		return ""
	}
	return strings.TrimSpace(*t.ProbeURL)
}

// Probe GETs the minted probe URL with the access token. An empty probe URL
// is a no-op; Smartling mint already authenticated.
func (c *Client) Probe(ctx context.Context, token *AccessToken) error {
	if c == nil {
		return fmt.Errorf("tmsauth: nil client")
	}
	if token == nil {
		return fmt.Errorf("tmsauth: missing access token")
	}
	probeURL := token.ProbeURLValue()
	if probeURL == "" {
		return nil
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, probeURL, nil)
	if err != nil {
		return err
	}
	token.Apply(req.Header)
	req.Header.Set("Accept", "application/json")

	res, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer func() { _ = res.Body.Close() }()
	_, _ = io.Copy(io.Discard, io.LimitReader(res.Body, maxErrorBodyBytes))

	if res.StatusCode == http.StatusUnauthorized || res.StatusCode == http.StatusForbidden {
		return &Error{Status: res.StatusCode, Code: "provider_auth_invalid", Message: "Provider rejected the minted credential."}
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return &Error{
			Status:  res.StatusCode,
			Code:    "provider_probe_failed",
			Message: fmt.Sprintf("Provider probe returned HTTP %d.", res.StatusCode),
		}
	}
	return nil
}

// Check mints a token and probes the provider when a probe URL is present.
func (c *Client) Check(ctx context.Context, request MintRequest) (*AccessToken, error) {
	token, err := c.Mint(ctx, request)
	if err != nil {
		return nil, err
	}
	if err := c.Probe(ctx, token); err != nil {
		return token, err
	}
	return token, nil
}

func serviceToken(cookiePassword string) string {
	mac := hmac.New(sha256.New, []byte(cookiePassword))
	_, _ = mac.Write([]byte(serverCallTokenMessage))
	return hex.EncodeToString(mac.Sum(nil))
}

func decodeError(status int, raw []byte) error {
	var body errorBody
	_ = json.Unmarshal(raw, &body)
	code := strings.TrimSpace(body.Error)
	if code == "" {
		code = "tms_access_token_failed"
	}
	return &Error{Status: status, Code: code, Message: strings.TrimSpace(body.Message)}
}
