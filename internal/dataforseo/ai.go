package dataforseo

import "context"

const (
	pathLlmMentionsSearch                 = "/v3/ai_optimization/llm_mentions/search/live"
	pathLlmMentionsAggregatedMetrics      = "/v3/ai_optimization/llm_mentions/aggregated_metrics/live"
	pathLlmMentionsTopPages               = "/v3/ai_optimization/llm_mentions/top_pages/live"
	pathLlmMentionsCrossAggregatedMetrics   = "/v3/ai_optimization/llm_mentions/cross_aggregated_metrics/live"
	pathChatGPTLlmResponsesLive           = "/v3/ai_optimization/chat_gpt/llm_responses/live"
	pathClaudeLlmResponsesLive            = "/v3/ai_optimization/claude/llm_responses/live"
	pathGeminiLlmResponsesLive            = "/v3/ai_optimization/gemini/llm_responses/live"
	pathPerplexityLlmResponsesLive        = "/v3/ai_optimization/perplexity/llm_responses/live"
)

// LlmMentionsSearchInput searches LLM mention rows for a brand lookup.
type LlmMentionsSearchInput struct {
	Target   LlmTarget
	Platform LlmPlatform
	Market   MarketScope
	Limit    int
}

// LlmAggregatedMetricsInput fetches total mention metrics for brand lookup.
type LlmAggregatedMetricsInput struct {
	Target            LlmTarget
	Platform          LlmPlatform
	Market            MarketScope
	InternalListLimit int
}

// LlmTopPagesInput fetches cited pages for brand lookup.
type LlmTopPagesInput struct {
	Target         LlmTarget
	Platform       LlmPlatform
	Market         MarketScope
	ItemsListLimit int
}

// LlmCrossAggregatedMetricsGroup is one competitor group in share-of-voice.
type LlmCrossAggregatedMetricsGroup struct {
	Key    string
	Target LlmTarget
}

// LlmCrossAggregatedMetricsInput compares mention share across groups.
type LlmCrossAggregatedMetricsInput struct {
	Groups            []LlmCrossAggregatedMetricsGroup
	Platform          LlmPlatform
	Market            MarketScope
	InternalListLimit int
}

// LlmResponseInput runs one prompt through one LLM provider.
type LlmResponseInput struct {
	UserPrompt            string
	Model                 LlmResponseModel
	ModelName             string
	WebSearch             bool
	MaxOutputTokens       int
	WebSearchCountryCode  string
}

func (a *AI) MentionsSearch(
	ctx context.Context,
	input LlmMentionsSearchInput,
) (TaskResponse[[]LlmMentionItem], error) {
	if err := validateLlmTarget(input.Target); err != nil {
		return TaskResponse[[]LlmMentionItem]{}, err
	}

	task, err := a.client.client.post(ctx, pathLlmMentionsSearch, []map[string]any{{
		"target":          []LlmTarget{input.Target},
		"platform":        input.Platform,
		"location_code":   input.Market.LocationCode,
		"language_code":   input.Market.LanguageCode,
		"limit":           clampLimit(input.Limit, 1, 1000),
	}}, postOptions{})
	if err != nil {
		return TaskResponse[[]LlmMentionItem]{}, err
	}
	return taskResponseFromItems[[]LlmMentionItem](task)
}

func (a *AI) AggregatedMetrics(
	ctx context.Context,
	input LlmAggregatedMetricsInput,
) (TaskResponse[LlmAggregatedTotal], error) {
	if err := validateLlmTarget(input.Target); err != nil {
		return TaskResponse[LlmAggregatedTotal]{}, err
	}

	task, err := a.client.client.post(ctx, pathLlmMentionsAggregatedMetrics, []map[string]any{{
		"target":              []LlmTarget{input.Target},
		"platform":            input.Platform,
		"location_code":       input.Market.LocationCode,
		"language_code":       input.Market.LanguageCode,
		"internal_list_limit": clampLimit(input.InternalListLimit, 1, 20),
	}}, postOptions{})
	if err != nil {
		return TaskResponse[LlmAggregatedTotal]{}, err
	}
	return taskResponseFromTotal[LlmAggregatedTotal](task)
}

