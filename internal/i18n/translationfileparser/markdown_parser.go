package translationfileparser

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"math"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"unicode"
)

var markdownPlaceholderPattern = regexp.MustCompile("\x1eHLMDPH_[A-Z0-9_]+_(\\d+)\x1f")

type markdownPart struct {
	literal      string
	key          string
	source       string
	placeholders map[string]string
	path         string
	yamlPlain    bool
}

type markdownDocument struct {
	parts []markdownPart
}

type markdownParseState struct {
	inJSXTag      bool
	jsxQuote      byte
	jsxEscaped    bool
	jsxBraceDepth int
}

type markdownKeyContext struct {
	text        string
	prevLiteral string
	nextLiteral string
	partIndex   int
	path        string
}

type MarkdownRenderDiagnostics struct {
	SourceFallbackKeys []string
}

// MarkdownASTPaths extracts stable structural paths for markdown or mdx text nodes.
func MarkdownASTPaths(content []byte, mdx bool) []string {
	doc, _ := parseMarkdownDocument(stripBOM(content), mdx)
	contexts := doc.keyContexts()
	paths := make([]string, 0, len(contexts))
	for _, ctx := range contexts {
		paths = append(paths, ctx.path)
	}
	slices.Sort(paths)
	paths = slices.Compact(paths)
	return paths
}

// LineForMarkdownKey returns the 1-based source line of the first translatable markdown or MDX segment
// with the given key (for example md.<hash>), or 0 if the key is not present.
func LineForMarkdownKey(content []byte, mdx bool, key string) int {
	doc, _ := parseMarkdownDocument(stripBOM(content), mdx)
	line := 1
	for _, part := range doc.parts {
		if part.key == key {
			return line
		}
		line += strings.Count(part.literal, "\n")
	}
	return 0
}

func (d markdownDocument) keyContexts() []markdownKeyContext {
	out := make([]markdownKeyContext, 0)
	for i, part := range d.parts {
		if part.key == "" {
			continue
		}
		prev := ""
		if i > 0 && d.parts[i-1].key == "" {
			prev = d.parts[i-1].literal
		}
		next := ""
		if i+1 < len(d.parts) && d.parts[i+1].key == "" {
			next = d.parts[i+1].literal
		}
		out = append(out, markdownKeyContext{text: renderMarkdownPart(part, part.source), prevLiteral: prev, nextLiteral: next, partIndex: i, path: part.path})
	}
	return out
}

func markdownSegmentKey(segment string, occurrences map[string]int) string {
	sum := sha256.Sum256([]byte(segment))
	hash := hex.EncodeToString(sum[:])[:16]
	count := occurrences[hash]
	occurrences[hash] = count + 1
	if count == 0 {
		return fmt.Sprintf("md.%s", hash)
	}
	return fmt.Sprintf("md.%s.%d", hash, count+1)
}

func emitMarkdownLineParts(line string, doc *markdownDocument, appendKey func(markdownPart), state *markdownParseState, path string) {
	prefix := ""
	body := line
	if state.inJSXTag && strings.TrimSpace(line) == "" {
		doc.parts = append(doc.parts, markdownPart{literal: line})
		state.inJSXTag = false
		state.jsxQuote = 0
		state.jsxEscaped = false
		state.jsxBraceDepth = 0
		return
	}
	if !state.inJSXTag {
		prefix, body = splitMarkdownLinePrefix(line)
	}
	if prefix != "" {
		doc.parts = append(doc.parts, markdownPart{literal: prefix})
	}
	if body == "" {
		return
	}

	newline := ""
	if strings.HasSuffix(body, "\n") {
		newline = "\n"
		body = strings.TrimSuffix(body, "\n")
	}

	var literal string
	var consumed bool
	literal, body, consumed = consumeLeadingJSXLiteral(body, state)
	if consumed {
		doc.parts = append(doc.parts, markdownPart{literal: literal})
	}

	body, trailingLiterals := stripTrailingJSXClosingLiterals(body)
	for {
		literal, body, consumed = consumeLeadingJSXLiteral(body, state)
		if !consumed {
			break
		}
		doc.parts = append(doc.parts, markdownPart{literal: literal})
	}
	if body == "" {
		for _, literal := range trailingLiterals {
			doc.parts = append(doc.parts, markdownPart{literal: literal})
		}
		if newline != "" {
			doc.parts = append(doc.parts, markdownPart{literal: newline})
		}
		return
	}

	placeholdered, placeholders, plainText, malformed := protectMarkdownInlineSyntax(body)
	if malformed {
		doc.parts = append(doc.parts, markdownPart{literal: body})
		for _, literal := range trailingLiterals {
			doc.parts = append(doc.parts, markdownPart{literal: literal})
		}
		if newline != "" {
			doc.parts = append(doc.parts, markdownPart{literal: newline})
		}
		return
	}
	if !isTranslatableChunk(plainText) {
		doc.parts = append(doc.parts, markdownPart{literal: body})
		for _, literal := range trailingLiterals {
			doc.parts = append(doc.parts, markdownPart{literal: literal})
		}
		if newline != "" {
			doc.parts = append(doc.parts, markdownPart{literal: newline})
		}
		return
	}
	appendKey(markdownPart{source: placeholdered, placeholders: placeholders, path: path})
	for _, literal := range trailingLiterals {
		doc.parts = append(doc.parts, markdownPart{literal: literal})
	}
	if newline != "" {
		doc.parts = append(doc.parts, markdownPart{literal: newline})
	}
}

