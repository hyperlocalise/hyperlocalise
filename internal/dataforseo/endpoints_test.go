package dataforseo

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestErrorString(t *testing.T) {
	var unset *Error
	require.Equal(t, "<nil>", unset.Error())
	require.Equal(t, "dataforseo_validation_error: missing", (&Error{Code: ErrorCodeValidation, Message: "missing"}).Error())
	require.Equal(t, "dataforseo_task_failed: down (/v3/serp)", (&Error{
		Code: ErrorCodeTaskFailed, Message: "down", Path: "/v3/serp",
	}).Error())
	require.Equal(t, "custom", llmResponsePath("custom"))
	require.Equal(t, "seo", BuildLlmKeywordTarget("seo").Keyword)
}

func TestLabsUncoveredEndpoints(t *testing.T) {
	client := newEndpointClient(t, func(w http.ResponseWriter, r *http.Request) {
		writeTask(t, w, `{
			"status_code": 20000,
			"tasks": [{
				"status_code": 20000,
				"path": ["v3","labs"],
				"cost": 0.01,
				"result": [{"items": [{"keyword":"seo"}], "total_count": 4}]
			}]
		}`)
		require.Contains(t, r.URL.Path, "/v3/dataforseo_labs/google/")
	})
	market := MarketScope{LocationCode: 2840, LanguageCode: "en"}

	suggestions, err := client.Labs().KeywordSuggestions(t.Context(), KeywordSuggestionsInput{Keyword: " seo ", Market: market, Limit: 5})
	require.NoError(t, err)
	require.Equal(t, "seo", suggestions.Data[0]["keyword"])

	ideas, err := client.Labs().KeywordIdeas(t.Context(), KeywordIdeasInput{Keyword: "seo", Market: market})
	require.NoError(t, err)
	require.Len(t, ideas.Data, 1)

	pages, err := client.Labs().RelevantPages(t.Context(), RelevantPagesInput{Target: "example.com", Market: market, Limit: 10})
	require.NoError(t, err)
	require.Equal(t, 4, *pages.Data.TotalCount)

	overview, err := client.Labs().KeywordOverview(t.Context(), KeywordOverviewInput{Keywords: []string{"seo"}, Market: market})
	require.NoError(t, err)
	require.Len(t, overview.Data, 1)

	bare, err := NewClient(Config{APIKey: "key"})
	require.NoError(t, err)
	_, err = bare.Labs().KeywordSuggestions(t.Context(), KeywordSuggestionsInput{})
	require.Equal(t, ErrorCodeValidation, mustError(t, err).Code)
	_, err = bare.Labs().KeywordIdeas(t.Context(), KeywordIdeasInput{Keyword: " "})
	require.Equal(t, ErrorCodeValidation, mustError(t, err).Code)
	_, err = bare.Labs().RelevantPages(t.Context(), RelevantPagesInput{})
	require.Equal(t, ErrorCodeValidation, mustError(t, err).Code)
	_, err = bare.Labs().KeywordOverview(t.Context(), KeywordOverviewInput{})
	require.Equal(t, ErrorCodeValidation, mustError(t, err).Code)
}

