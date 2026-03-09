package translationfileparser

import "strings"

type mdxKind string

const (
	mdxKindDocument             mdxKind = "document"
	mdxKindFrontmatter          mdxKind = "frontmatter"
	mdxKindFrontmatterDelimiter mdxKind = "frontmatter_delimiter"
	mdxKindText                 mdxKind = "text"
	mdxKindFence                mdxKind = "fence"
	mdxKindESM                  mdxKind = "esm"
	mdxKindJSXElement           mdxKind = "jsx_element"
	mdxKindJSXOpenTag           mdxKind = "jsx_open_tag"
	mdxKindJSXCloseTag          mdxKind = "jsx_close_tag"
	mdxKindMalformed            mdxKind = "malformed"
)

type mdxSpan struct {
	Start int
	End   int
}

type mdxNode struct {
	Kind               mdxKind
	Span               mdxSpan
	Parent             *mdxNode
	Children           []*mdxNode
	ContainerName      string
	ContainerSignature string
	LineKind           string
}

func (n *mdxNode) slice(source string) string {
	return source[n.Span.Start:n.Span.End]
}

func (n *mdxNode) appendChild(child *mdxNode) {
	if child == nil {
		return
	}
	child.Parent = n
	n.Children = append(n.Children, child)
}

type mdxCSTParser struct {
	source string
}

func parseMDXCST(content []byte) *mdxNode {
	source := strings.ReplaceAll(string(content), "\r\n", "\n")
	return parseMDXCSTFromSource(source)
}

func parseMDXCSTFromSource(source string) *mdxNode {
	parser := mdxCSTParser{source: source}
	root := &mdxNode{
		Kind: mdxKindDocument,
		Span: mdxSpan{Start: 0, End: len(source)},
	}
	parser.parseSequence(root, 0, "", true)
	return root
}

func (p mdxCSTParser) parseSequence(parent *mdxNode, offset int, closingName string, allowESM bool) (int, *mdxNode) {
	for offset < len(p.source) {
		if closingName != "" {
			if closeNode, next, ok := p.parseClosingTag(offset, closingName); ok {
				return next, closeNode
			}
		}

		if offset == 0 {
			if node, next, ok := p.parseFrontmatter(offset); ok {
				parent.appendChild(node)
				offset = next
				continue
			}
		}

		if node, next, ok := p.parseFence(offset); ok {
			parent.appendChild(node)
			offset = next
			continue
		}

		if allowESM {
			if node, next, ok := p.parseESM(offset); ok {
				parent.appendChild(node)
				offset = next
				continue
			}
		}

		if node, next, ok := p.parseFlowJSX(offset); ok {
			parent.appendChild(node)
			offset = next
			continue
		}

		node, next := p.parseText(offset, closingName, allowESM)
		parent.appendChild(node)
		offset = next
	}

	return offset, nil
}

func (p mdxCSTParser) parseFrontmatter(offset int) (*mdxNode, int, bool) {
	if offset != 0 {
		return nil, offset, false
	}
	lineEnd := mdxLineEnd(p.source, offset)
	if strings.TrimSpace(p.source[offset:lineEnd]) != "---" {
		return nil, offset, false
	}

	bodyStart := lineEnd
	cursor := lineEnd
	for cursor < len(p.source) {
		nextLineEnd := mdxLineEnd(p.source, cursor)
		if strings.TrimSpace(p.source[cursor:nextLineEnd]) == "---" {
			node := &mdxNode{
				Kind: mdxKindFrontmatter,
				Span: mdxSpan{Start: offset, End: nextLineEnd},
			}
			node.appendChild(&mdxNode{
				Kind: mdxKindFrontmatterDelimiter,
				Span: mdxSpan{Start: offset, End: lineEnd},
			})
			node.appendChild(&mdxNode{
				Kind: mdxKindText,
				Span: mdxSpan{Start: bodyStart, End: cursor},
			})
			node.appendChild(&mdxNode{
				Kind: mdxKindFrontmatterDelimiter,
				Span: mdxSpan{Start: cursor, End: nextLineEnd},
			})
			return node, nextLineEnd, true
		}
		cursor = nextLineEnd
	}

	return nil, offset, false
}