func findBraceExpressionEnd(line string, start int) (int, bool) {
	return scanMDXExpression(line, start)
}

func looksLikeJSXTagStart(line string, idx int) bool {
	if idx+1 >= len(line) {
		return false
	}
	next := line[idx+1]
	if next == '>' {
		return true
	}
	if next == '/' || next == '!' || next == '?' {
		return true
	}
	if (next >= 'A' && next <= 'Z') || (next >= 'a' && next <= 'z') {
		return !strings.HasPrefix(line[idx+1:], "http")
	}
	return false
}

func findJSXTagEnd(line string, start int) int {
	end, closed, _ := scanMDXTagLiteral(line, start)
	if !closed {
		return len(line)
	}
	return end
}

func findMarkdownLinkDestinationEnd(line string, start int) int {
	depth := 1
	for idx := start; idx < len(line); idx++ {
		if line[idx] == '\\' {
			idx++
			continue
		}

		switch line[idx] {
		case '(':
			depth++
		case ')':
			depth--
			if depth == 0 {
				return idx + 1
			}
		}
	}

	return len(line)
}

func splitMarkdownLinePrefix(line string) (string, string) {
	idx := 0
	for idx < len(line) && (line[idx] == ' ' || line[idx] == '\t') {
		idx++
	}

	// Preserve one or more blockquote markers as structural prefix.
	for idx < len(line) && line[idx] == '>' {
		idx++
		for idx < len(line) && line[idx] == ' ' {
			idx++
		}
	}

	switch {
	case hasHeadingPrefix(line[idx:]):
		for idx < len(line) && line[idx] == '#' {
			idx++
		}
		if idx < len(line) && line[idx] == ' ' {
			idx++
		}
	case hasBulletPrefix(line[idx:]):
		idx += 2
	case hasOrderedPrefix(line[idx:]):
		for idx < len(line) && line[idx] >= '0' && line[idx] <= '9' {
			idx++
		}
		if idx < len(line) && line[idx] == '.' {
			idx++
		}
		if idx < len(line) && line[idx] == ' ' {
			idx++
		}
	}

	return line[:idx], line[idx:]
}

func hasHeadingPrefix(s string) bool {
	if s == "" || s[0] != '#' {
		return false
	}
	count := 0
	for count < len(s) && s[count] == '#' {
		count++
	}
	return count > 0 && count <= 6 && count < len(s) && s[count] == ' '
}

func hasBulletPrefix(s string) bool {
	if len(s) < 2 || (s[0] != '-' && s[0] != '+' && s[0] != '*') || s[1] != ' ' {
		return false
	}
	if (s[0] == '-' || s[0] == '*') && isThematicBreak(s) {
		return false
	}
	return true
}

func hasOrderedPrefix(s string) bool {
	if s == "" || s[0] < '0' || s[0] > '9' {
		return false
	}
	idx := 0
	for idx < len(s) && s[idx] >= '0' && s[idx] <= '9' {
		idx++
	}
	return idx+1 < len(s) && s[idx] == '.' && s[idx+1] == ' '
}

func protectMarkdownInlineSyntax(segment string) (string, map[string]string, string, bool) {
	var rendered strings.Builder
	var plain strings.Builder
	placeholders := map[string]string{}
	placeholderCount := 0

	appendPlaceholder := func(literal string) {
		sum := sha256.Sum256([]byte(fmt.Sprintf("%d:%s", placeholderCount, literal)))
		placeholder := fmt.Sprintf("\x1eHLMDPH_%s_%d\x1f", strings.ToUpper(hex.EncodeToString(sum[:])[:12]), placeholderCount)
		placeholderCount++
		// Placeholder sentinels are exposed through Parse() and must survive translation
		// round-trips so renderMarkdownPart can restore protected markdown/JSX literals.
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
		case segment[idx] == '{':
			end, closed := findBraceExpressionEnd(segment, idx)
			if !closed {
				return segment, nil, segment, true
			}
			appendPlaceholder(segment[idx:end])
			idx = end
		case segment[idx] == '<' && looksLikeJSXTagStart(segment, idx):
			// This protection pass is single-line in scope. If an inline JSX tag
			// does not close within the current segment, the rest of the segment is
			// protected here; multi-line inline JSX continuation is handled by the
			// parser state in emitMarkdownLineParts.
			end := findJSXTagEnd(segment, idx)
			if end == len(segment) {
				return segment, nil, segment, true
			}
			appendPlaceholder(segment[idx:end])
			idx = end
		default:
			rendered.WriteByte(segment[idx])
			plain.WriteByte(segment[idx])
			idx++
		}
	}

	if len(placeholders) == 0 {
		return segment, nil, segment, false
	}
	return rendered.String(), placeholders, plain.String(), false
}

