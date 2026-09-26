package main

import (
	"net/http"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/hyperlocalise/hyperlocalise/internal/dataforseo"
	"github.com/stretchr/testify/require"
)

func TestValidateResearchKeywordBodies(t *testing.T) {
	valid := []researchKeywordBody{{
		Keyword: "seo tools",
		Volume:  1200,
		KD:      38,
		CPC:     2.4,
		Intent:  "commercial",
	}}
	require.NoError(t, validateResearchKeywordBodies(valid, 100))

	longKeyword := strings.Repeat("a", maxResearchKeywordLength+1)
	cases := []struct {
		name     string
		keywords []researchKeywordBody
		max      int
	}{
		{name: "empty list", keywords: nil, max: 100},
		{name: "too many keywords", keywords: make([]researchKeywordBody, 101), max: 100},
		{name: "negative volume", keywords: []researchKeywordBody{{Keyword: "seo", Volume: -1}}, max: 100},
		{name: "negative kd", keywords: []researchKeywordBody{{Keyword: "seo", KD: -1}}, max: 100},
		{name: "negative cpc", keywords: []researchKeywordBody{{Keyword: "seo", CPC: -1}}, max: 100},
		{name: "keyword too long", keywords: []researchKeywordBody{{Keyword: longKeyword}}, max: 100},
		{name: "invalid intent", keywords: []researchKeywordBody{{Keyword: "seo", Intent: "other"}}, max: 100},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if tc.name == "too many keywords" {
				for i := range tc.keywords {
					tc.keywords[i].Keyword = "kw"
				}
			}
			err := validateResearchKeywordBodies(tc.keywords, tc.max)
			require.Error(t, err)
			var failure *workspaceError
			require.ErrorAs(t, err, &failure)
			require.Equal(t, http.StatusBadRequest, failure.status)
			require.Equal(t, "invalid_domain_research_payload", failure.code)
		})
	}
}

func mustVerifiedLinkedDomain(t *testing.T, scope *testenv.Scope) string {
	t.Helper()
	linkedDomainID := uuid.NewString()
	_, err := scope.Pool.Exec(t.Context(), `
        insert into linked_domains (
            id, organization_id, created_by_user_id, domain_key, domain_slug, source_url, status, verification_token
        ) values ($1, $2, $3, 'example.com', 'example-com', 'https://example.com/', 'verified', 'token')`,
		linkedDomainID, scope.OrganizationID, scope.UserID)
	require.NoError(t, err)
	return linkedDomainID
}

func TestDomainResearchProductLifecycle(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "admin"})
	linkedDomainID := mustVerifiedLinkedDomain(t, scope)
	h := workspaceHandler(scope, "admin", stubWorkspaceFlags{enabled: true})
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
		},
		serp: dataforseo.TaskResponse[[]dataforseo.SerpItem]{
			Data: []dataforseo.SerpItem{{"type": "organic", "domain": "example.com"}},
		},
		rank: func() dataforseo.TaskResponse[dataforseo.RankCheckResult] {
			position := 4
			return dataforseo.TaskResponse[dataforseo.RankCheckResult]{
				Data: dataforseo.RankCheckResult{Keyword: "seo tools", Position: &position, URL: "https://example.com/page"},
			}
		}(),
	}
	base := scope.OrgPath("/domains/" + linkedDomainID + "/research")

	rec := workspaceRequest(t, h, scope, http.MethodGet, base, "")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"catalog"`)

	rec = workspaceRequest(t, h, scope, http.MethodPost, base+"/keywords/expand", `{"seedKeyword":"seo","marketId":"france-fr"}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"ideas"`)

	rec = workspaceRequest(t, h, scope, http.MethodPost, base+"/keywords/save", `{"marketId":"france-fr","seedKeyword":"seo","keywords":[{"keyword":"seo tools","volume":1200,"kd":38,"cpc":2.4,"intent":"commercial"}]}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

	rec = workspaceRequest(t, h, scope, http.MethodPost, base+"/serp", `{"keyword":"seo tools","marketId":"france-fr"}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"results"`)

	rec = workspaceRequest(t, h, scope, http.MethodPost, base+"/ranks", `{"marketId":"france-fr","device":"desktop","keywords":[{"keyword":"seo tools","volume":1200,"kd":38,"cpc":2.4,"intent":"commercial"}]}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"ranks"`)

	rec = workspaceRequest(t, h, scope, http.MethodPost, base+"/ranks/refresh", `{"marketId":"france-fr","device":"desktop"}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

	rec = workspaceRequest(t, h, scope, http.MethodPost, scope.OrgPath("/domains/research/market-visibility"), `{"targetDomain":"example.com","marketId":"france-fr","locationCode":2250,"languageCode":"fr"}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

	pendingID := uuid.NewString()
	_, err := scope.Pool.Exec(t.Context(), `
        insert into linked_domains (
            id, organization_id, created_by_user_id, domain_key, domain_slug, source_url, status, verification_token
        ) values ($1, $2, $3, 'pending.com', 'pending-com', 'https://pending.com/', 'pending', 'token')`,
		pendingID, scope.OrganizationID, scope.UserID)
	require.NoError(t, err)
	rec = workspaceRequest(t, h, scope, http.MethodPost, scope.OrgPath("/domains/"+pendingID+"/research/keywords/expand"), `{"seedKeyword":"seo","marketId":"france-fr"}`)
	require.Equal(t, http.StatusBadRequest, rec.Code)
	require.Contains(t, rec.Body.String(), "linked_domain_not_verified")

	rec = workspaceRequest(t, h, scope, http.MethodGet, scope.OrgPath("/domains/"+uuid.NewString()+"/research"), "")
	require.Equal(t, http.StatusNotFound, rec.Code)
}

func TestDomainResearchExpandRejectsUnknownMarket(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "admin"})
	linkedDomainID := uuid.NewString()
	_, err := scope.Pool.Exec(t.Context(), `
        insert into linked_domains (
            id, organization_id, created_by_user_id, domain_key, domain_slug, source_url, status, verification_token
        ) values ($1, $2, $3, 'example.com', 'example-com', 'https://example.com/', 'verified', 'token')`,
		linkedDomainID, scope.OrganizationID, scope.UserID)
	require.NoError(t, err)
	h := workspaceHandler(scope, "admin", stubWorkspaceFlags{enabled: true})
	h.research = fakeResearch{}
	path := scope.OrgPath("/domains/" + linkedDomainID + "/research/keywords/expand")
	rec := workspaceRequest(t, h, scope, http.MethodPost, path, `{"seedKeyword":"seo","marketId":"unknown"}`)
	require.Equal(t, http.StatusBadRequest, rec.Code)
	require.Contains(t, rec.Body.String(), "market_not_found")
}