func (p mdxCSTParser) parseFence(offset int) (*mdxNode, int, bool) {
	lineEnd := mdxLineEnd(p.source, offset)
	line := p.source[offset:lineEnd]
	blockTrimmed := strings.TrimSpace(markdownBlockFenceLine(line))
	switch {
	case strings.HasPrefix(blockTrimmed, "```"):
		return p.parseFenceWithMarker(offset, "```")
	case strings.HasPrefix(blockTrimmed, "~~~"):
		return p.parseFenceWithMarker(offset, "~~~")
	default:
		return nil, offset, false
	}
}

func (p mdxCSTParser) parseFenceWithMarker(offset int, marker string) (*mdxNode, int, bool) {
	cursor := offset
	for cursor < len(p.source) {
		lineEnd := mdxLineEnd(p.source, cursor)
		line := p.source[cursor:lineEnd]
		if cursor != offset && strings.HasPrefix(strings.TrimSpace(markdownBlockFenceLine(line)), marker) {
			end := lineEnd
			return &mdxNode{
				Kind: mdxKindFence,
				Span: mdxSpan{Start: offset, End: end},
			}, end, true
		}
		cursor = lineEnd
	}

	return &mdxNode{
		Kind: mdxKindFence,
		Span: mdxSpan{Start: offset, End: len(p.source)},
	}, len(p.source), true
}

func (p mdxCSTParser) parseESM(offset int) (*mdxNode, int, bool) {
	lineEnd := mdxLineEnd(p.source, offset)
	line := p.source[offset:lineEnd]
	if !looksLikeMDXESMStart(strings.TrimSpace(line)) {
		return nil, offset, false
	}

	end, ok, failEnd := scanMDXESMBlock(p.source, offset)
	if ok {
		return &mdxNode{
			Kind: mdxKindESM,
			Span: mdxSpan{Start: offset, End: end},
		}, end, true
	}

	return &mdxNode{
		Kind: mdxKindMalformed,
		Span: mdxSpan{Start: offset, End: failEnd},
	}, failEnd, true
}

func (p mdxCSTParser) parseFlowJSX(offset int) (*mdxNode, int, bool) {
	lineEnd := mdxLineEnd(p.source, offset)
	line := p.source[offset:lineEnd]
	tagStart, _, ok := mdxTopLevelJSXStart(line)
	if !ok {
		return nil, offset, false
	}

	absTagStart := offset + tagStart
	tagEnd, closed, failEnd := scanMDXTagLiteral(p.source, absTagStart)
	if !closed {
		return &mdxNode{
			Kind: mdxKindMalformed,
			Span: mdxSpan{Start: offset, End: failEnd},
		}, failEnd, true
	}

	tagLineEnd := mdxLineEnd(p.source, tagEnd)
	container, closing, selfClosing, ok := mdxParseContainerLiteral(p.source[absTagStart:tagEnd])
	if !ok || closing {
		return nil, offset, false
	}

	node := &mdxNode{
		Kind:               mdxKindJSXElement,
		Span:               mdxSpan{Start: offset, End: tagEnd},
		ContainerName:      container.name,
		ContainerSignature: container.signature,
	}
	node.appendChild(&mdxNode{
		Kind:               mdxKindJSXOpenTag,
		Span:               mdxSpan{Start: offset, End: tagEnd},
		ContainerName:      container.name,
		ContainerSignature: container.signature,
	})
	if selfClosing {
		if tagEnd < tagLineEnd {
			node.appendChild(&mdxNode{
				Kind: mdxKindText,
				Span: mdxSpan{Start: tagEnd, End: tagLineEnd},
			})
			node.Span.End = tagLineEnd
		}
		return node, tagLineEnd, true
	}

	if closeNode, closeEnd, ok := p.parseInlineClosingRemainder(tagEnd, tagLineEnd, container.name); ok {
		if tagEnd < closeNode.Span.Start {
			node.appendChild(&mdxNode{
				Kind: mdxKindText,
				Span: mdxSpan{Start: tagEnd, End: closeNode.Span.Start},
			})
		}
		node.appendChild(closeNode)
		if closeNode.Span.End < closeEnd {
			node.appendChild(&mdxNode{
				Kind: mdxKindText,
				Span: mdxSpan{Start: closeNode.Span.End, End: closeEnd},
			})
		}
		node.Span.End = closeEnd
		return node, closeEnd, true
	}

	if tagEnd < tagLineEnd {
		node.appendChild(&mdxNode{
			Kind: mdxKindText,
			Span: mdxSpan{Start: tagEnd, End: tagLineEnd},
		})
		node.Span.End = tagLineEnd
	}

	next, closeNode := p.parseSequence(node, tagLineEnd, container.name, false)
	if closeNode == nil {
		failEnd = len(p.source)
		if next > offset {
			failEnd = next
		}
		return &mdxNode{
			Kind: mdxKindMalformed,
			Span: mdxSpan{Start: offset, End: failEnd},
		}, failEnd, true
	}

	node.appendChild(closeNode)
	node.Span.End = closeNode.Span.End
	return node, node.Span.End, true
}