func findMarkdownReferenceDefinitionDestination(segment string) (int, int, bool) {
	trimmed := strings.TrimLeft(segment, " \t")
	leading := len(segment) - len(trimmed)
	if !strings.HasPrefix(trimmed, "[") {
		return 0, 0, false
	}
	closeBracket := strings.IndexByte(trimmed, ']')
	if closeBracket <= 1 || closeBracket+1 >= len(trimmed) || trimmed[closeBracket+1] != ':' {
		return 0, 0, false
	}

	destStart := closeBracket + 2
	for destStart < len(trimmed) && (trimmed[destStart] == ' ' || trimmed[destStart] == '\t') {
		destStart++
	}
	if destStart >= len(trimmed) {
		return 0, 0, false
	}

	destEnd := destStart
	if trimmed[destStart] == '<' {
		destEnd = strings.IndexByte(trimmed[destStart+1:], '>')
		if destEnd < 0 {
			return 0, 0, false
		}
		destEnd += destStart + 2
	} else {
		for destEnd < len(trimmed) && trimmed[destEnd] != ' ' && trimmed[destEnd] != '\t' {
			destEnd++
		}
	}

	return leading + destStart, leading + destEnd, true
}

func consumeLeadingJSXLiteral(body string, state *markdownParseState) (string, string, bool) {
	if body == "" {
		return "", body, false
	}
	start := 0
	if !state.inJSXTag {
		for start < len(body) && (body[start] == ' ' || body[start] == '\t') {
			start++
		}
		if start >= len(body) || body[start] != '<' || !looksLikeJSXTagStart(body, start) {
			return "", body, false
		}
	}

	end, closed := scanJSXTagFragment(body, start, state)
	if closed {
		state.inJSXTag = false
		state.jsxQuote = 0
		state.jsxEscaped = false
		state.jsxBraceDepth = 0
		return body[:end], body[end:], true
	}
	state.inJSXTag = true
	return body, "", true
}

func scanJSXTagFragment(line string, start int, state *markdownParseState) (int, bool) {
	loopStart := start + 1
	if !state.inJSXTag {
		state.jsxQuote = 0
		state.jsxEscaped = false
		state.jsxBraceDepth = 0
	} else {
		loopStart = start
	}

	for idx := loopStart; idx < len(line); idx++ {
		ch := line[idx]
		if state.jsxQuote != 0 {
			if state.jsxEscaped {
				state.jsxEscaped = false
				continue
			}
			if ch == '\\' {
				state.jsxEscaped = true
				continue
			}
			if ch == state.jsxQuote {
				state.jsxQuote = 0
			}
			continue
		}

		if ch == '\'' || ch == '"' {
			state.jsxQuote = ch
			continue
		}

		switch ch {
		case '{':
			state.jsxBraceDepth++
		case '}':
			if state.jsxBraceDepth > 0 {
				state.jsxBraceDepth--
			}
		case '>':
			if state.jsxBraceDepth == 0 {
				return idx + 1, true
			}
		}
	}

	return len(line), false
}

func stripTrailingJSXClosingLiterals(body string) (string, []string) {
	trailing := []string{}
	for {
		end := len(body)
		for end > 0 && (body[end-1] == ' ' || body[end-1] == '\t') {
			end--
		}
		start := strings.LastIndex(body[:end], "</")
		if start < 0 || !looksLikeJSXTagStart(body, start) {
			return body, trailing
		}
		tagEnd := findJSXTagEnd(body, start)
		if tagEnd != end {
			return body, trailing
		}
		trailing = append([]string{body[start:end]}, trailing...)
		body = body[:start]
	}
}