func TestAIUncoveredEndpoints(t *testing.T) {
	client := newEndpointClient(t, func(w http.ResponseWriter, r *http.Request) {
		body := map[string]any{
			"status_code": 20000,
			"tasks": []any{map[string]any{
				"status_code": 20000,
				"path":        []string{"v3", "ai"},
				"cost":        0.2,
				"result": []any{map[string]any{
					"items":  []any{map[string]string{"question": "what"}},
					"total":  map[string]int{"mentions": 3},
					"answer": "hello",
				}},
			}},
		}
		if strings.Contains(r.URL.Path, "aggregated_metrics") && !strings.Contains(r.URL.Path, "cross") {
			body["tasks"].([]any)[0].(map[string]any)["result"] = []any{map[string]any{"total": map[string]int{"mentions": 3}}}
		}
		require.NoError(t, json.NewEncoder(w).Encode(body))
	})
	target := BuildLlmDomainTarget("example.com", true)
	market := MarketScope{LocationCode: ChatGPTLocationCode, LanguageCode: ChatGPTLanguageCode}

	metrics, err := client.AI().AggregatedMetrics(t.Context(), LlmAggregatedMetricsInput{Target: target, Platform: LlmPlatformChatGPT, Market: market})
	require.NoError(t, err)
	require.EqualValues(t, 3, metrics.Data["mentions"])

	pages, err := client.AI().TopPages(t.Context(), LlmTopPagesInput{Target: target, Platform: LlmPlatformChatGPT, Market: market, ItemsListLimit: 99})
	require.NoError(t, err)
	require.Len(t, pages.Data, 1)

	share, err := client.AI().CrossAggregatedMetrics(t.Context(), LlmCrossAggregatedMetricsInput{
		Groups: []LlmCrossAggregatedMetricsGroup{
			{Key: "us", Target: target},
			{Key: "them", Target: BuildLlmKeywordTarget("competitor")},
		},
		Platform: LlmPlatformChatGPT,
		Market:   market,
	})
	require.NoError(t, err)
	require.Len(t, share.Data, 1)

	response, err := client.AI().LlmResponse(t.Context(), LlmResponseInput{
		UserPrompt: "best crm", Model: LlmResponseModelChatGPT, ModelName: "gpt-5",
		WebSearch: true, WebSearchCountryCode: "US", MaxOutputTokens: 10,
	})
	require.NoError(t, err)
	require.Equal(t, "hello", response.Data["answer"])

	_, err = client.AI().LlmResponse(t.Context(), LlmResponseInput{
		UserPrompt: "best crm", Model: LlmResponseModelGemini, ModelName: "gemini-2.5-pro", WebSearch: true, WebSearchCountryCode: "US",
	})
	require.NoError(t, err)

	bare, err := NewClient(Config{APIKey: "key"})
	require.NoError(t, err)
	_, err = bare.AI().AggregatedMetrics(t.Context(), LlmAggregatedMetricsInput{})
	require.Equal(t, ErrorCodeValidation, mustError(t, err).Code)
	_, err = bare.AI().TopPages(t.Context(), LlmTopPagesInput{Target: LlmTarget{}})
	require.Equal(t, ErrorCodeValidation, mustError(t, err).Code)
	_, err = bare.AI().CrossAggregatedMetrics(t.Context(), LlmCrossAggregatedMetricsInput{Groups: []LlmCrossAggregatedMetricsGroup{{Key: "only"}}})
	require.Equal(t, ErrorCodeValidation, mustError(t, err).Code)
	_, err = bare.AI().CrossAggregatedMetrics(t.Context(), LlmCrossAggregatedMetricsInput{Groups: []LlmCrossAggregatedMetricsGroup{{Key: "a"}, {Key: "b"}}})
	require.Equal(t, ErrorCodeValidation, mustError(t, err).Code)
	_, err = bare.AI().LlmResponse(t.Context(), LlmResponseInput{Model: LlmResponseModelChatGPT, ModelName: "gpt-5", UserPrompt: " "})
	require.Equal(t, ErrorCodeValidation, mustError(t, err).Code)

	badTotal := newEndpointClient(t, func(w http.ResponseWriter, _ *http.Request) {
		writeTask(t, w, `{"status_code":20000,"tasks":[{"status_code":20000,"path":["v3"],"cost":0.1,"result":[{"total":"nope"}]}]}`)
	})
	_, err = badTotal.AI().AggregatedMetrics(t.Context(), LlmAggregatedMetricsInput{Target: target, Platform: LlmPlatformChatGPT, Market: market})
	require.Equal(t, ErrorCodeInvalidResponse, mustError(t, err).Code)
}