func (p mdxCSTParser) parseInlineClosingRemainder(start, lineEnd int, name string) (*mdxNode, int, bool) {
	for idx := start; idx < lineEnd; idx++ {
		if p.source[idx] != '<' || !looksLikeJSXTagStart(p.source, idx) {
			continue
		}
		tagEnd, closed, _ := scanMDXTagLiteral(p.source, idx)
		if !closed || tagEnd > lineEnd {
			continue
		}
		container, closing, _, ok := mdxParseContainerLiteral(p.source[idx:tagEnd])
		if !ok || !closing || container.name != name {
			continue
		}
		return &mdxNode{
			Kind:               mdxKindJSXCloseTag,
			Span:               mdxSpan{Start: idx, End: tagEnd},
			ContainerName:      container.name,
			ContainerSignature: container.signature,
		}, lineEnd, true
	}
	return nil, lineEnd, false
}

func (p mdxCSTParser) parseClosingTag(offset int, name string) (*mdxNode, int, bool) {
	lineEnd := mdxLineEnd(p.source, offset)
	line := p.source[offset:lineEnd]
	tagStart, jsxOnly, ok := mdxTopLevelJSXStart(line)
	if !ok || !jsxOnly {
		return nil, offset, false
	}

	absTagStart := offset + tagStart
	tagEnd, closed, _ := scanMDXTagLiteral(p.source, absTagStart)
	if !closed {
		return nil, offset, false
	}

	tagLineEnd := mdxLineEnd(p.source, tagEnd)
	if strings.TrimSpace(p.source[tagEnd:tagLineEnd]) != "" {
		return nil, offset, false
	}

	container, closing, _, ok := mdxParseContainerLiteral(p.source[absTagStart:tagEnd])
	if !ok || !closing || container.name != name {
		return nil, offset, false
	}

	return &mdxNode{
		Kind:               mdxKindJSXCloseTag,
		Span:               mdxSpan{Start: offset, End: tagLineEnd},
		ContainerName:      container.name,
		ContainerSignature: container.signature,
	}, tagLineEnd, true
}