func emitFrontmatterLineParts(line string, doc *markdownDocument, appendKey func(markdownPart)) {
	if strings.TrimSpace(line) == "" {
		doc.parts = append(doc.parts, markdownPart{literal: line})
		return
	}

	newline := ""
	body := line
	if strings.HasSuffix(body, "\n") {
		newline = "\n"
		body = strings.TrimSuffix(body, "\n")
	}

	colon := strings.IndexByte(body, ':')
	if colon <= 0 {
		doc.parts = append(doc.parts, markdownPart{literal: line})
		return
	}

	key := strings.TrimSpace(body[:colon])
	if key == "" {
		doc.parts = append(doc.parts, markdownPart{literal: line})
		return
	}

	valuePart := body[colon+1:]
	lead := len(valuePart) - len(strings.TrimLeftFunc(valuePart, unicode.IsSpace))
	if lead >= len(valuePart) {
		doc.parts = append(doc.parts, markdownPart{literal: line})
		return
	}

	valueRest := valuePart[lead:]
	if len(valueRest) < 2 {
		doc.parts = append(doc.parts, markdownPart{literal: line})
		return
	}

	quote := valueRest[0]
	if quote != '"' && quote != '\'' {
		// Plain (unquoted) scalar value
		plainValue := strings.TrimSpace(valueRest)
		if strings.HasPrefix(plainValue, "-") || strings.HasPrefix(plainValue, "[") ||
			strings.HasPrefix(plainValue, "{") || strings.HasPrefix(plainValue, "|") ||
			strings.HasPrefix(plainValue, ">") || plainValue == "" {
			doc.parts = append(doc.parts, markdownPart{literal: line})
			return
		}
		if !isTranslatableChunk(plainValue) {
			doc.parts = append(doc.parts, markdownPart{literal: line})
			return
		}
		doc.parts = append(doc.parts, markdownPart{literal: body[:colon+1] + valuePart[:lead]})
		appendKey(markdownPart{source: plainValue, yamlPlain: true})
		doc.parts = append(doc.parts, markdownPart{literal: newline})
		return
	}

	end := findQuotedStringEnd(valueRest, quote)
	if end <= 1 {
		doc.parts = append(doc.parts, markdownPart{literal: line})
		return
	}

	quotedText := valueRest[1:end]
	if !isTranslatableChunk(quotedText) {
		doc.parts = append(doc.parts, markdownPart{literal: line})
		return
	}

	doc.parts = append(doc.parts, markdownPart{literal: body[:colon+1] + valuePart[:lead] + string(quote)})
	appendKey(markdownPart{source: quotedText})
	doc.parts = append(doc.parts, markdownPart{literal: valueRest[end:] + newline})
}

func findQuotedStringEnd(s string, quote byte) int {
	escaped := false
	for i := 1; i < len(s); i++ {
		ch := s[i]
		if escaped {
			escaped = false
			continue
		}
		if ch == '\\' && quote == '"' {
			escaped = true
			continue
		}
		if ch == quote {
			// YAML single-quote escaping: '' represents a literal '
			if quote == '\'' && i+1 < len(s) && s[i+1] == '\'' {
				i++ // skip the escaped quote
				continue
			}
			return i
		}
	}
	return -1
}

func isTranslatableChunk(chunk string) bool {
	trimmed := strings.TrimSpace(chunk)
	if trimmed == "" {
		return false
	}
	for _, r := range trimmed {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			return true
		}
	}
	return false
}

func (d markdownDocument) render(values map[string]string) ([]byte, MarkdownRenderDiagnostics) {
	var diags MarkdownRenderDiagnostics
	var b strings.Builder
	for _, part := range d.parts {
		if part.key == "" {
			b.WriteString(part.literal)
			continue
		}
		if v, ok := values[part.key]; ok {
			b.WriteString(renderMarkdownPartWithDiagnostics(part, v, &diags))
			continue
		}
		b.WriteString(renderMarkdownPartWithDiagnostics(part, part.source, &diags))
	}
	return []byte(b.String()), diags
}

func renderMarkdownPart(part markdownPart, translated string) string {
	return renderMarkdownPartWithDiagnostics(part, translated, nil)
}

func renderMarkdownPartWithDiagnostics(part markdownPart, translated string, diags *MarkdownRenderDiagnostics) string {
	rendered := preserveChunkBoundaryWhitespace(part.source, translated)
	if part.yamlPlain && yamlPlainScalarNeedsQuotes(rendered) {
		rendered = yamlDoubleQuoteScalar(rendered)
	}
	rendered = normalizeMarkdownTableRowBoundaries(part, rendered)
	if len(part.placeholders) == 0 {
		return rendered
	}
	rendered = expandMarkdownPlaceholders(rendered, part.placeholders)
	rendered = normalizeMarkdownPlaceholders(rendered, part.placeholders)
	rendered = normalizeUnexpectedMarkdownLinkClosers(part, rendered)
	rendered = restoreSourceReferenceDefinitionDestination(part, rendered)
	if strings.ContainsRune(rendered, '\x1e') || strings.ContainsRune(rendered, '\x1f') {
		// If a translation corrupts placeholder sentinels beyond recovery, emit the
		// original source markdown for this segment instead of leaking control tokens.
		if diags != nil && part.key != "" {
			diags.SourceFallbackKeys = append(diags.SourceFallbackKeys, part.key)
		}
		return expandMarkdownPlaceholders(part.source, part.placeholders)
	}
	return rendered
}

func yamlPlainScalarNeedsQuotes(value string) bool {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return true
	}
	switch trimmed[0] {
	case '{', '[', '"', '\'', ':', '>', '|', '-', '!', '&', '*', '?', '@', '`':
		return true
	}
	return strings.Contains(trimmed, ": ")
}

func yamlDoubleQuoteScalar(value string) string {
	replacer := strings.NewReplacer(
		`\\`, `\\\\`,
		`"`, `\"`,
		"\n", `\n`,
		"\r", `\r`,
		"\t", `\t`,
	)
	return `"` + replacer.Replace(value) + `"`
}

