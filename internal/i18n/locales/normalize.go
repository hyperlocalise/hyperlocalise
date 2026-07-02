package locales

import "strings"

// NormalizeList trims, splits on commas, and deduplicates locale or language codes.
func NormalizeList(values []string) []string {
	// BOLT OPTIMIZATION: Heuristically estimate total capacity to reduce re-allocations.
	capHint := 0
	for _, v := range values {
		capHint += 1 + strings.Count(v, ",")
	}

	normalized := make([]string, 0, capHint)
	seen := make(map[string]struct{}, capHint)
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
				// BOLT OPTIMIZATION: Check if string is already lowercase to avoid
				// unnecessary strings.ToLower allocations for common cases.
				key := trimmed
				if !isAlreadyLower(trimmed) {
					key = strings.ToLower(trimmed)
				}
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

func isAlreadyLower(s string) bool {
	for i := 0; i < len(s); i++ {
		ch := s[i]
		if ch >= 'A' && ch <= 'Z' {
			return false
		}
		if ch >= 0x80 {
			// Safety fallback for non-ASCII characters to ensure correct Unicode lowering.
			return false
		}
	}
	return true
}
