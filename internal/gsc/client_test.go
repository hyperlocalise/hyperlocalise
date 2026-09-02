package gsc_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/hyperlocalise/hyperlocalise/internal/gsc"
	"github.com/stretchr/testify/require"
	"golang.org/x/oauth2"
)

func TestNewClientRequiresTokenSource(t *testing.T) {
	_, err := gsc.NewClient(gsc.Config{})
	require.Error(t, err)
}

func TestListSites(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodGet, r.Method)
		require.Equal(t, "/sites", r.URL.Path)
		require.Equal(t, "Bearer tok_123", r.Header.Get("Authorization"))

		_, _ = w.Write([]byte(`{
			"siteEntry": [{"siteUrl":"https://x/","permissionLevel":"siteOwner"}]
		}`))
	}))
	t.Cleanup(server.Close)

	client, err := gsc.NewClientWithHTTPClient(gsc.Config{
		TokenSource:       oauth2.StaticTokenSource(&oauth2.Token{AccessToken: "tok_123"}),
		WebmastersBaseURL: server.URL,
	}, server.Client())
	require.NoError(t, err)

	sites, err := client.ListSites(t.Context())
	require.NoError(t, err)
	require.Len(t, sites, 1)
	require.Equal(t, "https://x/", sites[0].SiteURL)
	require.Equal(t, "siteOwner", sites[0].PermissionLevel)
}

func TestUserInfoEmail(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "/v1/userinfo", r.URL.Path)
		_, _ = w.Write([]byte(`{"email":"client@example.com"}`))
	}))
	t.Cleanup(server.Close)

	client, err := gsc.NewClientWithHTTPClient(gsc.Config{
		TokenSource: oauth2.StaticTokenSource(&oauth2.Token{AccessToken: "tok_123"}),
		UserInfoURL: server.URL + "/v1/userinfo",
	}, server.Client())
	require.NoError(t, err)

	email, err := client.UserInfoEmail(t.Context())
	require.NoError(t, err)
	require.Equal(t, "client@example.com", email)
}

func TestQuerySearchAnalyticsEncodesSiteURL(t *testing.T) {
	var paths []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		paths = append(paths, r.URL.String())
		require.Equal(t, http.MethodPost, r.Method)

		var body gsc.SearchAnalyticsRequest
		require.NoError(t, json.NewDecoder(r.Body).Decode(&body))
		require.Equal(t, "2026-01-01", body.StartDate)
		require.Equal(t, "2026-01-28", body.EndDate)

		_, _ = w.Write([]byte(`{"rows":[{"keys":["seo"],"clicks":1,"impressions":10,"ctr":0.1,"position":3.2}]}`))
	}))
	t.Cleanup(server.Close)

	client, err := gsc.NewClientWithHTTPClient(gsc.Config{
		TokenSource:       oauth2.StaticTokenSource(&oauth2.Token{AccessToken: "tok_123"}),
		WebmastersBaseURL: server.URL,
	}, server.Client())
	require.NoError(t, err)

	_, err = client.QuerySearchAnalytics(t.Context(), "sc-domain:example.com", gsc.SearchAnalyticsRequest{
		StartDate: "2026-01-01",
		EndDate:   "2026-01-28",
	})
	require.NoError(t, err)

	_, err = client.QuerySearchAnalytics(t.Context(), "https://example.com/", gsc.SearchAnalyticsRequest{
		StartDate: "2026-01-01",
		EndDate:   "2026-01-28",
	})
	require.NoError(t, err)

	require.Contains(t, paths[0], "/sites/sc-domain%3Aexample.com/searchAnalytics/query")
	require.Contains(t, paths[1], "/sites/https%3A%2F%2Fexample.com%2F/searchAnalytics/query")
}

func TestInspectURL(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "/v1/urlInspection/index:inspect", r.URL.Path)
		require.Equal(t, http.MethodPost, r.Method)

		var body gsc.InspectURLRequest
		require.NoError(t, json.NewDecoder(r.Body).Decode(&body))
		require.Equal(t, "sc-domain:example.com", body.SiteURL)
		require.Equal(t, "https://example.com/post", body.InspectionURL)
		require.Equal(t, "en-US", body.LanguageCode)

		_, _ = w.Write([]byte(`{
			"inspectionResult": {
				"indexStatusResult": {"verdict":"PASS","coverageState":"Indexed"}
			}
		}`))
	}))
	t.Cleanup(server.Close)

	client, err := gsc.NewClientWithHTTPClient(gsc.Config{
		TokenSource:          oauth2.StaticTokenSource(&oauth2.Token{AccessToken: "tok_123"}),
		URLInspectionBaseURL: server.URL + "/v1",
	}, server.Client())
	require.NoError(t, err)

	result, err := client.InspectURL(
		t.Context(),
		"sc-domain:example.com",
		"https://example.com/post",
		"en-US",
	)
	require.NoError(t, err)
	require.NotNil(t, result)
	require.Equal(t, "PASS", result.IndexStatusResult.Verdict)
}

