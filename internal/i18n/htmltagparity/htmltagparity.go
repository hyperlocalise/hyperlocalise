// Package htmltagparity compares HTML tag name sequences in two strings.
// It mirrors the hyperlocalise check command's html_tag_mismatch rule.
package htmltagparity

import (
	"regexp"
	"slices"
	"strings"

	"golang.org/x/net/html/atom"
)

var tagPattern = regexp.MustCompile(`</?[A-Za-z][^>]*?>`)

// Mismatch reports whether the normalized HTML tag name sequences differ
// between source and target (same semantics as check hasHTMLTagMismatch).
func Mismatch(sourceValue, targetValue string) bool {
	sourceTags := filterKnownHTMLTagNames(normalizeTagNames(tagPattern.FindAllString(sourceValue, -1)))
	targetTags := filterKnownHTMLTagNames(normalizeTagNames(tagPattern.FindAllString(targetValue, -1)))
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

// filterKnownHTMLTagNames keeps only names that exist in golang.org/x/net/html/atom.
// A leading "/" (closing tag) is stripped only for Lookup; the token passed through
// preserves opening vs closing. Patterns such as <name> in documented paths are ignored.
func filterKnownHTMLTagNames(names []string) []string {
	out := make([]string, 0, len(names))
	for _, n := range names {
		tag := strings.TrimPrefix(n, "/")
		if atom.Lookup([]byte(tag)) != 0 {
			out = append(out, n)
		}
	}
	return out
}
