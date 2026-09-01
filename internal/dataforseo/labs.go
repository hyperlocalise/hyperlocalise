package dataforseo

import "context"

const (
	pathRelatedKeywords   = "/v3/dataforseo_labs/google/related_keywords/live"
	pathKeywordSuggestions = "/v3/dataforseo_labs/google/keyword_suggestions/live"
	pathKeywordIdeas      = "/v3/dataforseo_labs/google/keyword_ideas/live"
	pathDomainRankOverview = "/v3/dataforseo_labs/google/domain_rank_overview/live"
	pathRankedKeywords    = "/v3/dataforseo_labs/google/ranked_keywords/live"
	pathRelevantPages     = "/v3/dataforseo_labs/google/relevant_pages/live"
	pathKeywordOverview   = "/v3/dataforseo_labs/google/keyword_overview/live"
)

// RelatedKeywordsInput expands a seed keyword into related terms.
type RelatedKeywordsInput struct {
	Keyword                 string
	Market                  MarketScope
	Limit                   int
	Depth                   int
	IncludeClickstreamData  bool
}

// KeywordSuggestionsInput expands a seed keyword into suggestions.
type KeywordSuggestionsInput struct {
	Keyword                string
	Market                 MarketScope
	Limit                  int
	IncludeClickstreamData bool
}

// KeywordIdeasInput expands a seed keyword into ideas.
type KeywordIdeasInput struct {
	Keyword                string
	Market                 MarketScope
	Limit                  int
	IncludeClickstreamData bool
}

// DomainRankOverviewInput fetches organic footprint metrics for a domain.
type DomainRankOverviewInput struct {
	Target string
	Market MarketScope
}

// RankedKeywordsInput lists keywords a domain ranks for.
type RankedKeywordsInput struct {
	Target    string
	Market    MarketScope
	Limit     int
	Offset    int
	OrderBy   []string
	Filters   []any
	ItemTypes []string
}

// RelevantPagesInput lists top organic pages for a domain.
type RelevantPagesInput struct {
	Target  string
	Market  MarketScope
	Limit   int
	Offset  int
	OrderBy []string
	Filters []any
}

// KeywordOverviewInput hydrates metrics for known keywords.
type KeywordOverviewInput struct {
	Keywords               []string
	Market                 MarketScope
	IncludeClickstreamData bool
}

func (l *Labs) RelatedKeywords(
	ctx context.Context,
	input RelatedKeywordsInput,
) (TaskResponse[[]KeywordDataItem], error) {
	keyword := normalizeKeyword(input.Keyword)
	if keyword == "" {
		return TaskResponse[[]KeywordDataItem]{}, newError(
			ErrorCodeValidation,
			"keyword is required",
			pathRelatedKeywords,
			0,
		)
	}

	task, err := l.client.post(ctx, pathRelatedKeywords, []map[string]any{{
		"keyword":                  keyword,
		"location_code":            input.Market.LocationCode,
		"language_code":            input.Market.LanguageCode,
		"limit":                    input.Limit,
		"depth":                    defaultDepth(input.Depth),
		"include_clickstream_data": input.IncludeClickstreamData,
		"include_serp_info":        false,
	}}, postOptions{})
	if err != nil {
		return TaskResponse[[]KeywordDataItem]{}, err
	}
	return taskResponseFromItems[[]KeywordDataItem](task)
}

func (l *Labs) KeywordSuggestions(
	ctx context.Context,
	input KeywordSuggestionsInput,
) (TaskResponse[[]KeywordDataItem], error) {
	keyword := normalizeKeyword(input.Keyword)
	if keyword == "" {
		return TaskResponse[[]KeywordDataItem]{}, newError(
			ErrorCodeValidation,
			"keyword is required",
			pathKeywordSuggestions,
			0,
		)
	}

	task, err := l.client.post(ctx, pathKeywordSuggestions, []map[string]any{{
		"keyword":                  keyword,
		"location_code":            input.Market.LocationCode,
		"language_code":            input.Market.LanguageCode,
		"limit":                    input.Limit,
		"include_clickstream_data": input.IncludeClickstreamData,
		"include_serp_info":        false,
		"include_seed_keyword":     true,
		"ignore_synonyms":          false,
		"exact_match":              false,
	}}, postOptions{})
	if err != nil {
		return TaskResponse[[]KeywordDataItem]{}, err
	}
	return taskResponseFromItems[[]KeywordDataItem](task)
}

func (l *Labs) KeywordIdeas(
	ctx context.Context,
	input KeywordIdeasInput,
) (TaskResponse[[]KeywordDataItem], error) {
	keyword := normalizeKeyword(input.Keyword)
	if keyword == "" {
		return TaskResponse[[]KeywordDataItem]{}, newError(
			ErrorCodeValidation,
			"keyword is required",
			pathKeywordIdeas,
			0,
		)
	}

	task, err := l.client.post(ctx, pathKeywordIdeas, []map[string]any{{
		"keywords":                 []string{keyword},
		"location_code":            input.Market.LocationCode,
		"language_code":            input.Market.LanguageCode,
		"limit":                    input.Limit,
		"include_clickstream_data": input.IncludeClickstreamData,
		"include_serp_info":        false,
		"ignore_synonyms":          false,
		"closely_variants":         false,
	}}, postOptions{})
	if err != nil {
		return TaskResponse[[]KeywordDataItem]{}, err
	}
	return taskResponseFromItems[[]KeywordDataItem](task)
}

