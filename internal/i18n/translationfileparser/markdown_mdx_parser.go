package translationfileparser

import (
	"fmt"
	"strings"
)

type mdxContainer struct {
	name      string
	signature string
}

type mdxPathState struct {
	textOrdinals map[string]int
}

func parseMarkdownMDXDocument(content []byte) (markdownDocument, map[string]string) {
	source := strings.ReplaceAll(string(content), "\r\n", "\n")
	root := parseMDXCSTFromSource(source)
	return extractMDXDocument(root, source)
}

func extractMDXDocument(root *mdxNode, source string) (markdownDocument, map[string]string) {
	doc := markdownDocument{parts: make([]markdownPart, 0, len(root.Children)*2+1)}
	entries := map[string]string{}
	hashOccurrences := map[string]int{}
	pathState := mdxPathState{textOrdinals: map[string]int{}}
	parserState := markdownParseState{}
	extractState := mdxExtractState{
		source:          source,
		doc:             &doc,
		entries:         entries,
		hashOccurrences: hashOccurrences,
		pathState:       &pathState,
		parserState:     &parserState,
	}

	extractState.walk(root, nil)
	return doc, entries
}

type mdxExtractState struct {
	source          string
	doc             *markdownDocument
	entries         map[string]string
	hashOccurrences map[string]int
	pathState       *mdxPathState
	parserState     *markdownParseState
	prevTrimmed     string
}

func (s *mdxExtractState) walk(node *mdxNode, stack []mdxContainer) {
	switch node.Kind {
	case mdxKindDocument:
		for _, child := range node.Children {
			s.walk(child, stack)
		}
	case mdxKindFrontmatter:
		for idx, child := range node.Children {
			switch {
			case idx == 1 && child.Kind == mdxKindText:
				s.emitFrontmatterText(child.slice(s.source))
			default:
				s.appendLiteral(child.slice(s.source))
			}
		}
	case mdxKindText:
		s.emitMarkdownText(node.slice(s.source), stack)
	case mdxKindFence, mdxKindESM, mdxKindMalformed, mdxKindJSXOpenTag, mdxKindJSXCloseTag:
		s.appendLiteral(node.slice(s.source))
	case mdxKindJSXElement:
		var nextStack []mdxContainer
		for idx, child := range node.Children {
			if idx == 0 && child.Kind == mdxKindJSXOpenTag {
				s.appendLiteral(child.slice(s.source))
				nextStack = stack
				if node.ContainerSignature != "" {
					nextStack = append(append([]mdxContainer(nil), stack...), mdxContainer{
						name:      node.ContainerName,
						signature: node.ContainerSignature,
					})
				}
				continue
			}
			if child.Kind == mdxKindJSXCloseTag {
				s.appendLiteral(child.slice(s.source))
				continue
			}
			s.walk(child, nextStack)
		}
	}
}

func (s *mdxExtractState) emitFrontmatterText(text string) {
	appendKey := func(part markdownPart) {
		key := markdownSegmentKey(part.source, s.hashOccurrences)
		part.key = key
		s.doc.parts = append(s.doc.parts, part)
		s.entries[key] = part.source
	}
	for _, line := range strings.SplitAfter(text, "\n") {
		if line == "" {
			continue
		}
		emitFrontmatterLineParts(line, s.doc, func(part markdownPart) {
			appendKey(part)
		})
		s.prevTrimmed = strings.TrimSpace(line)
	}
}

func (s *mdxExtractState) emitMarkdownText(text string, stack []mdxContainer) {
	appendKey := func(part markdownPart) {
		key := markdownSegmentKey(part.source, s.hashOccurrences)
		part.key = key
		s.doc.parts = append(s.doc.parts, part)
		s.entries[key] = part.source
	}
	for _, line := range strings.SplitAfter(text, "\n") {
		if line == "" {
			continue
		}
		trimmed := strings.TrimSpace(line)
		if len(stack) == 0 && isIndentedCodeLine(line) && s.prevTrimmed == "" {
			s.doc.parts = append(s.doc.parts, markdownPart{literal: line})
			s.prevTrimmed = trimmed
			continue
		}
		path := s.pathState.nextTextPath(line, stack)
		emitMarkdownLineParts(line, s.doc, appendKey, s.parserState, path)
		s.prevTrimmed = trimmed
	}
}

func (s *mdxExtractState) appendLiteral(literal string) {
	s.doc.parts = append(s.doc.parts, markdownPart{literal: literal})
	s.prevTrimmed = strings.TrimSpace(lastLine(literal))
}

