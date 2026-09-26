package main

import (
	"net/http"
	"strings"
	"testing"
	"time"

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
	const linkedDomainID = "55555555-5555-4555-8555-555555555555"
	db := newDictionaryTestDB(t,
		dictionaryAuthStep(),
		dictionaryRowStep("workos_organization_id", "org_live"),
		dictionaryRowStep("from linked_domains d",
			linkedDomainID, testDictionaryOrgID, "example.com", "example-com", "https://example.com/", []string{}, "verified",
			nil, nil, nil, nil, nil, time.Now(), time.Now(), "token", nil,
		),
	)
	h := workspaceHandler(db, "admin", stubWorkspaceFlags{enabled: true})
	h.research = fakeResearch{}
	path := "/v1/orgs/acme/domains/" + linkedDomainID + "/research/keywords/expand"
	rec := workspaceRequest(t, h, http.MethodPost, path, `{"seedKeyword":"seo","marketId":"unknown"}`)
	require.Equal(t, http.StatusBadRequest, rec.Code)
	require.Contains(t, rec.Body.String(), "market_not_found")
}