func normalizeMarkdownTableRowBoundaries(part markdownPart, rendered string) string {
	sourceTrimmed := strings.TrimSpace(part.source)
	if !strings.HasPrefix(sourceTrimmed, "|") {
		return rendered
	}
	if strings.Count(sourceTrimmed, "|") < 2 {
		return rendered
	}

	lead := len(rendered) - len(strings.TrimLeftFunc(rendered, unicode.IsSpace))
	trail := len(rendered) - len(strings.TrimRightFunc(rendered, unicode.IsSpace))
	core := strings.TrimSpace(rendered)
	if core == "" {
		return rendered
	}

	if !strings.HasPrefix(core, "|") {
		core = "| " + strings.TrimLeft(core, " ")
	}
	if !strings.HasSuffix(core, "|") {
		core = strings.TrimRight(core, " ") + " |"
	}

	return rendered[:lead] + core + rendered[len(rendered)-trail:]
}

func normalizeUnexpectedMarkdownLinkClosers(part markdownPart, rendered string) string {
	for placeholder, original := range part.placeholders {
		if !strings.HasPrefix(original, "](") && !strings.HasPrefix(original, "][") {
			continue
		}
		if strings.Contains(part.source, placeholder+"]") {
			continue
		}
		rendered = strings.ReplaceAll(rendered, original+"]", original)
		rendered = strings.ReplaceAll(rendered, original+" ]", original)
	}
	return rendered
}

func restoreSourceReferenceDefinitionDestination(part markdownPart, rendered string) string {
	sourceStart, sourceEnd, ok := findMarkdownReferenceDefinitionDestination(part.source)
	if !ok {
		return rendered
	}
	sourceDestination := part.source[sourceStart:sourceEnd]
	if expanded, ok := part.placeholders[sourceDestination]; ok {
		sourceDestination = expanded
	}

	renderedStart, renderedEnd, ok := findMarkdownReferenceDefinitionDestination(rendered)
	if !ok {
		return rendered
	}
	if rendered[renderedStart:renderedEnd] == sourceDestination {
		return rendered
	}

	return rendered[:renderedStart] + sourceDestination + rendered[renderedEnd:]
}

func expandMarkdownPlaceholders(rendered string, placeholders map[string]string) string {
	for placeholder, original := range placeholders {
		rendered = strings.ReplaceAll(rendered, placeholder, original)
	}
	return rendered
}

func normalizeMarkdownPlaceholders(rendered string, placeholders map[string]string) string {
	if !strings.Contains(rendered, "\x1eHLMDPH_") {
		return rendered
	}
	// Only recover by index when there is exactly one placeholder in the part.
	// With multiple placeholders, index corruption could silently substitute the
	// wrong literal, so we intentionally fail closed to source fallback.
	if len(placeholders) != 1 {
		return rendered
	}
	var (
		expectedIdx int
		original    string
		ok          bool
	)
	for placeholder, v := range placeholders {
		match := markdownPlaceholderPattern.FindStringSubmatch(placeholder)
		if len(match) != 2 {
			return rendered
		}
		idx, err := strconv.Atoi(match[1])
		if err != nil {
			return rendered
		}
		expectedIdx = idx
		original = v
		ok = true
	}
	if !ok {
		return rendered
	}

	return markdownPlaceholderPattern.ReplaceAllStringFunc(rendered, func(token string) string {
		match := markdownPlaceholderPattern.FindStringSubmatch(token)
		if len(match) != 2 {
			return token
		}
		idx, err := strconv.Atoi(match[1])
		if err != nil {
			return token
		}
		if idx == expectedIdx {
			return original
		}
		return token
	})
}

func preserveChunkBoundaryWhitespace(source, translated string) string {
	leadEnd := len(source) - len(strings.TrimLeftFunc(source, unicode.IsSpace))
	trailStart := len(strings.TrimRightFunc(source, unicode.IsSpace))
	core := strings.TrimFunc(translated, unicode.IsSpace)
	return source[:leadEnd] + core + source[trailStart:]
}

func stripBOM(content []byte) []byte {
	if len(content) >= 3 && content[0] == 0xEF && content[1] == 0xBB && content[2] == 0xBF {
		return content[3:]
	}
	return content
}

// MarkdownParser parses markdown files into stable key/value text segments.
type MarkdownParser struct {
	MDX bool
}

func (p MarkdownParser) Parse(content []byte) (map[string]string, error) {
	_, entries := parseMarkdownDocument(stripBOM(content), p.MDX)
	return entries, nil
}

// ParseWithContext implements [ContextParser]: same entries as [MarkdownParser.Parse],
// plus per-key prompt context (structure path, adjacent literals, placeholder preservation).
func (p MarkdownParser) ParseWithContext(content []byte) (map[string]string, map[string]string, error) {
	doc, entries := parseMarkdownDocument(stripBOM(content), p.MDX)
	ctx := make(map[string]string, len(entries))
	for _, kc := range doc.keyContexts() {
		part := doc.parts[kc.partIndex]
		if part.key == "" {
			continue
		}
		ctx[part.key] = buildMarkdownSegmentContext(p.MDX, kc.path, kc.prevLiteral, kc.nextLiteral)
	}
	return entries, ctx, nil
}

func MarshalMarkdown(template []byte, values map[string]string, mdx bool) []byte {
	content, _ := MarshalMarkdownWithDiagnostics(template, values, mdx)
	return content
}

