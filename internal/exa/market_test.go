package exa

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestMarketContextBuildsLocalisedSearch(t *testing.T) {
	var payload SearchRequest
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "/search", r.URL.Path)
		require.NoError(t, json.NewDecoder(r.Body).Decode(&payload))
		_, _ = w.Write([]byte(`{
			"requestId": "req_market",
			"results": [{
				"title": "JARO advertising guidelines",
				"url": "https://www.jaro.or.jp/"
			}],
			"output": {
				"content": {
					"competitors": ["Uniqlo", "uniqlo", "  "],
					"culturalReferences": ["Golden Week travel ads"],
					"trendingTerms": ["コスパ"],
					"adRules": ["Avoid absolute superlatives without evidence"]
				},
				"grounding": []
			},
			"costDollars": {"total": 0.02},
			"notices": [{"code":"RESTRICTIONS_RELAXED","path":"/query","message":"site restriction relaxed"}]
		}`))
	}))
	t.Cleanup(server.Close)

	client, err := NewClientWithHTTPClient(Config{APIKey: "key", BaseURL: server.URL}, server.Client())
	require.NoError(t, err)

	got, err := client.MarketContext(t.Context(), MarketContextRequest{
		Locale:         "ja-JP",
		Topic:          "athleisure",
		UserIdentifier: "org_123",
	})
	require.NoError(t, err)
	require.Contains(t, payload.Query, "athleisure")
	require.Contains(t, payload.Query, "ja-JP")
	require.Equal(t, SearchTypeAuto, payload.Type)
	require.Equal(t, 10, payload.NumResults)
	require.NotNil(t, payload.UserLocation)
	require.Equal(t, "JP", payload.UserLocation.Country)
	require.Equal(t, true, payload.Contents.Highlights)
	require.Equal(t, "org_123", payload.UserIdentifier)
	require.Equal(t, "object", payload.OutputSchema.Type)
	require.Contains(t, payload.Objective, "ja-JP")
	require.Equal(t, []string{"Uniqlo"}, got.Competitors)
	require.Equal(t, []string{"Golden Week travel ads"}, got.CulturalReferences)
	require.Equal(t, []string{"コスパ"}, got.TrendingTerms)
	require.Equal(t, []string{"Avoid absolute superlatives without evidence"}, got.AdRules)
	require.Equal(t, "JP", got.Country)
	require.Equal(t, "ja-JP", got.Locale)
	require.False(t, got.Empty())
	require.Len(t, got.Sources, 1)
}

func TestMarketContextRequiresSynthesisedOutput(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"results":[{"title":"A","url":"https://example.com"}]}`))
	}))
	t.Cleanup(server.Close)
	client, err := NewClientWithHTTPClient(Config{APIKey: "key", BaseURL: server.URL}, server.Client())
	require.NoError(t, err)
	_, err = client.MarketContext(t.Context(), MarketContextRequest{Locale: "en-AU"})
	require.Equal(t, ErrorCodeInvalidResponse, mustExaError(t, err).Code)
}

func TestMarketQueryFallsBackWithoutCountry(t *testing.T) {
	require.Contains(t, marketQuery("fr", "", "coffee"), "coffee")
	require.Contains(t, marketQuery("fr", "", "coffee"), "fr")
	require.Equal(t, "the target market", marketLabel("", ""))
}
