package dataforseo

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestParseKeywordIdeaFromIdeasPayload(t *testing.T) {
	idea, ok := ParseKeywordIdea(KeywordDataItem{
		"keyword": "seo tools",
		"keyword_info": map[string]any{
			"search_volume": float64(1200),
			"cpc":           1.25,
		},
		"keyword_properties": map[string]any{
			"keyword_difficulty": float64(41),
		},
		"search_intent_info": map[string]any{
			"main_intent": "commercial",
		},
	})
	require.True(t, ok)
	require.Equal(t, KeywordIdea{
		Keyword: "seo tools",
		Volume:  1200,
		KD:      41,
		CPC:     1.25,
		Intent:  "commercial",
	}, idea)
}

func TestParseKeywordIdeaFromRelatedKeywordsPayload(t *testing.T) {
	idea, ok := ParseKeywordIdea(KeywordDataItem{
		"related_keyword": "keyword research",
		"keyword_data": map[string]any{
			"keyword": "keyword research",
			"keyword_info": map[string]any{
				"search_volume": float64(8100),
				"cpc":           4.2,
			},
		},
	})
	require.True(t, ok)
	require.Equal(t, "keyword research", idea.Keyword)
	require.Equal(t, 8100, idea.Volume)
	require.Equal(t, 4.2, idea.CPC)
	require.Equal(t, "informational", idea.Intent)
}

func TestParseKeywordIdeasDedupesAndSkipsEmpty(t *testing.T) {
	ideas := ParseKeywordIdeas([]KeywordDataItem{
		{"keyword": "SEO Tools", "search_volume": float64(10)},
		{"keyword": "seo tools", "search_volume": float64(99)},
		{"keyword": "   "},
	})
	require.Equal(t, []KeywordIdea{{
		Keyword: "SEO Tools",
		Volume:  10,
		Intent:  "informational",
	}}, ideas)
}
