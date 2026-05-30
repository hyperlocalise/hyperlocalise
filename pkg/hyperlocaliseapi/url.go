package hyperlocaliseapi

import (
	"fmt"
	"net"
	"net/url"
	"strings"
)

// ValidateAPIBaseURL ensures sync clients only send API keys to trusted Hyperlocalise hosts.
func ValidateAPIBaseURL(baseURL string) error {
	parsed, err := url.Parse(strings.TrimSpace(baseURL))
	if err != nil {
		return fmt.Errorf("hyperlocalise api base url: invalid url: %w", err)
	}
	if parsed.Scheme == "" || parsed.Host == "" {
		return fmt.Errorf("hyperlocalise api base url: must include scheme and host")
	}
	if parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
		return fmt.Errorf("hyperlocalise api base url: must not include userinfo, query, or fragment")
	}

	host := strings.ToLower(parsed.Hostname())
	if host == "" {
		return fmt.Errorf("hyperlocalise api base url: host is required")
	}

	if parsed.Scheme == "http" && isLoopbackHost(host) {
		return nil
	}
	if parsed.Scheme != "https" {
		return fmt.Errorf("hyperlocalise api base url: must use https")
	}
	if !isAllowedAPIHost(host) {
		return fmt.Errorf("hyperlocalise api base url: host %q is not allowed", host)
	}
	if ip := net.ParseIP(host); ip != nil && !ip.IsGlobalUnicast() {
		return fmt.Errorf("hyperlocalise api base url: host %q is not a public address", host)
	}
	return nil
}

func isLoopbackHost(host string) bool {
	if strings.EqualFold(host, "localhost") {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func isAllowedAPIHost(host string) bool {
	host = strings.TrimSuffix(strings.TrimSpace(host), ".")
	switch {
	case host == "hyperlocalise.com" || strings.HasSuffix(host, ".hyperlocalise.com"):
		return true
	default:
		return false
	}
}
