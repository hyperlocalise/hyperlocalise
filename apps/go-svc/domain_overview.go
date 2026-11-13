package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	gosvcvalkey "github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/valkey"
	"github.com/hyperlocalise/hyperlocalise/internal/dataforseo"
	"golang.org/x/sync/errgroup"
)

type domainOverviewKeyword struct {
	Keyword  string  `json:"keyword"`
	Position *int    `json:"position,omitempty"`
	Volume   int     `json:"volume"`
	ETV      float64 `json:"etv"`
	URL      string  `json:"url,omitempty"`
}

type domainOverviewPage struct {
	Page         string  `json:"page"`
	KeywordCount int     `json:"keywordCount"`
	ETV          float64 `json:"etv"`
}

type domainOverview struct {
	Market              map[string]any          `json:"market"`
	CapturedAt          time.Time               `json:"capturedAt"`
	OrganicKeywordCount int                     `json:"organicKeywordCount"`
	OrganicETV          float64                 `json:"organicEtv"`
	Top10Count          int                     `json:"top10Count"`
	TrackedCount        int                     `json:"trackedCount"`
	ImprovedCount       int                     `json:"improvedCount"`
	DeclinedCount       int                     `json:"declinedCount"`
	UnchangedCount      int                     `json:"unchangedCount"`
	UnrankedCount       int                     `json:"unrankedCount"`
	TopKeywords         []domainOverviewKeyword `json:"topKeywords"`
	TopPages            []domainOverviewPage    `json:"topPages"`
}

type domainOverviewDatabaseError struct{ err error }

func (e *domainOverviewDatabaseError) Error() string { return e.err.Error() }
func (e *domainOverviewDatabaseError) Unwrap() error { return e.err }

const (
	DOMAIN_OVERVIEW_CACHE_TTL     = 7 * 24 * time.Hour
	DOMAIN_OVERVIEW_CACHE_TIMEOUT = 500 * time.Millisecond
)

func domainOverviewCacheKey(organizationID, linkedDomainID string, market researchMarket) string {
	return "go-svc:domain-overview:v1:" + organizationID + ":" + linkedDomainID + ":" + itoa(market.LocationCode) + ":" + market.Language
}

func (h *handler) getDomainOverview(r *http.Request, actor workspaceActor) (any, int, error) {
	domain, err := h.loadLinkedDomain(r.Context(), actor, r.PathValue("linkedDomainId"), false)
	if err != nil {
		return nil, 0, err
	}
	market, err := overviewMarket(domain, r.URL.Query().Get("marketId"))
	if err != nil {
		return nil, 0, err
	}
	overview, err := h.readDomainOverview(r.Context(), domain, market)
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"overview": overview, "market": market.public()}, http.StatusOK, nil
}

func (h *handler) refreshDomainOverview(r *http.Request, actor workspaceActor) (any, int, error) {
	var body struct {
		MarketID string `json:"marketId"`
	}
	if err := decodeWorkspaceBody(r, &body); err != nil || strings.TrimSpace(body.MarketID) == "" {
		return nil, 0, workspaceFailure(400, "invalid_domain_overview_payload", "marketId is required.")
	}
	domain, err := h.loadLinkedDomain(r.Context(), actor, r.PathValue("linkedDomainId"), true)
	if err != nil {
		return nil, 0, err
	}
	market, err := overviewMarket(domain, body.MarketID)
	if err != nil {
		return nil, 0, err
	}
	if h.research == nil {
		return nil, 0, workspaceFailure(503, "provider_not_configured", "DataForSEO is not configured.")
	}
	overview, err := h.fetchDomainOverview(r.Context(), domain, market)
	if err != nil {
		if errors.Is(r.Context().Err(), context.DeadlineExceeded) &&
			(errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded)) {
			return nil, 0, workspaceFailure(504, "domain_overview_timeout", "Overview refresh timed out.")
		}
		if errors.Is(err, context.Canceled) {
			return nil, 0, err
		}
		var databaseErr *domainOverviewDatabaseError
		if errors.As(err, &databaseErr) {
			return nil, 0, workspaceFailure(500, "domain_overview_data_unavailable", "Tracked keyword data is temporarily unavailable.")
		}
		return nil, 0, researchProviderError(err)
	}
	if err := h.writeDomainOverview(r.Context(), domain, market, overview); err != nil {
		return nil, 0, err
	}
	return map[string]any{"overview": overview, "market": market.public()}, http.StatusOK, nil
}