func (l *Labs) DomainRankOverview(
	ctx context.Context,
	input DomainRankOverviewInput,
) (TaskResponse[[]DomainRankOverviewItem], error) {
	target := normalizeKeyword(input.Target)
	if target == "" {
		return TaskResponse[[]DomainRankOverviewItem]{}, newError(
			ErrorCodeValidation,
			"target is required",
			pathDomainRankOverview,
			0,
		)
	}

	task, err := l.client.post(ctx, pathDomainRankOverview, []map[string]any{{
		"target":         target,
		"location_code":  input.Market.LocationCode,
		"language_code":  input.Market.LanguageCode,
		"limit":          1,
	}}, postOptions{})
	if err != nil {
		return TaskResponse[[]DomainRankOverviewItem]{}, err
	}
	return taskResponseFromItems[[]DomainRankOverviewItem](task)
}

func (l *Labs) RankedKeywords(
	ctx context.Context,
	input RankedKeywordsInput,
) (TaskResponse[RankedKeywordsPage], error) {
	target := normalizeKeyword(input.Target)
	if target == "" {
		return TaskResponse[RankedKeywordsPage]{}, newError(
			ErrorCodeValidation,
			"target is required",
			pathRankedKeywords,
			0,
		)
	}

	task, err := l.client.post(ctx, pathRankedKeywords, []map[string]any{{
		"target":        target,
		"location_code": input.Market.LocationCode,
		"language_code": input.Market.LanguageCode,
		"limit":         input.Limit,
		"offset":        input.Offset,
		"order_by":      input.OrderBy,
		"filters":       input.Filters,
		"item_types":    input.ItemTypes,
	}}, postOptions{})
	if err != nil {
		return TaskResponse[RankedKeywordsPage]{}, err
	}

	billing, err := buildTaskBilling(task)
	if err != nil {
		return TaskResponse[RankedKeywordsPage]{}, err
	}
	items, err := decodeItems[[]DomainRankedKeywordItem](firstResultItems(task))
	if err != nil {
		return TaskResponse[RankedKeywordsPage]{}, err
	}
	return TaskResponse[RankedKeywordsPage]{
		Data: RankedKeywordsPage{
			Items:      items,
			TotalCount: firstResultTotalCount(task),
		},
		Billing: billing,
	}, nil
}

func (l *Labs) RelevantPages(
	ctx context.Context,
	input RelevantPagesInput,
) (TaskResponse[RelevantPagesPage], error) {
	target := normalizeKeyword(input.Target)
	if target == "" {
		return TaskResponse[RelevantPagesPage]{}, newError(
			ErrorCodeValidation,
			"target is required",
			pathRelevantPages,
			0,
		)
	}

	task, err := l.client.post(ctx, pathRelevantPages, []map[string]any{{
		"target":        target,
		"location_code": input.Market.LocationCode,
		"language_code": input.Market.LanguageCode,
		"limit":         input.Limit,
		"offset":        input.Offset,
		"order_by":      input.OrderBy,
		"filters":       input.Filters,
	}}, postOptions{})
	if err != nil {
		return TaskResponse[RelevantPagesPage]{}, err
	}

	billing, err := buildTaskBilling(task)
	if err != nil {
		return TaskResponse[RelevantPagesPage]{}, err
	}
	items, err := decodeItems[[]RelevantPageItem](firstResultItems(task))
	if err != nil {
		return TaskResponse[RelevantPagesPage]{}, err
	}
	return TaskResponse[RelevantPagesPage]{
		Data: RelevantPagesPage{
			Items:      items,
			TotalCount: firstResultTotalCount(task),
		},
		Billing: billing,
	}, nil
}

func (l *Labs) KeywordOverview(
	ctx context.Context,
	input KeywordOverviewInput,
) (TaskResponse[[]KeywordOverviewItem], error) {
	if len(input.Keywords) == 0 {
		return TaskResponse[[]KeywordOverviewItem]{}, newError(
			ErrorCodeValidation,
			"at least one keyword is required",
			pathKeywordOverview,
			0,
		)
	}

	task, err := l.client.post(ctx, pathKeywordOverview, []map[string]any{{
		"keywords":                 input.Keywords,
		"location_code":            input.Market.LocationCode,
		"language_code":            input.Market.LanguageCode,
		"include_clickstream_data": input.IncludeClickstreamData,
	}}, postOptions{})
	if err != nil {
		return TaskResponse[[]KeywordOverviewItem]{}, err
	}
	return taskResponseFromItems[[]KeywordOverviewItem](task)
}

func defaultDepth(depth int) int {
	if depth <= 0 {
		return 3
	}
	return depth
}
