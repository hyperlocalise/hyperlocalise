package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const (
	introspectionPath      = "/api/internal/public-api/introspect"
	introspectionTimeout   = 5 * time.Second
	maxIntrospectionBytes  = 64 * 1024
	minServiceSecretLength = 32
)

var (
	errUnauthorized    = errors.New("invalid or revoked API key")
	errForbidden       = errors.New("workspace access denied")
	errAuthUnavailable = errors.New("authentication service unavailable")
)

type principal struct {
	TokenID        string   `json:"tokenId"`
	UserID         string   `json:"userId"`
	OrganizationID string   `json:"organizationId"`
	Permissions    []string `json:"permissions"`
}

type authenticator interface {
	authenticate(context.Context, string) (principal, error)
}

type platformAuthenticator struct {
	endpoint string
	secret   string
	client   *http.Client
}

func newPlatformAuthenticator(origin, secret string) (*platformAuthenticator, error) {
	u, err := url.Parse(origin)
	if err != nil || u.Hostname() == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || (u.Path != "" && u.Path != "/") {
		return nil, errors.New("PUBLIC_API_PLATFORM_URL must be an origin without credentials, path, query, or fragment")
	}
	ip := net.ParseIP(u.Hostname())
	isLoopback := u.Hostname() == "localhost" || (ip != nil && ip.IsLoopback())
	if u.Scheme != "https" && (u.Scheme != "http" || !isLoopback) {
		return nil, errors.New("PUBLIC_API_PLATFORM_URL requires HTTPS except on loopback")
	}
	if len(secret) < minServiceSecretLength || strings.TrimSpace(secret) != secret || strings.ContainsAny(secret, "\r\n") {
		return nil, errors.New("PUBLIC_API_SERVICE_SECRET must contain at least 32 characters with no surrounding whitespace or newlines")
	}
	u.Path = introspectionPath
	return &platformAuthenticator{
		endpoint: u.String(),
		secret:   secret,
		client: &http.Client{
			Timeout: introspectionTimeout,
			// Never forward credentials to a redirect destination, including the same host.
			CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse },
		},
	}, nil
}

func (a *platformAuthenticator) authenticate(ctx context.Context, token string) (principal, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, a.endpoint, nil)
	if err != nil {
		return principal{}, errAuthUnavailable
	}
	req.Header.Set("Authorization", "Bearer "+a.secret)
	req.Header.Set("X-Api-Key", token)
	req.Header.Set("Accept", "application/json")
	resp, err := a.client.Do(req)
	if err != nil {
		// Transport errors may include URLs. Do not expose or log their contents.
		return principal{}, errAuthUnavailable
	}
	defer func() { _ = resp.Body.Close() }() // Read-only HTTP body; close errors cannot change the result.
	data, err := io.ReadAll(io.LimitReader(resp.Body, maxIntrospectionBytes+1))
	if err != nil || len(data) > maxIntrospectionBytes {
		return principal{}, errAuthUnavailable
	}
	if resp.StatusCode != http.StatusOK {
		var failure struct {
			Error string `json:"error"`
		}
		if json.Unmarshal(data, &failure) != nil {
			return principal{}, errAuthUnavailable
		}
		switch {
		case resp.StatusCode == http.StatusUnauthorized && failure.Error == "unauthorized":
			return principal{}, errUnauthorized
		case resp.StatusCode == http.StatusForbidden && (failure.Error == "forbidden" || failure.Error == "workspace_archived"):
			return principal{}, errForbidden
		default:
			return principal{}, errAuthUnavailable
		}
	}
	var result struct {
		Principal principal `json:"principal"`
	}
	if err := json.Unmarshal(data, &result); err != nil {
		return principal{}, errAuthUnavailable
	}
	p := result.Principal
	if p.TokenID == "" || p.UserID == "" || p.OrganizationID == "" || p.Permissions == nil {
		return principal{}, fmt.Errorf("incomplete principal: %w", errAuthUnavailable)
	}
	return p, nil
}
