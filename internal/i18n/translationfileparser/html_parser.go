package translationfileparser

// HTML file parser: extracts translatable text from open/close tag content.
// Inline tags within a text segment are replaced with sentinel placeholders
// so that the LLM translates clean prose while the markup is restored on marshal.

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"regexp"
	"slices"
	"strings"

	"golang.org/x/net/html"
)

// HTMLParser parses HTML files into translatable string segments.
type HTMLParser struct{}

func (p HTMLParser) Parse(content []byte) (map[string]string, error) {
	_, entries, err := parseHTMLDocument(content)
	return entries, err
}

// htmlPart is a segment of an HTML document: either a non-translatable literal
// or a translatable chunk whose inline tags have been replaced with placeholders.
type htmlPart struct {
	literal      string
	key          string
	source       string            // translatable text with inline-tag placeholders
	placeholders map[string]string // placeholder token → original tag bytes
}

type htmlDocument struct {
	parts []htmlPart
}

// HTMLRenderDiagnostics records keys that fell back to source text during render.
type HTMLRenderDiagnostics struct {
	SourceFallbackKeys []string
}

// htmlBlockElements flush the accumulated inline buffer when their start or end
// tag is encountered. Text directly inside these elements is a translation unit.
var htmlBlockElements = map[string]bool{
	"address": true, "article": true, "aside": true, "blockquote": true,
	"caption": true, "dd": true, "details": true, "dialog": true,
	"div": true, "dl": true, "dt": true, "fieldset": true,
	"figcaption": true, "figure": true, "footer": true, "form": true,
	"h1": true, "h2": true, "h3": true, "h4": true, "h5": true, "h6": true,
	"header": true, "hgroup": true, "li": true, "main": true,
	"nav": true, "ol": true, "p": true, "section": true,
	"summary": true, "table": true, "tbody": true, "td": true, "tfoot": true,
	"th": true, "thead": true, "tr": true, "ul": true,
	"label": true, "button": true, "legend": true, "option": true,
}

// htmlSkipElements cause all content until the matching close tag to be emitted
// verbatim without any translation extraction.
var htmlSkipElements = map[string]bool{
	"head": true, "script": true, "style": true, "pre": true,
}

// htmlTagPattern matches a complete HTML tag, including attribute values that
// may themselves contain '>'. It skips over double- and single-quoted strings
// before consuming any bare character that is not '>'.
//
// Assumption: attribute values are always quoted. Unquoted attribute values
// containing '>' (invalid HTML) are not handled and will cause the regex to
// split the tag at the first bare '>'. In practice this is not a problem
// because only tokens that golang.org/x/net/html successfully tokenized as
// tag tokens reach protectHTMLInlineSyntax; those tokens are syntactically
// complete (begin with '<', end with '>') even though z.Raw() returns the
// original unmodified bytes.
var htmlTagPattern = regexp.MustCompile(`<(?:[^>"']*(?:"[^"]*"|'[^']*'))*[^>]*>`)

// htmlStructuralElements are container tags that are always emitted as
// literals rather than buffered as inline content. This prevents </body>,
// </html>, etc. from being wrapped in a translation unit when orphaned inline
// content appears directly before them.
var htmlStructuralElements = map[string]bool{
	"html": true, "body": true, "template": true, "colgroup": true,
}

