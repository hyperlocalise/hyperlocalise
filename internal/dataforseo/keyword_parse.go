package dataforseo

import (
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

	return KeywordIdea{
		Keyword: keyword,
		Volume:  volume,
		KD:      kd,
		CPC:     cpc,
		Intent:  intent,
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