func TestSERPUncoveredEndpoints(t *testing.T) {
	client := newEndpointClient(t, func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.Contains(r.URL.Path, "task_get"):
			writeTask(t, w, `{
				"status_code": 20000,
				"tasks": [{
					"status_code": 20000,
					"path": ["v3","serp"],
					"cost": 0.01,
					"result": [{"items": [
						{"type":"organic","domain":"www.example.com","rank_absolute":2,"url":"https://www.example.com"},
						{"type":"organic","domain":"other.com"},
						{"type":"people_also_ask"}
					]}]
				}]
			}`)
		case strings.HasSuffix(r.URL.Path, "/task_post"):
			writeTask(t, w, `{
				"status_code": 20000,
				"status_message": "Ok.",
				"tasks": [
					null,
					{"status_code": 40000, "id": "skip", "cost": 0.1, "data": {"tag":"kw_1:desktop"}},
					{"status_code": 20100, "id": "task-1", "cost": 0.2, "data": {"tag":"kw_1:desktop"}},
					{"status_code": 20100, "id": "unknown", "cost": 0.2, "data": {"tag":"missing"}}
				]
			}`)
		default:
			writeTask(t, w, `{
				"status_code": 20000,
				"tasks": [{
					"status_code": 20000,
					"path": ["v3","serp"],
					"cost": 0.01,
					"result": [{"items": [{"type":"organic","domain":"example.com","rank_group":1}]}]
				}]
			}`)
		}
	})

	live, err := client.SERP().LiveAdvanced(t.Context(), LiveSerpInput{Keyword: " seo ", Market: MarketScope{LanguageCode: "en"}, Device: "mobile", Depth: 1})
	require.NoError(t, err)
	require.Len(t, live.Data, 1)

	posted, err := client.SERP().PostRankCheckTasks(t.Context(), PostRankCheckTasksInput{
		TargetDomain: "example.com",
		LocationName: "United States",
		Market:       MarketScope{LocationCode: 2840, LanguageCode: "en"},
		Tasks:        []RankCheckTaskInput{{Keyword: "seo", KeywordID: "kw_1", Device: " desktop "}},
	})
	require.NoError(t, err)
	require.InDelta(t, 0.5, posted.Billing.CostUSD, 0.0001)
	require.Len(t, posted.Data, 1)
	require.Equal(t, "task-1", posted.Data[0].TaskID)

	outcome, err := client.SERP().RankCheckTaskResult(t.Context(), RankCheckTaskResultInput{
		TaskID: "task-1", KeywordID: "kw_1", Keyword: "seo", TargetDomain: "example.com",
	})
	require.NoError(t, err)
	require.Equal(t, "completed", outcome.Status)
	require.Equal(t, 2, *outcome.Result.Position)
	require.Equal(t, []string{"organic", "people_also_ask"}, outcome.Result.SerpFeatures)

	bare, err := NewClient(Config{APIKey: "key"})
	require.NoError(t, err)
	_, err = bare.SERP().LiveAdvanced(t.Context(), LiveSerpInput{})
	require.Equal(t, ErrorCodeValidation, mustError(t, err).Code)
	_, err = bare.SERP().PostRankCheckTasks(t.Context(), PostRankCheckTasksInput{})
	require.Equal(t, ErrorCodeValidation, mustError(t, err).Code)
	_, err = bare.SERP().PostRankCheckTasks(t.Context(), PostRankCheckTasksInput{Tasks: []RankCheckTaskInput{{}}})
	require.Equal(t, ErrorCodeValidation, mustError(t, err).Code)
	_, err = bare.SERP().RankCheckTaskResult(t.Context(), RankCheckTaskResultInput{})
	require.Equal(t, ErrorCodeValidation, mustError(t, err).Code)
}

