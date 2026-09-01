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

func TestConfigAuthorizationFromLoginPassword(t *testing.T) {
	cfg := Config{Login: "user", Password: "secret"}
	require.Equal(t, "dXNlcjpzZWNyZXQ=", cfg.authorizationValue())
}
