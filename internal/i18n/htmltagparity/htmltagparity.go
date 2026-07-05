// Package htmltagparity compares HTML tag name sequences in two strings.
// It mirrors the hyperlocalise check command's html_tag_mismatch rule.
package htmltagparity

import (
	"slices"
	"strings"

	"golang.org/x/net/html/atom"
)

// Mismatch reports whether the normalized HTML tag name sequences differ
// between source and target (same semantics as check hasHTMLTagMismatch).
func Mismatch(sourceValue, targetValue string) bool {
	// BOLT OPTIMIZATION: Fast-path for identical strings.
	if sourceValue == targetValue {
		return false
	}

	sourceTags := normalizedMarkupTagNames(findAllTags(sourceValue))
	targetTags := normalizedMarkupTagNames(findAllTags(targetValue))
	return !slices.Equal(sourceTags, targetTags)
}

func findAllTags(s string) []string {
	var out []string
	// BOLT OPTIMIZATION: Use strings.IndexByte for faster tag discovery.
	for i := 0; i < len(s); {
		idx := strings.IndexByte(s[i:], '<')
		if idx < 0 {
			break
		}
		i += idx

		// Potential tag start.
		start := i
		if i+1 >= len(s) {
			break
		}

		// We only care about </?[A-Za-z] to match the previous regex behavior.
		next := s[i+1]
		if next == '/' {
			if i+2 >= len(s) {
				break
			}
			next = s[i+2]
		}
		if (next < 'a' || next > 'z') && (next < 'A' || next > 'Z') {
			i++
			continue
		}

		// Found a tag start, scan until we find the closing '>', respecting quotes.
		var quote byte
		found := false
		for j := i + 1; j < len(s); j++ {
			ch := s[j]
			if quote != 0 {
				if ch == quote {
					quote = 0
				}
				continue
			}

			if ch == '"' || ch == '\'' {
				quote = ch
				continue
			}

			if ch == '>' {
				out = append(out, s[start:j+1])
				i = j + 1
				found = true
				break
			}
		}

		if !found {
			// Unclosed tag, skip it as a potential start.
			i++
			continue
		}
	}
	return out
}

// NormalizedTagNames returns normalized tag names from raw HTML snippets (exported for tests).
func NormalizedTagNames(tags []string) []string {
	return normalizeTagNames(tags)
}

func normalizeTagNames(tags []string) []string {
	// BOLT OPTIMIZATION: Single-pass tag name extraction to avoid redundant string allocations.
	out := make([]string, 0, len(tags))
	for _, tag := range tags {
		name := extractTagName(tag)
		if name != "" {
			out = append(out, name)
		}
	}
	return out
}

func extractTagName(tag string) string {
	// tag is like "<strong\n  class=\"foo\">" or "</strong >" or "<br / >"
	// We want "strong", "/strong", "br"
	i := 0
	for i < len(tag) && isHTMLWhitespace(tag[i]) {
		i++
	}
	if i >= len(tag) || tag[i] != '<' {
		return ""
	}
	i++
	for i < len(tag) && isHTMLWhitespace(tag[i]) {
		i++
	}

	start := i
	// Handle closing tag prefix
	if i < len(tag) && tag[i] == '/' {
		i++
	}

	// Scan name characters
	for i < len(tag) {
		ch := tag[i]
		if isHTMLWhitespace(ch) || ch == '/' || ch == '>' {
			break
		}
		i++
	}

	if i == start {
		return ""
	}

	return strings.ToLower(tag[start:i])
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
	// BOLT OPTIMIZATION: strings.TrimPrefix is allocation-free when slicing.
	tag := strings.TrimPrefix(normalized, "/")
	if tag == "" {
		return false
	}
	if a := atom.Lookup([]byte(tag)); a != 0 {
		// 'name' and 'id' are common path/template placeholders that are atoms but
		// not standard HTML elements. We only treat them as markup if they have
		// attributes (checked below).
		if tag != "name" && tag != "id" {
			return true
		}
	}
	// Hyphens and colons are strong indicators of custom elements or namespaced tags.
	if strings.Contains(tag, "-") || strings.Contains(tag, ":") {
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
	// BOLT OPTIMIZATION: Manual scan to avoid TrimSpace/TrimPrefix allocations.
	i := 0
	for i < len(raw) && isHTMLWhitespace(raw[i]) {
		i++
	}
	if i >= len(raw) || raw[i] != '<' {
		return ""
	}
	i++
	for i < len(raw) && isHTMLWhitespace(raw[i]) {
		i++
	}
	if i < len(raw) && raw[i] == '/' {
		i++
	}

	start := i
	for i < len(raw) {
		ch := raw[i]
		if isHTMLWhitespace(ch) || ch == '/' || ch == '>' {
			break
		}
		i++
	}
	return raw[start:i]
}

func rawTagHasAttributes(raw, rawName string) bool {
	// BOLT OPTIMIZATION: Avoid multiple TrimSpace/TrimPrefix/TrimSuffix allocations.
	i := 0
	for i < len(raw) && isHTMLWhitespace(raw[i]) {
		i++
	}
	if i >= len(raw) || raw[i] != '<' {
		return false
	}
	i++
	for i < len(raw) && isHTMLWhitespace(raw[i]) {
		i++
	}
	if i < len(raw) && raw[i] == '/' {
		i++
	}

	if !strings.HasPrefix(raw[i:], rawName) {
		return false
	}
	i += len(rawName)

	// Scan for attributes
	hasAttrs := false
	for i < len(raw) {
		ch := raw[i]
		if ch == '>' {
			break
		}
		if ch == '/' {
			// Peek ahead to see if it's the end of tag
			next := i + 1
			for next < len(raw) && isHTMLWhitespace(raw[next]) {
				next++
			}
			if next < len(raw) && raw[next] == '>' {
				break
			}
		}

		if !isHTMLWhitespace(ch) {
			hasAttrs = true
			break
		}
		i++
	}
	return hasAttrs
}

func isHTMLWhitespace(ch byte) bool {
	return ch == ' ' || ch == '\t' || ch == '\n' || ch == '\r'
}
