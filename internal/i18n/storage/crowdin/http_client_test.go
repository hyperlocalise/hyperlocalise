package crowdin

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	sdkcrowdin "github.com/crowdin/crowdin-api-client-go/crowdin"
	"github.com/crowdin/crowdin-api-client-go/crowdin/model"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/storage"
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

func TestIsConflictError(t *testing.T) {
	cases := []struct {
		name string
		err  error
		want bool
	}{
		{
			name: "error response conflict",
			err: &model.ErrorResponse{
				Response: &http.Response{StatusCode: http.StatusConflict},
			},
			want: true,
		},
		{
			name: "validation error conflict",
			err: &model.ValidationErrorResponse{
				Status: http.StatusConflict,
			},
			want: true,
		},
		{
			name: "not conflict",
			err: &model.ErrorResponse{
				Response: &http.Response{StatusCode: http.StatusBadRequest},
			},
			want: false,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := isConflictError(tc.err); got != tc.want {
				t.Fatalf("isConflictError() = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestExcludedTargetLanguagesDiffer(t *testing.T) {
	cases := []struct {
		name    string
		current []string
		desired []string
		want    bool
	}{
		{
			name:    "same values different order",
			current: []string{"fr", "de"},
			desired: []string{"de", "fr"},
			want:    false,
		},
		{
			name:    "duplicates and blanks normalize away",
			current: []string{"de", "", "de"},
			desired: []string{"de"},
			want:    false,
		},
		{
			name:    "different values",
			current: []string{"de"},
			desired: []string{"fr"},
			want:    true,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := excludedTargetLanguagesDiffer(tc.current, tc.desired); got != tc.want {
				t.Fatalf("excludedTargetLanguagesDiffer() = %v, want %v", got, tc.want)
			}
		})
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
	defer func() {
		if err := resp.Body.Close(); err != nil {
			t.Fatalf("close response body: %v", err)
		}
	}()
	_, _ = io.Copy(io.Discard, resp.Body)

	if seenPath != "/proxy/api/v2/projects" {
		t.Fatalf("unexpected rewritten path: %q", seenPath)
	}
	if seenHost != parsed.Host {
		t.Fatalf("unexpected rewritten host: %q", seenHost)
	}
}

func TestHTTPClientResolveBranchFindsExactName(t *testing.T) {
	client, mux, teardown := newCrowdinHTTPClientForTest(t)
	defer teardown()

	mux.HandleFunc("/api/v2/projects/123/branches", func(w http.ResponseWriter, r *http.Request) {
		assertRequest(t, r, http.MethodGet, "/api/v2/projects/123/branches?limit=500&name=feature%2Flogin")
		_, _ = io.WriteString(w, `{"data":[{"data":{"id":42,"projectId":123,"name":"feature/login","title":"Feature Login"}}]}`)
	})

	id, err := client.ResolveBranch(context.Background(), "123", "feature/login")
	if err != nil {
		t.Fatalf("resolve branch: %v", err)
	}
	if id != 42 {
		t.Fatalf("branch id = %d, want 42", id)
	}
}

func TestHTTPClientResolveBranchErrorsWhenMissing(t *testing.T) {
	client, mux, teardown := newCrowdinHTTPClientForTest(t)
	defer teardown()

	mux.HandleFunc("/api/v2/projects/123/branches", func(w http.ResponseWriter, r *http.Request) {
		assertRequest(t, r, http.MethodGet, "/api/v2/projects/123/branches?limit=500&name=missing")
		_, _ = io.WriteString(w, `{"data":[{"data":{"id":7,"projectId":123,"name":"other","title":"Other"}}]}`)
	})

	_, err := client.ResolveBranch(context.Background(), "123", "missing")
	if err == nil || !strings.Contains(err.Error(), `crowdin branch "missing" not found`) {
		t.Fatalf("expected missing branch error, got %v", err)
	}
}

func TestHTTPClientEnsureDirectoryScopesRootToBranchAndNestedToDirectory(t *testing.T) {
	client, mux, teardown := newCrowdinHTTPClientForTest(t)
	defer teardown()

	postCount := 0
	mux.HandleFunc("/api/v2/projects/123/directories", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method + " " + r.RequestURI {
		case http.MethodGet + " /api/v2/projects/123/directories?branchId=42&filter=src&limit=500":
			_, _ = io.WriteString(w, `{"data":[]}`)
		case http.MethodPost + " /api/v2/projects/123/directories":
			postCount++
			if postCount == 1 {
				assertJSONBody(t, r, map[string]any{"name": "src", "branchId": float64(42)})
				_, _ = io.WriteString(w, `{"data":{"id":8,"projectId":123,"branchId":42,"name":"src"}}`)
				return
			}
			assertJSONBody(t, r, map[string]any{"name": "nested", "directoryId": float64(8)})
			_, _ = io.WriteString(w, `{"data":{"id":9,"projectId":123,"directoryId":8,"name":"nested"}}`)
		case http.MethodGet + " /api/v2/projects/123/directories?directoryId=8&filter=nested&limit=500":
			_, _ = io.WriteString(w, `{"data":[]}`)
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.RequestURI)
		}
	})

	id, err := client.EnsureDirectory(context.Background(), "123", 42, "src/nested")
	if err != nil {
		t.Fatalf("ensure directory: %v", err)
	}
	if id != 9 {
		t.Fatalf("directory id = %d, want 9", id)
	}
}

func TestHTTPClientFindDirectoryAndFileUseBranchForRootLookups(t *testing.T) {
	client, mux, teardown := newCrowdinHTTPClientForTest(t)
	defer teardown()

	mux.HandleFunc("/api/v2/projects/123/directories", func(w http.ResponseWriter, r *http.Request) {
		assertRequest(t, r, http.MethodGet, "/api/v2/projects/123/directories?branchId=42&filter=src&limit=500")
		_, _ = io.WriteString(w, `{"data":[{"data":{"id":8,"projectId":123,"branchId":42,"name":"src"}}]}`)
	})
	mux.HandleFunc("/api/v2/projects/123/files", func(w http.ResponseWriter, r *http.Request) {
		assertRequest(t, r, http.MethodGet, "/api/v2/projects/123/files?branchId=42&filter=messages.json&limit=500")
		_, _ = io.WriteString(w, `{"data":[{"data":{"id":17,"projectId":123,"branchId":42,"name":"messages.json"}}]}`)
	})

	dirID, err := client.FindDirectory(context.Background(), "123", 42, "src")
	if err != nil {
		t.Fatalf("find directory: %v", err)
	}
	if dirID != 8 {
		t.Fatalf("directory id = %d, want 8", dirID)
	}
	fileID, err := client.FindFile(context.Background(), "123", 42, 0, "messages.json")
	if err != nil {
		t.Fatalf("find file: %v", err)
	}
	if fileID != 17 {
		t.Fatalf("file id = %d, want 17", fileID)
	}
}

func TestHTTPClientUpsertSourceFileAddsRootFileToBranch(t *testing.T) {
	client, mux, teardown := newCrowdinHTTPClientForTest(t)
	defer teardown()

	localPath := writeHTTPClientFixture(t, "messages.json", `{"hello":"Hello"}`)

	mux.HandleFunc("/api/v2/storages", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Fatalf("storage method = %s, want POST", r.Method)
		}
		_, _ = io.WriteString(w, `{"data":{"id":61,"fileName":"messages.json"}}`)
	})
	mux.HandleFunc("/api/v2/projects/123/files", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method + " " + r.RequestURI {
		case http.MethodGet + " /api/v2/projects/123/files?branchId=42&filter=messages.json&limit=500":
			_, _ = io.WriteString(w, `{"data":[]}`)
		case http.MethodPost + " /api/v2/projects/123/files":
			assertJSONBody(t, r, map[string]any{
				"storageId": float64(61),
				"name":      "messages.json",
				"branchId":  float64(42),
			})
			_, _ = io.WriteString(w, `{"data":{"id":17,"projectId":123,"branchId":42,"name":"messages.json"}}`)
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.RequestURI)
		}
	})

	id, err := client.UpsertSourceFile(context.Background(), "123", 42, 0, "messages.json", localPath, storage.FileGroupSpec{})
	if err != nil {
		t.Fatalf("upsert source file: %v", err)
	}
	if id != 17 {
		t.Fatalf("file id = %d, want 17", id)
	}
}

