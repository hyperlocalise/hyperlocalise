package exa

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
)

const (
	defaultMarketResults = 10
	maxMarketTopicRunes  = 400
)

// MarketContextRequest asks Exa for a live localisation brief in one market.
type MarketContextRequest struct {
	// Locale is a BCP 47 tag such as ja-JP. Used in the query even when it
	// has no country subtag.
	Locale string
	// Country is an ISO 3166-1 alpha-2 code. When empty, CountryFromLocale
	// is used. Coordinates are not set; country localises results.
	Country string
	// Topic is the brand, product, or category being adapted. When empty,
	// the search still asks for general consumer-marketing context.
	Topic string
	// UserIdentifier is an opaque end-user id for Exa usage attribution.
	// Must not contain personal information.
	UserIdentifier string
}

// MarketContext is the synthesised localisation brief for one target market.
type MarketContext struct {
	RequestID          string       `json:"requestId,omitempty"`
	Locale             string       `json:"locale,omitempty"`
	Country            string       `json:"country,omitempty"`
	Competitors        []string     `json:"competitors,omitempty"`
	CulturalReferences []string     `json:"culturalReferences,omitempty"`
	TrendingTerms      []string     `json:"trendingTerms,omitempty"`
	AdRules            []string     `json:"adRules,omitempty"`
	Sources            []Result     `json:"sources,omitempty"`
	Notices            []Notice     `json:"notices,omitempty"`
	Cost               *CostDollars `json:"costDollars,omitempty"`
}

type marketSchemaContent struct {
	Competitors        []string `json:"competitors"`
	CulturalReferences []string `json:"culturalReferences"`
	TrendingTerms      []string `json:"trendingTerms"`
	AdRules            []string `json:"adRules"`
}

// Empty reports whether the brief has no usable market facts.
func (m MarketContext) Empty() bool {
	return len(m.Competitors) == 0 &&
		len(m.CulturalReferences) == 0 &&
		len(m.TrendingTerms) == 0 &&
		len(m.AdRules) == 0
}

// MarketContext searches the live web for local competitors, cultural
// references, trending terms, and advertising rules in the target market.
//
// It uses POST /search with userLocation, highlights, and a four-field
// outputSchema so one request returns both citations and structured JSON.
func (c *Client) MarketContext(ctx context.Context, req MarketContextRequest) (MarketContext, error) {
	locale := strings.TrimSpace(req.Locale)
	country := strings.ToUpper(strings.TrimSpace(req.Country))
	if country == "" {
		country = CountryFromLocale(locale)
	}
	topic := strings.TrimSpace(req.Topic)

	query := marketQuery(locale, country, topic)
	searchReq := SearchRequest{
		Query:          query,
		Type:           SearchTypeAuto,
		NumResults:     defaultMarketResults,
		Objective:      marketObjective(locale),
		SystemPrompt:   marketSystemPrompt,
		UserIdentifier: strings.TrimSpace(req.UserIdentifier),
		Contents:       &ContentsOptions{Highlights: true},
		OutputSchema:   marketOutputSchema(),
	}
	if country != "" {
		searchReq.UserLocation = &UserLocation{Country: country}
	}

	response, err := c.Search(ctx, searchReq)
	if err != nil {
		return MarketContext{}, err
	}

	out := MarketContext{
		RequestID: response.RequestID,
		Locale:    locale,
		Country:   country,
		Sources:   response.Results,
		Notices:   response.Notices,
		Cost:      response.Cost,
	}
	if response.Output == nil || len(response.Output.Content) == 0 {
		return out, newError(ErrorCodeInvalidResponse, "Exa search returned no synthesised market context", pathSearch, 0)
	}

	var content marketSchemaContent
	if err := json.Unmarshal(response.Output.Content, &content); err != nil {
		return out, newError(ErrorCodeInvalidResponse, "Exa search returned invalid market context JSON", pathSearch, 0)
	}
	out.Competitors = compactStrings(content.Competitors)
	out.CulturalReferences = compactStrings(content.CulturalReferences)
	out.TrendingTerms = compactStrings(content.TrendingTerms)
	out.AdRules = compactStrings(content.AdRules)
	return out, nil
}

func marketQuery(locale, country, topic string) string {
	market := marketLabel(locale, country)
	focus := "consumer marketing"
	if topic != "" {
		focus = truncateRunes(topic, maxMarketTopicRunes)
	}
	return fmt.Sprintf(
		"Local competitor advertising, current cultural references, trending marketing terms, and advertising rules for %s in %s",
		focus,
		market,
	)
}

func marketObjective(locale string) string {
	target := "the target market"
	if trimmed := strings.TrimSpace(locale); trimmed != "" {
		target = trimmed
	}
	return "Build a localisation brief for adapting marketing copy into " + target +
		". Prefer official regulator pages for advertising rules, local-language sources for cultural references and trending terms, and current competitor ads over generic global roundups."
}

const marketSystemPrompt = "Prefer primary or official pages for advertising rules. Prefer local-language sources. Keep each list item to one concise sentence. Drop stale or generic global advice that does not apply to this market."

func marketLabel(locale, country string) string {
	switch {
	case locale != "" && country != "":
		return locale + " (" + country + ")"
	case locale != "":
		return locale
	case country != "":
		return country
	default:
		return "the target market"
	}
}

func marketOutputSchema() *OutputSchema {
	additional := false
	stringItems := map[string]any{"type": "string"}
	return &OutputSchema{
		Type:        "object",
		Description: "Live localisation context for one target market.",
		Properties: map[string]any{
			"competitors": map[string]any{
				"type":        "array",
				"description": "Local competitors and how they currently advertise.",
				"items":       stringItems,
			},
			"culturalReferences": map[string]any{
				"type":        "array",
				"description": "Cultural references, idioms, and campaigns that currently land in this market.",
				"items":       stringItems,
			},
			"trendingTerms": map[string]any{
				"type":        "array",
				"description": "Trending marketing and product terms in this market right now.",
				"items":       stringItems,
			},
			"adRules": map[string]any{
				"type":        "array",
				"description": "Advertising rules, restricted claims, and regulator guidance for this market.",
				"items":       stringItems,
			},
		},
		Required:             []string{"competitors", "culturalReferences", "trendingTerms", "adRules"},
		AdditionalProperties: &additional,
	}
}

func compactStrings(values []string) []string {
	out := make([]string, 0, len(values))
	seen := make(map[string]struct{}, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		key := strings.ToLower(trimmed)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, trimmed)
	}
	return out
}

func truncateRunes(value string, max int) string {
	if max <= 0 || value == "" {
		return ""
	}
	runes := []rune(value)
	if len(runes) <= max {
		return value
	}
	return string(runes[:max])
}