func MarshalMarkdownWithDiagnostics(template []byte, values map[string]string, mdx bool) ([]byte, MarkdownRenderDiagnostics) {
	doc, _ := parseMarkdownDocument(stripBOM(template), mdx)
	return doc.render(values)
}

func isThematicBreak(s string) bool {
	trimmed := strings.TrimRight(s, "\r\n")
	if trimmed == "" {
		return false
	}
	delim := trimmed[0]
	if delim != '-' && delim != '*' && delim != '_' {
		return false
	}

	count := 0
	for i := 0; i < len(trimmed); i++ {
		switch trimmed[i] {
		case delim:
			count++
		case ' ', '\t':
		default:
			return false
		}
	}
	return count >= 3
}

func markdownBlockFenceLine(line string) string {
	s := strings.TrimLeft(line, " \t")
	for {
		consumed := false

		for {
			trimmed := strings.TrimLeft(s, " \t")
			if trimmed == "" || trimmed[0] != '>' {
				s = trimmed
				break
			}
			s = trimmed[1:]
			if len(s) > 0 && s[0] == ' ' {
				s = s[1:]
			}
			consumed = true
		}

		if hasBulletPrefix(s) {
			s = strings.TrimLeft(s[2:], " \t")
			consumed = true
			continue
		}
		if hasOrderedPrefix(s) {
			idx := 0
			for idx < len(s) && s[idx] >= '0' && s[idx] <= '9' {
				idx++
			}
			if idx < len(s) && s[idx] == '.' {
				idx++
			}
			if idx < len(s) && s[idx] == ' ' {
				idx++
			}
			s = strings.TrimLeft(s[idx:], " \t")
			consumed = true
			continue
		}

		if !consumed {
			return s
		}
	}
}

func isIndentedCodeLine(line string) bool {
	if strings.TrimSpace(line) == "" {
		return false
	}

	width := 0
	for i := 0; i < len(line); i++ {
		switch line[i] {
		case ' ':
			width++
		case '\t':
			width += 4
		default:
			return width >= 4
		}
	}
	return width >= 4
}

// MarshalMarkdownWithTargetFallback renders markdown from the source template so new
// sections are included, while preserving existing target translations for entries
// not updated in the current run.
func MarshalMarkdownWithTargetFallback(sourceTemplate, targetTemplate []byte, values map[string]string, mdx bool) []byte {
	content, _ := MarshalMarkdownWithTargetFallbackDiagnostics(sourceTemplate, targetTemplate, values, mdx)
	return content
}

func MarshalMarkdownWithTargetFallbackDiagnostics(sourceTemplate, targetTemplate []byte, values map[string]string, mdx bool) ([]byte, MarkdownRenderDiagnostics) {
	sourceDoc, sourceEntries := parseMarkdownDocument(stripBOM(sourceTemplate), mdx)
	targetDoc, _ := parseMarkdownDocument(stripBOM(targetTemplate), mdx)
	targetContexts := targetDoc.keyContexts()
	targetPartUsed := make([]bool, len(targetDoc.parts))
	targetContextsByPath := indexMarkdownContextsByPath(targetContexts)
	targetCtxCursor := 0
	targetPartCursor := 0
	sourceContexts := sourceDoc.keyContexts()
	useStructuralPaths := len(sourceContexts) == len(targetContexts)
	sourceCtxIdx := 0
	var diags MarkdownRenderDiagnostics

	takeFallback := func(sourceCtx markdownKeyContext) (string, bool) {
		if useStructuralPaths {
			if idx, ok := selectMarkdownContextByPath(targetContexts, targetPartUsed, targetContextsByPath, sourceCtx.path); ok {
				targetPartUsed[targetContexts[idx].partIndex] = true
				if idx >= targetCtxCursor {
					targetCtxCursor = idx + 1
				}
				if targetContexts[idx].partIndex+1 > targetPartCursor {
					targetPartCursor = targetContexts[idx].partIndex + 1
				}
				return targetContexts[idx].text, true
			}
		}
		if idx, ok := selectMarkdownContextCandidate(targetContexts, targetPartUsed, sourceCtx, targetCtxCursor, sourceCtxIdx, len(sourceContexts)); ok {
			targetPartUsed[targetContexts[idx].partIndex] = true
			if idx >= targetCtxCursor {
				targetCtxCursor = idx + 1
			}
			if targetContexts[idx].partIndex+1 > targetPartCursor {
				targetPartCursor = targetContexts[idx].partIndex + 1
			}
			return targetContexts[idx].text, true
		}
		for _, startAt := range []int{targetPartCursor, 0} {
			if fallback, nextPartCursor, ok := takeMarkdownFallbackSpan(targetDoc, targetPartUsed, startAt, sourceCtx); ok {
				targetPartCursor = nextPartCursor
				return fallback, true
			}
		}
		for i := targetCtxCursor; i < len(targetContexts); i++ {
			if targetPartUsed[targetContexts[i].partIndex] {
				continue
			}
			targetPartUsed[targetContexts[i].partIndex] = true
			targetCtxCursor = i + 1
			if targetContexts[i].partIndex+1 > targetPartCursor {
				targetPartCursor = targetContexts[i].partIndex + 1
			}
			return targetContexts[i].text, true
		}
		for i := 0; i < len(targetContexts); i++ {
			if targetPartUsed[targetContexts[i].partIndex] {
				continue
			}
			targetPartUsed[targetContexts[i].partIndex] = true
			if i >= targetCtxCursor {
				targetCtxCursor = i + 1
			}
			if targetContexts[i].partIndex+1 > targetPartCursor {
				targetPartCursor = targetContexts[i].partIndex + 1
			}
			return targetContexts[i].text, true
		}
		return "", false
	}

	var b strings.Builder
	for _, part := range sourceDoc.parts {
		if part.key == "" {
			b.WriteString(part.literal)
			continue
		}

		if v, ok := values[part.key]; ok {
			b.WriteString(renderMarkdownPartWithDiagnostics(part, v, &diags))
			sourceCtxIdx++
			continue
		}

		// Only consume fallback translations for keys that are part of source extraction.
		// This avoids injecting fallback text into non-translatable structural segments.
		if _, ok := sourceEntries[part.key]; ok && sourceCtxIdx < len(sourceContexts) {
			if fallback, ok := takeFallback(sourceContexts[sourceCtxIdx]); ok {
				b.WriteString(renderMarkdownPartWithDiagnostics(part, fallback, &diags))
				sourceCtxIdx++
				continue
			}
		}
		if sourceCtxIdx < len(sourceContexts) {
			sourceCtxIdx++
		}
		b.WriteString(renderMarkdownPartWithDiagnostics(part, part.source, &diags))
	}

	return []byte(b.String()), diags
}

