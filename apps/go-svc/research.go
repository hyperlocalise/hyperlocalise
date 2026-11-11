package main

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/dataforseo"
)

const (
	maxResearchBodyBytes     = 64 << 10
	defaultKeywordIdeaLimit  = 50
	maxKeywordIdeaLimit      = 200
	maxRankCheckBatchSize    = 20
	defaultResearchSerpDepth = 20
	rankCheckConcurrency     = 4
)

type researchService interface {
	KeywordIdeas(ctx context.Context, input dataforseo.KeywordIdeasInput) (dataforseo.TaskResponse[[]dataforseo.KeywordDataItem], error)
	DomainRankOverview(ctx context.Context, input dataforseo.DomainRankOverviewInput) (dataforseo.TaskResponse[[]dataforseo.DomainRankOverviewItem], error)
	RankedKeywords(ctx context.Context, input dataforseo.RankedKeywordsInput) (dataforseo.TaskResponse[dataforseo.RankedKeywordsPage], error)
	RelevantPages(ctx context.Context, input dataforseo.RelevantPagesInput) (dataforseo.TaskResponse[dataforseo.RelevantPagesPage], error)
	LiveAdvanced(ctx context.Context, input dataforseo.LiveSerpInput) (dataforseo.TaskResponse[[]dataforseo.SerpItem], error)
	RankCheck(ctx context.Context, input dataforseo.RankCheckSerpInput) (dataforseo.TaskResponse[dataforseo.RankCheckResult], error)
}

type dataForSEOResearch struct {
	client *dataforseo.Client
}

func newDataForSEOResearch(client *dataforseo.Client) *dataForSEOResearch {
	return &dataForSEOResearch{client: client}
}

func (d *dataForSEOResearch) KeywordIdeas(
	ctx context.Context,
	input dataforseo.KeywordIdeasInput,
) (dataforseo.TaskResponse[[]dataforseo.KeywordDataItem], error) {
	return d.client.Labs().KeywordIdeas(ctx, input)
}

func (d *dataForSEOResearch) DomainRankOverview(
	ctx context.Context,
	input dataforseo.DomainRankOverviewInput,
) (dataforseo.TaskResponse[[]dataforseo.DomainRankOverviewItem], error) {
	return d.client.Labs().DomainRankOverview(ctx, input)
}

func (d *dataForSEOResearch) RankedKeywords(
	ctx context.Context,
	input dataforseo.RankedKeywordsInput,
) (dataforseo.TaskResponse[dataforseo.RankedKeywordsPage], error) {
	return d.client.Labs().RankedKeywords(ctx, input)
}

func (d *dataForSEOResearch) RelevantPages(
	ctx context.Context,
	input dataforseo.RelevantPagesInput,
) (dataforseo.TaskResponse[dataforseo.RelevantPagesPage], error) {
	return d.client.Labs().RelevantPages(ctx, input)
}

func (d *dataForSEOResearch) LiveAdvanced(
	ctx context.Context,
	input dataforseo.LiveSerpInput,
) (dataforseo.TaskResponse[[]dataforseo.SerpItem], error) {
	return d.client.SERP().LiveAdvanced(ctx, input)
}

func (d *dataForSEOResearch) RankCheck(
	ctx context.Context,
	input dataforseo.RankCheckSerpInput,
) (dataforseo.TaskResponse[dataforseo.RankCheckResult], error) {
	return d.client.SERP().RankCheck(ctx, input)
}

type researchMarketVisibilityRequest struct {
	TargetDomain string `json:"targetDomain"`
	MarketID     string `json:"marketId"`
	LocationCode int    `json:"locationCode"`
	LanguageCode string `json:"languageCode"`
}

type researchMarketVisibilityResponse struct {
	MarketID             string                 `json:"marketId"`
	LocationCode         int                    `json:"locationCode"`
	LanguageCode         string                 `json:"languageCode"`
	OrganicCount         int                    `json:"organicCount"`
	OrganicETV           float64                `json:"organicEtv"`
	Top10Count           int                    `json:"top10Count"`
	HasOrganicVisibility bool                   `json:"hasOrganicVisibility"`
	Billing              dataforseo.APICallCost `json:"billing"`
}

type researchRankCheckKeyword struct {
	KeywordID string `json:"keywordId"`
	Keyword   string `json:"keyword"`
}

func (h *handler) computeMarketVisibility(
	ctx context.Context,
	req researchMarketVisibilityRequest,
) (researchMarketVisibilityResponse, error) {
	response, err := h.research.DomainRankOverview(ctx, dataforseo.DomainRankOverviewInput{
		Target: strings.TrimSpace(req.TargetDomain),
		Market: dataforseo.MarketScope{
			LocationCode: req.LocationCode,
			LanguageCode: strings.TrimSpace(req.LanguageCode),
		},
	})
	if err != nil {
		return researchMarketVisibilityResponse{}, err
	}

	organicCount, organicETV, top10Count := marketOrganicMetrics(response.Data)
	return researchMarketVisibilityResponse{
		MarketID:             req.MarketID,
		LocationCode:         req.LocationCode,
		LanguageCode:         strings.TrimSpace(req.LanguageCode),
		OrganicCount:         organicCount,
		OrganicETV:           organicETV,
		Top10Count:           top10Count,
		HasOrganicVisibility: organicCount > 0 || organicETV > 0 || top10Count > 0,
		Billing:              response.Billing,
	}, nil
}

func marketOrganicMetrics(items []dataforseo.DomainRankOverviewItem) (int, float64, int) {
	if len(items) == 0 {
		return 0, 0, 0
	}
	metrics, _ := items[0]["metrics"].(map[string]any)
	organic, _ := metrics["organic"].(map[string]any)
	count := anyInt(organic["count"])
	etv := anyFloat(organic["etv"])
	top10 := anyInt(organic["pos_1"]) + anyInt(organic["pos_2_3"]) + anyInt(organic["pos_4_10"])
	return count, etv, top10
}

func anyInt(value any) int {
	switch number := value.(type) {
	case int:
		return number
	case float64:
		return int(number)
	case json.Number:
		parsed, _ := number.Int64()
		return int(parsed)
	default:
		return 0
	}
}

func anyFloat(value any) float64 {
	switch number := value.(type) {
	case float64:
		return number
	case float32:
		return float64(number)
	case int:
		return float64(number)
	case json.Number:
		parsed, _ := number.Float64()
		return parsed
	default:
		return 0
	}
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
