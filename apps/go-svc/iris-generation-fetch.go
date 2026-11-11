package main

import (
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"strings"
	"time"
)

const irisMaxFetchBytes = 64 << 20

var irisFetchClient = irisPublicHTTPClient()

func irisPublicHTTPClient() *http.Client {
	return &http.Client{
		Timeout: irisProviderTimeout,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 3 {
				return fmt.Errorf("too many redirects")
			}
			if req.URL == nil {
				return fmt.Errorf("invalid https url")
			}
			return validatePublicHTTPSURL(req.URL)
		},
		Transport: &http.Transport{
			DialContext: dialPublicAddress,
		},
	}
}

func validatePublicHTTPSURL(target *url.URL) error {
	if target == nil || target.Scheme != "https" || target.Host == "" || target.User != nil {
		return fmt.Errorf("refusing non-https url")
	}
	host := target.Hostname()
	if host == "" {
		return fmt.Errorf("refusing non-https url")
	}
	if ip, err := netip.ParseAddr(host); err == nil {
		if !isRoutableLinkedDomainIP(ip) {
			return fmt.Errorf("refusing non-public address")
		}
		return nil
	}
	if !isPublicHostname(host) {
		return fmt.Errorf("refusing non-public address")
	}
	return nil
}

func parsePublicHTTPSURL(rawURL string) (*url.URL, error) {
	trimmed := strings.TrimSpace(rawURL)
	if !strings.HasPrefix(trimmed, "https://") {
		return nil, fmt.Errorf("refusing non-https url")
	}
	target, err := url.Parse(trimmed)
	if err != nil {
		return nil, fmt.Errorf("invalid https url")
	}
	if err := validatePublicHTTPSURL(target); err != nil {
		return nil, err
	}
	return target, nil
}

func dialPublicAddress(ctx context.Context, network, address string) (net.Conn, error) {
	host, port, err := net.SplitHostPort(address)
	if err != nil {
		return nil, err
	}
	ips, err := net.DefaultResolver.LookupIPAddr(ctx, host)
	if err != nil {
		return nil, err
	}
	for _, ip := range ips {
		parsed, ok := netip.AddrFromSlice(ip.IP)
		if !ok || !isRoutableLinkedDomainIP(parsed) {
			continue
		}
		return (&net.Dialer{Timeout: 10 * time.Second}).DialContext(ctx, network, net.JoinHostPort(parsed.String(), port))
	}
	return nil, fmt.Errorf("refusing non-public address")
}

func fetchHTTPS(ctx context.Context, rawURL string) ([]byte, string, error) {
	target, err := parsePublicHTTPSURL(rawURL)
	if err != nil {
		return nil, "", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target.String(), nil)
	if err != nil {
		return nil, "", err
	}
	resp, err := irisFetchClient.Do(req)
	if err != nil {
		return nil, "", err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, "", fmt.Errorf("remote asset fetch failed: %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, irisMaxFetchBytes+1))
	if err != nil {
		return nil, "", err
	}
	if int64(len(body)) > irisMaxFetchBytes {
		return nil, "", fmt.Errorf("remote asset is too large")
	}
	return body, resp.Header.Get("Content-Type"), nil
}