// parseHTMLDocument tokenizes content into literal and translatable parts,
// returning the document, a map of key → source (with placeholders), and any
// non-EOF tokenizer error.
func parseHTMLDocument(content []byte) (htmlDocument, map[string]string, error) {
	var doc htmlDocument
	entries := map[string]string{}
	occurrences := map[string]int{}

	z := html.NewTokenizer(bytes.NewReader(content))

	skipDepth := 0
	var buffer strings.Builder

	appendLiteral := func(s string) {
		doc.parts = append(doc.parts, htmlPart{literal: s})
	}

	flushBuffer := func() {
		raw := buffer.String()
		buffer.Reset()
		if raw == "" {
			return
		}
		if strings.TrimSpace(raw) == "" {
			appendLiteral(raw)
			return
		}
		placeholdered, placeholders, plainText, _ := protectHTMLInlineSyntax(raw)
		if !isTranslatableChunk(plainText) {
			appendLiteral(raw)
			return
		}
		key := htmlSegmentKey(placeholdered, occurrences)
		entries[key] = placeholdered
		doc.parts = append(doc.parts, htmlPart{
			key:          key,
			source:       placeholdered,
			placeholders: placeholders,
		})
	}

	for {
		tt := z.Next()
		if tt == html.ErrorToken {
			if err := z.Err(); err != nil && err != io.EOF {
				return doc, entries, err
			}
			flushBuffer()
			break
		}

		// Copy raw bytes before any TagName call which may advance internal state.
		raw := string(z.Raw())

		if skipDepth > 0 {
			switch tt {
			case html.EndTagToken:
				tn, _ := z.TagName()
				if htmlSkipElements[string(tn)] {
					skipDepth--
				}
			case html.StartTagToken:
				tn, _ := z.TagName()
				if htmlSkipElements[string(tn)] {
					skipDepth++
				}
			}
			appendLiteral(raw)
			continue
		}

		switch tt {
		case html.DoctypeToken, html.CommentToken:
			flushBuffer()
			appendLiteral(raw)

		case html.StartTagToken:
			tn, _ := z.TagName()
			if htmlSkipElements[string(tn)] {
				flushBuffer()
				skipDepth++
				appendLiteral(raw)
			} else if htmlBlockElements[string(tn)] || htmlStructuralElements[string(tn)] {
				flushBuffer()
				appendLiteral(raw)
			} else {
				// Inline element: accumulate into the text buffer.
				buffer.WriteString(raw)
			}

		case html.EndTagToken:
			tn, _ := z.TagName()
			if htmlBlockElements[string(tn)] || htmlStructuralElements[string(tn)] {
				flushBuffer()
				appendLiteral(raw)
			} else {
				buffer.WriteString(raw)
			}

		case html.SelfClosingTagToken:
			tn, _ := z.TagName()
			if htmlBlockElements[string(tn)] || htmlStructuralElements[string(tn)] {
				flushBuffer()
				appendLiteral(raw)
			} else {
				buffer.WriteString(raw)
			}

		case html.TextToken:
			buffer.WriteString(raw)
		}
	}

	return doc, entries, nil
}

// protectHTMLInlineSyntax replaces every HTML tag in segment with a sentinel
// placeholder. Returns the placeholdered string, the placeholder map, the plain
// text (tags removed), and a malformed flag (always false; reserved for future use).
func protectHTMLInlineSyntax(segment string) (string, map[string]string, string, bool) {
	var rendered strings.Builder
	var plain strings.Builder
	placeholders := map[string]string{}
	placeholderCount := 0

	appendPlaceholder := func(literal string) string {
		sum := sha256.Sum256([]byte(fmt.Sprintf("%d:%s", placeholderCount, literal)))
		ph := fmt.Sprintf("\x1eHLHTPH_%s_%d\x1f", strings.ToUpper(hex.EncodeToString(sum[:])[:12]), placeholderCount)
		placeholderCount++
		placeholders[ph] = literal
		return ph
	}

	pos := 0
	for _, match := range htmlTagPattern.FindAllStringIndex(segment, -1) {
		text := segment[pos:match[0]]
		rendered.WriteString(text)
		plain.WriteString(text)
		rendered.WriteString(appendPlaceholder(segment[match[0]:match[1]]))
		pos = match[1]
	}
	tail := segment[pos:]
	rendered.WriteString(tail)
	plain.WriteString(tail)

	return rendered.String(), placeholders, plain.String(), false
}

// htmlSegmentKey generates a stable SHA-256-based key for a translatable segment.
// Duplicate content gets a numeric suffix: html.abc123def456, html.abc123def456.2, …
// Suffix numbering mirrors markdownSegmentKey: the first occurrence has no suffix,
// the second gets .2, the third .3, etc. (there is no .1).
func htmlSegmentKey(segment string, occurrences map[string]int) string {
	sum := sha256.Sum256([]byte(segment))
	hash := hex.EncodeToString(sum[:])[:16]
	count := occurrences[hash]
	occurrences[hash] = count + 1
	if count == 0 {
		return fmt.Sprintf("html.%s", hash)
	}
	return fmt.Sprintf("html.%s.%d", hash, count+1)
}