func lastLine(region string) string {
	if region == "" {
		return ""
	}
	idx := strings.LastIndex(region, "\n")
	if idx < 0 {
		return region
	}
	if idx == len(region)-1 {
		region = region[:idx]
		idx = strings.LastIndex(region, "\n")
		if idx < 0 {
			return region
		}
	}
	return region[idx+1:]
}

func (s *mdxPathState) nextTextPath(line string, stack []mdxContainer) string {
	base := "mdx/root"
	for _, container := range stack {
		base += "/jsx/" + container.signature
	}
	base += "/" + mdxLineKind(line)
	ordinal := s.textOrdinals[base]
	s.textOrdinals[base] = ordinal + 1
	return fmt.Sprintf("%s/text[%d]", base, ordinal)
}

func mdxLineKind(line string) string {
	trimmed := strings.TrimSpace(line)
	switch {
	case strings.HasPrefix(trimmed, "#"):
		return "heading"
	case strings.HasPrefix(trimmed, ">"):
		return "blockquote"
	case hasBulletPrefix(strings.TrimLeft(line, " \t")) || hasOrderedPrefix(strings.TrimLeft(line, " \t")):
		return "list"
	default:
		return "flow"
	}
}

func mdxParseContainerLiteral(literal string) (mdxContainer, bool, bool, bool) {
	trimmed := strings.TrimSpace(literal)
	if trimmed == "" || !strings.HasPrefix(trimmed, "<") || !strings.HasSuffix(trimmed, ">") {
		return mdxContainer{}, false, false, false
	}
	if trimmed == "<>" {
		return mdxContainer{name: "fragment", signature: "fragment"}, false, false, true
	}
	if trimmed == "</>" {
		return mdxContainer{name: "fragment", signature: "fragment"}, true, false, true
	}

	closing := strings.HasPrefix(trimmed, "</")
	start := 1
	if closing {
		start = 2
	}
	if start >= len(trimmed) {
		return mdxContainer{}, false, false, false
	}

	end := start
	for end < len(trimmed) && isMDXTagNameByte(trimmed[end]) {
		end++
	}
	if end == start {
		return mdxContainer{}, false, false, false
	}

	name := trimmed[start:end]
	selfClosing := !closing && strings.HasSuffix(strings.TrimSpace(strings.TrimSuffix(trimmed, ">")), "/")
	signature := name + "[" + markdownPlaceholderHash(0, trimmed) + "]"
	return mdxContainer{name: name, signature: signature}, closing, selfClosing, true
}

func isMDXTagNameByte(ch byte) bool {
	return (ch >= 'a' && ch <= 'z') ||
		(ch >= 'A' && ch <= 'Z') ||
		(ch >= '0' && ch <= '9') ||
		ch == '_' ||
		ch == '-' ||
		ch == ':' ||
		ch == '.'
}

func isMDXESMStatement(trimmed string) bool {
	if trimmed == "" {
		return false
	}
	if strings.HasPrefix(trimmed, "import ") {
		rest := strings.TrimSpace(strings.TrimPrefix(trimmed, "import "))
		return strings.HasPrefix(rest, "\"") || strings.HasPrefix(rest, "'") || strings.Contains(rest, " from ")
	}
	if !strings.HasPrefix(trimmed, "export ") {
		return false
	}

	rest := strings.TrimSpace(strings.TrimPrefix(trimmed, "export "))
	switch {
	case strings.HasPrefix(rest, "{"):
		return true
	case strings.HasPrefix(rest, "*"):
		return true
	case strings.HasPrefix(rest, "const "):
		return true
	case strings.HasPrefix(rest, "let "):
		return true
	case strings.HasPrefix(rest, "var "):
		return true
	case strings.HasPrefix(rest, "function "):
		return true
	case strings.HasPrefix(rest, "class "):
		return true
	case strings.HasPrefix(rest, "async function "):
		return true
	case strings.HasPrefix(rest, "default "):
		return isMDXExportDefaultStatement(strings.TrimSpace(strings.TrimPrefix(rest, "default ")))
	default:
		return false
	}
}

func isMDXExportDefaultStatement(rest string) bool {
	if rest == "" {
		return false
	}
	switch rest[0] {
	case '{', '[', '(', '"', '\'', '`':
		return true
	}
	if rest[0] >= '0' && rest[0] <= '9' {
		return true
	}
	if strings.HasPrefix(rest, "function ") || strings.HasPrefix(rest, "class ") || strings.HasPrefix(rest, "async function ") {
		return true
	}
	if strings.ContainsAny(rest, "=([{;:+-*/%!&|<>?") {
		return true
	}
	fields := strings.Fields(rest)
	if len(fields) == 1 && strings.Contains(rest, ".") {
		return true
	}
	return len(fields) == 1
}
