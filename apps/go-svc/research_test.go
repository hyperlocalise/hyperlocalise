package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/dataforseo"
	"github.com/stretchr/testify/require"
)

type fakeResearch struct {
	ideas    dataforseo.TaskResponse[[]dataforseo.KeywordDataItem]
	ideasErr error
	serp     dataforseo.TaskResponse[[]dataforseo.SerpItem]
	serpErr  error
	rank     dataforseo.TaskResponse[dataforseo.RankCheckResult]
	rankErr  error
}

func (f fakeResearch) KeywordIdeas(
	_ context.Context,
	_ dataforseo.KeywordIdeasInput,
) (dataforseo.TaskResponse[[]dataforseo.KeywordDataItem], error) {
	return f.ideas, f.ideasErr
}

func (f fakeResearch) LiveAdvanced(
	_ context.Context,
	_ dataforseo.LiveSerpInput,
) (dataforseo.TaskResponse[[]dataforseo.SerpItem], error) {
	return f.serp, f.serpErr
}

func (f fakeResearch) RankCheck(
	_ context.Context,
	_ dataforseo.RankCheckSerpInput,
) (dataforseo.TaskResponse[dataforseo.RankCheckResult], error) {
	return f.rank, f.rankErr
}

func TestExpandKeywordsRequiresConfiguration(t *testing.T) {
	h := newHandler()
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/v1/domains/research/keywords", bytes.NewBufferString(`{
		"keyword":"seo","locationCode":2840,"languageCode":"en"
	}`))

	h.expandKeywords(rec, req)

	require.Equal(t, http.StatusServiceUnavailable, rec.Code)
	require.Contains(t, rec.Body.String(), "dataforseo_not_configured")
}

func TestExpandKeywordsReturnsNormalizedIdeas(t *testing.T) {
	h := newHandler()
	h.research = fakeResearch{
		ideas: dataforseo.TaskResponse[[]dataforseo.KeywordDataItem]{
			Data: []dataforseo.KeywordDataItem{{
				"keyword": "seo tools",
				"keyword_info": map[string]any{
					"search_volume": float64(1200),
					"cpc":           2.4,
				},
				"keyword_properties": map[string]any{
					"keyword_difficulty": float64(38),
				},
				"search_intent_info": map[string]any{"main_intent": "commercial"},
			}},
			Billing: dataforseo.APICallCost{
				Path:    []string{"v3", "dataforseo_labs", "google", "keyword_ideas", "live"},
				CostUSD: 0.05,
			},
		},
	}

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/v1/domains/research/keywords", bytes.NewBufferString(`{
		"keyword":"seo","locationCode":2840,"languageCode":"en"
	}`))
	h.expandKeywords(rec, req)

	require.Equal(t, http.StatusOK, rec.Code)
	var body researchKeywordsResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Equal(t, []dataforseo.KeywordIdea{{
		Keyword: "seo tools",
		Volume:  1200,
		KD:      38,
		CPC:     2.4,
		Intent:  "commercial",
	}}, body.Keywords)
	require.Equal(t, 0.05, body.Billing.CostUSD)
}

func TestLiveSerpRequiresKeyword(t *testing.T) {
	h := newHandler()
	h.research = fakeResearch{}
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/v1/domains/research/serp", bytes.NewBufferString(`{
		"locationCode":2250,"languageCode":"fr"
	}`))
	h.liveSerp(rec, req)
	require.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestRankCheckMapsProviderValidation(t *testing.T) {
	h := newHandler()
	h.research = fakeResearch{
		rankErr: &dataforseo.Error{
			Code:    dataforseo.ErrorCodeValidation,
			Message: "keyword and targetDomain are required",
		},
	}
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/v1/domains/research/rank-check", bytes.NewBufferString(`{
		"keyword":"seo","keywordId":"kw_1","targetDomain":"example.com",
		"locationCode":2840,"languageCode":"en"
	}`))
	h.rankCheck(rec, req)
	require.Equal(t, http.StatusBadRequest, rec.Code)
	require.Contains(t, rec.Body.String(), "dataforseo_validation_error")
}

func TestRankCheckBatchCapsSize(t *testing.T) {
	h := newHandler()
	h.research = fakeResearch{}
	payload := map[string]any{
		"targetDomain": "example.com",
		"locationCode": 2840,
		"languageCode": "en",
		"keywords":     make([]map[string]string, 21),
	}
	for i := range 21 {
		payload["keywords"].([]map[string]string)[i] = map[string]string{
			"keywordId": "kw",
			"keyword":   "seo",
		}
	}
	body, err := json.Marshal(payload)
	require.NoError(t, err)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/v1/domains/research/rank-check/batch", bytes.NewReader(body))
	h.rankCheckBatch(rec, req)
	require.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestRankCheckBatchReturnsResults(t *testing.T) {
	position := 6
	h := newHandler()
	h.research = fakeResearch{
		rank: dataforseo.TaskResponse[dataforseo.RankCheckResult]{
			Data: dataforseo.RankCheckResult{
				KeywordID: "kw_1",
				Keyword:   "seo tools",
				Position:  &position,
				URL:       "https://example.com/seo",
			},
		},
	}
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/v1/domains/research/rank-check/batch", bytes.NewBufferString(`{
		"targetDomain":"example.com","locationCode":2840,"languageCode":"en",
		"keywords":[{"keywordId":"kw_1","keyword":"seo tools"}]
	}`))
	h.rankCheckBatch(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)
	var body researchRankCheckBatchResponse
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Len(t, body.Results, 1)
	require.Equal(t, "seo tools", body.Results[0].Keyword)
	require.Equal(t, &position, body.Results[0].Position)
}

func TestExpandKeywordsUnauthorizedOnRegisteredRoute(t *testing.T) {
	h := newHandler()
	h.research = fakeResearch{}
	mux := http.NewServeMux()
	registerRoutes(mux, h, mockSessionVerifier{err: errors.New("nope")})

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/v1/domains/research/keywords", bytes.NewBufferString(`{}`))
	mux.ServeHTTP(rec, req)
	require.Equal(t, http.StatusUnauthorized, rec.Code)
}
