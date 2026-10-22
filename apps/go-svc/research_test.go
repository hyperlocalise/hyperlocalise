package main

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/hyperlocalise/hyperlocalise/internal/dataforseo"
	"github.com/stretchr/testify/require"
)

type fakeResearch struct {
	ideas       dataforseo.TaskResponse[[]dataforseo.KeywordDataItem]
	ideasErr    error
	overview    dataforseo.TaskResponse[[]dataforseo.DomainRankOverviewItem]
	overviewErr error
	ranked      dataforseo.TaskResponse[dataforseo.RankedKeywordsPage]
	rankedErr   error
	pages       dataforseo.TaskResponse[dataforseo.RelevantPagesPage]
	pagesErr    error
	serp        dataforseo.TaskResponse[[]dataforseo.SerpItem]
	serpErr     error
	rank        dataforseo.TaskResponse[dataforseo.RankCheckResult]
	rankErr     error
	rankDelay   time.Duration
	onRank      func()
}

func (f fakeResearch) KeywordIdeas(
	_ context.Context,
	_ dataforseo.KeywordIdeasInput,
) (dataforseo.TaskResponse[[]dataforseo.KeywordDataItem], error) {
	return f.ideas, f.ideasErr
}

func (f fakeResearch) DomainRankOverview(
	_ context.Context,
	_ dataforseo.DomainRankOverviewInput,
) (dataforseo.TaskResponse[[]dataforseo.DomainRankOverviewItem], error) {
	return f.overview, f.overviewErr
}

func (f fakeResearch) RankedKeywords(
	_ context.Context,
	_ dataforseo.RankedKeywordsInput,
) (dataforseo.TaskResponse[dataforseo.RankedKeywordsPage], error) {
	return f.ranked, f.rankedErr
}

func (f fakeResearch) RelevantPages(
	_ context.Context,
	_ dataforseo.RelevantPagesInput,
) (dataforseo.TaskResponse[dataforseo.RelevantPagesPage], error) {
	return f.pages, f.pagesErr
}

func TestMarketVisibilityNormalizesOrganicMetrics(t *testing.T) {
	h := newHandler()
	h.research = fakeResearch{
		overview: dataforseo.TaskResponse[[]dataforseo.DomainRankOverviewItem]{
			Data: []dataforseo.DomainRankOverviewItem{{
				"metrics": map[string]any{
					"organic": map[string]any{
						"count":    float64(42),
						"etv":      float64(1380.5),
						"pos_1":    float64(1),
						"pos_2_3":  float64(2),
						"pos_4_10": float64(4),
					},
				},
			}},
			Billing: dataforseo.APICallCost{CostUSD: 0.01},
		},
	}

	body, err := h.computeMarketVisibility(context.Background(), researchMarketVisibilityRequest{
		TargetDomain: "example.com",
		MarketID:     "france-fr",
		LocationCode: 2250,
		LanguageCode: "fr",
	})

	require.NoError(t, err)
	require.Equal(t, "france-fr", body.MarketID)
	require.Equal(t, 42, body.OrganicCount)
	require.Equal(t, 1380.5, body.OrganicETV)
	require.Equal(t, 7, body.Top10Count)
	require.True(t, body.HasOrganicVisibility)
}

func TestMarketVisibilityRequiresFields(t *testing.T) {
	h := newHandler()
	h.research = fakeResearch{}
	req := httptest.NewRequest(http.MethodPost, "/market-visibility", bytes.NewBufferString(`{
		"targetDomain":"example.com","marketId":"france-fr","locationCode":0,"languageCode":"fr"
	}`))

	_, _, err := h.orgDomainMarketVisibility(req, workspaceActor{})

	var failure *workspaceError
	require.ErrorAs(t, err, &failure)
	require.Equal(t, http.StatusBadRequest, failure.status)
	require.Equal(t, "provider_validation_failed", failure.code)
}

func TestMarketOrganicMetricsEmptyAndMissing(t *testing.T) {
	count, etv, top10 := marketOrganicMetrics(nil)
	require.Equal(t, 0, count)
	require.Equal(t, 0.0, etv)
	require.Equal(t, 0, top10)

	count, etv, top10 = marketOrganicMetrics([]dataforseo.DomainRankOverviewItem{{}})
	require.Equal(t, 0, count)
	require.Equal(t, 0.0, etv)
	require.Equal(t, 0, top10)

	h := newHandler()
	h.research = fakeResearch{
		overview: dataforseo.TaskResponse[[]dataforseo.DomainRankOverviewItem]{
			Data: nil,
		},
	}

	body, err := h.computeMarketVisibility(context.Background(), researchMarketVisibilityRequest{
		TargetDomain: "example.com",
		MarketID:     "france-fr",
		LocationCode: 2250,
		LanguageCode: "fr",
	})

	require.NoError(t, err)
	require.Equal(t, 0, body.OrganicCount)
	require.Equal(t, 0.0, body.OrganicETV)
	require.Equal(t, 0, body.Top10Count)
	require.False(t, body.HasOrganicVisibility)
}

