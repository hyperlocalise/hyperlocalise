package main

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/dataforseo"
	"golang.org/x/sync/errgroup"
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

type researchMarketRequest struct {
	Keyword      string `json:"keyword"`
	LocationCode int    `json:"locationCode"`
	LanguageCode string `json:"languageCode"`
	Limit        int    `json:"limit"`
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

type researchSerpRequest struct {
	Keyword      string `json:"keyword"`
	LocationCode int    `json:"locationCode"`
	LanguageCode string `json:"languageCode"`
	TargetDomain string `json:"targetDomain"`
	Device       string `json:"device"`
	Depth        int    `json:"depth"`
}

type researchRankCheckRequest struct {
	KeywordID    string `json:"keywordId"`
	Keyword      string `json:"keyword"`
	TargetDomain string `json:"targetDomain"`
	LocationCode int    `json:"locationCode"`
	LanguageCode string `json:"languageCode"`
	Device       string `json:"device"`
	Depth        int    `json:"depth"`
}

type researchRankCheckKeyword struct {
	KeywordID string `json:"keywordId"`
	Keyword   string `json:"keyword"`
}

type researchRankCheckBatchRequest struct {
	TargetDomain string                     `json:"targetDomain"`
	LocationCode int                        `json:"locationCode"`
	LanguageCode string                     `json:"languageCode"`
	Device       string                     `json:"device"`
	Depth        int                        `json:"depth"`
	Keywords     []researchRankCheckKeyword `json:"keywords"`
}

type researchKeywordsResponse struct {
	Keywords []dataforseo.KeywordIdea `json:"keywords"`
	Billing  dataforseo.APICallCost   `json:"billing"`
}

type researchSerpResponse struct {
	Results []dataforseo.OrganicSerpResult `json:"results"`
	Billing dataforseo.APICallCost         `json:"billing"`
}

type researchRankCheckResponse struct {
	Result  dataforseo.RankCheckResult `json:"result"`
	Billing dataforseo.APICallCost     `json:"billing"`
}

type researchRankCheckBatchResponse struct {
	Results []dataforseo.RankCheckResult `json:"results"`
}

func (h *handler) marketVisibility(w http.ResponseWriter, r *http.Request) {
	if !h.requireResearch(w, r) {
		return
	}

	var req researchMarketVisibilityRequest
	if !decodeResearchBody(w, r, &req) {
		return
	}
	if strings.TrimSpace(req.TargetDomain) == "" || strings.TrimSpace(req.MarketID) == "" || req.LocationCode <= 0 || strings.TrimSpace(req.LanguageCode) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{
			"error":   "dataforseo_validation_error",
			"message": "targetDomain, marketId, locationCode, and languageCode are required",
		})
		return
	}
	if h.research == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{
			"error":   "dataforseo_not_configured",
			"message": "DATAFORSEO_API_KEY is not configured",
		})
		return
	}

	result, err := h.computeMarketVisibility(r.Context(), req)
	if err != nil {
		writeResearchError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
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

func (h *handler) expandKeywords(w http.ResponseWriter, r *http.Request) {
	if !h.requireResearch(w, r) {
		return
	}

	var req researchMarketRequest
	if !decodeResearchBody(w, r, &req) {
		return
	}

	keyword, languageCode, ok := validateKeywordMarket(w, r, req.Keyword, req.LanguageCode, req.LocationCode)
	if !ok {
		return
	}

	response, err := h.research.KeywordIdeas(r.Context(), dataforseo.KeywordIdeasInput{
		Keyword: keyword,
		Market: dataforseo.MarketScope{
			LocationCode: req.LocationCode,
			LanguageCode: languageCode,
		},
		Limit: clampKeywordLimit(req.Limit),
	})
	if err != nil {
		writeResearchError(w, r, err)
		return
	}

	writeJSON(w, http.StatusOK, researchKeywordsResponse{
		Keywords: dataforseo.ParseKeywordIdeas(response.Data),
		Billing:  response.Billing,
	})
}

func (h *handler) liveSerp(w http.ResponseWriter, r *http.Request) {
	if !h.requireResearch(w, r) {
		return
	}

	var req researchSerpRequest
	if !decodeResearchBody(w, r, &req) {
		return
	}

	keyword, languageCode, ok := validateKeywordMarket(w, r, req.Keyword, req.LanguageCode, req.LocationCode)
	if !ok {
		return
	}

	response, err := h.research.LiveAdvanced(r.Context(), dataforseo.LiveSerpInput{
		Keyword: keyword,
		Market: dataforseo.MarketScope{
			LocationCode: req.LocationCode,
			LanguageCode: languageCode,
		},
		Device: req.Device,
		Depth:  req.Depth,
	})
	if err != nil {
		writeResearchError(w, r, err)
		return
	}

	writeJSON(w, http.StatusOK, researchSerpResponse{
		Results: dataforseo.ParseOrganicSerpResults(response.Data, req.TargetDomain),
		Billing: response.Billing,
	})
}

func (h *handler) rankCheck(w http.ResponseWriter, r *http.Request) {
	if !h.requireResearch(w, r) {
		return
	}

	var req researchRankCheckRequest
	if !decodeResearchBody(w, r, &req) {
		return
	}

	keyword, languageCode, ok := validateKeywordMarket(w, r, req.Keyword, req.LanguageCode, req.LocationCode)
	if !ok {
		return
	}
	targetDomain := strings.TrimSpace(req.TargetDomain)
	if targetDomain == "" {
		writeBadRequest(w, r, "targetDomain is required")
		return
	}

	response, err := h.research.RankCheck(r.Context(), dataforseo.RankCheckSerpInput{
		KeywordID:    strings.TrimSpace(req.KeywordID),
		Keyword:      keyword,
		TargetDomain: targetDomain,
		Market: dataforseo.MarketScope{
			LocationCode: req.LocationCode,
			LanguageCode: languageCode,
		},
		Device: req.Device,
		Depth:  defaultSerpDepth(req.Depth),
	})
	if err != nil {
		writeResearchError(w, r, err)
		return
	}

	writeJSON(w, http.StatusOK, researchRankCheckResponse{
		Result:  response.Data,
		Billing: response.Billing,
	})
}

func (h *handler) rankCheckBatch(w http.ResponseWriter, r *http.Request) {
	if !h.requireResearch(w, r) {
		return
	}

	var req researchRankCheckBatchRequest
	if !decodeResearchBody(w, r, &req) {
		return
	}

	if len(req.Keywords) == 0 || len(req.Keywords) > maxRankCheckBatchSize {
		writeBadRequest(w, r, "keywords must contain 1-20 entries")
		return
	}
	targetDomain := strings.TrimSpace(req.TargetDomain)
	if targetDomain == "" {
		writeBadRequest(w, r, "targetDomain is required")
		return
	}
	languageCode := strings.TrimSpace(req.LanguageCode)
	if languageCode == "" || req.LocationCode <= 0 {
		writeBadRequest(w, r, "locationCode and languageCode are required")
		return
	}

	items := make([]researchRankCheckKeyword, 0, len(req.Keywords))
	for _, item := range req.Keywords {
		keyword := strings.TrimSpace(item.Keyword)
		if keyword == "" {
			continue
		}
		items = append(items, researchRankCheckKeyword{
			KeywordID: strings.TrimSpace(item.KeywordID),
			Keyword:   keyword,
		})
	}
	if len(items) == 0 {
		writeJSON(w, http.StatusOK, researchRankCheckBatchResponse{Results: []dataforseo.RankCheckResult{}})
		return
	}

	results := make([]dataforseo.RankCheckResult, len(items))
	group, ctx := errgroup.WithContext(r.Context())
	group.SetLimit(rankCheckConcurrency)
	for i, item := range items {
		group.Go(func() error {
			response, err := h.research.RankCheck(ctx, dataforseo.RankCheckSerpInput{
				KeywordID:    item.KeywordID,
				Keyword:      item.Keyword,
				TargetDomain: targetDomain,
				Market: dataforseo.MarketScope{
					LocationCode: req.LocationCode,
					LanguageCode: languageCode,
				},
				Device: req.Device,
				Depth:  defaultSerpDepth(req.Depth),
			})
			if err != nil {
				return err
			}
			results[i] = response.Data
			return nil
		})
	}
	if err := group.Wait(); err != nil {
		writeResearchError(w, r, err)
		return
	}

	writeJSON(w, http.StatusOK, researchRankCheckBatchResponse{Results: results})
}

func (h *handler) requireResearch(w http.ResponseWriter, r *http.Request) bool {
	if h.research != nil {
		return true
	}
	noteRequest(r, "code", "dataforseo_not_configured")
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusServiceUnavailable)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"error":   "dataforseo_not_configured",
		"message": "DATAFORSEO_API_KEY is not configured",
	})
	return false
}

