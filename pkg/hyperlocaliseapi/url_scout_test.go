package hyperlocaliseapi

import (
	"strings"
	"testing"
)

func TestValidateAPIBaseURL_ScoutEdgeCases(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		baseURL string
		wantErr string
	}{
		{
			name:    "empty string",
			baseURL: "",
			wantErr: "must include scheme and host",
		},
		{
			name:    "whitespace only",
			baseURL: "   ",
			wantErr: "must include scheme and host",
		},
		{
			name:    "invalid url structure (percent encoding error)",
			baseURL: "https://hyperlocalise.com/%invalid",
			wantErr: "invalid url",
		},
		{
			name:    "missing scheme",
			baseURL: "api.hyperlocalise.com",
			wantErr: "must include scheme and host",
		},
		{
			name:    "missing host",
			baseURL: "https:///path",
			wantErr: "must include scheme and host",
		},
		{
			name:    "includes userinfo (username)",
			baseURL: "https://user@api.hyperlocalise.com",
			wantErr: "must not include userinfo, query, or fragment",
		},
		{
			name:    "includes userinfo (username and password)",
			baseURL: "https://user:password@api.hyperlocalise.com",
			wantErr: "must not include userinfo, query, or fragment",
		},
		{
			name:    "includes query parameter",
			baseURL: "https://api.hyperlocalise.com?foo=bar",
			wantErr: "must not include userinfo, query, or fragment",
		},
		{
			name:    "includes hash fragment",
			baseURL: "https://api.hyperlocalise.com#section",
			wantErr: "must not include userinfo, query, or fragment",
		},
		{
			name:    "http scheme is blocked on production domains",
			baseURL: "http://api.hyperlocalise.com",
			wantErr: "must use https",
		},
		{
			name:    "http scheme is allowed on IPv4 localhost",
			baseURL: "http://127.0.0.1:8080",
			wantErr: "",
		},
		{
			name:    "http scheme is allowed on named localhost",
			baseURL: "http://localhost:3000",
			wantErr: "",
		},
		{
			name:    "http scheme is allowed on IPv6 localhost loopback",
			baseURL: "http://[::1]:3000",
			wantErr: "",
		},
		{
			name:    "https scheme is not allowed on IPv6 localhost loopback because only http loopback is bypassable",
			baseURL: "https://[::1]:3000",
			wantErr: "not allowed",
		},
		{
			name:    "malicious domain tricks (suffix mismatch)",
			baseURL: "https://hyperlocalise.com.attacker.com",
			wantErr: "not allowed",
		},
		{
			name:    "malicious domain tricks (partial match)",
			baseURL: "https://fakehyperlocalise.com",
			wantErr: "not allowed",
		},
		{
			name:    "subdomain of allowed domain is allowed",
			baseURL: "https://sub.api.hyperlocalise.com/v1",
			wantErr: "",
		},
		{
			name:    "allowed domain with trailing dot is allowed",
			baseURL: "https://hyperlocalise.com.",
			wantErr: "",
		},
		{
			name:    "non-global unicast private IP (RFC1918) is blocked",
			baseURL: "https://10.0.0.1/api",
			wantErr: "not allowed",
		},
		{
			name:    "multicast IP is blocked",
			baseURL: "https://224.0.0.1/api",
			wantErr: "not allowed",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateAPIBaseURL(tt.baseURL)
			if tt.wantErr == "" {
				if err != nil {
					t.Errorf("ValidateAPIBaseURL(%q) unexpected error: %v", tt.baseURL, err)
				}
			} else {
				if err == nil {
					t.Errorf("ValidateAPIBaseURL(%q) expected error containing %q, got nil", tt.baseURL, tt.wantErr)
				} else if !strings.Contains(err.Error(), tt.wantErr) {
					t.Errorf("ValidateAPIBaseURL(%q) error %q does not contain %q", tt.baseURL, err.Error(), tt.wantErr)
				}
			}
		})
	}
}