// AlignMarkdownTargetToSource maps translated target segments back to source-derived markdown keys.
// This is useful for status/reporting where source key identity must remain stable across locales.
func AlignMarkdownTargetToSource(sourceTemplate, targetTemplate []byte, mdx bool) map[string]string {
	sourceDoc, sourceEntries := parseMarkdownDocument(stripBOM(sourceTemplate), mdx)
	targetDoc, _ := parseMarkdownDocument(stripBOM(targetTemplate), mdx)
	return alignMarkdownFallback(sourceDoc, sourceEntries, targetDoc)
}

func alignMarkdownFallback(sourceDoc markdownDocument, sourceEntries map[string]string, targetDoc markdownDocument) map[string]string {
	targetContexts := targetDoc.keyContexts()
	targetPartUsed := make([]bool, len(targetDoc.parts))
	targetContextsByPath := indexMarkdownContextsByPath(targetContexts)
	targetCtxCursor := 0
	targetPartCursor := 0
	sourceContexts := sourceDoc.keyContexts()
	useStructuralPaths := len(sourceContexts) == len(targetContexts)
	sourceCtxIdx := 0
	aligned := make(map[string]string, len(sourceEntries))

	takeFallback := func(sourceCtx markdownKeyContext) (string, bool) {
		if useStructuralPaths {
			if idx, ok := selectMarkdownContextByPath(targetContexts, targetPartUsed, targetContextsByPath, sourceCtx.path); ok {
				targetPartUsed[targetContexts[idx].partIndex] = true
				if idx >= targetCtxCursor {
					targetCtxCursor = idx + 1
				}
				if targetContexts[idx].partIndex+1 > targetPartCursor {
					targetPartCursor = targetContexts[idx].partIndex + 1
				}
				return targetContexts[idx].text, true
			}
		}
		if idx, ok := selectMarkdownContextCandidate(targetContexts, targetPartUsed, sourceCtx, targetCtxCursor, sourceCtxIdx, len(sourceContexts)); ok {
			targetPartUsed[targetContexts[idx].partIndex] = true
			if idx >= targetCtxCursor {
				targetCtxCursor = idx + 1
			}
			if targetContexts[idx].partIndex+1 > targetPartCursor {
				targetPartCursor = targetContexts[idx].partIndex + 1
			}
			return targetContexts[idx].text, true
		}
		for _, startAt := range []int{targetPartCursor, 0} {
			if fallback, nextPartCursor, ok := takeMarkdownFallbackSpan(targetDoc, targetPartUsed, startAt, sourceCtx); ok {
				targetPartCursor = nextPartCursor
				return fallback, true
			}
		}
		for i := targetCtxCursor; i < len(targetContexts); i++ {
			if targetPartUsed[targetContexts[i].partIndex] {
				continue
			}
			targetPartUsed[targetContexts[i].partIndex] = true
			targetCtxCursor = i + 1
			if targetContexts[i].partIndex+1 > targetPartCursor {
				targetPartCursor = targetContexts[i].partIndex + 1
			}
			return targetContexts[i].text, true
		}
		for i := range targetContexts {
			if targetPartUsed[targetContexts[i].partIndex] {
				continue
			}
			targetPartUsed[targetContexts[i].partIndex] = true
			if i >= targetCtxCursor {
				targetCtxCursor = i + 1
			}
			if targetContexts[i].partIndex+1 > targetPartCursor {
				targetPartCursor = targetContexts[i].partIndex + 1
			}
			return targetContexts[i].text, true
		}
		return "", false
	}

	for _, part := range sourceDoc.parts {
		if part.key == "" {
			continue
		}

		// Only consume fallback translations for keys that are part of source extraction.
		// This avoids injecting fallback text into non-translatable structural segments.
		if _, ok := sourceEntries[part.key]; ok && sourceCtxIdx < len(sourceContexts) {
			if fallback, ok := takeFallback(sourceContexts[sourceCtxIdx]); ok {
				aligned[part.key] = renderMarkdownPart(part, fallback)
				sourceCtxIdx++
				continue
			}
		}
		if sourceCtxIdx < len(sourceContexts) {
			sourceCtxIdx++
		}
		if _, ok := sourceEntries[part.key]; ok {
			aligned[part.key] = ""
		}
	}

	return aligned
}

