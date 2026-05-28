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
	sourceTags := normalizedMarkupTagNames(tagPattern.FindAllString(sourceValue, -1))
	targetTags := normalizedMarkupTagNames(tagPattern.FindAllString(targetValue, -1))
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

func normalizedMarkupTagNames(tags []string) []string {
	names := normalizeTagNames(tags)
	out := make([]string, 0, len(names))
	for i, name := range names {
		if isLikelyMarkupTag(tags[i], name) {
			out = append(out, name)
		}
	}
	return out
}

func isLikelyMarkupTag(raw, normalized string) bool {
	tag := strings.TrimPrefix(normalized, "/")
	if tag == "" {
		return false
	}
	if atom.Lookup([]byte(tag)) != 0 || strings.Contains(tag, "-") {
		return true
	}
	rawName := rawTagName(raw)
	if rawName == "" {
		return false
	}
	if rawName[0] >= 'A' && rawName[0] <= 'Z' {
		return true
	}
	return rawTagHasAttributes(raw, rawName)
}

func rawTagName(raw string) string {
	inner := strings.TrimSpace(raw)
	inner = strings.TrimPrefix(inner, "<")
	inner = strings.TrimPrefix(inner, "/")
	for i := 0; i < len(inner); i++ {
		switch inner[i] {
		case ' ', '\t', '\n', '\r', '/', '>':
			return inner[:i]
		}
	}
	return inner
}

func rawTagHasAttributes(raw, rawName string) bool {
	inner := strings.TrimSpace(raw)
	inner = strings.TrimPrefix(inner, "<")
	inner = strings.TrimPrefix(inner, "/")
	if !strings.HasPrefix(inner, rawName) {
		return false
	}
	rest := strings.TrimSpace(inner[len(rawName):])
	return rest != "" && rest != ">" && rest != "/>"
}