func (p mdxCSTParser) parseText(offset int, closingName string, allowESM bool) (*mdxNode, int) {
	start := offset
	for offset < len(p.source) {
		if closingName != "" {
			if _, _, ok := p.parseClosingTag(offset, closingName); ok {
				break
			}
		}
		if offset == 0 {
			if _, _, ok := p.parseFrontmatter(offset); ok {
				break
			}
		}
		if _, _, ok := p.parseFence(offset); ok {
			break
		}
		if allowESM {
			if _, _, ok := p.parseESM(offset); ok {
				break
			}
		}
		if _, _, ok := p.parseFlowJSX(offset); ok {
			break
		}
		offset = mdxLineEnd(p.source, offset)
	}
	if offset == start {
		offset = mdxLineEnd(p.source, offset)
	}
	return &mdxNode{
		Kind: mdxKindText,
		Span: mdxSpan{Start: start, End: offset},
	}, offset
}

func mdxLineEnd(source string, start int) int {
	end := start
	for end < len(source) && source[end] != '\n' {
		end++
	}
	if end < len(source) && source[end] == '\n' {
		end++
	}
	return end
}

func scanUntilBlankLine(source string, start int) int {
	cursor := start
	for cursor < len(source) {
		lineEnd := mdxLineEnd(source, cursor)
		if strings.TrimSpace(source[cursor:lineEnd]) == "" {
			return lineEnd
		}
		cursor = lineEnd
	}
	return len(source)
}

func mdxContinuationOffset(line string) int {
	idx := 0
	for idx < len(line) && (line[idx] == ' ' || line[idx] == '\t') {
		idx++
	}

	cursor := idx
	for cursor < len(line) && line[cursor] == '>' {
		next := cursor + 1
		if next < len(line) && line[next] == ' ' {
			next++
		}
		if next >= len(line) || line[next] == '\n' {
			break
		}
		cursor = next
		for cursor < len(line) && (line[cursor] == ' ' || line[cursor] == '\t') {
			cursor++
		}
	}

	return cursor
}

func mdxTopLevelJSXStart(line string) (int, bool, bool) {
	_, body := splitMarkdownLinePrefix(line)
	lead := len(line) - len(body)
	for i := 0; i < len(body); i++ {
		if body[i] == ' ' || body[i] == '\t' {
			lead++
			continue
		}
		if body[i] != '<' || !looksLikeJSXTagStart(body, i) {
			return 0, false, false
		}
		state := markdownParseState{}
		literal, rest, consumed := consumeLeadingJSXLiteral(body[i:], &state)
		if !consumed {
			return 0, false, false
		}
		_ = literal
		rest = strings.TrimSuffix(rest, "\n")
		rest, _ = stripTrailingJSXClosingLiterals(rest)
		return lead + i, strings.TrimSpace(rest) == "", true
	}
	return 0, false, false
}

func scanMDXTagLiteral(source string, start int) (int, bool, int) {
	if start >= len(source) || source[start] != '<' {
		return start, false, start
	}

	lineStart := start
	for lineStart > 0 && source[lineStart-1] != '\n' {
		lineStart--
	}

	for idx := start + 1; idx < len(source); {
		switch source[idx] {
		case '\'':
			end, ok := consumeJSQuotedString(source, idx, '\'')
			if !ok {
				return len(source), false, len(source)
			}
			idx = end
		case '"':
			end, ok := consumeJSQuotedString(source, idx, '"')
			if !ok {
				return len(source), false, len(source)
			}
			idx = end
		case '{':
			end, ok := scanMDXExpression(source, idx)
			if !ok {
				failEnd := scanUntilBlankLine(source, lineStart)
				return failEnd, false, failEnd
			}
			idx = end
		case '\n':
			if strings.TrimSpace(source[lineStart:idx+1]) == "" {
				return idx + 1, false, idx + 1
			}
			lineStart = idx + 1
			nextLineEnd := mdxLineEnd(source, lineStart)
			if nextLineEnd > lineStart {
				idx = lineStart + mdxContinuationOffset(source[lineStart:nextLineEnd])
				continue
			}
			idx++
		case '>':
			return idx + 1, true, 0
		default:
			idx++
		}
	}

	return len(source), false, len(source)
}

type jsBalanceState struct {
	BraceDepth     int
	ParenDepth     int
	BracketDepth   int
	Quote          byte
	InTemplate     bool
	InBlockComment bool
	Escaped        bool
	Complete       bool
}

