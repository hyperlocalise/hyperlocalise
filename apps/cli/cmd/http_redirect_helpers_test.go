package cmd

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
)

type redirectTransport struct {
	target *url.URL
	base   http.RoundTripper
}

func (rt redirectTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	clone := req.Clone(req.Context())
	clone.URL.Scheme = rt.target.Scheme
	clone.URL.Host = rt.target.Host
	clone.Host = rt.target.Host
	return rt.base.RoundTrip(clone)
}

func newRedirectTransport(t *testing.T, server *httptest.Server) redirectTransport {
	t.Helper()
	target, err := url.Parse(server.URL)
	if err != nil {
		t.Fatalf("parse test server url: %v", err)
	}
	return redirectTransport{target: target, base: server.Client().Transport}
}

func redirectDefaultTransport(t *testing.T, server *httptest.Server) {
	t.Helper()
	original := http.DefaultTransport
	http.DefaultTransport = newRedirectTransport(t, server)
	t.Cleanup(func() { http.DefaultTransport = original })
}

func redirectUpdateHTTPClient(t *testing.T, server *httptest.Server) {
	t.Helper()
	original := updateHTTPClient
	updateHTTPClient = &http.Client{Transport: newRedirectTransport(t, server)}
	t.Cleanup(func() { updateHTTPClient = original })
}
