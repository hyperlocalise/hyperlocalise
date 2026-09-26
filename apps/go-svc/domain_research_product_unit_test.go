package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/internal/dataforseo"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"
)

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

	domain, err := h.loadLinkedDomain(context.Background(), orgID, linkedID, true)
	require.NoError(t, err)
	require.Equal(t, "verified", domain.Status)

	pool = &scriptPool{steps: []dbStep{{op: opQueryRow, err: pgx.ErrNoRows}}}
	h.workspace.pool = pool
	_, err = h.loadLinkedDomain(context.Background(), orgID, linkedID, false)
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