func scanMDXESMBlock(source string, start int) (int, bool, int) {
	cursor := start
	state := jsBalanceState{Complete: true}
	for cursor < len(source) {
		lineEnd := mdxLineEnd(source, cursor)
		state = scanJSBalanceState(state, source[cursor:lineEnd])
		if state.Complete &&
			state.BraceDepth == 0 &&
			state.ParenDepth == 0 &&
			state.BracketDepth == 0 &&
			state.Quote == 0 &&
			!state.InTemplate &&
			!state.InBlockComment &&
			!jsLineRequiresContinuation(source[cursor:lineEnd]) {
			return lineEnd, true, 0
		}
		cursor = lineEnd
	}
	return len(source), false, len(source)
}

func scanJSBalanceState(state jsBalanceState, segment string) jsBalanceState {
	if !state.Complete {
		return state
	}
	for idx := 0; idx < len(segment); {
		if state.InBlockComment {
			end := strings.Index(segment[idx:], "*/")
			if end < 0 {
				return state
			}
			idx += end + 2
			state.InBlockComment = false
			continue
		}
		if state.Quote != 0 {
			end, ok := consumeJSQuotedStringState(segment, idx, &state)
			if !ok {
				return state
			}
			idx = end
			continue
		}
		if state.InTemplate {
			end, ok := consumeJSTemplateLiteralState(segment, idx, &state)
			if !ok {
				return state
			}
			idx = end
			continue
		}
		switch segment[idx] {
		case '\'':
			state.Quote = '\''
			end, _ := consumeJSQuotedStringState(segment, idx, &state)
			idx = end
		case '"':
			state.Quote = '"'
			end, _ := consumeJSQuotedStringState(segment, idx, &state)
			idx = end
		case '`':
			state.InTemplate = true
			end, _ := consumeJSTemplateLiteralState(segment, idx, &state)
			idx = end
		case '/':
			switch {
			case idx+1 < len(segment) && segment[idx+1] == '/':
				idx = consumeJSLineComment(segment, idx)
			case idx+1 < len(segment) && segment[idx+1] == '*':
				state.InBlockComment = true
				idx += 2
			default:
				idx++
			}
		case '{':
			state.BraceDepth++
			idx++
		case '}':
			if state.BraceDepth > 0 {
				state.BraceDepth--
			}
			idx++
		case '(':
			state.ParenDepth++
			idx++
		case ')':
			if state.ParenDepth > 0 {
				state.ParenDepth--
			}
			idx++
		case '[':
			state.BracketDepth++
			idx++
		case ']':
			if state.BracketDepth > 0 {
				state.BracketDepth--
			}
			idx++
		default:
			idx++
		}
	}
	return state
}

func jsLineRequiresContinuation(line string) bool {
	trimmed := strings.TrimSpace(strings.TrimRight(line, "\n"))
	if trimmed == "" {
		return false
	}

	last := trimmed[len(trimmed)-1]
	switch last {
	case '=', '(', '[', '{', ',', '+', '-', '*', '/', '%', '&', '|', '^', '<', '>':
		return true
	}
	if strings.HasSuffix(trimmed, "=>") {
		return true
	}
	if strings.HasSuffix(trimmed, "from") {
		return true
	}

	if strings.HasPrefix(trimmed, "import ") {
		rest := strings.TrimSpace(strings.TrimPrefix(trimmed, "import "))
		switch {
		case rest == "":
			return true
		case strings.HasPrefix(rest, "\""), strings.HasPrefix(rest, "'"), strings.Contains(rest, " from "):
			return false
		case strings.HasPrefix(rest, "{"), strings.HasPrefix(rest, "*"):
			return true
		case strings.Contains(rest, ","):
			return true
		default:
			return false
		}
	}

	if strings.HasPrefix(trimmed, "export default") {
		rest := strings.TrimSpace(strings.TrimPrefix(trimmed, "export default"))
		return rest == ""
	}

	return false
}

