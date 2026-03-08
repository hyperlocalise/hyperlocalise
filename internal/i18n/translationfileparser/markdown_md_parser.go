package translationfileparser

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"sort"
	"strings"
	"unicode"

	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/extension"
	extast "github.com/yuin/goldmark/extension/ast"
	textm "github.com/yuin/goldmark/text"
)

var standardMarkdownParser = goldmark.New(goldmark.WithExtensions(
	extension.Table,
	extension.Strikethrough,
	extension.TaskList,
	extension.DefinitionList,
	extension.Footnote,
))

type markdownSpanCandidate struct {
	start int
	stop  int
	path  string
}

func parseMarkdownDocument(content []byte, mdx bool) (markdownDocument, map[string]string) {
	if mdx {
		return parseMarkdownMDXDocument(content)
	}
	return parseMarkdownASTDocument(content)
}

func parseMarkdownASTDocument(content []byte) (markdownDocument, map[string]string) {
	content = []byte(strings.ReplaceAll(string(content), "\r\n", "\n"))
	candidates, bodyStart := collectFrontmatterCandidates(content)
	candidates = append(candidates, collectMarkdownBodyCandidates(content[bodyStart:], bodyStart)...)
	sort.Slice(candidates, func(i, j int) bool {
		if candidates[i].start == candidates[j].start {
			return candidates[i].stop < candidates[j].stop
		}
		return candidates[i].start < candidates[j].start
	})

	doc := markdownDocument{parts: make([]markdownPart, 0, len(candidates)*2+1)}
	entries := map[string]string{}
	hashOccurrences := map[string]int{}
	cursor := 0

	for _, candidate := range candidates {
		if candidate.start < cursor || candidate.stop <= candidate.start {
			continue
		}
		if candidate.start > cursor {
			doc.parts = append(doc.parts, markdownPart{literal: string(content[cursor:candidate.start])})
		}

		raw := string(content[candidate.start:candidate.stop])
		placeholdered, placeholders, plainText := protectStandardMarkdownInlineSyntax(raw)
		if !isTranslatableChunk(plainText) {
			doc.parts = append(doc.parts, markdownPart{literal: raw})
			cursor = candidate.stop
			continue
		}

		part := markdownPart{
			source:       placeholdered,
			placeholders: placeholders,
			path:         candidate.path,
		}
		part.key = markdownSegmentKey(part.source, hashOccurrences)
		doc.parts = append(doc.parts, part)
		entries[part.key] = part.source
		cursor = candidate.stop
	}

	if cursor < len(content) {
		doc.parts = append(doc.parts, markdownPart{literal: string(content[cursor:])})
	}

	return doc, entries
}

func collectFrontmatterCandidates(content []byte) ([]markdownSpanCandidate, int) {
	lines := strings.SplitAfter(string(content), "\n")
	if len(lines) == 0 || strings.TrimSpace(lines[0]) != "---" {
		return nil, 0
	}

	candidates := []markdownSpanCandidate{}
	offset := 0
	for i, line := range lines {
		if i == 0 {
			offset += len(line)
			continue
		}

		trimmed := strings.TrimSpace(line)
		if trimmed == "---" {
			return candidates, offset + len(line)
		}

		body := strings.TrimSuffix(line, "\n")
		body = strings.TrimSuffix(body, "\r")
		colon := strings.IndexByte(body, ':')
		if colon <= 0 {
			offset += len(line)
			continue
		}

		key := strings.TrimSpace(body[:colon])
		if key == "" {
			offset += len(line)
			continue
		}

		valuePart := body[colon+1:]
		lead := len(valuePart) - len(strings.TrimLeftFunc(valuePart, unicode.IsSpace))
		if lead >= len(valuePart) {
			offset += len(line)
			continue
		}

		valueRest := valuePart[lead:]
		if len(valueRest) < 2 {
			offset += len(line)
			continue
		}

		quote := valueRest[0]
		if quote != '"' && quote != '\'' {
			// Plain (unquoted) scalar value
			plainValue := strings.TrimSpace(valueRest)
			if plainValue == "" || strings.HasPrefix(plainValue, "-") ||
				strings.HasPrefix(plainValue, "[") || strings.HasPrefix(plainValue, "{") ||
				strings.HasPrefix(plainValue, "|") || strings.HasPrefix(plainValue, ">") {
				offset += len(line)
				continue
			}
			if isTranslatableChunk(plainValue) {
				valueStart := offset + colon + 1 + lead
				valueEnd := valueStart + len(plainValue)
				candidates = append(candidates, markdownSpanCandidate{
					start: valueStart,
					stop:  valueEnd,
					path:  fmt.Sprintf("frontmatter/%s", key),
				})
			}
			offset += len(line)
			continue
		}

		end := findQuotedStringEnd(valueRest, quote)
		if end <= 1 {
			offset += len(line)
			continue
		}

		start := offset + colon + 1 + lead + 1
		stop := offset + colon + 1 + lead + end
		candidates = append(candidates, markdownSpanCandidate{
			start: start,
			stop:  stop,
			path:  fmt.Sprintf("frontmatter/%s", key),
		})
		offset += len(line)
	}

	return candidates, offset
}

