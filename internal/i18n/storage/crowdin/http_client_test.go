package crowdin

import (
	"errors"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"github.com/crowdin/crowdin-api-client-go/crowdin/model"
)

func TestParseProjectID(t *testing.T) {
	if got, err := parseProjectID("123"); err != nil || got != 123 {
		t.Fatalf("parseProjectID valid failed: got=%d err=%v", got, err)
	}
	if _, err := parseProjectID("abc"); err == nil {
		t.Fatalf("expected parseProjectID error for non-numeric value")
	}
	if _, err := parseProjectID("0"); err == nil {
		t.Fatalf("expected parseProjectID error for zero value")
	}
}

func TestIndexSourceStringMarksAmbiguousMapping(t *testing.T) {
	byID := make(map[int]sourceStringMeta)
	byKey := make(map[sourceStringKey]int)

	indexSourceString(byID, byKey, &model.SourceString{
		ID:         1,
		Identifier: "hello",
		Context:    "home",
	})
	indexSourceString(byID, byKey, &model.SourceString{
		ID:         2,
		Identifier: "hello",
		Context:    "home",
	})

	if got := byKey[sourceStringKey{key: "hello", context: "home"}]; got != -1 {
		t.Fatalf("expected ambiguous key mapping to -1, got %d", got)
	}
	if got := len(byID); got != 2 {
		t.Fatalf("expected byID to retain both strings, got %d", got)
	}
}

func TestIsRetryableUpsertError(t *testing.T) {
	cases := []struct {
		name string
		err  error
		want bool
	}{
		{
			name: "429",
			err: &model.ErrorResponse{
				Response: &http.Response{StatusCode: http.StatusTooManyRequests},
			},
			want: true,
		},
		{
			name: "500",
			err: &model.ErrorResponse{
				Response: &http.Response{StatusCode: http.StatusInternalServerError},
			},
			want: true,
		},
		{
			name: "400",
			err: &model.ErrorResponse{
				Response: &http.Response{StatusCode: http.StatusBadRequest},
			},
			want: false,
		},
		{
			name: "network",
			err:  &net.DNSError{IsTimeout: true},
			want: true,
		},
		{
			name: "other",
			err:  errors.New("boom"),
			want: false,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := isRetryableUpsertError(tc.err); got != tc.want {
				t.Fatalf("isRetryableUpsertError() = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestRetryDelayPrefersRetryAfterHeader(t *testing.T) {
	err := &model.ErrorResponse{
		Response: &http.Response{
			StatusCode: http.StatusTooManyRequests,
			Header:     http.Header{"Retry-After": []string{"2"}},
		},
	}

	if got := retryDelay(0, err); got != 2*time.Second {
		t.Fatalf("retryDelay() = %s, want 2s", got)
	}
}

func TestJoinURLPath(t *testing.T) {
	tests := []struct {
		name   string
		prefix string
		path   string
		want   string
	}{
		{name: "empty prefix", prefix: "", path: "/api/v2/projects", want: "/api/v2/projects"},
		{name: "prefix and path", prefix: "/proxy", path: "/api/v2/projects", want: "/proxy/api/v2/projects"},
		{name: "already trimmed", prefix: "/proxy/", path: "api/v2/projects", want: "/proxy/api/v2/projects"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := joinURLPath(tc.prefix, tc.path); got != tc.want {
				t.Fatalf("joinURLPath() = %q, want %q", got, tc.want)
			}
		})
	}
}

func TestAPIBaseURLRoundTripperRewritesCloudHost(t *testing.T) {
	var seenPath string
	var seenHost string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seenPath = r.URL.Path
		seenHost = r.Host
		w.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()

	overrideURL := server.URL + "/proxy"
	parsed, err := url.Parse(overrideURL)
	if err != nil {
		t.Fatalf("parse override url: %v", err)
	}

	rt := &apiBaseURLRoundTripper{base: http.DefaultTransport, override: parsed, cloudHost: "api.crowdin.com"}
	client := &http.Client{Transport: rt}
	req, err := http.NewRequest(http.MethodGet, "https://api.crowdin.com/api/v2/projects", nil)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}

	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("do request: %v", err)
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, resp.Body)

	if seenPath != "/proxy/api/v2/projects" {
		t.Fatalf("unexpected rewritten path: %q", seenPath)
	}
	if seenHost != parsed.Host {
		t.Fatalf("unexpected rewritten host: %q", seenHost)
	}
}