func overviewMarket(domain linkedDomainRecord, requested string) (researchMarket, error) {
	requested = strings.TrimSpace(requested)
	marketIDs := domain.MarketIDs
	if len(marketIDs) == 0 {
		marketIDs = defaultResearchMarketIDs
	}
	if requested == "" {
		requested = marketIDs[0]
	}
	market, ok := researchMarketByID(requested)
	if !ok {
		return researchMarket{}, workspaceFailure(400, "market_not_found", "Unknown research market.")
	}
	for _, id := range marketIDs {
		if id == market.ID {
			return market, nil
		}
	}
	return researchMarket{}, workspaceFailure(400, "market_not_enabled", "This market is not enabled for the domain.")
}

func (h *handler) fetchDomainOverview(ctx context.Context, domain linkedDomainRecord, market researchMarket) (domainOverview, error) {
	var rank dataforseo.TaskResponse[[]dataforseo.DomainRankOverviewItem]
	var keywords dataforseo.TaskResponse[dataforseo.RankedKeywordsPage]
	var pages dataforseo.TaskResponse[dataforseo.RelevantPagesPage]
	g, groupCtx := errgroup.WithContext(ctx)
	g.Go(func() error {
		var err error
		rank, err = h.research.DomainRankOverview(groupCtx, dataforseo.DomainRankOverviewInput{Target: domain.DomainKey, Market: dataforseo.MarketScope{LocationCode: market.LocationCode, LanguageCode: market.Language}})
		return err
	})
	g.Go(func() error {
		var err error
		keywords, err = h.research.RankedKeywords(groupCtx, dataforseo.RankedKeywordsInput{Target: domain.DomainKey, Market: dataforseo.MarketScope{LocationCode: market.LocationCode, LanguageCode: market.Language}, Limit: 10, OrderBy: []string{"keyword_data.keyword_info.search_volume,desc"}})
		return err
	})
	g.Go(func() error {
		var err error
		pages, err = h.research.RelevantPages(groupCtx, dataforseo.RelevantPagesInput{Target: domain.DomainKey, Market: dataforseo.MarketScope{LocationCode: market.LocationCode, LanguageCode: market.Language}, Limit: 10, OrderBy: []string{"metrics.organic.etv,desc"}})
		return err
	})
	if err := g.Wait(); err != nil {
		return domainOverview{}, err
	}
	count, etv, top10 := marketOrganicMetrics(rank.Data)
	result := domainOverview{
		Market: market.public(), CapturedAt: time.Now().UTC(),
		OrganicKeywordCount: count, OrganicETV: etv, Top10Count: top10,
		TopKeywords: normalizeOverviewKeywords(keywords.Data.Items),
		TopPages:    normalizeOverviewPages(pages.Data.Items),
	}
	var err error
	result.TrackedCount, result.ImprovedCount, result.DeclinedCount, result.UnchangedCount, result.UnrankedCount, err = h.trackedOverviewCounts(ctx, domain.ID, market)
	if err != nil {
		return domainOverview{}, &domainOverviewDatabaseError{err: err}
	}
	return result, nil
}

func normalizeOverviewKeywords(items []dataforseo.DomainRankedKeywordItem) []domainOverviewKeyword {
	rows := make([]domainOverviewKeyword, 0, len(items))
	for _, item := range items {
		row := domainOverviewKeyword{
			Keyword: stringValue(item["keyword"]),
			Volume:  firstNonZeroInt(nestedInt(item, "keyword_info", "search_volume"), nestedInt(item, "keyword_data", "keyword_info", "search_volume")),
			ETV:     firstNonZeroFloat(nestedFloat(item, "ranked_serp_element", "etv"), nestedFloat(item, "ranked_serp_element", "serp_item", "etv")),
			URL:     firstNonEmptyString(nestedString(item, "ranked_serp_element", "url"), nestedString(item, "ranked_serp_element", "serp_item", "url")),
		}
		if row.Keyword == "" {
			row.Keyword = nestedString(item, "keyword_data", "keyword")
		}
		position := firstNonZeroInt(nestedInt(item, "ranked_serp_element", "rank_absolute"), nestedInt(item, "ranked_serp_element", "serp_item", "rank_absolute"))
		if position > 0 {
			row.Position = &position
		}
		rows = append(rows, row)
	}
	return rows
}