func collectMarkdownBodyCandidates(content []byte, baseOffset int) []markdownSpanCandidate {
	reader := textm.NewReader(content)
	root := standardMarkdownParser.Parser().Parse(reader)
	candidates := []markdownSpanCandidate{}
	seen := map[string]struct{}{}

	_ = ast.Walk(root, func(n ast.Node, entering bool) (ast.WalkStatus, error) {
		if !entering {
			return ast.WalkContinue, nil
		}

		switch typed := n.(type) {
		case *extast.Table:
			appendTableCandidates(&candidates, seen, typed, content, baseOffset)
			return ast.WalkSkipChildren, nil
		case *ast.Heading, *ast.Paragraph, *ast.TextBlock:
			appendBlockLineCandidates(&candidates, seen, n, baseOffset)
		case *ast.FencedCodeBlock, *ast.CodeBlock, *ast.HTMLBlock:
			return ast.WalkSkipChildren, nil
		case *extast.Strikethrough:
			// Wraps inline content; walk into children.
		case *extast.TaskCheckBox:
			// Within a ListItem; Paragraph children are already walked.
		case *extast.DefinitionTerm, *extast.DefinitionDescription:
			appendBlockLineCandidates(&candidates, seen, n, baseOffset)
		case *extast.FootnoteList:
			return ast.WalkSkipChildren, nil
		}

		return ast.WalkContinue, nil
	})

	return candidates
}

func appendBlockLineCandidates(out *[]markdownSpanCandidate, seen map[string]struct{}, node ast.Node, baseOffset int) {
	lines := node.Lines()
	if lines == nil || lines.Len() == 0 {
		return
	}

	for i := 0; i < lines.Len(); i++ {
		segment := lines.At(i)
		start := baseOffset + segment.Start
		stop := baseOffset + trimMarkdownSegmentStop(segment)
		appendMarkdownCandidate(out, seen, start, stop, markdownNodePath(node, i))
	}
}

func appendTableCandidates(out *[]markdownSpanCandidate, seen map[string]struct{}, table *extast.Table, content []byte, baseOffset int) {
	rowIndex := 0
	for row := table.FirstChild(); row != nil; row = row.NextSibling() {
		switch typed := row.(type) {
		case *extast.TableHeader:
			if start, stop, ok := markdownTableRowSpan(typed, content, baseOffset); ok {
				appendMarkdownCandidate(out, seen, start, stop, markdownNodePath(typed, 0))
			}
		case *extast.TableRow:
			if start, stop, ok := markdownTableRowSpan(typed, content, baseOffset); ok {
				appendMarkdownCandidate(out, seen, start, stop, fmt.Sprintf("%s/row[%d]", markdownNodePath(table, 0), rowIndex))
			}
			rowIndex++
		}
	}
}

func markdownTableRowSpan(row ast.Node, content []byte, baseOffset int) (int, int, bool) {
	minStart := -1
	maxStop := -1
	for cell := row.FirstChild(); cell != nil; cell = cell.NextSibling() {
		lines := cell.Lines()
		if lines == nil || lines.Len() == 0 {
			continue
		}
		for i := 0; i < lines.Len(); i++ {
			segment := lines.At(i)
			if minStart < 0 || segment.Start < minStart {
				minStart = segment.Start
			}
			if segment.Stop > maxStop {
				maxStop = segment.Stop
			}
		}
	}
	if minStart < 0 || maxStop <= minStart {
		return 0, 0, false
	}

	start := findMarkdownLineStart(content, minStart)
	stop := findMarkdownLineStop(content, maxStop)
	return baseOffset + start, baseOffset + stop, true
}

func appendMarkdownCandidate(out *[]markdownSpanCandidate, seen map[string]struct{}, start, stop int, path string) {
	if stop <= start {
		return
	}
	key := fmt.Sprintf("%d:%d", start, stop)
	if _, ok := seen[key]; ok {
		return
	}
	seen[key] = struct{}{}
	*out = append(*out, markdownSpanCandidate{start: start, stop: stop, path: path})
}

func trimMarkdownSegmentStop(segment textm.Segment) int {
	stop := segment.Stop
	if stop > segment.Start && segment.Padding > 0 {
		stop -= segment.Padding
	}
	return stop
}

func findMarkdownLineStart(content []byte, idx int) int {
	for idx > 0 && content[idx-1] != '\n' {
		idx--
	}
	return idx
}

func findMarkdownLineStop(content []byte, idx int) int {
	for idx < len(content) && content[idx] != '\n' {
		idx++
	}
	if idx > 0 && content[idx-1] == '\r' {
		return idx - 1
	}
	return idx
}

