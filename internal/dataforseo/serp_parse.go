package dataforseo

import (
	"strings"
)

// ParseOrganicSerpResults keeps organic rows and optionally marks the target domain.
func ParseOrganicSerpResults(items []SerpItem, targetDomain string) []OrganicSerpResult {
	target := strings.ToLower(strings.TrimSpace(targetDomain))
	results := make([]OrganicSerpResult, 0, len(items))
	for _, item := range items {
		itemType := stringFromAny(item["type"])
		if itemType != "organic" {
			continue
		}

		position := firstInt(item["rank_group"], item["rank_absolute"])
		urlValue := stringFromAny(item["url"])
		if position <= 0 || urlValue == "" {
			continue
		}

		domain := strings.ToLower(stringFromAny(item["domain"]))
		result := OrganicSerpResult{
			Position: position,
			Title:    stringFromAny(item["title"]),
			URL:      urlValue,
			Snippet:  firstString(item["description"], item["snippet"]),
			Domain:   domain,
		}
		if target != "" && domainOwnsHost(domain, target) {
			result.IsOwn = true
		}
		results = append(results, result)
	}
	return results
}

func domainOwnsHost(domain, target string) bool {
	if domain == "" || target == "" {
		return false
	}
	return domain == target || strings.HasSuffix(domain, "."+target)
}
