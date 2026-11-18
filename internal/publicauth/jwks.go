package publicauth

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
	"strings"
	"sync"
	"time"

	"github.com/workos/workos-go/v10"
)

const (
	jwksCacheTTL     = 10 * time.Minute
	jwksHTTPTimeout  = 5 * time.Second
	maxJWKSBodyBytes = 1 << 20
)

// JWKS caches the RSA signing keys a WorkOS JWKS endpoint publishes.
type JWKS struct {
	url    string
	Fetch  func(ctx context.Context, jwksURL string) (*workos.JWKSResponse, error)
	mu     sync.Mutex
	keys   map[string]*rsa.PublicKey
	expiry time.Time
}

// NewJWKS reads keys from jwksURL on first use and refreshes them every 10 minutes.
func NewJWKS(jwksURL string) *JWKS {
	return &JWKS{
		url:   jwksURL,
		Fetch: FetchWorkOSJWKS,
		keys:  map[string]*rsa.PublicKey{},
	}
}

// PublicKey returns the key with id kid.
func (c *JWKS) PublicKey(ctx context.Context, kid string) (*rsa.PublicKey, error) {
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

func (c *JWKS) refreshLocked(ctx context.Context) error {
	if c.Fetch == nil || strings.TrimSpace(c.url) == "" {
		return errors.New("jwks unavailable")
	}
	resp, err := c.Fetch(ctx, c.url)
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

// FetchWorkOSJWKS downloads a JWKS document.
func FetchWorkOSJWKS(ctx context.Context, jwksURL string) (*workos.JWKSResponse, error) {
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