func markdownNodePath(node ast.Node, lineIndex int) string {
	parts := []string{}
	for current := node; current != nil; current = current.Parent() {
		if current.Kind() == ast.KindDocument {
			break
		}
		parts = append([]string{fmt.Sprintf("%s[%d]", current.Kind().String(), markdownSiblingOrdinal(current))}, parts...)
	}
	if lineIndex >= 0 {
		parts = append(parts, fmt.Sprintf("line[%d]", lineIndex))
	}
	return strings.Join(parts, "/")
}

func markdownSiblingOrdinal(node ast.Node) int {
	ordinal := 0
	for sibling := node.PreviousSibling(); sibling != nil; sibling = sibling.PreviousSibling() {
		if sibling.Kind() == node.Kind() {
			ordinal++
		}
	}
	return ordinal
}

func protectStandardMarkdownInlineSyntax(segment string) (string, map[string]string, string) {
	var rendered strings.Builder
	var plain strings.Builder
	placeholders := map[string]string{}
	placeholderCount := 0

	appendPlaceholder := func(literal string) {
		placeholder := markdownPlaceholderToken(placeholderCount, literal)
		placeholderCount++
		placeholders[placeholder] = literal
		rendered.WriteString(placeholder)
	}

	for idx := 0; idx < len(segment); {
		if idx == 0 {
			if start, end, ok := findMarkdownReferenceDefinitionDestination(segment); ok {
				rendered.WriteString(segment[idx:start])
				plain.WriteString(segment[idx:start])
				appendPlaceholder(segment[start:end])
				idx = end
				continue
			}
		}

		switch {
		case segment[idx] == '`':
			run := 0
			for idx+run < len(segment) && segment[idx+run] == '`' {
				run++
			}
			end := idx + run
			closing := strings.Repeat("`", run)
			found := false
			for end <= len(segment)-run {
				if segment[end:end+run] == closing {
					end += run
					found = true
					break
				}
				end++
			}
			if !found {
				rendered.WriteString(segment[idx : idx+run])
				plain.WriteString(segment[idx : idx+run])
				idx += run
				continue
			}
			appendPlaceholder(segment[idx:end])
			idx = end
		case strings.HasPrefix(segment[idx:], "]("):
			end := findMarkdownLinkDestinationEnd(segment, idx+2)
			appendPlaceholder(segment[idx:end])
			idx = end
		case strings.HasPrefix(segment[idx:], "]["):
			// Reference-style link: [text][id] — protect the [id] part
			closeIdx := strings.IndexByte(segment[idx+2:], ']')
			if closeIdx < 0 {
				rendered.WriteByte(segment[idx])
				plain.WriteByte(segment[idx])
				idx++
				continue
			}
			end := idx + 2 + closeIdx + 1
			appendPlaceholder(segment[idx:end])
			idx = end
		case strings.HasPrefix(segment[idx:], "<http://") || strings.HasPrefix(segment[idx:], "<https://") || strings.HasPrefix(segment[idx:], "<mailto:"):
			end := strings.IndexByte(segment[idx:], '>')
			if end < 0 {
				rendered.WriteByte(segment[idx])
				plain.WriteByte(segment[idx])
				idx++
				continue
			}
			end += idx + 1
			appendPlaceholder(segment[idx:end])
			idx = end
		case looksLikeInlineHTMLTag(segment, idx):
			end := findJSXTagEnd(segment, idx)
			if end <= idx {
				rendered.WriteByte(segment[idx])
				plain.WriteByte(segment[idx])
				idx++
				continue
			}
			appendPlaceholder(segment[idx:end])
			idx = end
		case segment[idx] == '<' && idx+1 < len(segment) && segment[idx+1] == '/':
			end := strings.IndexByte(segment[idx:], '>')
			if end < 0 {
				rendered.WriteByte(segment[idx])
				plain.WriteByte(segment[idx])
				idx++
				continue
			}
			end += idx + 1
			appendPlaceholder(segment[idx:end])
			idx = end
		default:
			rendered.WriteByte(segment[idx])
			plain.WriteByte(segment[idx])
			idx++
		}
	}

	if len(placeholders) == 0 {
		return segment, nil, segment
	}
	return rendered.String(), placeholders, plain.String()
}

func looksLikeInlineHTMLTag(segment string, idx int) bool {
	if idx+1 >= len(segment) || segment[idx] != '<' {
		return false
	}
	next := segment[idx+1]
	if next == '/' {
		return idx+2 < len(segment) && isHTMLTagNameChar(segment[idx+2])
	}
	return isHTMLTagNameChar(next)
}

func isHTMLTagNameChar(ch byte) bool {
	return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z')
}

func markdownPlaceholderToken(idx int, literal string) string {
	return fmt.Sprintf("\x1eHLMDPH_%s_%d\x1f", strings.ToUpper(markdownPlaceholderHash(idx, literal)), idx)
}

func markdownPlaceholderHash(idx int, literal string) string {
	sum := sha256.Sum256([]byte(fmt.Sprintf("%d:%s", idx, literal)))
	return hex.EncodeToString(sum[:])[:12]
}
