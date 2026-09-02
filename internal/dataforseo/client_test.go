package dataforseo

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestNewClientRequiresCredentials(t *testing.T) {
	_, err := NewClient(Config{})
	require.Error(t, err)
}

func TestLabsRelatedKeywords(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodPost, r.Method)
		require.Equal(t, "/v3/dataforseo_labs/google/related_keywords/live", r.URL.Path)
		require.Equal(t, "Basic dGVzdA==", r.Header.Get("Authorization"))

		_, _ = w.Write([]byte(`{
			"status_code": 20000,
			"status_message": "Ok.",
			"tasks": [{
				"status_code": 20000,
				"status_message": "Ok.",
				"path": ["v3","dataforseo_labs","google","related_keywords","live"],
				"cost": 0.12,
				"result": [{
					"items": [{"keyword":"seo tools","search_volume":1200}]
				}]
			}]
		}`))
	}))
	t.Cleanup(server.Close)

	client, err := NewClientWithHTTPClient(Config{APIKey: "dGVzdA=="}, server.Client())
	require.NoError(t, err)
	client.baseURL = server.URL

	response, err := client.Labs().RelatedKeywords(t.Context(), RelatedKeywordsInput{
		Keyword: "seo",
		Market:  MarketScope{LocationCode: 2840, LanguageCode: "en"},
		Limit:   10,
	})
	require.NoError(t, err)
	require.Equal(t, 0.12, response.Billing.CostUSD)
	require.Len(t, response.Data, 1)
	require.Equal(t, "seo tools", response.Data[0]["keyword"])
}

