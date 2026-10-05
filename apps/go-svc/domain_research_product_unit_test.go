package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	gosvcvalkey "github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/valkey"
	"github.com/hyperlocalise/hyperlocalise/internal/dataforseo"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"
)

type memoryResearchCache struct {
	mu     sync.Mutex
	items  map[string]string
	counts map[string]int64
}

func newMemoryResearchCache() *memoryResearchCache {
	return &memoryResearchCache{items: map[string]string{}, counts: map[string]int64{}}
}

func (c *memoryResearchCache) Get(_ context.Context, key string) (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	value, ok := c.items[key]
	if !ok {
		return "", gosvcvalkey.ErrNil
	}
	return value, nil
}

func (c *memoryResearchCache) Set(_ context.Context, key, value string, _ time.Duration) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.items[key] = value
	return nil
}

func (c *memoryResearchCache) IncrByWithTTL(_ context.Context, key string, units int, _ time.Duration) (int64, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.counts[key] += int64(units)
	return c.counts[key], nil
}

func TestConsumeDomainResearchQuota(t *testing.T) {
	h := newHandler()
	err := h.consumeDomainResearchQuota(context.Background(), "org", "keyword-expansion", 1, DOMAIN_RESEARCH_KEYWORD_QUOTA)
	var failure *workspaceError
	require.ErrorAs(t, err, &failure)
	require.Equal(t, http.StatusServiceUnavailable, failure.status)
	require.Equal(t, "research_quota_unavailable", failure.code)

	h.researchCache = newMemoryResearchCache()
	require.NoError(t, h.consumeDomainResearchQuota(context.Background(), "org", "keyword-expansion", 2, 2))
	err = h.consumeDomainResearchQuota(context.Background(), "org", "keyword-expansion", 1, 2)
	require.ErrorAs(t, err, &failure)
	require.Equal(t, http.StatusTooManyRequests, failure.status)
	require.Equal(t, "research_quota_exceeded", failure.code)
}

func verifiedLinkedDomainRow(id, org string) []any {
	now := time.Now().UTC()
	return []any{
		id, org, "example.com", "example-com", "https://example.com/",
		[]string{"france-fr"},
		"verified",
		nil, nil, &now, nil, nil, now, now, "token", nil,
	}
}

func TestLoadLinkedDomainAndCatalog(t *testing.T) {
	linkedID := uuid.NewString()
	orgID := uuid.NewString()
	pool := &scriptPool{steps: []dbStep{
		{op: opQueryRow, scan: verifiedLinkedDomainRow(linkedID, orgID)},
		{op: opQuery, table: [][]any{}},
		{op: opQuery, table: [][]any{}},
		{op: opQuery, table: [][]any{}},
	}}
	h := newHandler()
	h.workspace = &workspaceAPI{pool: pool}

	domain, err := h.loadLinkedDomain(context.Background(), workspaceActor{organizationID: orgID, role: "admin"}, linkedID, true)
	require.NoError(t, err)
	require.Equal(t, "verified", domain.Status)

	pool = &scriptPool{steps: []dbStep{{op: opQueryRow, err: pgx.ErrNoRows}}}
	h.workspace.pool = pool
	_, err = h.loadLinkedDomain(context.Background(), workspaceActor{organizationID: orgID, role: "admin"}, linkedID, false)
	require.EqualError(t, err, "linked_domain_not_found")

	pool = &scriptPool{steps: []dbStep{
		{op: opQueryRow, scan: verifiedLinkedDomainRow(linkedID, orgID)},
		{op: opQuery, table: [][]any{}},
		{op: opQuery, table: [][]any{}},
		{op: opQuery, table: [][]any{}},
	}}
	h.workspace.pool = pool
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.SetPathValue("linkedDomainId", linkedID)
	actor := workspaceActor{organizationID: orgID}
	body, status, err := h.getDomainResearch(req, actor)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, status)
	require.Contains(t, body.(map[string]any), "catalog")
}

