package main

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"os"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/dataforseo"
	"golang.org/x/sync/errgroup"
)

const (
	maxResearchBodyBytes        = 64 << 10
	defaultKeywordIdeaLimit     = 50
	maxKeywordIdeaLimit         = 200
	maxRankCheckBatchSize       = 20
	defaultResearchSerpDepth    = 20
	rankCheckConcurrency        = 4
	researchServiceTokenHeader  = "X-Go-Svc-Research-Token"
	researchServiceTokenMessage = "go-svc-research"
)

type researchService interface {
	KeywordIdeas(ctx context.Context, input dataforseo.KeywordIdeasInput) (dataforseo.TaskResponse[[]dataforseo.KeywordDataItem], error)
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

func (h *handler) expandKeywords(w http.ResponseWriter, r *http.Request) {
	if !h.requireResearch(w) {
		return
	}

	var req researchMarketRequest
	if !decodeResearchBody(w, r, &req) {
		return
	}

	keyword, languageCode, ok := validateKeywordMarket(w, req.Keyword, req.LanguageCode, req.LocationCode)
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
		writeResearchError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, researchKeywordsResponse{
		Keywords: dataforseo.ParseKeywordIdeas(response.Data),
		Billing:  response.Billing,
	})
}

func (h *handler) liveSerp(w http.ResponseWriter, r *http.Request) {
	if !h.requireResearch(w) {
		return
	}

	var req researchSerpRequest
	if !decodeResearchBody(w, r, &req) {
		return
	}

	keyword, languageCode, ok := validateKeywordMarket(w, req.Keyword, req.LanguageCode, req.LocationCode)
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
		writeResearchError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, researchSerpResponse{
		Results: dataforseo.ParseOrganicSerpResults(response.Data, req.TargetDomain),
		Billing: response.Billing,
	})
}

func (h *handler) rankCheck(w http.ResponseWriter, r *http.Request) {
	if !h.requireResearch(w) {
		return
	}

	var req researchRankCheckRequest
	if !decodeResearchBody(w, r, &req) {
		return
	}

	keyword, languageCode, ok := validateKeywordMarket(w, req.Keyword, req.LanguageCode, req.LocationCode)
	if !ok {
		return
	}
	targetDomain := strings.TrimSpace(req.TargetDomain)
	if targetDomain == "" {
		writeBadRequest(w, "targetDomain is required")
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
		writeResearchError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, researchRankCheckResponse{
		Result:  response.Data,
		Billing: response.Billing,
	})
}

func (h *handler) rankCheckBatch(w http.ResponseWriter, r *http.Request) {
	if !h.requireResearch(w) {
		return
	}

	var req researchRankCheckBatchRequest
	if !decodeResearchBody(w, r, &req) {
		return
	}

	if len(req.Keywords) == 0 || len(req.Keywords) > maxRankCheckBatchSize {
		writeBadRequest(w, "keywords must contain 1-20 entries")
		return
	}
	targetDomain := strings.TrimSpace(req.TargetDomain)
	if targetDomain == "" {
		writeBadRequest(w, "targetDomain is required")
		return
	}
	languageCode := strings.TrimSpace(req.LanguageCode)
	if languageCode == "" || req.LocationCode <= 0 {
		writeBadRequest(w, "locationCode and languageCode are required")
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
		writeResearchError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, researchRankCheckBatchResponse{Results: results})
}

func researchAuthMiddleware(verifier SessionVerifier) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return authMiddleware(verifier)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !requireResearchServiceToken(w, r) {
				return
			}
			next.ServeHTTP(w, r)
		}))
	}
}

func researchServiceToken() string {
	mac := hmac.New(sha256.New, []byte(os.Getenv("WORKOS_COOKIE_PASSWORD")))
	_, _ = mac.Write([]byte(researchServiceTokenMessage))
	return hex.EncodeToString(mac.Sum(nil))
}

func requireResearchServiceToken(w http.ResponseWriter, r *http.Request) bool {
	provided := strings.TrimSpace(r.Header.Get(researchServiceTokenHeader))
	expected := researchServiceToken()
	if provided == "" || subtle.ConstantTimeCompare([]byte(provided), []byte(expected)) != 1 {
		writeUnauthorized(w, "missing research service token")
		return false
	}
	return true
}

func (h *handler) requireResearch(w http.ResponseWriter) bool {
	if h.research != nil {
		return true
	}
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
			writePayloadTooLarge(w)
			return false
		}
		writeBadRequest(w, "invalid JSON body")
		return false
	}
	return true
}

func validateKeywordMarket(w http.ResponseWriter, keyword, languageCode string, locationCode int) (string, string, bool) {
	trimmedKeyword := strings.TrimSpace(keyword)
	trimmedLanguage := strings.TrimSpace(languageCode)
	if trimmedKeyword == "" {
		writeBadRequest(w, "keyword is required")
		return "", "", false
	}
	if locationCode <= 0 || trimmedLanguage == "" {
		writeBadRequest(w, "locationCode and languageCode are required")
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

func writeResearchError(w http.ResponseWriter, err error) {
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
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"error":   code,
		"message": message,
	})
}