// expandHTMLPlaceholders replaces sentinel tokens in rendered with their original
// tag bytes. Tokens are expanded longest-first to avoid partial-prefix collisions.
func expandHTMLPlaceholders(rendered string, placeholders map[string]string) string {
	keys := make([]string, 0, len(placeholders))
	for ph := range placeholders {
		keys = append(keys, ph)
	}
	slices.SortFunc(keys, func(a, b string) int { return len(b) - len(a) })
	for _, ph := range keys {
		rendered = strings.ReplaceAll(rendered, ph, placeholders[ph])
	}
	return rendered
}

// MarshalHTML reconstructs template with translated values applied.
// Keys missing from values fall back to source text and are recorded in diagnostics.
func MarshalHTML(template []byte, values map[string]string) ([]byte, HTMLRenderDiagnostics) {
	doc, _, _ := parseHTMLDocument(template)
	return doc.render(values)
}

// MarshalHTMLWithTargetFallback is like MarshalHTML but also accepts an existing
// target file. For source keys absent from values, it recovers translations by
// structural position: the i-th translatable segment in the target file is used as
// the fallback for the i-th translatable segment in the source template.
//
// This preserves translations from previous runs and manual edits in the target
// file when only a subset of segments is present in values.
//
// NOTE: positional alignment is stable only when the source template's segment
// count and order match the existing target file. If segments are added or removed
// in the source, the fallback may associate the wrong target translation with some
// segments. Affected segments beyond the end of targetParts fall back to source text.
func MarshalHTMLWithTargetFallback(sourceTemplate, targetTemplate []byte, values map[string]string) ([]byte, HTMLRenderDiagnostics) {
	sourceDoc, _, _ := parseHTMLDocument(sourceTemplate)
	targetDoc, _, _ := parseHTMLDocument(targetTemplate)

	// Collect target translatable parts in document order.
	targetParts := make([]htmlPart, 0)
	for _, p := range targetDoc.parts {
		if p.key != "" {
			targetParts = append(targetParts, p)
		}
	}

	// Build merged values: staged entries take priority; fill the rest by position.
	merged := make(map[string]string, len(values)+len(targetParts))
	for k, v := range values {
		merged[k] = v
	}
	si := 0
	for _, p := range sourceDoc.parts {
		if p.key == "" {
			continue
		}
		if _, ok := merged[p.key]; !ok && si < len(targetParts) {
			// Store the target's placeholderized source directly. render() will
			// check that all source placeholder tokens are present (they match when
			// inline tags are identical, since tokens are keyed on tag literal +
			// counter) and then expand them. Storing already-expanded HTML would
			// cause the placeholder-present check in render() to always fail.
			merged[p.key] = targetParts[si].source
		}
		si++
	}

	return sourceDoc.render(merged)
}

func (d htmlDocument) render(values map[string]string) ([]byte, HTMLRenderDiagnostics) {
	var diags HTMLRenderDiagnostics
	var b strings.Builder
	for _, part := range d.parts {
		if part.key == "" {
			b.WriteString(part.literal)
			continue
		}
		translated, ok := values[part.key]
		if !ok {
			diags.SourceFallbackKeys = append(diags.SourceFallbackKeys, part.key)
			b.WriteString(expandHTMLPlaceholders(part.source, part.placeholders))
			continue
		}
		rendered := preserveChunkBoundaryWhitespace(part.source, translated)
		// Ensure every placeholder survived translation. A dropped placeholder
		// means source markup was lost; fall back rather than emit incomplete HTML.
		allPresent := true
		for ph := range part.placeholders {
			if !strings.Contains(rendered, ph) {
				allPresent = false
				break
			}
		}
		if !allPresent {
			diags.SourceFallbackKeys = append(diags.SourceFallbackKeys, part.key)
			b.WriteString(expandHTMLPlaceholders(part.source, part.placeholders))
			continue
		}
		rendered = expandHTMLPlaceholders(rendered, part.placeholders)
		if strings.ContainsRune(rendered, '\x1e') || strings.ContainsRune(rendered, '\x1f') {
			diags.SourceFallbackKeys = append(diags.SourceFallbackKeys, part.key)
			b.WriteString(expandHTMLPlaceholders(part.source, part.placeholders))
			continue
		}
		b.WriteString(rendered)
	}
	return []byte(b.String()), diags
}
