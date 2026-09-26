package main

import (
	"net/http"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
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
