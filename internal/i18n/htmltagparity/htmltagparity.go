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
	sourceTags := normalizedMarkupTagNames(findAllTags(sourceValue))
	targetTags := normalizedMarkupTagNames(findAllTags(targetValue))
	return !slices.Equal(sourceTags, targetTags)
}

func findAllTags(s string) []string {
	var out []string
	for i := 0; i < len(s); i++ {
		if s[i] != '<' {
			continue
		}

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
				i = j
				found = true
				break
			}
		}

		if !found {
			// Unclosed tag, skip it as a potential start.
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
	out := make([]string, 0, len(tags))
	for _, tag := range tags {
		normalized := strings.ToLower(strings.TrimSpace(tag))
		normalized = strings.TrimSuffix(normalized, ">")
		normalized = strings.TrimSpace(normalized)
		normalized = strings.TrimSuffix(normalized, "/") // Handle flexible " / >"
		normalized = strings.TrimSpace(normalized)
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
	// Strip trailing ">" and flexible self-closing "/"
	rest = strings.TrimSuffix(rest, ">")
	rest = strings.TrimSpace(rest)
	rest = strings.TrimSuffix(rest, "/")
	rest = strings.TrimSpace(rest)
	return rest != ""
}
