package locales

import "strings"

// NormalizeList trims, splits on commas, and deduplicates locale or language codes.
func NormalizeList(values []string) []string {
	normalized := make([]string, 0, len(values))
	seen := make(map[string]struct{}, len(values))
	for _, value := range values {
		s := value
		for {
			var part string
			idx := strings.IndexByte(s, ',')
			if idx < 0 {
				part = s
			} else {
				part = s[:idx]
			}

			trimmed := strings.TrimSpace(part)
			if trimmed != "" {
				key := strings.ToLower(trimmed)
				if _, ok := seen[key]; !ok {
					seen[key] = struct{}{}
					normalized = append(normalized, trimmed)
				}
			}

			if idx < 0 {
				break
			}
			s = s[idx+1:]
		}
	}
	return normalized
}
