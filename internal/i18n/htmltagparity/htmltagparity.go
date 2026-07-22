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

	sourceTags := collectMarkupTags(sourceValue)
	targetTags := collectMarkupTags(targetValue)
	return !slices.Equal(sourceTags, targetTags)
}

// collectMarkupTags scans the string and collects normalized markup tag names
// in a single pass with minimal heap allocations by fusing tag discovery, name extraction, and filtering.
func collectMarkupTags(s string) []string {
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
				raw := s[start : j+1]
				name := extractTagName(raw)
				if name != "" && isLikelyMarkupTag(raw, name) {
					if out == nil {
						// Heuristic: pre-allocate 4 slots to avoid small re-allocations
						out = make([]string, 0, 4)
					}
					out = append(out, name)
				}
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

	name := tag[start:i]
	if hasNoASCIIUpperCase(name) {
		return name
	}
	return strings.ToLower(name)
}

func hasNoASCIIUpperCase(s string) bool {
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c >= 'A' && c <= 'Z' {
			return false
		}
	}
	return true
}

// htmlAtoms contains all standard HTML, SVG, and MathML atoms to bypass atom.Lookup.
// This completely avoids []byte conversions and heap allocations for safe lookup of standard tags.
// Note: "name" and "id" are excluded since they are treated as template placeholders
// unless they explicitly have attributes.
var htmlAtoms = map[string]bool{
	"div": true, "span": true, "p": true, "a": true, "br": true, "img": true, "strong": true, "em": true, "b": true, "i": true, "u": true,
	"h1": true, "h2": true, "h3": true, "h4": true, "h5": true, "h6": true, "ul": true, "ol": true, "li": true, "table": true, "thead": true,
	"tbody": true, "tr": true, "th": true, "td": true, "button": true, "input": true, "form": true, "label": true, "select": true,
	"option": true, "textarea": true, "section": true, "nav": true, "header": true, "footer": true, "aside": true,
	"main": true, "code": true, "pre": true, "hr": true, "svg": true, "path": true, "iframe": true, "script": true, "style": true,
	"body": true, "head": true, "html": true, "meta": true, "link": true, "title": true, "small": true, "sub": true, "sup": true,
	"abbr": true, "address": true, "area": true, "article": true, "audio": true, "bdi": true, "bdo": true, "blockquote": true,
	"canvas": true, "caption": true, "cite": true, "col": true, "colgroup": true, "data": true, "datalist": true, "dd": true,
	"del": true, "details": true, "dfn": true, "dialog": true, "dl": true, "dt": true, "embed": true, "fieldset": true,
	"figcaption": true, "figure": true, "hgroup": true, "ins": true, "kbd": true, "legend": true, "map": true, "mark": true,
	"math": true, "menu": true, "meter": true, "noscript": true, "object": true, "optgroup": true, "output": true, "picture": true,
	"progress": true, "q": true, "rp": true, "rt": true, "ruby": true, "s": true, "samp": true, "slot": true,
	"source": true, "template": true, "time": true, "track": true, "var": true, "video": true, "wbr": true,
	// SVG and MathML atoms
	"rect": true, "circle": true, "g": true, "ellipse": true, "line": true, "polyline": true, "polygon": true,
	"text": true, "tspan": true, "defs": true, "use": true, "symbol": true, "lineargradient": true, "radialgradient": true,
	"stop": true, "mask": true, "pattern": true, "clippath": true,
}

func isLikelyMarkupTag(raw, normalized string) bool {
	// BOLT OPTIMIZATION: strings.TrimPrefix is allocation-free when slicing.
	tag := strings.TrimPrefix(normalized, "/")
	if tag == "" {
		return false
	}

	// BOLT OPTIMIZATION: Check for common HTML tags using our precomputed map to bypass atom.Lookup.
	// This avoids allocating a []byte slice for Lookup.
	if htmlAtoms[tag] {
		return true
	} else if a := atom.Lookup([]byte(tag)); a != 0 {
		// 'name' and 'id' are common path/template placeholders that are atoms but
		// not standard HTML elements. We only treat them as markup if they have
		// attributes (checked below).
		if tag != "name" && tag != "id" {
			return true
		}
	}

	// BOLT OPTIMIZATION: Use strings.IndexByte for faster hyphen and colon checks.
	if strings.IndexByte(tag, '-') >= 0 || strings.IndexByte(tag, ':') >= 0 {
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
