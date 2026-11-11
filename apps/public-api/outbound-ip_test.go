package main

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
)

type fakeOutboundIP struct {
	address    string
	addressErr error
	name       string
	addresses  []string
	ssmErr     error
}

func (f fakeOutboundIP) observedIP(context.Context) (string, error) {
	return f.address, f.addressErr
}

func (f fakeOutboundIP) natAddresses(context.Context) (string, []string, error) {
	return f.name, f.addresses, f.ssmErr
}

func TestOutboundIP(t *testing.T) {
	h := newHandlerWithOutbound(authFunc(func(context.Context, string) (principal, error) {
		t.Fatal("outbound IP does not authenticate")
		return principal{}, nil
	}), nil, fakeOutboundIP{
		address:   "203.0.113.10",
		name:      defaultNATEgressParameter,
		addresses: []string{"203.0.113.10", "203.0.113.11"},
	})
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/outbound-ip", nil))
	require.Equal(t, http.StatusOK, w.Code)
	require.JSONEq(t, `{
		"checkip": "203.0.113.10",
		"ssmParameter": "/hyperlocalise/prod/ecs/public-api/nat_public_ip_addresses",
		"ssmAddresses": ["203.0.113.10", "203.0.113.11"]
	}`, w.Body.String())
}

func TestOutboundIPPartialFailures(t *testing.T) {
	checkFailed := newHandlerWithOutbound(nil, nil, fakeOutboundIP{
		addressErr: errors.New("dial failed"),
		name:       defaultNATEgressParameter,
		addresses:  []string{"203.0.113.11"},
	})
	w := httptest.NewRecorder()
	checkFailed.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/outbound-ip", nil))
	require.Equal(t, http.StatusBadGateway, w.Code)
	require.Contains(t, w.Body.String(), `"checkipError":"outbound IP lookup failed"`)
	require.Contains(t, w.Body.String(), `"203.0.113.11"`)
	require.NotContains(t, w.Body.String(), "dial failed")

	parameterFailed := newHandlerWithOutbound(nil, nil, fakeOutboundIP{
		address: "203.0.113.10",
		name:    defaultNATEgressParameter,
		ssmErr:  errors.New("access denied"),
	})
	w = httptest.NewRecorder()
	parameterFailed.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/outbound-ip", nil))
	require.Equal(t, http.StatusServiceUnavailable, w.Code)
	require.Contains(t, w.Body.String(), `"checkip":"203.0.113.10"`)
	require.Contains(t, w.Body.String(), `"ssmError":"parameter lookup failed"`)
	require.NotContains(t, w.Body.String(), "access denied")
}

func TestObservedIP(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = io.WriteString(w, " 198.51.100.20\n")
	}))
	t.Cleanup(upstream.Close)
	lookup := &liveOutboundIP{client: upstream.Client(), checkURL: upstream.URL}
	address, err := lookup.observedIP(t.Context())
	require.NoError(t, err)
	require.Equal(t, "198.51.100.20", address)
	require.Equal(t, []string{"203.0.113.10", "198.51.100.8"}, splitAddresses(" 203.0.113.10, 198.51.100.8 "))
}