func decodeResearchBody(w http.ResponseWriter, r *http.Request, dest any) bool {
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxResearchBodyBytes))
	if err := decoder.Decode(dest); err != nil {
		if isRequestBodyTooLarge(err) {
			writePayloadTooLarge(w, r)
			return false
		}
		writeBadRequest(w, r, "invalid JSON body")
		return false
	}
	return true
}

func validateKeywordMarket(w http.ResponseWriter, r *http.Request, keyword, languageCode string, locationCode int) (string, string, bool) {
	trimmedKeyword := strings.TrimSpace(keyword)
	trimmedLanguage := strings.TrimSpace(languageCode)
	if trimmedKeyword == "" {
		writeBadRequest(w, r, "keyword is required")
		return "", "", false
	}
	if locationCode <= 0 || trimmedLanguage == "" {
		writeBadRequest(w, r, "locationCode and languageCode are required")
		return "", "", false
	}
	return trimmedKeyword, trimmedLanguage, true
}

func clampKeywordLimit(limit int) int {
	if limit <= 0 {
		return defaultKeywordIdeaLimit
	}
	if limit > maxKeywordIdeaLimit {
		return maxKeywordIdeaLimit
	}
	return limit
}

func defaultSerpDepth(depth int) int {
	if depth <= 0 {
		return defaultResearchSerpDepth
	}
	return depth
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeResearchError(w http.ResponseWriter, r *http.Request, err error) {
	status := http.StatusBadGateway
	code := "dataforseo_upstream_unavailable"
	message := "DataForSEO request failed"
	if typed, ok := dataforseo.AsError(err); ok {
		code = string(typed.Code)
		if typed.Message != "" {
			message = typed.Message
		}
		switch typed.Code {
		case dataforseo.ErrorCodeValidation:
			status = http.StatusBadRequest
		case dataforseo.ErrorCodeRateLimited:
			status = http.StatusTooManyRequests
		case dataforseo.ErrorCodeAuthFailed:
			status = http.StatusBadGateway
		}
	}
	noteRequest(r, "code", code)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"error":   code,
		"message": message,
	})
}
