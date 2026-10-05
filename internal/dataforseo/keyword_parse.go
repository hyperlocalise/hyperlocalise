package dataforseo

import (
	"fmt"
	"strings"
)

// ParseKeywordIdeas normalizes Labs keyword payloads into KeywordIdea rows.
func ParseKeywordIdeas(items []KeywordDataItem) []KeywordIdea {
	ideas := make([]KeywordIdea, 0, len(items))
	seen := make(map[string]struct{}, len(items))
	for _, item := range items {
		idea, ok := ParseKeywordIdea(item)
		if !ok {
			continue
		}
		key := strings.ToLower(idea.Keyword)
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		ideas = append(ideas, idea)
	}
	return ideas
}

// ParseKeywordIdea extracts metrics from a Labs keyword item or nested keyword_data.
func ParseKeywordIdea(item KeywordDataItem) (KeywordIdea, bool) {
	payload := item
	if nested, ok := mapFromAny(item["keyword_data"]); ok {
		payload = nested
	}

	keyword := stringFromAny(payload["keyword"])
	if keyword == "" {
		keyword = stringFromAny(item["related_keyword"])
	}
	keyword = normalizeKeyword(keyword)
	if keyword == "" {
		return KeywordIdea{}, false
	}

	info, _ := mapFromAny(payload["keyword_info"])
	properties, _ := mapFromAny(payload["keyword_properties"])
	intentInfo, _ := mapFromAny(payload["search_intent_info"])

	volume := firstInt(info["search_volume"], payload["search_volume"], item["search_volume"])
	kd := firstInt(properties["keyword_difficulty"], payload["keyword_difficulty"], item["keyword_difficulty"])
	cpc := firstFloat(info["cpc"], payload["cpc"], item["cpc"])
	intent := normalizeIntent(firstString(
		intentInfo["main_intent"],
		payload["intent"],
		item["intent"],
	))
	competition := firstFloatPointer(info["competition"], properties["competition"], payload["competition"], item["competition"])
	monthlySearches := parseMonthlySearches(
		info["monthly_searches"],
		properties["monthly_searches"],
		payload["monthly_searches"],
		item["monthly_searches"],
	)

	return KeywordIdea{
		Keyword:         keyword,
		Volume:          volume,
		KD:              kd,
		CPC:             cpc,
		Competition:     competition,
		MonthlySearches: monthlySearches,
		Intent:          intent,
	}, true
}

func normalizeIntent(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "commercial":
		return "commercial"
	case "transactional":
		return "transactional"
	case "navigational":
		return "navigational"
	default:
		return "informational"
	}
}

func mapFromAny(value any) (map[string]any, bool) {
	switch typed := value.(type) {
	case map[string]any:
		return typed, true
	case KeywordDataItem:
		return typed, true
	default:
		return nil, false
	}
}

func stringFromAny(value any) string {
	typed, _ := value.(string)
	return strings.TrimSpace(typed)
}

func firstString(values ...any) string {
	for _, value := range values {
		if text := stringFromAny(value); text != "" {
			return text
		}
	}
	return ""
}

func firstInt(values ...any) int {
	for _, value := range values {
		if parsed := intFromAny(value); parsed != nil {
			return *parsed
		}
	}
	return 0
}

func firstFloat(values ...any) float64 {
	for _, value := range values {
		if parsed := floatFromAny(value); parsed != nil {
			return *parsed
		}
	}
	return 0
}

func firstFloatPointer(values ...any) *float64 {
	for _, value := range values {
		if parsed := floatFromAny(value); parsed != nil {
			return parsed
		}
	}
	return nil
}

func parseMonthlySearches(values ...any) []KeywordMonthlySearch {
	for _, value := range values {
		items, ok := value.([]any)
		if !ok {
			continue
		}
		result := make([]KeywordMonthlySearch, 0, len(items))
		for _, item := range items {
			row, ok := mapFromAny(item)
			if !ok {
				continue
			}
			year := intFromAny(row["year"])
			month := intFromAny(row["month"])
			volume := intFromAny(firstNonNil(row["search_volume"], row["volume"]))
			if year == nil || month == nil || volume == nil || *month < 1 || *month > 12 {
				continue
			}
			result = append(result, KeywordMonthlySearch{
				Month:  fmt.Sprintf("%04d-%02d", *year, *month),
				Volume: *volume,
			})
		}
		if len(result) > 0 {
			return result
		}
	}
	return nil
}

func firstNonNil(values ...any) any {
	for _, value := range values {
		if value != nil {
			return value
		}
	}
	return nil
}

func floatFromAny(value any) *float64 {
	switch typed := value.(type) {
	case float64:
		return &typed
	case float32:
		converted := float64(typed)
		return &converted
	case int:
		converted := float64(typed)
		return &converted
	case int32:
		converted := float64(typed)
		return &converted
	case int64:
		converted := float64(typed)
		return &converted
	default:
		return nil
	}
}
