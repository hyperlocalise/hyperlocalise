package main

import (
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
)

const corsMaxAgeSeconds = "600"

var defaultBrowserOrigins = []string{
	"https://hyperlocalise.com",
	"https://www.hyperlocalise.com",
	"https://hyperlocalize.com",
	"https://www.hyperlocalize.com",
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := strings.TrimSpace(r.Header.Get("Origin"))
		if allowedBrowserOrigin(origin, r.Host) {
			header := w.Header()
			header.Set("Access-Control-Allow-Origin", origin)
			header.Add("Vary", "Origin")
			header.Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS")
			header.Set("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept, If-None-Match, X-API-Key, X-Go-Svc-Research-Token")
			header.Set("Access-Control-Expose-Headers", "Content-Disposition, Content-Type, ETag, X-Export-Extension")
			header.Set("Access-Control-Max-Age", corsMaxAgeSeconds)
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

func denyBrowserMutation(r *http.Request) bool {
	switch r.Method {
	case http.MethodGet, http.MethodHead, http.MethodOptions:
		return false
	}
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	if origin != "" {
		return !allowedBrowserOrigin(origin, r.Host)
	}
	return r.Header.Get("Sec-Fetch-Site") == "cross-site"
}

func allowedBrowserOrigin(origin, requestHost string) bool {
	parsed, ok := parseBrowserOrigin(origin)
	if !ok {
		return false
	}
	if strings.EqualFold(parsed.Host, requestHost) {
		return true
	}
	if isLoopbackOrigin(parsed) {
		return true
	}
	canonical := canonicalOrigin(parsed)
	for _, allowed := range defaultBrowserOrigins {
		if canonical == allowed {
			return true
		}
	}
	for _, extra := range strings.Split(os.Getenv("GO_SVC_CORS_ORIGINS"), ",") {
		trimmed := strings.TrimSpace(extra)
		if trimmed == "" {
			continue
		}
		allowed, extraOK := parseBrowserOrigin(trimmed)
		if extraOK && canonical == canonicalOrigin(allowed) {
			return true
		}
	}
	return false
}

func parseBrowserOrigin(origin string) (*url.URL, bool) {
	origin = strings.TrimSpace(origin)
	if origin == "" || origin == "null" {
		return nil, false
	}
	parsed, err := url.Parse(origin)
	if err != nil || parsed.Opaque != "" || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
		return nil, false
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return nil, false
	}
	if parsed.Path != "" && parsed.Path != "/" {
		return nil, false
	}
	if parsed.Host == "" {
		return nil, false
	}
	return parsed, true
}

func canonicalOrigin(parsed *url.URL) string {
	return strings.ToLower(parsed.Scheme) + "://" + strings.ToLower(parsed.Host)
}

func isLoopbackOrigin(parsed *url.URL) bool {
	host := parsed.Hostname()
	if host == "localhost" {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}