func (a *AI) TopPages(
	ctx context.Context,
	input LlmTopPagesInput,
) (TaskResponse[[]LlmTopPagesItem], error) {
	if err := validateLlmTarget(input.Target); err != nil {
		return TaskResponse[[]LlmTopPagesItem]{}, err
	}

	task, err := a.client.client.post(ctx, pathLlmMentionsTopPages, []map[string]any{{
		"target":              []LlmTarget{input.Target},
		"platform":            input.Platform,
		"location_code":       input.Market.LocationCode,
		"language_code":       input.Market.LanguageCode,
		"links_scope":         "sources",
		"items_list_limit":    clampLimit(input.ItemsListLimit, 1, 10),
		"internal_list_limit": 5,
	}}, postOptions{})
	if err != nil {
		return TaskResponse[[]LlmTopPagesItem]{}, err
	}
	return taskResponseFromItems[[]LlmTopPagesItem](task)
}

func (a *AI) CrossAggregatedMetrics(
	ctx context.Context,
	input LlmCrossAggregatedMetricsInput,
) (TaskResponse[[]LlmCrossAggregatedItem], error) {
	if len(input.Groups) < 2 || len(input.Groups) > 10 {
		return TaskResponse[[]LlmCrossAggregatedItem]{}, newError(
			ErrorCodeValidation,
			"cross aggregated metrics requires 2 to 10 target groups",
			pathLlmMentionsCrossAggregatedMetrics,
			0,
		)
	}

	targets := make([]map[string]any, 0, len(input.Groups))
	for _, group := range input.Groups {
		if err := validateLlmTarget(group.Target); err != nil {
			return TaskResponse[[]LlmCrossAggregatedItem]{}, err
		}
		targets = append(targets, map[string]any{
			"aggregation_key": group.Key,
			"target":          []LlmTarget{group.Target},
		})
	}

	task, err := a.client.client.post(ctx, pathLlmMentionsCrossAggregatedMetrics, []map[string]any{{
		"targets":             targets,
		"platform":            input.Platform,
		"location_code":       input.Market.LocationCode,
		"language_code":       input.Market.LanguageCode,
		"internal_list_limit": clampLimit(input.InternalListLimit, 1, 10),
	}}, postOptions{})
	if err != nil {
		return TaskResponse[[]LlmCrossAggregatedItem]{}, err
	}
	return taskResponseFromItems[[]LlmCrossAggregatedItem](task)
}

func (a *AI) LlmResponse(
	ctx context.Context,
	input LlmResponseInput,
) (TaskResponse[LlmResponseResult], error) {
	if err := validateLLMModelName(input.Model, input.ModelName); err != nil {
		return TaskResponse[LlmResponseResult]{}, err
	}
	if normalizeKeyword(input.UserPrompt) == "" {
		return TaskResponse[LlmResponseResult]{}, newError(
			ErrorCodeValidation,
			"userPrompt is required",
			llmResponsePath(input.Model),
			0,
		)
	}

	payload := map[string]any{
		"user_prompt":       input.UserPrompt,
		"model_name":        input.ModelName,
		"web_search":        input.WebSearch,
		"max_output_tokens": clampLimit(input.MaxOutputTokens, 256, 4096),
	}
	if input.Model != LlmResponseModelGemini && input.WebSearch && input.WebSearchCountryCode != "" {
		payload["web_search_country_iso_code"] = input.WebSearchCountryCode
	}

	task, err := a.client.client.post(ctx, llmResponsePath(input.Model), []map[string]any{payload}, postOptions{})
	if err != nil {
		return TaskResponse[LlmResponseResult]{}, err
	}
	return taskResponseFromFirstResult[LlmResponseResult](task)
}

func llmResponsePath(model LlmResponseModel) string {
	switch model {
	case LlmResponseModelChatGPT:
		return pathChatGPTLlmResponsesLive
	case LlmResponseModelClaude:
		return pathClaudeLlmResponsesLive
	case LlmResponseModelGemini:
		return pathGeminiLlmResponsesLive
	case LlmResponseModelPerplexity:
		return pathPerplexityLlmResponsesLive
	default:
		return string(model)
	}
}

func validateLlmTarget(target LlmTarget) error {
	if normalizeKeyword(target.Domain) == "" && normalizeKeyword(target.Keyword) == "" {
		return newError(ErrorCodeValidation, "LLM target domain or keyword is required", "", 0)
	}
	return nil
}
