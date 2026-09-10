package dataforseo

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestParseOrganicSerpResultsMarksOwnDomain(t *testing.T) {
	results := ParseOrganicSerpResults([]SerpItem{
		{
			"type":        "paid",
			"rank_group":  float64(1),
			"url":         "https://ads.example.com",
			"title":       "Ad",
			"description": "Paid",
			"domain":      "ads.example.com",
		},
		{
			"type":        "organic",
			"rank_group":  float64(1),
			"url":         "https://fr.wikipedia.org/wiki/SEO",
			"title":       "SEO",
			"description": "Wikipedia",
			"domain":      "fr.wikipedia.org",
		},
		{
			"type":        "organic",
			"rank_group":  float64(4),
			"url":         "https://www.hyperlocalise.com/fr",
			"title":       "Hyperlocalise",
			"description": "Own result",
			"domain":      "www.hyperlocalise.com",
		},
	}, "hyperlocalise.com")

	require.Len(t, results, 2)
	require.Equal(t, 1, results[0].Position)
	require.False(t, results[0].IsOwn)
	require.Equal(t, OrganicSerpResult{
		Position: 4,
		Title:    "Hyperlocalise",
		URL:      "https://www.hyperlocalise.com/fr",
		Snippet:  "Own result",
		Domain:   "www.hyperlocalise.com",
		IsOwn:    true,
	}, results[1])
}