func TestDomainOverviewNormalizesLabsRows(t *testing.T) {
	keywords := normalizeOverviewKeywords([]dataforseo.DomainRankedKeywordItem{{
		"keyword_data": map[string]any{
			"keyword":      "localization platform",
			"keyword_info": map[string]any{"search_volume": float64(900)},
		},
		"ranked_serp_element": map[string]any{
			"serp_item": map[string]any{"rank_absolute": float64(4), "etv": float64(120), "url": "https://example.com/localization"},
		},
	}})
	require.Equal(t, []domainOverviewKeyword{{Keyword: "localization platform", Position: overviewIntPointer(4), Volume: 900, ETV: 120, URL: "https://example.com/localization"}}, keywords)

	pages := normalizeOverviewPages([]dataforseo.RelevantPageItem{{
		"page_address": "https://example.com/localization",
		"metrics":      map[string]any{"organic": map[string]any{"count": float64(12), "etv": float64(340)}},
	}})
	require.Equal(t, []domainOverviewPage{{Page: "https://example.com/localization", KeywordCount: 12, ETV: 340}}, pages)
}

func TestOverviewMarketUsesFallbackMarketsWhenDomainHasNone(t *testing.T) {
	market, err := overviewMarket(linkedDomainRecord{}, "vietnam-vi")
	require.NoError(t, err)
	require.Equal(t, "vietnam-vi", market.ID)

	_, err = overviewMarket(linkedDomainRecord{}, "australia-en")
	require.Error(t, err)
}

func TestTrackedOverviewCountsClassifiesRankDeltas(t *testing.T) {
	pool := &scriptPool{steps: []dbStep{{
		op: opQuery,
		table: [][]any{
			{3, 8},
			{8, 3},
			{5, 5},
			{4, nil},
			{nil, 2},
		},
	}}}
	h := newHandler()
	h.workspace = &workspaceAPI{pool: pool}

	tracked, improved, declined, unchanged, unranked, err := h.trackedOverviewCounts(
		context.Background(),
		"linked-domain",
		researchMarket{LocationCode: 2250, Language: "fr"},
	)
	require.NoError(t, err)
	require.Equal(t, 5, tracked)
	require.Equal(t, 1, improved)
	require.Equal(t, 1, declined)
	require.Equal(t, 2, unchanged)
	require.Equal(t, 1, unranked)
	require.NoError(t, pool.failed)
}

func TestDomainOverviewCacheKeyIncludesMarket(t *testing.T) {
	france := researchMarket{LocationCode: 2250, Language: "fr"}
	us := researchMarket{LocationCode: 2840, Language: "en"}
	first := domainOverviewCacheKey("org", "domain", france)
	require.Equal(t, first, domainOverviewCacheKey("org", "domain", france))
	require.NotEqual(t, first, domainOverviewCacheKey("org", "domain", us))
	require.Contains(t, first, "2250")
	require.Contains(t, first, "fr")
}

func overviewIntPointer(value int) *int { return &value }

func (f fakeResearch) LiveAdvanced(
	_ context.Context,
	_ dataforseo.LiveSerpInput,
) (dataforseo.TaskResponse[[]dataforseo.SerpItem], error) {
	return f.serp, f.serpErr
}

func (f fakeResearch) RankCheck(
	ctx context.Context,
	_ dataforseo.RankCheckSerpInput,
) (dataforseo.TaskResponse[dataforseo.RankCheckResult], error) {
	if f.onRank != nil {
		f.onRank()
	}
	if f.rankDelay > 0 {
		select {
		case <-ctx.Done():
			return dataforseo.TaskResponse[dataforseo.RankCheckResult]{}, ctx.Err()
		case <-time.After(f.rankDelay):
		}
	}
	return f.rank, f.rankErr
}

func TestLegacyDomainResearchProxyRoutesAreNotRegistered(t *testing.T) {
	h := newHandler()
	h.research = fakeResearch{}
	mux := http.NewServeMux()
	registerRoutes(mux, h, mockSessionVerifier{claims: AuthClaims{UserID: "user_123"}})

	for _, path := range []string{
		"/v1/domains/research/keywords",
		"/v1/domains/research/market-visibility",
		"/v1/domains/research/serp",
		"/v1/domains/research/rank-check",
		"/v1/domains/research/rank-check/batch",
		"/v1/domains/gsc/sites",
		"/v1/domains/gsc/performance",
		"/v1/domains/gsc/inspect",
	} {
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, path, bytes.NewBufferString(`{}`))
		req.Header.Set(serverCallTokenHeader, serverCallToken())
		mux.ServeHTTP(rec, req)
		require.Equal(t, http.StatusNotFound, rec.Code, path)
	}
}

func TestRankKeywordsUsesBoundedConcurrency(t *testing.T) {
	var inFlight, maxInFlight atomic.Int32
	h := newHandler()
	h.research = fakeResearch{
		onRank: func() {
			n := inFlight.Add(1)
			defer inFlight.Add(-1)
			for {
				current := maxInFlight.Load()
				if n <= current || maxInFlight.CompareAndSwap(current, n) {
					break
				}
			}
			time.Sleep(40 * time.Millisecond)
		},
		rank: dataforseo.TaskResponse[dataforseo.RankCheckResult]{
			Data: dataforseo.RankCheckResult{Keyword: "seo"},
		},
	}
	keywords := make([]researchRankCheckKeyword, 8)
	for i := range keywords {
		keywords[i] = researchRankCheckKeyword{KeywordID: "kw", Keyword: "seo"}
	}

	results, err := h.rankKeywords(context.Background(), "example.com", researchMarkets["france-fr"], "", keywords)

	require.NoError(t, err)
	require.Len(t, results, len(keywords))
	require.Greater(t, maxInFlight.Load(), int32(1))
	require.LessOrEqual(t, maxInFlight.Load(), int32(rankCheckConcurrency))
}
