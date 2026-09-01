package dataforseo

import "fmt"

// MarketScope identifies keyword and domain research targets.
type MarketScope struct {
	LocationCode int
	LanguageCode string
}

// LlmPlatform is a supported LLM mentions platform.
type LlmPlatform string

const (
	LlmPlatformChatGPT LlmPlatform = "chat_gpt"
	LlmPlatformGoogle  LlmPlatform = "google"
)

// LlmResponseModel identifies a DataForSEO LLM response provider.
type LlmResponseModel string

const (
	LlmResponseModelChatGPT    LlmResponseModel = "chat_gpt"
	LlmResponseModelClaude     LlmResponseModel = "claude"
	LlmResponseModelGemini     LlmResponseModel = "gemini"
	LlmResponseModelPerplexity LlmResponseModel = "perplexity"
)

// ChatGPTLocationCode and ChatGPTLanguageCode are required for ChatGPT mentions.
const (
	ChatGPTLocationCode = 2840
	ChatGPTLanguageCode = "en"
)

// LlmDomainTarget scopes LLM mentions to a domain.
type LlmDomainTarget struct {
	Domain             string `json:"domain"`
	IncludeSubdomains  *bool  `json:"include_subdomains,omitempty"`
	SearchFilter       string `json:"search_filter,omitempty"`
	SearchScope        []string `json:"search_scope,omitempty"`
}

// LlmKeywordTarget scopes LLM mentions to a keyword.
type LlmKeywordTarget struct {
	Keyword      string   `json:"keyword"`
	SearchFilter string   `json:"search_filter,omitempty"`
	SearchScope  []string `json:"search_scope,omitempty"`
	MatchType    string   `json:"match_type,omitempty"`
}

// LlmTarget is the union accepted by DataForSEO LLM mentions endpoints.
type LlmTarget struct {
	Domain            string   `json:"domain,omitempty"`
	Keyword           string   `json:"keyword,omitempty"`
	IncludeSubdomains *bool    `json:"include_subdomains,omitempty"`
	SearchFilter      string   `json:"search_filter,omitempty"`
	SearchScope       []string `json:"search_scope,omitempty"`
	MatchType         string   `json:"match_type,omitempty"`
}

// BuildLlmDomainTarget returns a domain target for LLM mentions calls.
func BuildLlmDomainTarget(domain string, includeSubdomains bool) LlmTarget {
	return LlmTarget{
		Domain:            domain,
		IncludeSubdomains: boolPtr(includeSubdomains),
		SearchFilter:      "include",
		SearchScope:       []string{"any"},
	}
}

// BuildLlmKeywordTarget returns a keyword target for LLM mentions calls.
func BuildLlmKeywordTarget(keyword string) LlmTarget {
	return LlmTarget{
		Keyword:      keyword,
		SearchFilter: "include",
		SearchScope:  []string{"any", "brand_entities"},
		MatchType:    "word_match",
	}
}

func boolPtr(value bool) *bool {
	return &value
}

// KeywordDataItem is a keyword metric row from Labs endpoints.
type KeywordDataItem map[string]any

// RelatedKeywordPage is a Labs related-keywords response page.
type RelatedKeywordPage struct {
	Items []KeywordDataItem `json:"items"`
}

// DomainRankOverviewItem is a domain overview metrics row.
type DomainRankOverviewItem map[string]any

// DomainRankedKeywordItem is a ranked keyword row for a domain.
type DomainRankedKeywordItem map[string]any

// RankedKeywordsPage is a paginated ranked-keywords response.
type RankedKeywordsPage struct {
	Items      []DomainRankedKeywordItem
	TotalCount *int
}

// RelevantPageItem is a top organic page row for a domain.
type RelevantPageItem map[string]any

// RelevantPagesPage is a paginated relevant-pages response.
type RelevantPagesPage struct {
	Items      []RelevantPageItem
	TotalCount *int
}

// KeywordOverviewItem is a keyword metrics row from keyword overview.
type KeywordOverviewItem map[string]any

// SerpItem is a live organic SERP row.
type SerpItem map[string]any

// RankCheckResult is the normalized output of a rank check.
type RankCheckResult struct {
	KeywordID    string   `json:"keywordId"`
	Keyword      string   `json:"keyword"`
	Position     *int     `json:"position"`
	URL          string   `json:"url,omitempty"`
	SerpFeatures []string `json:"serpFeatures"`
}

// RankCheckTaskInput identifies one queued rank-check task.
type RankCheckTaskInput struct {
	Keyword   string `json:"keyword"`
	KeywordID string `json:"keywordId"`
	Device    string `json:"device"`
}

// PostedRankCheckTask is a queued rank-check task accepted by DataForSEO.
type PostedRankCheckTask struct {
	RankCheckTaskInput
	TaskID string `json:"taskId"`
}

// RankCheckTaskOutcome is the collection result for a queued task.
type RankCheckTaskOutcome struct {
	Status  string           `json:"status"`
	Message string           `json:"message,omitempty"`
	Result  *RankCheckResult `json:"result,omitempty"`
}

// LlmMentionItem is a brand lookup mention row.
type LlmMentionItem map[string]any

// LlmAggregatedTotal is the total block from aggregated metrics.
type LlmAggregatedTotal map[string]any

// LlmTopPagesItem is a cited page row from brand lookup.
type LlmTopPagesItem map[string]any

// LlmCrossAggregatedItem is one competitor group in share-of-voice analysis.
type LlmCrossAggregatedItem map[string]any

// LlmResponseResult is one model response from prompt explorer.
type LlmResponseResult map[string]any

// Accepted model names per provider slug. DataForSEO bills failed model_name
// validation tasks, so the client rejects unknown names before dispatch.
var acceptedLLMModelNames = map[LlmResponseModel]map[string]struct{}{
	LlmResponseModelChatGPT: {
		"gpt-5": {},
	},
	LlmResponseModelClaude: {
		"claude-sonnet-4-5": {},
		"claude-sonnet-4-6": {},
	},
	LlmResponseModelGemini: {
		"gemini-2.5-pro": {},
	},
	LlmResponseModelPerplexity: {
		"sonar-reasoning-pro": {},
		"sonar-pro":           {},
		"sonar":               {},
	},
}

func validateLLMModelName(model LlmResponseModel, modelName string) error {
	allowed, ok := acceptedLLMModelNames[model]
	if !ok {
		return newError(ErrorCodeValidation, "unsupported LLM response model slug", string(model), 0)
	}
	if _, ok := allowed[modelName]; !ok {
		return newError(
			ErrorCodeValidation,
			fmt.Sprintf("unsupported DataForSEO model_name %q for %s", modelName, model),
			string(model),
			0,
		)
	}
	return nil
}
