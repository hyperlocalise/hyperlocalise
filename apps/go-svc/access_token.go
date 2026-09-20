package main

import (
	"context"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/workos/workos-go/v10"
)

const (
	jwksCacheTTL           = 10 * time.Minute
	jwksHTTPTimeout        = 5 * time.Second
	accessTokenClockLeeway = 30 * time.Second
	maxJWKSBodyBytes       = 1 << 20
	workOSProductionAPIURL = "https://api.workos.com"
)

type workosAccessTokenClaims struct {
	jwt.RegisteredClaims
	SessionID      string          `json:"sid"`
	OrganizationID string          `json:"org_id"`
	Act            json.RawMessage `json:"act"`
}

type jwksCache struct {
	url    string
	fetch  func(ctx context.Context, jwksURL string) (*workos.JWKSResponse, error)
	mu     sync.Mutex
	keys   map[string]*rsa.PublicKey
	expiry time.Time
}

func newJWKSCache(jwksURL string) *jwksCache {
	return &jwksCache{
		url:   jwksURL,
		fetch: fetchWorkOSJWKS,
		keys:  map[string]*rsa.PublicKey{},
	}
}

func workosAPIBaseURL() string {
	host := strings.TrimSpace(os.Getenv("WORKOS_API_HOSTNAME"))
	if host == "" {
		return workOSProductionAPIURL
	}

	scheme := "https"
	if strings.EqualFold(strings.TrimSpace(os.Getenv("WORKOS_API_HTTPS")), "false") {
		scheme = "http"
	}

	base := scheme + "://" + host
	if port := strings.TrimSpace(os.Getenv("WORKOS_API_PORT")); port != "" {
		base += ":" + port
	}
	return strings.TrimRight(base, "/")
}

func (v *WorkOSSessionVerifier) VerifyAccessToken(ctx context.Context, accessToken string) (AuthClaims, error) {
	accessToken = strings.TrimSpace(accessToken)
	if accessToken == "" {
		return AuthClaims{}, newAuthError("missing_access_token", "invalid access token")
	}
	if v.clientID == "" {
		return AuthClaims{}, newAuthError("invalid_access_token", "invalid access token")
	}

	parser := jwt.NewParser(
		jwt.WithValidMethods([]string{jwt.SigningMethodRS256.Alg()}),
		jwt.WithExpirationRequired(),
		jwt.WithLeeway(accessTokenClockLeeway),
		jwt.WithAudience(v.clientID),
	)
	claims := &workosAccessTokenClaims{}
	token, err := parser.ParseWithClaims(accessToken, claims, func(t *jwt.Token) (any, error) {
		kid, _ := t.Header["kid"].(string)
		if strings.TrimSpace(kid) == "" {
			return nil, errors.New("missing kid")
		}
		if v.jwks == nil {
			return nil, errors.New("jwks unavailable")
		}
		return v.jwks.publicKey(ctx, kid)
	})
	if err != nil || token == nil || !token.Valid {
		return AuthClaims{}, newAuthError("invalid_access_token", "invalid access token")
	}

	if !issuerAllowed(claims.Issuer, v.apiBaseURL, v.clientID) {
		return AuthClaims{}, newAuthError("invalid_access_token", "invalid access token")
	}
	if len(claims.Act) > 0 && string(claims.Act) != "null" {
		return AuthClaims{}, newAuthError("invalid_access_token", "invalid access token")
	}
	if claims.Subject == "" || claims.SessionID == "" {
		return AuthClaims{}, newAuthError("invalid_access_token", "invalid access token")
	}

	return AuthClaims{
		UserID:    claims.Subject,
		OrgID:     claims.OrganizationID,
		SessionID: claims.SessionID,
	}, nil
}

func issuerAllowed(issuer, apiBaseURL, clientID string) bool {
	issuer = strings.TrimRight(strings.TrimSpace(issuer), "/")
	apiBaseURL = strings.TrimRight(strings.TrimSpace(apiBaseURL), "/")
	if issuer == "" || apiBaseURL == "" {
		return false
	}
	if issuer == apiBaseURL {
		return true
	}
	return issuer == apiBaseURL+"/"+clientID
}

func (c *jwksCache) publicKey(ctx context.Context, kid string) (*rsa.PublicKey, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	now := time.Now()
	if now.Before(c.expiry) && len(c.keys) > 0 {
		if key, ok := c.keys[kid]; ok {
			return key, nil
		}
		return nil, fmt.Errorf("unknown jwks kid %q", kid)
	}

	if err := c.refreshLocked(ctx); err != nil {
		if key, ok := c.keys[kid]; ok {
			return key, nil
		}
		return nil, err
	}
	key, ok := c.keys[kid]
	if !ok {
		return nil, fmt.Errorf("unknown jwks kid %q", kid)
	}
	return key, nil
}

func (c *jwksCache) refreshLocked(ctx context.Context) error {
	if c.fetch == nil || strings.TrimSpace(c.url) == "" {
		return errors.New("jwks unavailable")
	}
	resp, err := c.fetch(ctx, c.url)
	if err != nil {
		return err
	}
	keys := make(map[string]*rsa.PublicKey, len(resp.Keys))
	for _, item := range resp.Keys {
		if item == nil || item.Kty != "RSA" || strings.TrimSpace(item.Kid) == "" {
			continue
		}
		key, err := rsaPublicKeyFromJWKS(item.N, item.E)
		if err != nil {
			continue
		}
		keys[item.Kid] = key
	}
	if len(keys) == 0 {
		return errors.New("jwks empty")
	}
	c.keys = keys
	c.expiry = time.Now().Add(jwksCacheTTL)
	return nil
}

func rsaPublicKeyFromJWKS(nB64, eB64 string) (*rsa.PublicKey, error) {
	nBytes, err := base64.RawURLEncoding.DecodeString(nB64)
	if err != nil {
		return nil, err
	}
	eBytes, err := base64.RawURLEncoding.DecodeString(eB64)
	if err != nil {
		return nil, err
	}
	if len(nBytes) == 0 || len(eBytes) == 0 {
		return nil, errors.New("invalid jwk")
	}
	eInt := 0
	for _, b := range eBytes {
		eInt = eInt<<8 | int(b)
	}
	if eInt <= 0 {
		return nil, errors.New("invalid jwk exponent")
	}
	return &rsa.PublicKey{
		N: new(big.Int).SetBytes(nBytes),
		E: eInt,
	}, nil
}

func fetchWorkOSJWKS(ctx context.Context, jwksURL string) (*workos.JWKSResponse, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, jwksURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")

	client := &http.Client{Timeout: jwksHTTPTimeout}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("jwks status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, maxJWKSBodyBytes+1))
	if err != nil {
		return nil, err
	}
	if len(body) > maxJWKSBodyBytes {
		return nil, errors.New("jwks too large")
	}

	var result workos.JWKSResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, err
	}
	return &result, nil
}