func TestRankCheckTaskResultStates(t *testing.T) {
	pending := newEndpointClient(t, func(w http.ResponseWriter, _ *http.Request) {
		writeTask(t, w, `{"status_code":20000,"tasks":[{"status_code":40602,"status_message":"Task In Queue"}]}`)
	})
	outcome, err := pending.SERP().RankCheckTaskResult(t.Context(), RankCheckTaskResultInput{TaskID: "task-1"})
	require.NoError(t, err)
	require.Equal(t, "pending", outcome.Status)

	failed := newEndpointClient(t, func(w http.ResponseWriter, _ *http.Request) {
		writeTask(t, w, `{"status_code":20000,"tasks":[{"status_code":40000}]}`)
	})
	outcome, err = failed.SERP().RankCheckTaskResult(t.Context(), RankCheckTaskResultInput{TaskID: "task-1"})
	require.NoError(t, err)
	require.Equal(t, "failed", outcome.Status)
	require.Contains(t, outcome.Message, "40000")

	empty := newEndpointClient(t, func(w http.ResponseWriter, _ *http.Request) {
		writeTask(t, w, `{"status_code":20000,"tasks":[{"status_code":40501,"status_message":"No Search Results."}]}`)
	})
	outcome, err = empty.SERP().RankCheckTaskResult(t.Context(), RankCheckTaskResultInput{TaskID: "task-1", Keyword: "seo"})
	require.NoError(t, err)
	require.Equal(t, "completed", outcome.Status)
	require.Nil(t, outcome.Result.Position)

	broken := newEndpointClient(t, func(w http.ResponseWriter, _ *http.Request) {
		writeTask(t, w, `{"status_code":50000}`)
	})
	_, err = broken.SERP().RankCheckTaskResult(t.Context(), RankCheckTaskResultInput{TaskID: "task-1"})
	require.Equal(t, ErrorCodeTaskFailed, mustError(t, err).Code)

	invalid := newEndpointClient(t, func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`not-json`))
	})
	_, err = invalid.SERP().RankCheckTaskResult(t.Context(), RankCheckTaskResultInput{TaskID: "task-1"})
	require.Equal(t, ErrorCodeInvalidResponse, mustError(t, err).Code)

	denied := newEndpointClient(t, func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(strings.Repeat("nope", 100)))
	})
	_, err = denied.SERP().RankCheckTaskResult(t.Context(), RankCheckTaskResultInput{TaskID: "task-1"})
	require.Equal(t, ErrorCodeAuthFailed, mustError(t, err).Code)
}

func TestEnvelopeHelpers(t *testing.T) {
	require.Nil(t, firstResultTotal(nil))
	require.Nil(t, firstResultObject(nil))
	require.Nil(t, firstResultTotalCount(&Task{Result: []TaskResult{{"total_count": json.RawMessage(`"bad"`)}}}))

	task := &Task{Path: []string{"v3"}, Cost: 1, Result: []TaskResult{{"total": json.RawMessage(`{"mentions":2}`), "items": json.RawMessage(`[{"keyword":"seo"}]`)}}}
	total, err := taskResponseFromTotal[map[string]int](task)
	require.NoError(t, err)
	require.Equal(t, 2, total.Data["mentions"])
	first, err := taskResponseFromFirstResult[map[string]any](&Task{
		Path: []string{"v3"}, Cost: 1, Result: []TaskResult{{"answer": json.RawMessage(`"hi"`)}},
	})
	require.NoError(t, err)
	require.Equal(t, "hi", first.Data["answer"])

	_, err = decodeTotal[map[string]int](json.RawMessage(`[]`))
	require.Equal(t, ErrorCodeInvalidResponse, mustError(t, err).Code)
	require.Empty(t, parseTaskTag(nil))
	require.Empty(t, parseTaskTag([]byte(`[]`)))
	require.Equal(t, "kw:desktop", parseTaskTag([]byte(`{"tag":"kw:desktop"}`)))
}

func newEndpointClient(t *testing.T, handler http.HandlerFunc) *Client {
	t.Helper()
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	client, err := NewClientWithHTTPClient(Config{APIKey: "dGVzdA=="}, server.Client())
	require.NoError(t, err)
	client.baseURL = server.URL
	return client
}

func writeTask(t *testing.T, w http.ResponseWriter, body string) {
	t.Helper()
	_, err := w.Write([]byte(body))
	require.NoError(t, err)
}

func mustError(t *testing.T, err error) *Error {
	t.Helper()
	typed, ok := AsError(err)
	require.True(t, ok)
	return typed
}