func normalizeOverviewPages(items []dataforseo.RelevantPageItem) []domainOverviewPage {
	rows := make([]domainOverviewPage, 0, len(items))
	for _, item := range items {
		rows = append(rows, domainOverviewPage{Page: stringValue(item["page_address"]), KeywordCount: nestedInt(item, "metrics", "organic", "count"), ETV: nestedFloat(item, "metrics", "organic", "etv")})
	}
	return rows
}

func nestedValue(value any, keys ...string) any {
	for _, key := range keys {
		row, ok := value.(map[string]any)
		if !ok {
			return nil
		}
		value = row[key]
	}
	return value
}

func nestedInt(row map[string]any, keys ...string) int { return anyInt(nestedValue(row, keys...)) }
func nestedFloat(row map[string]any, keys ...string) float64 {
	return anyFloat(nestedValue(row, keys...))
}

func nestedString(row map[string]any, keys ...string) string {
	return stringValue(nestedValue(row, keys...))
}
func stringValue(value any) string { result, _ := value.(string); return result }
func firstNonZeroInt(values ...int) int {
	for _, value := range values {
		if value != 0 {
			return value
		}
	}
	return 0
}

func firstNonZeroFloat(values ...float64) float64 {
	for _, value := range values {
		if value != 0 {
			return value
		}
	}
	return 0
}

func firstNonEmptyString(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}

func (h *handler) trackedOverviewCounts(ctx context.Context, domainID string, market researchMarket) (int, int, int, int, int, error) {
	var tracked, improved, declined, unchanged, unranked int
	rows, err := h.workspace.pool.Query(ctx, `select position, previous_position from domain_research_tracked_keywords where linked_domain_id=$1 and location_code=$2 and language_code=$3`, domainID, market.LocationCode, market.Language)
	if err != nil {
		return 0, 0, 0, 0, 0, err
	}
	defer rows.Close()
	for rows.Next() {
		var position, previous *int
		if err := rows.Scan(&position, &previous); err != nil {
			return 0, 0, 0, 0, 0, err
		}
		tracked++
		switch {
		case position == nil:
			unranked++
		case previous == nil:
			unchanged++
		case *position < *previous:
			improved++
		case *position > *previous:
			declined++
		default:
			unchanged++
		}
	}
	if err := rows.Err(); err != nil {
		return 0, 0, 0, 0, 0, err
	}
	return tracked, improved, declined, unchanged, unranked, nil
}

func (h *handler) writeDomainOverview(ctx context.Context, domain linkedDomainRecord, market researchMarket, overview domainOverview) error {
	if h.overviewCache == nil {
		return workspaceFailure(503, "cache_not_configured", "Overview cache is not configured.")
	}
	payload, err := json.Marshal(overview)
	if err != nil {
		return err
	}
	cacheCtx, cancel := context.WithTimeout(ctx, DOMAIN_OVERVIEW_CACHE_TIMEOUT)
	defer cancel()
	return h.overviewCache.Set(cacheCtx, domainOverviewCacheKey(domain.OrganizationID, domain.ID, market), string(payload), DOMAIN_OVERVIEW_CACHE_TTL)
}

func (h *handler) readDomainOverview(ctx context.Context, domain linkedDomainRecord, market researchMarket) (*domainOverview, error) {
	if h.overviewCache == nil {
		return nil, nil
	}
	cacheCtx, cancel := context.WithTimeout(ctx, DOMAIN_OVERVIEW_CACHE_TIMEOUT)
	defer cancel()
	raw, err := h.overviewCache.Get(cacheCtx, domainOverviewCacheKey(domain.OrganizationID, domain.ID, market))
	if err != nil {
		if errors.Is(err, gosvcvalkey.ErrNil) {
			return nil, nil
		}
		return nil, workspaceFailure(503, "cache_unavailable", "Overview cache is temporarily unavailable.")
	}
	var overview domainOverview
	if err := json.Unmarshal([]byte(raw), &overview); err != nil {
		return nil, err
	}
	overview.Market = market.public()
	return &overview, nil
}