func indexMarkdownContextsByPath(targetContexts []markdownKeyContext) map[string][]int {
	indexed := make(map[string][]int, len(targetContexts))
	for i := range targetContexts {
		if targetContexts[i].path == "" {
			continue
		}
		indexed[targetContexts[i].path] = append(indexed[targetContexts[i].path], i)
	}
	return indexed
}

func selectMarkdownContextByPath(targetContexts []markdownKeyContext, targetPartUsed []bool, indexed map[string][]int, path string) (int, bool) {
	if path == "" {
		return 0, false
	}
	for _, idx := range indexed[path] {
		if targetPartUsed[targetContexts[idx].partIndex] {
			continue
		}
		return idx, true
	}
	return 0, false
}

func selectMarkdownContextCandidate(targetContexts []markdownKeyContext, targetPartUsed []bool, sourceCtx markdownKeyContext, targetCtxCursor, sourceCtxIdx, sourceTotal int) (int, bool) {
	best := -1
	bestScore := math.MaxFloat64
	for i := range targetContexts {
		if targetPartUsed[targetContexts[i].partIndex] {
			continue
		}
		if targetContexts[i].prevLiteral != sourceCtx.prevLiteral || targetContexts[i].nextLiteral != sourceCtx.nextLiteral {
			continue
		}
		score := markdownRelativeIndexDistance(i, len(targetContexts), sourceCtxIdx, sourceTotal)
		if i < targetCtxCursor {
			score += 0.25
		}
		if score < bestScore {
			best = i
			bestScore = score
		}
	}
	if best < 0 {
		return 0, false
	}
	return best, true
}

func markdownRelativeIndexDistance(targetIdx, targetTotal, sourceIdx, sourceTotal int) float64 {
	if targetTotal <= 1 || sourceTotal <= 1 {
		return 0
	}
	targetPos := float64(targetIdx) / float64(targetTotal-1)
	sourcePos := float64(sourceIdx) / float64(sourceTotal-1)
	return math.Abs(targetPos - sourcePos)
}

func takeMarkdownFallbackSpan(targetDoc markdownDocument, targetPartUsed []bool, startAt int, sourceCtx markdownKeyContext) (string, int, bool) {
	findSpan := func(searchStart int) (int, int, bool) {
		start := searchStart
		if sourceCtx.prevLiteral != "" {
			foundPrev := false
			for i := searchStart; i < len(targetDoc.parts); i++ {
				part := targetDoc.parts[i]
				if part.key == "" && part.literal == sourceCtx.prevLiteral {
					start = i + 1
					foundPrev = true
					break
				}
			}
			if !foundPrev {
				return 0, 0, false
			}
		}

		end := len(targetDoc.parts)
		if sourceCtx.nextLiteral != "" {
			foundNext := false
			for i := start; i < len(targetDoc.parts); i++ {
				part := targetDoc.parts[i]
				if part.key == "" && part.literal == sourceCtx.nextLiteral {
					end = i
					foundNext = true
					break
				}
			}
			if !foundNext {
				return 0, 0, false
			}
		} else {
			for i := start; i < len(targetDoc.parts); i++ {
				part := targetDoc.parts[i]
				if part.key == "" {
					end = i
					break
				}
			}
		}

		if end <= start {
			return 0, 0, false
		}

		for i := start; i < end; i++ {
			if targetPartUsed[i] {
				return 0, 0, false
			}
		}
		return start, end, true
	}

	spanStart, spanEnd, ok := findSpan(startAt)
	if !ok {
		return "", startAt, false
	}

	var b strings.Builder
	for i := spanStart; i < spanEnd; i++ {
		targetPartUsed[i] = true
		if targetDoc.parts[i].key == "" {
			b.WriteString(targetDoc.parts[i].literal)
			continue
		}
		b.WriteString(renderMarkdownPart(targetDoc.parts[i], targetDoc.parts[i].source))
	}

	nextCursor := startAt
	if spanEnd > nextCursor {
		nextCursor = spanEnd
	}
	return b.String(), nextCursor, true
}