func TestInspectURLRequiresSiteAndInspectionURL(t *testing.T) {
	client, err := gsc.NewClient(gsc.Config{
		TokenSource: oauth2.StaticTokenSource(&oauth2.Token{AccessToken: "tok_123"}),
	})
	require.NoError(t, err)

	_, err = client.InspectURL(t.Context(), "  ", "https://example.com/", "")
	require.Error(t, err)
	typed, ok := gsc.AsError(err)
	require.True(t, ok)
	require.Equal(t, gsc.ErrorCodeValidation, typed.Code)

	_, err = client.InspectURL(t.Context(), "sc-domain:example.com", "", "")
	require.Error(t, err)
	typed, ok = gsc.AsError(err)
	require.True(t, ok)
	require.Equal(t, gsc.ErrorCodeValidation, typed.Code)
}

func TestInspectURLsRequiresAtLeastOneURL(t *testing.T) {
	client, err := gsc.NewClient(gsc.Config{
		TokenSource: oauth2.StaticTokenSource(&oauth2.Token{AccessToken: "tok_123"}),
	})
	require.NoError(t, err)

	_, err = client.InspectURLs(t.Context(), "sc-domain:example.com", nil, "")
	require.Error(t, err)
	typed, ok := gsc.AsError(err)
	require.True(t, ok)
	require.Equal(t, gsc.ErrorCodeValidation, typed.Code)
}

func TestInspectURLsContinuesAfterNonAuthErrors(t *testing.T) {
	var seen []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body gsc.InspectURLRequest
		require.NoError(t, json.NewDecoder(r.Body).Decode(&body))
		seen = append(seen, body.InspectionURL)

		switch body.InspectionURL {
		case "https://example.com/missing":
			w.WriteHeader(http.StatusNotFound)
			_, _ = w.Write([]byte(`{"error":"not found"}`))
		case "https://example.com/ok":
			_, _ = w.Write([]byte(`{
				"inspectionResult": {
					"indexStatusResult": {"verdict":"PASS","coverageState":"Indexed"}
				}
			}`))
		default:
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte(`{"error":"bad request"}`))
		}
	}))
	t.Cleanup(server.Close)

	client, err := gsc.NewClientWithHTTPClient(gsc.Config{
		TokenSource:          oauth2.StaticTokenSource(&oauth2.Token{AccessToken: "tok_123"}),
		URLInspectionBaseURL: server.URL + "/v1",
	}, server.Client())
	require.NoError(t, err)

	outcomes, err := client.InspectURLs(
		t.Context(),
		"sc-domain:example.com",
		[]string{"https://example.com/missing", "https://example.com/ok"},
		"en-US",
	)
	require.NoError(t, err)
	require.Equal(t, []string{"https://example.com/missing", "https://example.com/ok"}, seen)
	require.Len(t, outcomes, 2)

	require.Equal(t, "https://example.com/missing", outcomes[0].InspectionURL)
	require.Error(t, outcomes[0].Error)
	missingErr, ok := gsc.AsError(outcomes[0].Error)
	require.True(t, ok)
	require.Equal(t, gsc.ErrorCodeNotFound, missingErr.Code)
	require.Contains(t, outcomes[0].ErrorString(), "gsc_not_found")

	require.Equal(t, "https://example.com/ok", outcomes[1].InspectionURL)
	require.NoError(t, outcomes[1].Error)
	require.NotNil(t, outcomes[1].Result)
	require.Equal(t, "PASS", outcomes[1].Result.IndexStatusResult.Verdict)
	require.Empty(t, outcomes[1].ErrorString())
}

