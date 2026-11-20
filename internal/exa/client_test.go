package exa

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestNewClientRequiresAPIKey(t *testing.T) {
	_, err := NewClient(Config{})
	require.Error(t, err)
	_, err = NewClientWithHTTPClient(Config{APIKey: "key"}, nil)
	require.Error(t, err)
}

func TestSearchSendsLocalisedRequestAndParsesOutput(t *testing.T) {
	var payload map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodPost, r.Method)
		require.Equal(t, "/search", r.URL.Path)
		require.Equal(t, "test-key", r.Header.Get("x-api-key"))
		require.Equal(t, "application/json", r.Header.Get("Content-Type"))
		body, err := io.ReadAll(r.Body)
		require.NoError(t, err)
		require.NoError(t, json.Unmarshal(body, &payload))
		_, _ = w.Write([]byte(`{
			"requestId": "req_search",
			"results": [{
				"title": "ACMA advertising rules",
				"url": "https://www.acma.gov.au/ads",
				"publishedDate": "2026-11-01T00:00:00.000Z",
				"highlights": ["Do not make unsubstantiated health claims."]
			}],
			"output": {
				"content": {
					"competitors": ["Local brand X leads with afterpay CTAs"],
					"culturalReferences": ["Melbourne Cup week"],
					"trendingTerms": ["arvo"],
					"adRules": ["Therapeutic claims need evidence"]
				},
				"grounding": [{
					"field": "adRules[0]",
					"confidence": "high",
					"citations": [{"title": "ACMA advertising rules", "url": "https://www.acma.gov.au/ads"}]
				}]
			},
			"costDollars": {"total": 0.012},
			"notices": []
		}`))
	}))
	t.Cleanup(server.Close)

	client, err := NewClientWithHTTPClient(Config{APIKey: "test-key", BaseURL: server.URL}, server.Client())
	require.NoError(t, err)

	country := UserLocation{Country: "au"}
	response, err := client.Search(t.Context(), SearchRequest{
		Query:        "Australian advertising rules for supplements",
		Type:         SearchTypeAuto,
		NumResults:   8,
		UserLocation: &country,
		Contents:     &ContentsOptions{Highlights: true},
		Objective:    "Localise supplement ads for en-AU",
	})
	require.NoError(t, err)
	require.Equal(t, "Australian advertising rules for supplements", payload["query"])
	require.Equal(t, "auto", payload["type"])
	require.Equal(t, float64(8), payload["numResults"])
	require.Equal(t, "AU", payload["userLocation"])
	require.Equal(t, map[string]any{"highlights": true}, payload["contents"])
	require.Equal(t, "req_search", response.RequestID)
	require.Len(t, response.Results, 1)
	require.Equal(t, "https://www.acma.gov.au/ads", response.Results[0].URL)
	require.NotNil(t, response.Output)
	require.Contains(t, string(response.Output.Content), "Therapeutic claims")
	require.Equal(t, 0.012, response.Cost.Total)
}

func TestGetContentsAndAnswer(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name string
		path string
		run  func(*Client) error
		want map[string]any
	}{
		{
			name: "contents",
			path: "/contents",
			run: func(client *Client) error {
				_, err := client.GetContents(t.Context(), ContentsRequest{
					URLs:       []string{"https://www.accc.gov.au/ads"},
					Highlights: true,
				})
				return err
			},
			want: map[string]any{
				"urls":       []any{"https://www.accc.gov.au/ads"},
				"highlights": true,
			},
		},
		{
			name: "answer",
			path: "/answer",
			run: func(client *Client) error {
				_, err := client.Answer(t.Context(), AnswerRequest{
					Query:        "What claims are restricted in Australian ads?",
					UserLocation: &UserLocation{Country: "AU"},
				})
				return err
			},
			want: map[string]any{
				"query":        "What claims are restricted in Australian ads?",
				"userLocation": "AU",
			},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			var payload map[string]any
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				require.Equal(t, tc.path, r.URL.Path)
				require.NoError(t, json.NewDecoder(r.Body).Decode(&payload))
				switch tc.path {
				case "/contents":
					_, _ = w.Write([]byte(`{
						"results": [{"title": "ACCC", "url": "https://www.accc.gov.au/ads", "highlights": ["No misleading claims"]}],
						"statuses": [{"id": "https://www.accc.gov.au/ads", "status": "success"}]
					}`))
				default:
					_, _ = w.Write([]byte(`{
						"answer": "Unsubstantiated therapeutic claims are restricted.",
						"citations": [{"title": "ACCC", "url": "https://www.accc.gov.au/ads"}]
					}`))
				}
			}))
			t.Cleanup(server.Close)
			client, err := NewClientWithHTTPClient(Config{APIKey: "key", BaseURL: server.URL}, server.Client())
			require.NoError(t, err)
			require.NoError(t, tc.run(client))
			require.Equal(t, tc.want, payload)
		})
	}
}