func newCrowdinHTTPClientForTest(t *testing.T) (*HTTPClient, *http.ServeMux, func()) {
	t.Helper()
	mux := http.NewServeMux()
	server := httptest.NewServer(mux)

	overrideURL, err := url.Parse(server.URL)
	if err != nil {
		t.Fatalf("parse server url: %v", err)
	}
	httpClient := server.Client()
	httpClient.Transport = &apiBaseURLRoundTripper{
		base:      httpClient.Transport,
		override:  overrideURL,
		cloudHost: "api.crowdin.com",
	}
	sdkClient, err := sdkcrowdin.NewClient("token", sdkcrowdin.WithHTTPClient(httpClient))
	if err != nil {
		t.Fatalf("new sdk client: %v", err)
	}
	return &HTTPClient{client: sdkClient, httpClient: httpClient}, mux, server.Close
}

func assertRequest(t *testing.T, r *http.Request, method, requestURI string) {
	t.Helper()
	if r.Method != method {
		t.Fatalf("method = %s, want %s", r.Method, method)
	}
	if r.RequestURI != requestURI {
		t.Fatalf("request URI = %s, want %s", r.RequestURI, requestURI)
	}
}

func assertJSONBody(t *testing.T, r *http.Request, want map[string]any) {
	t.Helper()
	var got map[string]any
	if err := json.NewDecoder(r.Body).Decode(&got); err != nil {
		t.Fatalf("decode request body: %v", err)
	}
	if !mapsEqual(got, want) {
		gotJSON, _ := json.Marshal(got)
		wantJSON, _ := json.Marshal(want)
		t.Fatalf("request body = %s, want %s", gotJSON, wantJSON)
	}
}

func mapsEqual(got, want map[string]any) bool {
	gotJSON, err := json.Marshal(got)
	if err != nil {
		return false
	}
	wantJSON, err := json.Marshal(want)
	if err != nil {
		return false
	}
	return bytes.Equal(gotJSON, wantJSON)
}

func writeHTTPClientFixture(t *testing.T, name, content string) string {
	t.Helper()
	path := t.TempDir() + "/" + name
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write fixture: %v", err)
	}
	return path
}