func TestLabsDomainRankOverview(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{
			"status_code": 20000,
			"tasks": [{
				"status_code": 20000,
				"path": ["v3","dataforseo_labs","google","domain_rank_overview","live"],
				"cost": 0.05,
				"result": [{
					"items": [{"metrics": {"organic": {"etv": 1500}}}]
				}]
			}]
		}`))
	}))
	t.Cleanup(server.Close)

	client, err := NewClientWithHTTPClient(Config{APIKey: "dGVzdA=="}, server.Client())
	require.NoError(t, err)
	client.baseURL = server.URL

	response, err := client.Labs().DomainRankOverview(t.Context(), DomainRankOverviewInput{
		Target: "example.com",
		Market: MarketScope{LocationCode: 2840, LanguageCode: "en"},
	})
	require.NoError(t, err)
	require.Equal(t, 0.05, response.Billing.CostUSD)
	require.Len(t, response.Data, 1)
}

func TestSERPRankCheck(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "/v3/serp/google/organic/live/advanced", r.URL.Path)

		var payload []map[string]any
		require.NoError(t, json.NewDecoder(r.Body).Decode(&payload))
		require.Equal(t, "example pricing", payload[0]["keyword"])

		_, _ = w.Write([]byte(`{
			"status_code": 20000,
			"tasks": [{
				"status_code": 20000,
				"path": ["v3","serp","google","organic","live","advanced"],
				"cost": 0.002,
				"result": [{
					"items": [{
						"type": "organic",
						"domain": "www.example.com",
						"rank_group": 3,
						"url": "https://www.example.com/pricing"
					}]
				}]
			}]
		}`))
	}))
	t.Cleanup(server.Close)

	client, err := NewClientWithHTTPClient(Config{APIKey: "dGVzdA=="}, server.Client())
	require.NoError(t, err)
	client.baseURL = server.URL

	response, err := client.SERP().RankCheck(t.Context(), RankCheckSerpInput{
		KeywordID:    "kw_1",
		Keyword:      "example pricing",
		TargetDomain: "example.com",
		Market:       MarketScope{LocationCode: 2840, LanguageCode: "en"},
		Device:       "desktop",
		Depth:        20,
	})
	require.NoError(t, err)
	require.NotNil(t, response.Data.Position)
	require.Equal(t, 3, *response.Data.Position)
	require.Equal(t, "https://www.example.com/pricing", response.Data.URL)
}

func TestAIMentionsSearch(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "/v3/ai_optimization/llm_mentions/search/live", r.URL.Path)
		_, _ = w.Write([]byte(`{
			"status_code": 20000,
			"tasks": [{
				"status_code": 20000,
				"path": ["v3","ai_optimization","llm_mentions","search","live"],
				"cost": 0.2,
				"result": [{
					"items": [{"question":"what is example.com"}]
				}]
			}]
		}`))
	}))
	t.Cleanup(server.Close)

	client, err := NewClientWithHTTPClient(Config{APIKey: "dGVzdA=="}, server.Client())
	require.NoError(t, err)
	client.baseURL = server.URL

	response, err := client.AI().MentionsSearch(t.Context(), LlmMentionsSearchInput{
		Target:   BuildLlmDomainTarget("example.com", true),
		Platform: LlmPlatformChatGPT,
		Market:   MarketScope{LocationCode: ChatGPTLocationCode, LanguageCode: ChatGPTLanguageCode},
		Limit:    10,
	})
	require.NoError(t, err)
	require.Equal(t, 0.2, response.Billing.CostUSD)
	require.Len(t, response.Data, 1)
}

func TestAILlmResponseRejectsUnknownModel(t *testing.T) {
	client, err := NewClient(Config{Login: "login", Password: "password"})
	require.NoError(t, err)

	_, err = client.AI().LlmResponse(t.Context(), LlmResponseInput{
		UserPrompt: "best crm software",
		Model:      LlmResponseModelChatGPT,
		ModelName:  "gpt-4",
	})
	require.Error(t, err)

	typed, ok := AsError(err)
	require.True(t, ok)
	require.Equal(t, ErrorCodeValidation, typed.Code)
}

func TestAssertTaskTreatsNoResultsAsEmpty(t *testing.T) {
	task := &Task{
		StatusCode:    40501,
		StatusMessage: "No Search Results.",
		Path:          []string{"v3", "serp", "google", "organic", "live", "advanced"},
		Cost:          0.001,
	}

	parsed, err := assertTask(task, "/v3/serp/google/organic/live/advanced", assertTaskOptions{
		treatNoResultsAsEmpty: true,
	})
	require.NoError(t, err)
	require.Equal(t, task, parsed)
}

func TestAssertTaskBilledFailureIncludesBilling(t *testing.T) {
	task := &Task{
		StatusCode:    50000,
		StatusMessage: "Internal Error.",
		Path:          []string{"v3", "dataforseo_labs", "google", "related_keywords", "live"},
		Cost:          0.12,
	}

	_, err := assertTask(task, pathRelatedKeywords, assertTaskOptions{})
	require.Error(t, err)

	typed, ok := AsError(err)
	require.True(t, ok)
	require.Equal(t, ErrorCodeTaskFailed, typed.Code)
	require.Equal(t, 50000, typed.StatusCode)
	require.NotNil(t, typed.Billing)
	require.Equal(t, 0.12, typed.Billing.CostUSD)
	require.Equal(t, task.Path, typed.Billing.Path)
}

func TestAssertTaskUnbilledFailureOmitsBilling(t *testing.T) {
	task := &Task{
		StatusCode:    40102,
		StatusMessage: "Invalid Path.",
		Path:          []string{"v3", "dataforseo_labs", "google", "related_keywords", "live"},
		Cost:          0,
	}

	_, err := assertTask(task, pathRelatedKeywords, assertTaskOptions{})
	require.Error(t, err)

	typed, ok := AsError(err)
	require.True(t, ok)
	require.Equal(t, ErrorCodeTaskFailed, typed.Code)
	require.Nil(t, typed.Billing)
}

func TestHTTPErrorMapping(t *testing.T) {
	cases := []struct {
		name       string
		statusCode int
		wantCode   ErrorCode
	}{
		{name: "unauthorized", statusCode: http.StatusUnauthorized, wantCode: ErrorCodeAuthFailed},
		{name: "rate limited", statusCode: http.StatusTooManyRequests, wantCode: ErrorCodeRateLimited},
		{name: "upstream", statusCode: http.StatusBadGateway, wantCode: ErrorCodeUpstreamUnavailable},
		{name: "other client error", statusCode: http.StatusBadRequest, wantCode: ErrorCodeTaskFailed},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.WriteHeader(tc.statusCode)
				_, _ = w.Write([]byte(`{"message":"nope"}`))
			}))
			t.Cleanup(server.Close)

			client, err := NewClientWithHTTPClient(Config{APIKey: "dGVzdA=="}, server.Client())
			require.NoError(t, err)
			client.baseURL = server.URL

			_, err = client.Labs().RelatedKeywords(t.Context(), RelatedKeywordsInput{
				Keyword: "seo",
				Market:  MarketScope{LocationCode: 2840, LanguageCode: "en"},
			})
			require.Error(t, err)

			typed, ok := AsError(err)
			require.True(t, ok)
			require.Equal(t, tc.wantCode, typed.Code)
			require.Equal(t, tc.statusCode, typed.StatusCode)
			require.Equal(t, pathRelatedKeywords, typed.Path)
		})
	}
}

func TestLabsRankedKeywordsPassesOffset(t *testing.T) {
	var offset any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, pathRankedKeywords, r.URL.Path)

		var payload []map[string]any
		require.NoError(t, json.NewDecoder(r.Body).Decode(&payload))
		require.Len(t, payload, 1)
		offset = payload[0]["offset"]

		_, _ = w.Write([]byte(`{
			"status_code": 20000,
			"tasks": [{
				"status_code": 20000,
				"path": ["v3","dataforseo_labs","google","ranked_keywords","live"],
				"cost": 0.08,
				"result": [{
					"total_count": 42,
					"items": [{"keyword":"pricing","rank_group":4}]
				}]
			}]
		}`))
	}))
	t.Cleanup(server.Close)

	client, err := NewClientWithHTTPClient(Config{APIKey: "dGVzdA=="}, server.Client())
	require.NoError(t, err)
	client.baseURL = server.URL

	response, err := client.Labs().RankedKeywords(t.Context(), RankedKeywordsInput{
		Target: "example.com",
		Market: MarketScope{LocationCode: 2840, LanguageCode: "en"},
		Limit:  25,
		Offset: 50,
	})
	require.NoError(t, err)
	require.Equal(t, float64(50), offset)
	require.Equal(t, 0.08, response.Billing.CostUSD)
	require.NotNil(t, response.Data.TotalCount)
	require.Equal(t, 42, *response.Data.TotalCount)
	require.Len(t, response.Data.Items, 1)
	require.Equal(t, "pricing", response.Data.Items[0]["keyword"])
}

func TestLabsRankedKeywordsRequiresTarget(t *testing.T) {
	client, err := NewClient(Config{APIKey: "dGVzdA=="})
	require.NoError(t, err)

	_, err = client.Labs().RankedKeywords(t.Context(), RankedKeywordsInput{
		Target: "   ",
		Market: MarketScope{LocationCode: 2840, LanguageCode: "en"},
	})
	require.Error(t, err)
	typed, ok := AsError(err)
	require.True(t, ok)
	require.Equal(t, ErrorCodeValidation, typed.Code)
}

func TestIsTaskInProgress(t *testing.T) {
	require.False(t, IsTaskInProgress(nil))
	require.False(t, IsTaskInProgress(&Task{StatusCode: 20000}))
	require.True(t, IsTaskInProgress(&Task{StatusCode: 20100}))
	require.True(t, IsTaskInProgress(&Task{StatusCode: 40601}))
	require.True(t, IsTaskInProgress(&Task{StatusCode: 40602}))
}

func TestConfigAuthorizationFromLoginPassword(t *testing.T) {
	cfg := Config{Login: "user", Password: "secret"}
	require.Equal(t, "dXNlcjpzZWNyZXQ=", cfg.authorizationValue())
}