func TestClientMapsHTTPErrors(t *testing.T) {
	t.Parallel()
	cases := []struct {
		status     int
		body       string
		retryAfter string
		code       ErrorCode
		tag        string
	}{
		{status: http.StatusUnauthorized, body: `{"requestId":"r1","error":"invalid key","tag":"INVALID_API_KEY"}`, code: ErrorCodeAuthFailed, tag: "INVALID_API_KEY"},
		{status: http.StatusPaymentRequired, body: `{"requestId":"r2","error":"no credits","tag":"NO_MORE_CREDITS"}`, code: ErrorCodePaymentRequired, tag: "NO_MORE_CREDITS"},
		{status: http.StatusTooManyRequests, body: `{"error":"slow down","tag":"RATE_LIMIT_EXCEEDED"}`, retryAfter: "7", code: ErrorCodeRateLimited, tag: "RATE_LIMIT_EXCEEDED"},
		{status: http.StatusBadRequest, body: `{"error":"bad schema","tag":"INVALID_JSON_SCHEMA"}`, code: ErrorCodeValidation, tag: "INVALID_JSON_SCHEMA"},
		{status: http.StatusServiceUnavailable, body: `{"error":"over capacity","tag":"SERVICE_OVERLOADED"}`, code: ErrorCodeUpstreamUnavailable, tag: "SERVICE_OVERLOADED"},
	}
	for _, tc := range cases {
		t.Run(string(tc.code), func(t *testing.T) {
			t.Parallel()
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				if tc.retryAfter != "" {
					w.Header().Set("Retry-After", tc.retryAfter)
				}
				w.Header().Set("x-request-id", "hdr")
				w.WriteHeader(tc.status)
				_, _ = w.Write([]byte(tc.body))
			}))
			t.Cleanup(server.Close)
			client, err := NewClientWithHTTPClient(Config{APIKey: "key", BaseURL: server.URL}, server.Client())
			require.NoError(t, err)
			_, err = client.Search(t.Context(), SearchRequest{Query: "ads"})
			typed, ok := AsError(err)
			require.True(t, ok)
			require.Equal(t, tc.code, typed.Code)
			require.Equal(t, tc.tag, typed.Tag)
			if tc.retryAfter != "" {
				require.Equal(t, 7*time.Second, typed.RetryAfter)
			}
		})
	}
}

func TestSearchAndContentsValidateInput(t *testing.T) {
	client, err := NewClient(Config{APIKey: "key"})
	require.NoError(t, err)
	_, err = client.Search(t.Context(), SearchRequest{})
	require.Equal(t, ErrorCodeValidation, mustExaError(t, err).Code)
	_, err = client.GetContents(t.Context(), ContentsRequest{})
	require.Equal(t, ErrorCodeValidation, mustExaError(t, err).Code)
	_, err = client.Answer(t.Context(), AnswerRequest{})
	require.Equal(t, ErrorCodeValidation, mustExaError(t, err).Code)
}

func TestUserLocationJSON(t *testing.T) {
	t.Parallel()
	encoded, err := json.Marshal(UserLocation{Country: "au"})
	require.NoError(t, err)
	require.Equal(t, `"AU"`, string(encoded))

	lat, lng := -33.86, 151.21
	encoded, err = json.Marshal(UserLocation{Country: "AU", Latitude: &lat, Longitude: &lng})
	require.NoError(t, err)
	require.JSONEq(t, `{"country":"AU","latitude":-33.86,"longitude":151.21}`, string(encoded))

	var country UserLocation
	require.NoError(t, json.Unmarshal([]byte(`"jp"`), &country))
	require.Equal(t, "JP", country.Country)

	var coords UserLocation
	require.NoError(t, json.Unmarshal([]byte(`{"country":"jp","latitude":35.6,"longitude":139.7}`), &coords))
	require.Equal(t, "JP", coords.Country)
	require.NotNil(t, coords.Latitude)
}

func TestCountryFromLocale(t *testing.T) {
	t.Parallel()
	require.Equal(t, "AU", CountryFromLocale("en-AU"))
	require.Equal(t, "JP", CountryFromLocale("ja_JP"))
	require.Equal(t, "CN", CountryFromLocale("zh-Hans-CN"))
	require.Equal(t, "", CountryFromLocale("fr"))
	require.Equal(t, "", CountryFromLocale("en"))
	require.Equal(t, "", CountryFromLocale(""))
}

func mustExaError(t *testing.T, err error) *Error {
	t.Helper()
	typed, ok := AsError(err)
	require.True(t, ok)
	return typed
}