func looksLikeMDXESMStart(trimmed string) bool {
	if isMDXESMStatement(trimmed) {
		return true
	}
	if strings.HasPrefix(trimmed, "import ") {
		rest := strings.TrimSpace(strings.TrimPrefix(trimmed, "import "))
		switch {
		case rest == "":
			return false
		case strings.HasPrefix(rest, "{"), strings.HasPrefix(rest, "*"):
			return true
		case strings.Contains(rest, ","):
			return true
		case strings.HasSuffix(rest, " from"):
			return true
		default:
			return false
		}
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
		return jsLineRequiresContinuation(trimmed)
	default:
		return false
	}
}

func consumeJSQuotedString(source string, start int, quote byte) (int, bool) {
	state := jsBalanceState{Complete: true, Quote: quote}
	end, ok := consumeJSQuotedStringState(source, start, &state)
	return end, ok && state.Quote == 0
}

func consumeJSTemplateLiteral(source string, start int) (int, bool) {
	state := jsBalanceState{Complete: true, InTemplate: true}
	end, ok := consumeJSTemplateLiteralState(source, start, &state)
	return end, ok && !state.InTemplate
}

func consumeJSLineComment(source string, start int) int {
	idx := start + 2
	for idx < len(source) && source[idx] != '\n' {
		idx++
	}
	return idx
}

func consumeJSBlockComment(source string, start int) (int, bool) {
	idx := strings.Index(source[start+2:], "*/")
	if idx < 0 {
		return len(source), false
	}
	return start + 2 + idx + 2, true
}

func consumeJSQuotedStringState(source string, start int, state *jsBalanceState) (int, bool) {
	idx := start
	if state.Quote != 0 && start < len(source) && source[start] == state.Quote {
		idx++
	}
	for ; idx < len(source); idx++ {
		switch source[idx] {
		case '\\':
			idx++
		case state.Quote:
			state.Quote = 0
			return idx + 1, true
		}
	}
	return len(source), true
}

func consumeJSTemplateLiteralState(source string, start int, state *jsBalanceState) (int, bool) {
	idx := start
	if state.InTemplate && start < len(source) && source[start] == '`' {
		idx++
	}
	for ; idx < len(source); idx++ {
		switch source[idx] {
		case '\\':
			idx++
		case '`':
			state.InTemplate = false
			return idx + 1, true
		case '$':
			if idx+1 < len(source) && source[idx+1] == '{' {
				end, ok := scanMDXExpression(source, idx+1)
				if !ok {
					state.Complete = false
					return len(source), false
				}
				idx = end - 1
			}
		}
	}
	return len(source), true
}

func scanMDXExpression(source string, start int) (int, bool) {
	if start >= len(source) || source[start] != '{' {
		return start, false
	}

	depth := 1
	for idx := start + 1; idx < len(source); {
		switch source[idx] {
		case '\'':
			end, ok := consumeJSQuotedString(source, idx, '\'')
			if !ok {
				return len(source), false
			}
			idx = end
		case '"':
			end, ok := consumeJSQuotedString(source, idx, '"')
			if !ok {
				return len(source), false
			}
			idx = end
		case '`':
			end, ok := consumeJSTemplateLiteral(source, idx)
			if !ok {
				return len(source), false
			}
			idx = end
		case '/':
			switch {
			case idx+1 < len(source) && source[idx+1] == '/':
				idx = consumeJSLineComment(source, idx)
			case idx+1 < len(source) && source[idx+1] == '*':
				end, ok := consumeJSBlockComment(source, idx)
				if !ok {
					return len(source), false
				}
				idx = end
			default:
				idx++
			}
		case '{':
			depth++
			idx++
		case '}':
			depth--
			idx++
			if depth == 0 {
				return idx, true
			}
		default:
			idx++
		}
	}

	return len(source), false
}