func TestExpandDomainKeywords(t *testing.T) {
	linkedID := uuid.NewString()
	orgID := uuid.NewString()
	pool := &scriptPool{steps: []dbStep{{op: opQueryRow, scan: verifiedLinkedDomainRow(linkedID, orgID)}}}
	h := newHandler()
	h.workspace = &workspaceAPI{pool: pool}
	h.researchCache = newMemoryResearchCache()
	h.research = fakeResearch{
		ideas: dataforseo.TaskResponse[[]dataforseo.KeywordDataItem]{
			Data: []dataforseo.KeywordDataItem{{
				"keyword": "seo tools",
				"keyword_info": map[string]any{
					"search_volume": float64(100),
				},
			}},
		},
	}
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"seedKeyword":"seo","marketId":"france-fr"}`))
	req.SetPathValue("linkedDomainId", linkedID)
	actor := workspaceActor{organizationID: orgID}
	body, status, err := h.expandDomainKeywords(req, actor)
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, status)
	require.NotEmpty(t, body.(map[string]any)["ideas"])
}

func TestListResearchSerpDevicePreferenceIsStable(t *testing.T) {
	desktop := []byte(`[{"title":"Desktop","url":"https://example.com"}]`)
	mobile := []byte(`[{"title":"Mobile","url":"https://m.example.com"}]`)
	table := [][]any{
		{2250, "fr", "seo tools", "mobile", mobile},
		{2250, "fr", "seo tools", "desktop", desktop},
	}
	keywords := []map[string]any{{
		"id": "kw", "keyword": "seo tools", "marketId": "france-fr",
	}}
	orders := [][]map[string]any{
		{
			{"keyword": "seo tools", "marketId": "france-fr", "device": "mobile"},
			{"keyword": "seo tools", "marketId": "france-fr", "device": "desktop"},
		},
		{
			{"keyword": "seo tools", "marketId": "france-fr", "device": "desktop"},
			{"keyword": "seo tools", "marketId": "france-fr", "device": "mobile"},
		},
	}
	h := newHandler()
	for _, ranks := range orders {
		h.workspace = &workspaceAPI{pool: &scriptPool{steps: []dbStep{{op: opQuery, table: table}}}}
		serp, err := h.listResearchSerp(context.Background(), "domain", keywords, ranks)
		require.NoError(t, err)
		results := serp["kw"].([]dataforseo.OrganicSerpResult)
		require.Equal(t, "Desktop", results[0].Title)
	}

	h.workspace = &workspaceAPI{pool: &scriptPool{steps: []dbStep{{op: opQuery, table: table}}}}
	serp, err := h.listResearchSerp(context.Background(), "domain", keywords, []map[string]any{
		{"keyword": "seo tools", "marketId": "france-fr", "device": "mobile"},
	})
	require.NoError(t, err)
	results := serp["kw"].([]dataforseo.OrganicSerpResult)
	require.Equal(t, "Mobile", results[0].Title)
}

func TestDomainResearchProviderHelpers(t *testing.T) {
	h := newHandler()
	h.research = fakeResearch{
		ideas: dataforseo.TaskResponse[[]dataforseo.KeywordDataItem]{
			Data: []dataforseo.KeywordDataItem{{"keyword": "seo tools"}},
		},
	}
	market, ok := researchMarketByID("france-fr")
	require.True(t, ok)
	ideas, err := h.keywordIdeas(context.Background(), "seo", market)
	require.NoError(t, err)
	require.Len(t, ideas, 1)

	h.research = nil
	_, err = h.keywordIdeas(context.Background(), "seo", market)
	require.EqualError(t, err, "provider_not_configured")

	h.research = fakeResearch{ideasErr: &dataforseo.Error{Code: dataforseo.ErrorCodeRateLimited, Message: "slow"}}
	_, err = h.keywordIdeas(context.Background(), "seo", market)
	var failure *workspaceError
	require.ErrorAs(t, err, &failure)
	require.Equal(t, "provider_rate_limited", failure.code)
}
