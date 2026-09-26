package main

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestUniqueResearchKeywords(t *testing.T) {
	rows := uniqueResearchKeywords([]researchKeywordBody{
		{Keyword: " SEO ", Volume: 1},
		{Keyword: " ", Volume: 9},
		{Keyword: "seo", Volume: 4, Intent: "commercial"},
		{Keyword: "Rank", Volume: 2},
	})
	require.Equal(t, []researchKeywordBody{
		{Keyword: "seo", Volume: 4, Intent: "commercial"},
		{Keyword: "Rank", Volume: 2},
	}, rows)
	require.Empty(t, uniqueResearchKeywords(nil))
}

func TestResearchIntentAndNullables(t *testing.T) {
	require.Equal(t, "commercial", researchIntent("commercial"))
	require.Equal(t, "transactional", researchIntent("transactional"))
	require.Equal(t, "navigational", researchIntent("navigational"))
	require.Equal(t, "informational", researchIntent("informational"))
	require.Equal(t, "informational", researchIntent("other"))

	require.Nil(t, nullableInt(nil))
	value := 3
	require.Equal(t, 3, nullableInt(&value))
	require.Nil(t, nullableString(nil))
	text := "verified"
	require.Equal(t, "verified", nullableString(&text))
	require.Equal(t, "2250:fr:seo tools", serpKey(2250, "fr", "SEO Tools"))
}

func TestCompactCount(t *testing.T) {
	require.Equal(t, "—", compactCount(0))
	require.Equal(t, "—", compactCount(-2))
	require.Equal(t, "12", compactCount(12))
	require.Equal(t, "1k", compactCount(1000))
	require.Equal(t, "1.5k", compactCount(1500))
	require.Equal(t, "2m", compactCount(2_000_000))
	require.Equal(t, "1.5m", compactCount(1_500_000))
}

func TestResearchOverviewRows(t *testing.T) {
	position := 4
	ranks := []map[string]any{
		{"id": "a", "keyword": "seo", "position": nullableInt(&position), "volume": 10, "url": "https://example.com/pricing"},
		{"id": "b", "keyword": "tools", "position": nil, "volume": 3, "url": "https://example.com/pricing?q=1"},
		{"id": "c", "keyword": "blank", "position": nullableInt(&position), "volume": 1, "url": ""},
		{"id": "d", "keyword": "raw", "position": nullableInt(&position), "volume": 1, "url": "not a url"},
	}
	require.Equal(t, []map[string]any{
		{"id": "a", "keyword": "seo", "position": 4, "volume": 10, "traffic": 0},
		{"id": "c", "keyword": "blank", "position": 4, "volume": 1, "traffic": 0},
		{"id": "d", "keyword": "raw", "position": 4, "volume": 1, "traffic": 0},
	}, overviewKeywords(ranks))

	pages := overviewPages(ranks)
	require.Equal(t, []map[string]any{
		{"id": "a", "path": "/pricing", "keywords": 2, "traffic": 0},
		{"id": "d", "path": "not a url", "keywords": 1, "traffic": 0},
	}, pages)
	require.Empty(t, overviewKeywords(nil))
	require.Empty(t, overviewPages(nil))
}

func TestLinkedDomainResearchViews(t *testing.T) {
	score := 82
	method := "dns"
	when := time.Date(2026, 4, 5, 6, 7, 8, 9_000_000, time.FixedZone("AEST", 10*3600))
	domain := linkedDomainRecord{
		ID: "dom", OrganizationID: "org", DomainKey: "example.com", DomainSlug: "example-com",
		SourceURL: "https://example.com/docs", MarketIDs: []string{"france-fr", "missing"},
		Status: "verified", PreferredMethod: &method, VerifiedAt: &when, VerificationToken: "tok",
		AuditScore: &score, CreatedAt: when, UpdatedAt: when,
	}
	view := domain.researchDomain(1500, 2)
	require.Equal(t, "verified", view["status"])
	require.Equal(t, 82, view["score"])
	require.Equal(t, "1.5k", view["keywordCountLabel"])
	locales := view["locales"].([]map[string]any)
	require.Len(t, locales, 1)
	require.Equal(t, "france-fr", locales[0]["id"])

	pending := linkedDomainRecord{ID: "dom", DomainKey: "example.com", SourceURL: "not-a-url", VerificationToken: "tok"}
	fallback := pending.researchDomain(0, 0)
	require.Equal(t, "pending_verification", fallback["status"])
	require.Nil(t, fallback["score"])
	require.Equal(t, "—", fallback["keywordCountLabel"])
	require.Len(t, fallback["locales"].([]map[string]any), len(defaultResearchMarketIDs))

	publicView := domain.public()
	require.Equal(t, []string{"france-fr", "missing"}, publicView["marketIds"])
	require.Equal(t, "dns", publicView["preferredMethod"])
	require.Nil(t, publicView["verifiedMethod"])
	require.Equal(t, when.UTC().Format("2006-01-02T15:04:05.000Z"), publicView["verifiedAt"])
	require.Nil(t, isoTime(nil))
	require.Equal(t, []string{}, stringSlice(nil))

	challenges := pending.challenges()
	require.Equal(t, "tok", challenges["token"])
	require.Equal(t, "not-a-url/.well-known/hyperlocalise-verification.txt", challenges["htmlFile"].(map[string]string)["url"])
	verifiedChallenges := domain.challenges()
	require.Equal(t, "https://example.com/.well-known/hyperlocalise-verification.txt", verifiedChallenges["htmlFile"].(map[string]string)["url"])
	require.Equal(t, "_hyperlocalise-verify.example.com", verifiedChallenges["dnsTxt"].(map[string]string)["host"])
}

func TestResearchMarketPublic(t *testing.T) {
	market := researchMarkets["japan-ja"].public()
	require.Equal(t, "japan-ja", market["id"])
	require.Equal(t, "ja", market["language"])
	require.Equal(t, 2392, market["locationCode"])
}
