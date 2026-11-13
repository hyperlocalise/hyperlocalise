package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type authFunc func(context.Context, string) (principal, error)

func (f authFunc) authenticate(ctx context.Context, token string) (principal, error) {
	return f(ctx, token)
}

func TestRoutes(t *testing.T) {
	for _, tt := range []struct {
		name, method, path, token string
		authErr                   error
		status                    int
		calls                     int
	}{
		{"health", "GET", "/health", "", nil, 200, 0},
		{"missing token", "GET", "/v1/me", "", nil, 401, 0},
		{"valid token", "GET", "/v1/me", "hl_test", nil, 200, 1},
		{"revoked token", "GET", "/v1/me", "hl_test", errUnauthorized, 401, 1},
		{"forbidden", "GET", "/v1/me", "hl_test", errForbidden, 403, 1},
		{"auth unavailable", "GET", "/v1/me", "hl_test", errAuthUnavailable, 503, 1},
		{"method", "POST", "/v1/me", "hl_test", nil, 405, 0},
		{"unknown route", "GET", "/v1/missing", "hl_test", nil, 404, 0},
		{"ambiguous token", "GET", "/v1/me", "hl_a,hl_b", nil, 401, 0},
		{"head authenticates", "HEAD", "/v1/me", "hl_test", nil, 200, 1},
	} {
		t.Run(tt.name, func(t *testing.T) {
			calls := 0
			h := newHandler(authFunc(func(_ context.Context, token string) (principal, error) {
				calls++
				require.Equal(t, tt.token, token)
				return principal{TokenID: "t", UserID: "u", OrganizationID: "o", Permissions: []string{"files:read"}}, tt.authErr
			}))
			r := httptest.NewRequest(tt.method, tt.path, nil)
			if tt.token != "" {
				r.Header.Set("X-Api-Key", tt.token)
			}
			w := httptest.NewRecorder()
			h.ServeHTTP(w, r)
			require.Equal(t, tt.status, w.Code)
			require.Equal(t, tt.calls, calls)
			require.Equal(t, "no-store", w.Header().Get("Cache-Control"))
			require.Equal(t, "application/json", w.Header().Get("Content-Type"))
			if tt.status >= 400 {
				require.Contains(t, w.Body.String(), `"error":`)
			}
		})
	}
}

func TestDuplicateTokensRejected(t *testing.T) {
	h := newHandler(authFunc(func(context.Context, string) (principal, error) {
		t.Fatal("ambiguous token reached authenticator")
		return principal{}, nil
	}))
	r := httptest.NewRequest(http.MethodGet, "/v1/me", nil)
	r.Header.Add("X-Api-Key", "hl_a")
	r.Header.Add("X-Api-Key", "hl_b")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	require.Equal(t, http.StatusUnauthorized, w.Code)
}

func TestDocsRoute(t *testing.T) {
	h := newHandler(authFunc(func(context.Context, string) (principal, error) {
		t.Fatal("docs does not authenticate")
		return principal{}, nil
	}))
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/docs", nil))
	require.Equal(t, http.StatusOK, w.Code)
	require.Equal(t, "no-store", w.Header().Get("Cache-Control"))
	require.Contains(t, w.Header().Get("Content-Type"), "text/html")
	require.Contains(t, w.Header().Get("Content-Security-Policy"), "cdn.jsdelivr.net")
	require.Contains(t, w.Body.String(), `data-url="/openapi.yaml"`)

	w = httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/docs", nil))
	require.Equal(t, http.StatusMethodNotAllowed, w.Code)
}

func TestParseQueryFilters(t *testing.T) {
	t.Parallel()
	okFilters := func(t *testing.T, values url.Values) queryFilters {
		t.Helper()
		rec := httptest.NewRecorder()
		filters, ok := parseQueryFilters(rec, values)
		require.True(t, ok, rec.Body.String())
		require.Equal(t, http.StatusOK, rec.Code)
		return filters
	}
	reject := func(t *testing.T, values url.Values) {
		t.Helper()
		rec := httptest.NewRecorder()
		_, ok := parseQueryFilters(rec, values)
		require.False(t, ok)
		require.Equal(t, http.StatusBadRequest, rec.Code)
	}

	defaults := okFilters(t, url.Values{})
	require.Equal(t, "status", defaults.Sort)
	require.Equal(t, "asc", defaults.SortDir)
	require.Equal(t, 50, defaults.Limit)

	assignee := uuid.NewString()
	filters := okFilters(t, url.Values{
		"projectId": {"project_1"},
		"status":    {"open"},
		"issueType": {"qa_failure"},
		"priority":  {"P0"},
		"locale":    {"fr-FR"},
		"assignee":  {assignee},
		"search":    {"checkout"},
		"sort":      {"created_at"},
		"sortDir":   {"desc"},
		"limit":     {"10"},
		"offset":    {"5"},
	})
	require.Equal(t, assignee, filters.Assignee)
	require.Equal(t, "qa_failure", filters.IssueType)
	require.Equal(t, 10, filters.Limit)
	require.Equal(t, 5, filters.Offset)

	for name, values := range map[string]url.Values{
		"status":    {"status": {"done"}},
		"issueType": {"issueType": {"typo"}},
		"priority":  {"priority": {"P4"}},
		"sort":      {"sort": {"title"}},
		"sortDir":   {"sortDir": {"up"}},
		"assignee":  {"assignee": {"not-a-uuid"}},
		"search":    {"search": {strings.Repeat("q", 201)}},
		"locale":    {"locale": {strings.Repeat("f", 33)}},
		"projectId": {"projectId": {strings.Repeat("p", 129)}},
		"limit":     {"limit": {"0"}},
		"offset":    {"offset": {"-1"}},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			reject(t, values)
		})
	}
}

func FuzzParseQueryFilters(f *testing.F) {
	f.Add("open", "P1", "me", "status", "asc", "cart", "fr", "project_1")
	f.Add("done", "P9", "nope", "title", "up", strings.Repeat("q", 201), strings.Repeat("f", 33), "")
	f.Fuzz(func(t *testing.T, status, priority, assignee, sort, sortDir, search, locale, projectID string) {
		rec := httptest.NewRecorder()
		filters, ok := parseQueryFilters(rec, url.Values{
			"status":    {status},
			"priority":  {priority},
			"assignee":  {assignee},
			"sort":      {sort},
			"sortDir":   {sortDir},
			"search":    {search},
			"locale":    {locale},
			"projectId": {projectID},
		})
		if !ok {
			require.Equal(t, http.StatusBadRequest, rec.Code)
			return
		}
		require.LessOrEqual(t, len(filters.Search), 200)
		require.LessOrEqual(t, len(filters.Locale), 32)
		require.LessOrEqual(t, len(filters.ProjectID), 128)
	})
}
