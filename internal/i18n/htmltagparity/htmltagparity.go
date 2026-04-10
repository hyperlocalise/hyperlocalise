// Package htmltagparity compares HTML tag name sequences in two strings.
// It mirrors the hyperlocalise check command's html_tag_mismatch rule.
package htmltagparity

import (
	"regexp"
	"slices"
	"strings"
)

var tagPattern = regexp.MustCompile(`</?[A-Za-z][^>]*?>`)

// Mismatch reports whether the normalized HTML tag name sequences differ
// between source and target (same semantics as check hasHTMLTagMismatch).
func Mismatch(sourceValue, targetValue string) bool {
	sourceTags := normalizeTagNames(tagPattern.FindAllString(sourceValue, -1))
	targetTags := normalizeTagNames(tagPattern.FindAllString(targetValue, -1))
	return !slices.Equal(sourceTags, targetTags)
}

// NormalizedTagNames returns normalized tag names from raw HTML snippets (exported for tests).
func NormalizedTagNames(tags []string) []string {
	return normalizeTagNames(tags)
}

func normalizeTagNames(tags []string) []string {
	out := make([]string, 0, len(tags))
	for _, tag := range tags {
		normalized := strings.ToLower(strings.TrimSpace(tag))
		normalized = strings.TrimSuffix(normalized, "/>")
		normalized = strings.TrimSuffix(normalized, ">")
		normalized = strings.TrimPrefix(normalized, "<")
		parts := strings.Fields(normalized)
		if len(parts) == 0 {
			continue
		}
		out = append(out, parts[0])
	}
	return out
}