func TestInspectURLsAbortsOnAuthFailure(t *testing.T) {
	var seen []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body gsc.InspectURLRequest
		require.NoError(t, json.NewDecoder(r.Body).Decode(&body))
		seen = append(seen, body.InspectionURL)

		switch body.InspectionURL {
		case "https://example.com/ok":
			_, _ = w.Write([]byte(`{
				"inspectionResult": {
					"indexStatusResult": {"verdict":"PASS","coverageState":"Indexed"}
				}
			}`))
		case "https://example.com/forbidden":
			w.WriteHeader(http.StatusForbidden)
			_, _ = w.Write([]byte(`{"error":"forbidden"}`))
		default:
			t.Fatalf("unexpected inspection URL %q", body.InspectionURL)
		}
	}))
	t.Cleanup(server.Close)

	client, err := gsc.NewClientWithHTTPClient(gsc.Config{
		TokenSource:          oauth2.StaticTokenSource(&oauth2.Token{AccessToken: "tok_123"}),
		URLInspectionBaseURL: server.URL + "/v1",
	}, server.Client())
	require.NoError(t, err)

	outcomes, err := client.InspectURLs(
		t.Context(),
		"sc-domain:example.com",
		[]string{
			"https://example.com/ok",
			"https://example.com/forbidden",
			"https://example.com/never",
		},
		"",
	)
	require.Error(t, err)
	require.Equal(t, []string{"https://example.com/ok", "https://example.com/forbidden"}, seen)
	require.Len(t, outcomes, 2)

	require.NoError(t, outcomes[0].Error)
	require.NotNil(t, outcomes[0].Result)

	authErr, ok := gsc.AsError(err)
	require.True(t, ok)
	require.Equal(t, gsc.ErrorCodeAuthFailed, authErr.Code)
	require.Equal(t, http.StatusForbidden, authErr.StatusCode)
	require.ErrorIs(t, outcomes[1].Error, err)
}

func TestHTTPErrorMapping(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusForbidden)
		_, _ = w.Write([]byte(`{"error":"forbidden"}`))
	}))
	t.Cleanup(server.Close)

	client, err := gsc.NewClientWithHTTPClient(gsc.Config{
		TokenSource:       oauth2.StaticTokenSource(&oauth2.Token{AccessToken: "tok_123"}),
		WebmastersBaseURL: server.URL,
	}, server.Client())
	require.NoError(t, err)

	_, err = client.ListSites(t.Context())
	require.Error(t, err)

	typed, ok := gsc.AsError(err)
	require.True(t, ok)
	require.Equal(t, gsc.ErrorCodeAuthFailed, typed.Code)
	require.Equal(t, http.StatusForbidden, typed.StatusCode)
}

func TestHTTPQuotaErrorMapping(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusForbidden)
		_, _ = w.Write([]byte(`{
			"error": {
				"code": 403,
				"message": "Quota exceeded for quota metric 'Queries' and limit 'Queries per day' of service 'searchconsole.googleapis.com'",
				"status": "RESOURCE_EXHAUSTED",
				"errors": [{"reason": "rateLimitExceeded"}]
			}
		}`))
	}))
	t.Cleanup(server.Close)

	client, err := gsc.NewClientWithHTTPClient(gsc.Config{
		TokenSource:       oauth2.StaticTokenSource(&oauth2.Token{AccessToken: "tok_123"}),
		WebmastersBaseURL: server.URL,
	}, server.Client())
	require.NoError(t, err)

	_, err = client.ListSites(t.Context())
	require.Error(t, err)

	typed, ok := gsc.AsError(err)
	require.True(t, ok)
	require.Equal(t, gsc.ErrorCodeRateLimited, typed.Code)
	require.Equal(t, http.StatusForbidden, typed.StatusCode)
}

func TestBuildSearchAnalyticsRequestWrapsFilters(t *testing.T) {
	today := time.Date(2026, 1, 31, 12, 0, 0, 0, time.UTC)
	request := gsc.BuildSearchAnalyticsRequest(gsc.PerformanceInput{
		Filters: []gsc.DimensionFilter{{
			Dimension:  gsc.DimensionQuery,
			Operator:   gsc.FilterOperatorContains,
			Expression: "pricing",
		}},
		DateRange: gsc.DateRangeLast28Days,
	}, today)

	require.Equal(t, "2026-01-28", request.EndDate)
	require.Equal(t, "2026-01-01", request.StartDate)
	require.Len(t, request.DimensionFilterGroups, 1)
	require.Equal(t, "and", request.DimensionFilterGroups[0].GroupType)
	require.Equal(t, "pricing", request.DimensionFilterGroups[0].Filters[0].Expression)
}

func TestResolveDateRangeClampsToSixteenMonths(t *testing.T) {
	today := time.Date(2026, 1, 31, 0, 0, 0, 0, time.UTC)
	start, end := gsc.ResolveDateRange(gsc.PerformanceInput{
		StartDate: "2020-01-01",
		EndDate:   "2026-01-28",
	}, today)

	require.Equal(t, "2024-09-30", start)
	require.Equal(t, "2026-01-28", end)
}
