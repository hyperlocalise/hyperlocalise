package translationfileparser

import (
	"crypto/sha256"
	"fmt"
	"math"
	"path/filepath"
	"regexp"
	"slices"
	"strconv"
	"strings"
)

const asciiDocPlaceholderPrefix = "\x1eHLADPH_"

var asciiDocPlaceholderPattern = regexp.MustCompile("\x1eHLADPH_[A-Z0-9_]+_(\\d+)\x1f")

var asciiDocAdmonitionPrefixes = []string{
	"NOTE: ",
	"TIP: ",
	"IMPORTANT: ",
	"WARNING: ",
	"CAUTION: ",
}

var asciiDocURLSchemePrefixes = []string{
	"https://",
	"http://",
	"ftp://",
	"irc://",
	"mailto:",
}

// AsciiDocParser parses AsciiDoc files into translatable string segments.
type AsciiDocParser struct{}

type asciiDocPart struct {
	literal      string
	key          string
	source       string
	placeholders map[string]string
	path         string
	fingerprint  string
	kind         string
}

type asciiDocDocument struct {
	parts []asciiDocPart
}

type asciiDocKeyContext struct {
	text        string
	prevLiteral string
	nextLiteral string
	partIndex   int
	path        string
}

// AsciiDocRenderDiagnostics records keys that fell back to source text during render.
type AsciiDocRenderDiagnostics struct {
	SourceFallbackKeys []string
}

func (p AsciiDocParser) Parse(content []byte) (map[string]string, error) {
	_, entries := parseAsciiDocDocument(stripBOM(content))
	return entries, nil
}

func (p AsciiDocParser) ParseWithContext(content []byte) (map[string]string, map[string]string, error) {
	doc, entries := parseAsciiDocDocument(stripBOM(content))
	ctx := make(map[string]string, len(entries))
	for _, kc := range doc.keyContexts() {
		part := doc.parts[kc.partIndex]
		if part.key == "" {
			continue
		}
		ctx[part.key] = buildAsciiDocSegmentContext(kc.path, kc.prevLiteral, kc.nextLiteral)
	}
	return entries, ctx, nil
}

func buildAsciiDocSegmentContext(path, prevLiteral, nextLiteral string) string {
	var b strings.Builder
	b.WriteString("AsciiDoc segment. Preserve placeholders, macros, attribute references, and inline markup exactly.")
	if path != "" {
		b.WriteString("\nStructural path: ")
		b.WriteString(path)
	}
	if hint := asciiDocLiteralHint(prevLiteral); hint != "" {
		b.WriteString("\nPrevious markup: ")
		b.WriteString(hint)
	}
	if hint := asciiDocLiteralHint(nextLiteral); hint != "" {
		b.WriteString("\nFollowing markup: ")
		b.WriteString(hint)
	}
	return b.String()
}

func asciiDocLiteralHint(literal string) string {
	trimmed := strings.TrimSpace(literal)
	if trimmed == "" {
		return ""
	}
	if len(trimmed) > 80 {
		return trimmed[:80] + "…"
	}
	return trimmed
}

func parseAsciiDocDocument(content []byte) (asciiDocDocument, map[string]string) {
	lines := splitAsciiDocLines(string(content))
	doc := asciiDocDocument{}
	occurrences := map[string]int{}
	sawDocumentTitle := false
	inTitleHeader := false

	i := 0
	if isAsciiDocYAMLFrontMatterStart(lines, 0) {
		end := findAsciiDocYAMLFrontMatterEnd(lines, 0)
		doc.appendLiteral(joinAsciiDocLines(lines[0 : end+1]))
		i = end + 1
	}

	for i < len(lines) {
		line := lines[i]
		body := asciiDocLineBody(line)
		trimmed := strings.TrimSpace(body)
		nl := asciiDocLineNL(line)

		if trimmed == "" {
			doc.appendLiteral(line)
			inTitleHeader = false
			i++
			continue
		}

		if trimmed == "////" {
			end := findAsciiDocClosingDelimiter(lines, i, "////")
			doc.appendLiteral(joinAsciiDocLines(lines[i : end+1]))
			i = end + 1
			continue
		}
		if strings.HasPrefix(trimmed, "//") {
			doc.appendLiteral(line)
			i++
			continue
		}
		if isAsciiDocAttributeDefinition(trimmed) || isAsciiDocPreprocessor(trimmed) || isAsciiDocBlockMacro(trimmed) {
			doc.appendLiteral(line)
			i++
			continue
		}
		if delim, ok := asciiDocVerbatimDelimiter(trimmed); ok {
			end := findAsciiDocClosingDelimiter(lines, i, delim)
			doc.appendLiteral(joinAsciiDocLines(lines[i : end+1]))
			i = end + 1
			continue
		}
		if asciiDocContainerDelimiter(trimmed) != "" {
			doc.appendLiteral(line)
			i++
			continue
		}
		if isAsciiDocAttributeList(trimmed) {
			doc.appendLiteral(line)
			i++
			continue
		}
		if isAsciiDocTableFence(trimmed) {
			doc.appendLiteral(line)
			i++
			continue
		}
		if strings.Contains(trimmed, "|") && (strings.HasPrefix(trimmed, "|") || strings.Contains(trimmed, "|===")) {
			emitAsciiDocTableRow(&doc, occurrences, line)
			i++
			continue
		}

		if inTitleHeader && !asciiDocLineEndsDocumentHeader(trimmed) {
			doc.appendLiteral(line)
			i++
			continue
		}
		inTitleHeader = false

		if level, title, ok := parseAsciiDocHeading(trimmed); ok {
			indent := body[:len(body)-len(strings.TrimLeft(body, " \t"))]
			marker := strings.Repeat("=", level) + " "
			doc.appendLiteral(indent + marker)
			emitAsciiDocKeyedPart(&doc, occurrences, asciiDocHeadingPath(level, sawDocumentTitle), title)
			doc.appendLiteral(nl)
			if level == 1 && !sawDocumentTitle {
				sawDocumentTitle = true
				inTitleHeader = true
			}
			i++
			continue
		}
		if isAsciiDocBlockTitle(trimmed) {
			indent := body[:len(body)-len(strings.TrimLeft(body, " \t"))]
			doc.appendLiteral(indent + ".")
			emitAsciiDocKeyedPart(&doc, occurrences, "block_title", strings.TrimSpace(trimmed[1:]))
			doc.appendLiteral(nl)
			i++
			continue
		}
		if prefix, text, ok := parseAsciiDocAdmonitionParagraph(trimmed); ok {
			indent := body[:len(body)-len(strings.TrimLeft(body, " \t"))]
			doc.appendLiteral(indent + prefix)
			emitAsciiDocKeyedPart(&doc, occurrences, "admonition", text)
			doc.appendLiteral(nl)
			i++
			continue
		}
		if prefix, text, ok := parseAsciiDocListItem(trimmed); ok {
			indent := body[:len(body)-len(strings.TrimLeft(body, " \t"))]
			doc.appendLiteral(indent + prefix)
			emitAsciiDocKeyedPart(&doc, occurrences, "list_item", text)
			doc.appendLiteral(nl)
			i++
			continue
		}
		if term, desc, ok := parseAsciiDocDescriptionList(trimmed); ok {
			indent := body[:len(body)-len(strings.TrimLeft(body, " \t"))]
			doc.appendLiteral(indent)
			emitAsciiDocKeyedPart(&doc, occurrences, "description_term", term)
			if desc == "" {
				doc.appendLiteral("::" + nl)
			} else {
				doc.appendLiteral(":: ")
				emitAsciiDocKeyedPart(&doc, occurrences, "description", desc)
				doc.appendLiteral(nl)
			}
			i++
			continue
		}

		end := collectAsciiDocParagraph(lines, i)
		paraLines := lines[i:end]
		joined := joinAsciiDocParagraphText(paraLines)
		if joined != "" {
			emitAsciiDocKeyedPart(&doc, occurrences, "paragraph", joined)
			doc.appendLiteral(asciiDocLineNL(paraLines[len(paraLines)-1]))
		}
		i = end
	}

	entries := make(map[string]string, len(doc.parts))
	for _, part := range doc.parts {
		if part.key != "" {
			entries[part.key] = part.source
		}
	}
	return doc, entries
}

func (d *asciiDocDocument) appendLiteral(literal string) {
	if literal == "" {
		return
	}
	if n := len(d.parts); n > 0 && d.parts[n-1].key == "" {
		d.parts[n-1].literal += literal
		return
	}
	d.parts = append(d.parts, asciiDocPart{literal: literal})
}

func emitAsciiDocKeyedPart(doc *asciiDocDocument, occurrences map[string]int, path, text string) {
	if strings.TrimSpace(text) == "" {
		return
	}
	source, placeholders := protectAsciiDocInlineSyntax(text)
	part := asciiDocPart{
		source:       source,
		placeholders: placeholders,
		path:         path,
		kind:         string(DocumentBlockKindBody),
	}
	part.fingerprint = markdownContentFingerprint(part.source)
	part.key = asciiDocSlotKey(path, occurrences)
	doc.parts = append(doc.parts, part)
}

func asciiDocSlotKey(path string, occurrences map[string]int) string {
	if path == "" {
		path = "slot"
	}
	count := occurrences[path]
	occurrences[path] = count + 1
	if count == 0 {
		return "adoc." + path
	}
	return "adoc." + path + "." + strconv.Itoa(count+1)
}

func asciiDocHeadingPath(level int, sawDocumentTitle bool) string {
	if level == 1 && !sawDocumentTitle {
		return "title"
	}
	return "heading"
}

func splitAsciiDocLines(s string) []string {
	if s == "" {
		return nil
	}
	lines := make([]string, 0, strings.Count(s, "\n")+1)
	start := 0
	for i := 0; i < len(s); i++ {
		if s[i] == '\n' {
			lines = append(lines, s[start:i+1])
			start = i + 1
		}
	}
	if start < len(s) {
		lines = append(lines, s[start:])
	}
	return lines
}

func joinAsciiDocLines(lines []string) string {
	var b strings.Builder
	for _, line := range lines {
		b.WriteString(line)
	}
	return b.String()
}

func asciiDocLineBody(line string) string {
	return strings.TrimRight(line, "\r\n")
}

func asciiDocLineNL(line string) string {
	if strings.HasSuffix(line, "\r\n") {
		return "\r\n"
	}
	if strings.HasSuffix(line, "\n") {
		return "\n"
	}
	return ""
}

func isAsciiDocYAMLFrontMatterStart(lines []string, idx int) bool {
	if idx != 0 || idx >= len(lines) {
		return false
	}
	return strings.TrimSpace(asciiDocLineBody(lines[idx])) == "---"
}

func findAsciiDocYAMLFrontMatterEnd(lines []string, start int) int {
	for i := start + 1; i < len(lines); i++ {
		if strings.TrimSpace(asciiDocLineBody(lines[i])) == "---" {
			return i
		}
	}
	return start
}

func findAsciiDocClosingDelimiter(lines []string, start int, delim string) int {
	for i := start + 1; i < len(lines); i++ {
		if strings.TrimSpace(asciiDocLineBody(lines[i])) == delim {
			return i
		}
	}
	return len(lines) - 1
}

func isAsciiDocAttributeDefinition(trimmed string) bool {
	if !strings.HasPrefix(trimmed, ":") {
		return false
	}
	rest := trimmed[1:]
	if rest == "" {
		return false
	}
	if rest[0] == '!' {
		rest = rest[1:]
	}
	colon := strings.IndexByte(rest, ':')
	return colon > 0
}

func isAsciiDocPreprocessor(trimmed string) bool {
	return strings.HasPrefix(trimmed, "ifdef::") ||
		strings.HasPrefix(trimmed, "ifndef::") ||
		strings.HasPrefix(trimmed, "ifeval::") ||
		strings.HasPrefix(trimmed, "endif::")
}

func isAsciiDocBlockMacro(trimmed string) bool {
	idx := strings.Index(trimmed, "::")
	if idx <= 0 {
		return false
	}
	if !isAsciiDocMacroName(trimmed[:idx]) {
		return false
	}
	rest := trimmed[idx+2:]
	if rest == "" || strings.HasPrefix(rest, " ") {
		return false
	}
	return strings.Contains(rest, "[")
}

func isAsciiDocMacroName(name string) bool {
	if name == "" {
		return false
	}
	for i, r := range name {
		if r >= 'A' && r <= 'Z' || r >= 'a' && r <= 'z' || r == '_' {
			continue
		}
		if i > 0 && r >= '0' && r <= '9' {
			continue
		}
		return false
	}
	return true
}

func asciiDocVerbatimDelimiter(trimmed string) (string, bool) {
	if trimmed == "```" || strings.HasPrefix(trimmed, "```") && !strings.ContainsAny(trimmed[3:], " \t") {
		return strings.TrimSpace(trimmed), true
	}
	if isRepeatedDelimiter(trimmed, '-', 4) ||
		isRepeatedDelimiter(trimmed, '.', 4) ||
		isRepeatedDelimiter(trimmed, '+', 4) {
		return trimmed, true
	}
	return "", false
}

func asciiDocContainerDelimiter(trimmed string) string {
	if isRepeatedDelimiter(trimmed, '=', 4) ||
		isRepeatedDelimiter(trimmed, '*', 4) ||
		isRepeatedDelimiter(trimmed, '_', 4) ||
		trimmed == "--" {
		return trimmed
	}
	return ""
}

func isRepeatedDelimiter(s string, ch byte, min int) bool {
	if len(s) < min {
		return false
	}
	for i := 0; i < len(s); i++ {
		if s[i] != ch {
			return false
		}
	}
	return true
}

func isAsciiDocAttributeList(trimmed string) bool {
	return len(trimmed) >= 3 && trimmed[0] == '[' && trimmed[len(trimmed)-1] == ']'
}

func isAsciiDocTableFence(trimmed string) bool {
	return trimmed == "|===" || strings.HasPrefix(trimmed, "|===")
}

func parseAsciiDocHeading(trimmed string) (int, string, bool) {
	if !strings.HasPrefix(trimmed, "=") {
		return 0, "", false
	}
	level := 0
	for level < len(trimmed) && trimmed[level] == '=' {
		level++
	}
	if level == 0 || level > 6 {
		return 0, "", false
	}
	if level >= len(trimmed) || (trimmed[level] != ' ' && trimmed[level] != '\t') {
		return 0, "", false
	}
	title := strings.TrimSpace(trimmed[level:])
	if title == "" {
		return 0, "", false
	}
	return level, title, true
}

func asciiDocLineEndsDocumentHeader(trimmed string) bool {
	if _, _, ok := parseAsciiDocHeading(trimmed); ok {
		return true
	}
	if isAsciiDocBlockTitle(trimmed) {
		return true
	}
	if _, _, ok := parseAsciiDocAdmonitionParagraph(trimmed); ok {
		return true
	}
	if _, _, ok := parseAsciiDocListItem(trimmed); ok {
		return true
	}
	if _, _, ok := parseAsciiDocDescriptionList(trimmed); ok {
		return true
	}
	return false
}

func isAsciiDocBlockTitle(trimmed string) bool {
	if !strings.HasPrefix(trimmed, ".") || len(trimmed) < 2 {
		return false
	}
	next := trimmed[1]
	return next != '.' && next != ' ' && next != '\t'
}

func parseAsciiDocAdmonitionParagraph(trimmed string) (string, string, bool) {
	for _, prefix := range asciiDocAdmonitionPrefixes {
		if strings.HasPrefix(trimmed, prefix) {
			return prefix, strings.TrimSpace(trimmed[len(prefix):]), true
		}
	}
	return "", "", false
}

func parseAsciiDocListItem(trimmed string) (string, string, bool) {
	if strings.HasPrefix(trimmed, "<") {
		end := strings.IndexByte(trimmed, '>')
		if end > 1 && end+1 < len(trimmed) && trimmed[end+1] == ' ' {
			allDigits := true
			for i := 1; i < end; i++ {
				if trimmed[i] < '0' || trimmed[i] > '9' {
					allDigits = false
					break
				}
			}
			if allDigits {
				return trimmed[:end+2], strings.TrimSpace(trimmed[end+2:]), true
			}
		}
	}

	markerLen := 0
	switch trimmed[0] {
	case '*', '-', '.':
		for markerLen < len(trimmed) && trimmed[markerLen] == trimmed[0] {
			markerLen++
		}
	default:
		if trimmed[0] >= '0' && trimmed[0] <= '9' {
			for markerLen < len(trimmed) && trimmed[markerLen] >= '0' && trimmed[markerLen] <= '9' {
				markerLen++
			}
			if markerLen < len(trimmed) && (trimmed[markerLen] == '.' || trimmed[markerLen] == ')') {
				markerLen++
			} else {
				return "", "", false
			}
		}
	}
	if markerLen == 0 || markerLen >= len(trimmed) || (trimmed[markerLen] != ' ' && trimmed[markerLen] != '\t') {
		return "", "", false
	}
	prefix := trimmed[:markerLen+1]
	return prefix, strings.TrimSpace(trimmed[markerLen+1:]), true
}

func parseAsciiDocDescriptionList(trimmed string) (string, string, bool) {
	idx := strings.Index(trimmed, "::")
	if idx <= 0 {
		return "", "", false
	}
	term := strings.TrimSpace(trimmed[:idx])
	if term == "" || isAsciiDocMacroName(term) && isAsciiDocBlockMacro(trimmed) {
		return "", "", false
	}
	desc := strings.TrimSpace(trimmed[idx+2:])
	return term, desc, true
}

func collectAsciiDocParagraph(lines []string, start int) int {
	i := start + 1
	for i < len(lines) {
		trimmed := strings.TrimSpace(asciiDocLineBody(lines[i]))
		if trimmed == "" || asciiDocLineStartsBlock(trimmed) {
			return i
		}
		i++
	}
	return i
}

func asciiDocLineStartsBlock(trimmed string) bool {
	if trimmed == "////" || strings.HasPrefix(trimmed, "//") {
		return true
	}
	if isAsciiDocAttributeDefinition(trimmed) || isAsciiDocPreprocessor(trimmed) || isAsciiDocBlockMacro(trimmed) {
		return true
	}
	if _, ok := asciiDocVerbatimDelimiter(trimmed); ok {
		return true
	}
	if asciiDocContainerDelimiter(trimmed) != "" || isAsciiDocAttributeList(trimmed) || isAsciiDocTableFence(trimmed) {
		return true
	}
	if _, _, ok := parseAsciiDocHeading(trimmed); ok {
		return true
	}
	if isAsciiDocBlockTitle(trimmed) {
		return true
	}
	if _, _, ok := parseAsciiDocAdmonitionParagraph(trimmed); ok {
		return true
	}
	if _, _, ok := parseAsciiDocListItem(trimmed); ok {
		return true
	}
	if _, _, ok := parseAsciiDocDescriptionList(trimmed); ok {
		return true
	}
	if strings.HasPrefix(trimmed, "|") {
		return true
	}
	return false
}

func joinAsciiDocParagraphText(lines []string) string {
	parts := make([]string, 0, len(lines))
	for _, line := range lines {
		body := strings.TrimSpace(asciiDocLineBody(line))
		if body != "" {
			parts = append(parts, body)
		}
	}
	return strings.Join(parts, " ")
}

func emitAsciiDocTableRow(doc *asciiDocDocument, occurrences map[string]int, line string) {
	body := asciiDocLineBody(line)
	nl := asciiDocLineNL(line)
	if isAsciiDocTableFence(strings.TrimSpace(body)) {
		doc.appendLiteral(line)
		return
	}

	leading := body[:len(body)-len(strings.TrimLeft(body, " \t"))]
	row := strings.TrimSpace(body)
	if !strings.Contains(row, "|") {
		doc.appendLiteral(line)
		return
	}

	doc.appendLiteral(leading)
	cells := splitAsciiDocTableCells(row)
	if len(cells) == 0 {
		doc.appendLiteral(body[len(leading):] + nl)
		return
	}
	for i, cell := range cells {
		spec, text := splitAsciiDocTableCellSpec(cell)
		if i == 0 && strings.HasPrefix(row, "|") {
			doc.appendLiteral("|" + spec)
		} else if i == 0 {
			doc.appendLiteral(spec)
		} else {
			doc.appendLiteral("|" + spec)
		}
		if strings.TrimSpace(text) != "" {
			if spec != "" && !strings.HasSuffix(spec, " ") {
				doc.appendLiteral(" ")
			} else if spec == "" {
				doc.appendLiteral(" ")
			}
			emitAsciiDocKeyedPart(doc, occurrences, "table_cell", strings.TrimSpace(text))
			if i < len(cells)-1 {
				doc.appendLiteral(" ")
			}
		}
	}
	doc.appendLiteral(nl)
}

func splitAsciiDocTableCells(row string) []string {
	raw := strings.TrimPrefix(row, "|")
	if raw == "" {
		return nil
	}
	return strings.Split(raw, "|")
}

func splitAsciiDocTableCellSpec(cell string) (string, string) {
	trimmedLeft := strings.TrimLeft(cell, " \t")
	leading := cell[:len(cell)-len(trimmedLeft)]
	specEnd := 0
	for specEnd < len(trimmedLeft) {
		ch := trimmedLeft[specEnd]
		if (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') || ch == '.' || ch == '+' || ch == '>' || ch == '<' || ch == '^' {
			specEnd++
			continue
		}
		break
	}
	if specEnd > 0 && specEnd < len(trimmedLeft) && trimmedLeft[specEnd-1] != ' ' {
		// specs such as "2+" or "a" immediately precede cell text without a required delimiter.
		// Only treat a prefix as a spec when the remainder still has content and the prefix
		// looks like a cell specifier rather than ordinary words.
		prefix := trimmedLeft[:specEnd]
		if asciiDocLooksLikeCellSpec(prefix) {
			return leading + prefix, strings.TrimSpace(trimmedLeft[specEnd:])
		}
	}
	return leading, strings.TrimSpace(cell)
}

func asciiDocLooksLikeCellSpec(prefix string) bool {
	if prefix == "" {
		return false
	}
	for _, r := range prefix {
		if r >= '0' && r <= '9' || r == '.' || r == '+' || r == '>' || r == '<' || r == '^' {
			return true
		}
	}
	switch prefix {
	case "a", "e", "s", "l", "m", "h", "d", "v":
		return true
	default:
		return false
	}
}

func protectAsciiDocInlineSyntax(segment string) (string, map[string]string) {
	placeholders := map[string]string{}
	placeholderCount := 0
	var rendered strings.Builder
	rendered.Grow(len(segment))

	appendPlaceholder := func(literal string) {
		var buf [128]byte
		hInput := strconv.AppendInt(buf[:0], int64(placeholderCount), 10)
		hInput = append(hInput, ':')
		hInput = append(hInput, literal...)
		sum := sha256.Sum256(hInput)

		var sb strings.Builder
		sb.Grow(24)
		sb.WriteString(asciiDocPlaceholderPrefix)
		for i := 0; i < 6; i++ {
			b := sum[i]
			sb.WriteByte(hexDigits[b>>4])
			sb.WriteByte(hexDigits[b&0x0f])
		}
		sb.WriteByte('_')
		sb.WriteString(strconv.Itoa(placeholderCount))
		sb.WriteByte('\x1f')
		placeholder := sb.String()
		placeholderCount++
		placeholders[placeholder] = literal
		rendered.WriteString(placeholder)
	}

	for idx := 0; idx < len(segment); {
		if segment[idx] == '`' {
			end, ok := findAsciiDocDelimitedSpan(segment, idx, '`')
			if !ok {
				rendered.WriteByte(segment[idx])
				idx++
				continue
			}
			appendPlaceholder(segment[idx:end])
			idx = end
			continue
		}
		if strings.HasPrefix(segment[idx:], "+++") {
			end := strings.Index(segment[idx+3:], "+++")
			if end >= 0 {
				appendPlaceholder(segment[idx : idx+3+end+3])
				idx += 3 + end + 3
				continue
			}
		}
		if strings.HasPrefix(segment[idx:], "pass:") {
			if end, ok := findAsciiDocBracketMacroEnd(segment, idx); ok {
				appendPlaceholder(segment[idx:end])
				idx = end
				continue
			}
		}
		if name, ok := asciiDocInlineMacroAt(segment, idx); ok {
			if open, close, ok := findAsciiDocMacroBrackets(segment, idx+len(name)+1); ok {
				appendPlaceholder(segment[idx : open+1])
				rendered.WriteString(segment[open+1 : close])
				appendPlaceholder(segment[close : close+1])
				idx = close + 1
				continue
			}
			if name == "link" || name == "xref" || name == "mailto" || name == "image" || name == "icon" {
				if end := consumeAsciiDocBareMacro(segment, idx); end > idx {
					appendPlaceholder(segment[idx:end])
					idx = end
					continue
				}
			}
		}
		if scheme, ok := asciiDocURLSchemeAt(segment, idx); ok {
			if open, close, ok := findAsciiDocURLBrackets(segment, idx, scheme); ok {
				appendPlaceholder(segment[idx : open+1])
				rendered.WriteString(segment[open+1 : close])
				appendPlaceholder(segment[close : close+1])
				idx = close + 1
				continue
			}
			end := consumeAsciiDocBareURL(segment, idx)
			appendPlaceholder(segment[idx:end])
			idx = end
			continue
		}
		if segment[idx] == '{' {
			if end, ok := findAsciiDocAttributeRef(segment, idx); ok {
				appendPlaceholder(segment[idx:end])
				idx = end
				continue
			}
		}
		if strings.HasPrefix(segment[idx:], "[[") {
			if end := strings.Index(segment[idx+2:], "]]"); end >= 0 {
				appendPlaceholder(segment[idx : idx+2+end+2])
				idx += 2 + end + 2
				continue
			}
		}
		if segment[idx] == '+' && !strings.HasPrefix(segment[idx:], "++") {
			end, ok := findAsciiDocPlusMonospace(segment, idx)
			if ok {
				appendPlaceholder(segment[idx:end])
				idx = end
				continue
			}
		}
		if segment[idx] == '#' && asciiDocIssueRefAt(segment, idx) {
			end := idx + 1
			for end < len(segment) && segment[end] >= '0' && segment[end] <= '9' {
				end++
			}
			appendPlaceholder(segment[idx:end])
			idx = end
			continue
		}
		rendered.WriteByte(segment[idx])
		idx++
	}

	return rendered.String(), placeholders
}

func findAsciiDocDelimitedSpan(s string, start int, delim byte) (int, bool) {
	if start >= len(s) || s[start] != delim {
		return 0, false
	}
	end := strings.IndexByte(s[start+1:], delim)
	if end < 0 {
		return 0, false
	}
	return start + 1 + end + 1, true
}

func findAsciiDocPlusMonospace(s string, start int) (int, bool) {
	end := strings.IndexByte(s[start+1:], '+')
	if end < 0 {
		return 0, false
	}
	closeAt := start + 1 + end
	if closeAt+1 < len(s) && s[closeAt+1] == '+' {
		return 0, false
	}
	if closeAt == start+1 {
		return 0, false
	}
	return closeAt + 1, true
}

func findAsciiDocBracketMacroEnd(s string, start int) (int, bool) {
	open := strings.IndexByte(s[start:], '[')
	if open < 0 {
		return 0, false
	}
	close := strings.IndexByte(s[start+open:], ']')
	if close < 0 {
		return 0, false
	}
	return start + open + close + 1, true
}

func asciiDocInlineMacroAt(s string, idx int) (string, bool) {
	if idx > 0 {
		prev := s[idx-1]
		if prev >= 'A' && prev <= 'Z' || prev >= 'a' && prev <= 'z' || prev == '_' {
			return "", false
		}
	}
	end := idx
	for end < len(s) && isAsciiDocMacroName(s[idx:end+1]) {
		end++
	}
	if end == idx || end >= len(s) || s[end] != ':' {
		return "", false
	}
	if end+1 < len(s) && s[end+1] == ':' {
		return "", false
	}
	name := s[idx:end]
	switch name {
	case "link", "xref", "mailto", "image", "icon", "kbd", "btn", "menu":
		return name, true
	default:
		return "", false
	}
}

func findAsciiDocMacroBrackets(s string, afterColon int) (int, int, bool) {
	lastOpen, lastClose := -1, -1
	i := afterColon
	for i < len(s) {
		if s[i] == '[' {
			close := strings.IndexByte(s[i+1:], ']')
			if close < 0 {
				break
			}
			lastOpen = i
			lastClose = i + 1 + close
			i = lastClose + 1
			continue
		}
		if s[i] == ' ' || s[i] == '\t' || s[i] == '\n' || s[i] == '\r' {
			break
		}
		i++
	}
	if lastOpen < 0 {
		return 0, 0, false
	}
	return lastOpen, lastClose, true
}

func consumeAsciiDocBareMacro(s string, start int) int {
	end := start
	for end < len(s) && !isAsciiDocURLStop(s[end]) {
		end++
	}
	if end == start {
		return start
	}
	return end
}

func asciiDocURLSchemeAt(s string, idx int) (string, bool) {
	if idx > 0 {
		prev := s[idx-1]
		if prev >= 'A' && prev <= 'Z' || prev >= 'a' && prev <= 'z' || prev == '_' || prev == ':' {
			return "", false
		}
	}
	for _, scheme := range asciiDocURLSchemePrefixes {
		if strings.HasPrefix(s[idx:], scheme) {
			return scheme, true
		}
	}
	return "", false
}

func findAsciiDocURLBrackets(s string, start int, scheme string) (int, int, bool) {
	return findAsciiDocMacroBrackets(s, start+len(scheme))
}

func consumeAsciiDocBareURL(s string, start int) int {
	end := start
	for end < len(s) && !isAsciiDocURLStop(s[end]) {
		end++
	}
	for end > start && isAsciiDocURLTrailPunct(s[end-1]) {
		end--
	}
	return end
}

func isAsciiDocURLStop(ch byte) bool {
	return ch == ' ' || ch == '\t' || ch == '\n' || ch == '\r' || ch == '[' || ch == ']'
}

func isAsciiDocURLTrailPunct(ch byte) bool {
	return ch == '.' || ch == ',' || ch == ';' || ch == ':' || ch == ')' || ch == '!' || ch == '?'
}

func findAsciiDocAttributeRef(s string, start int) (int, bool) {
	if start+2 >= len(s) || s[start] != '{' {
		return 0, false
	}
	end := strings.IndexByte(s[start+1:], '}')
	if end < 0 {
		return 0, false
	}
	name := s[start+1 : start+1+end]
	if name == "" {
		return 0, false
	}
	for i, r := range name {
		if r >= 'A' && r <= 'Z' || r >= 'a' && r <= 'z' || r == '_' || r == '-' {
			continue
		}
		if i > 0 && (r >= '0' && r <= '9' || r == ':') {
			continue
		}
		return 0, false
	}
	return start + 1 + end + 1, true
}

func asciiDocIssueRefAt(s string, idx int) bool {
	if idx+1 >= len(s) || s[idx] != '#' || s[idx+1] < '0' || s[idx+1] > '9' {
		return false
	}
	if idx > 0 {
		prev := s[idx-1]
		if prev >= 'A' && prev <= 'Z' || prev >= 'a' && prev <= 'z' || prev >= '0' && prev <= '9' || prev == '_' {
			return false
		}
	}
	return true
}

func expandAsciiDocPlaceholders(text string, placeholders map[string]string) string {
	if len(placeholders) == 0 {
		return text
	}
	rendered := text
	for token, literal := range placeholders {
		rendered = strings.ReplaceAll(rendered, token, literal)
	}
	return rendered
}

func AsciiDocInternalPlaceholderTokens(s string) []string {
	matches := asciiDocPlaceholderPattern.FindAllString(s, -1)
	slices.Sort(matches)
	return matches
}

func ValidateAsciiDocInternalPlaceholders(source, translated string) error {
	src := AsciiDocInternalPlaceholderTokens(source)
	tgt := AsciiDocInternalPlaceholderTokens(translated)
	if slices.Equal(src, tgt) {
		return nil
	}
	return fmt.Errorf("asciidoc internal placeholder mismatch: expected %d token(s), got %d", len(src), len(tgt))
}

func (d asciiDocDocument) keyContexts() []asciiDocKeyContext {
	out := make([]asciiDocKeyContext, 0)
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
		out = append(out, asciiDocKeyContext{
			text:        expandAsciiDocPlaceholders(part.source, part.placeholders),
			prevLiteral: prev,
			nextLiteral: next,
			partIndex:   i,
			path:        part.path,
		})
	}
	return out
}

func (d asciiDocDocument) render(values map[string]string) ([]byte, AsciiDocRenderDiagnostics) {
	var diags AsciiDocRenderDiagnostics
	var b strings.Builder
	for _, part := range d.parts {
		if part.key == "" {
			b.WriteString(part.literal)
			continue
		}
		if v, ok := values[part.key]; ok {
			b.WriteString(renderAsciiDocPartWithDiagnostics(part, v, &diags, false))
			continue
		}
		b.WriteString(renderAsciiDocPartWithDiagnostics(part, part.source, &diags, true))
	}
	return []byte(b.String()), diags
}

func renderAsciiDocPartWithDiagnostics(part asciiDocPart, translated string, diags *AsciiDocRenderDiagnostics, trustedFallback bool) string {
	rendered := preserveChunkBoundaryWhitespace(part.source, translated)
	if !trustedFallback && len(part.placeholders) > 0 {
		if err := ValidateAsciiDocInternalPlaceholders(part.source, rendered); err != nil {
			if diags != nil && part.key != "" {
				diags.SourceFallbackKeys = append(diags.SourceFallbackKeys, part.key)
			}
			return expandAsciiDocPlaceholders(part.source, part.placeholders)
		}
	}
	rendered = expandAsciiDocPlaceholders(rendered, part.placeholders)
	if strings.ContainsRune(rendered, '\x1e') || strings.ContainsRune(rendered, '\x1f') {
		if diags != nil && part.key != "" {
			diags.SourceFallbackKeys = append(diags.SourceFallbackKeys, part.key)
		}
		return expandAsciiDocPlaceholders(part.source, part.placeholders)
	}
	return rendered
}

func MarshalAsciiDoc(template []byte, values map[string]string) []byte {
	content, _ := MarshalAsciiDocWithDiagnostics(template, values)
	return content
}

func MarshalAsciiDocWithDiagnostics(template []byte, values map[string]string) ([]byte, AsciiDocRenderDiagnostics) {
	doc, _ := parseAsciiDocDocument(stripBOM(template))
	return doc.render(values)
}

func MarshalAsciiDocWithTargetFallback(sourceTemplate, targetTemplate []byte, values map[string]string) []byte {
	content, _ := MarshalAsciiDocWithTargetFallbackDiagnostics(sourceTemplate, targetTemplate, values)
	return content
}

func MarshalAsciiDocWithTargetFallbackDiagnostics(sourceTemplate, targetTemplate []byte, values map[string]string) ([]byte, AsciiDocRenderDiagnostics) {
	sourceDoc, _ := parseAsciiDocDocument(stripBOM(sourceTemplate))
	targetDoc, _ := parseAsciiDocDocument(stripBOM(targetTemplate))
	fallback := newAsciiDocAligner(sourceDoc, targetDoc)
	var diags AsciiDocRenderDiagnostics
	var b strings.Builder
	for _, part := range sourceDoc.parts {
		if part.key == "" {
			b.WriteString(part.literal)
			continue
		}
		if v, ok := values[part.key]; ok {
			_, _ = fallback.takeHighConfidence()
			b.WriteString(renderAsciiDocPartWithDiagnostics(part, v, &diags, false))
			continue
		}
		if fallbackText, ok := fallback.takeRemaining(); ok {
			b.WriteString(renderAsciiDocPartWithDiagnostics(part, fallbackText, &diags, true))
			continue
		}
		b.WriteString(renderAsciiDocPartWithDiagnostics(part, part.source, &diags, true))
	}
	return []byte(b.String()), diags
}

func AlignAsciiDocTargetToSource(sourceTemplate, targetTemplate []byte) map[string]string {
	sourceDoc, sourceEntries := parseAsciiDocDocument(stripBOM(sourceTemplate))
	targetDoc, _ := parseAsciiDocDocument(stripBOM(targetTemplate))
	fallback := newAsciiDocAligner(sourceDoc, targetDoc)
	aligned := make(map[string]string, len(sourceEntries))
	for _, part := range sourceDoc.parts {
		if part.key == "" {
			continue
		}
		if _, ok := sourceEntries[part.key]; !ok {
			fallback.advance()
			continue
		}
		if text, ok := fallback.take(); ok {
			aligned[part.key] = text
			continue
		}
		aligned[part.key] = ""
	}
	return aligned
}

type asciiDocAligner struct {
	sourceDoc            asciiDocDocument
	targetDoc            asciiDocDocument
	sourceContexts       []asciiDocKeyContext
	targetContexts       []asciiDocKeyContext
	targetContextsByPath map[string][]int
	targetPartUsed       []bool
	targetCtxCursor      int
	targetPartCursor     int
	sourceCtxIdx         int
	useStructuralPaths   bool
}

func newAsciiDocAligner(sourceDoc, targetDoc asciiDocDocument) *asciiDocAligner {
	sourceContexts := sourceDoc.keyContexts()
	targetContexts := targetDoc.keyContexts()
	return &asciiDocAligner{
		sourceDoc:            sourceDoc,
		targetDoc:            targetDoc,
		sourceContexts:       sourceContexts,
		targetContexts:       targetContexts,
		targetContextsByPath: indexAsciiDocContextsByPath(targetContexts),
		targetPartUsed:       make([]bool, len(targetDoc.parts)),
		useStructuralPaths:   len(sourceContexts) == len(targetContexts),
	}
}

func (a *asciiDocAligner) advance() {
	_, _ = a.take()
}

func (a *asciiDocAligner) take() (string, bool) {
	return a.takeWith(a.useStructuralPaths, a.useStructuralPaths)
}

func (a *asciiDocAligner) takeHighConfidence() (string, bool) {
	return a.takeWith(false, false)
}

func (a *asciiDocAligner) takeRemaining() (string, bool) {
	return a.takeWith(a.useStructuralPaths, true)
}

func (a *asciiDocAligner) takeWith(usePath, useLastResort bool) (string, bool) {
	if a.sourceCtxIdx >= len(a.sourceContexts) {
		return "", false
	}
	sourceCtx := a.sourceContexts[a.sourceCtxIdx]
	text, ok := a.takeFallback(sourceCtx, usePath, useLastResort)
	a.sourceCtxIdx++
	return text, ok
}

func (a *asciiDocAligner) takeFallback(sourceCtx asciiDocKeyContext, usePath, useLastResort bool) (string, bool) {
	if idx, ok := selectAsciiDocContextCandidate(a.targetContexts, a.targetPartUsed, sourceCtx, a.targetCtxCursor, a.sourceCtxIdx, len(a.sourceContexts)); ok {
		return a.consumeContext(idx), true
	}
	if usePath {
		if idx, ok := selectAsciiDocContextByPath(a.targetContexts, a.targetPartUsed, a.targetContextsByPath, sourceCtx.path); ok {
			return a.consumeContext(idx), true
		}
	}
	for _, startAt := range []int{a.targetPartCursor, 0} {
		if fallback, nextPartCursor, ok := takeAsciiDocFallbackSpan(a.targetDoc, a.targetPartUsed, startAt, sourceCtx); ok {
			a.targetPartCursor = nextPartCursor
			return fallback, true
		}
	}
	if !useLastResort {
		return "", false
	}
	for i := a.targetCtxCursor; i < len(a.targetContexts); i++ {
		if a.targetPartUsed[a.targetContexts[i].partIndex] {
			continue
		}
		return a.consumeContext(i), true
	}
	for i := range a.targetContexts {
		if a.targetPartUsed[a.targetContexts[i].partIndex] {
			continue
		}
		return a.consumeContext(i), true
	}
	return "", false
}

func (a *asciiDocAligner) consumeContext(idx int) string {
	a.targetPartUsed[a.targetContexts[idx].partIndex] = true
	if idx >= a.targetCtxCursor {
		a.targetCtxCursor = idx + 1
	}
	if a.targetContexts[idx].partIndex+1 > a.targetPartCursor {
		a.targetPartCursor = a.targetContexts[idx].partIndex + 1
	}
	return a.targetContexts[idx].text
}

func indexAsciiDocContextsByPath(targetContexts []asciiDocKeyContext) map[string][]int {
	indexed := make(map[string][]int, len(targetContexts))
	for i := range targetContexts {
		if targetContexts[i].path == "" {
			continue
		}
		indexed[targetContexts[i].path] = append(indexed[targetContexts[i].path], i)
	}
	return indexed
}

func selectAsciiDocContextByPath(targetContexts []asciiDocKeyContext, targetPartUsed []bool, indexed map[string][]int, path string) (int, bool) {
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

func selectAsciiDocContextCandidate(targetContexts []asciiDocKeyContext, targetPartUsed []bool, sourceCtx asciiDocKeyContext, targetCtxCursor, sourceCtxIdx, sourceTotal int) (int, bool) {
	best := -1
	bestScore := math.MaxFloat64
	for i := range targetContexts {
		if targetPartUsed[targetContexts[i].partIndex] {
			continue
		}
		if targetContexts[i].prevLiteral != sourceCtx.prevLiteral || targetContexts[i].nextLiteral != sourceCtx.nextLiteral {
			continue
		}
		score := asciiDocRelativeIndexDistance(i, len(targetContexts), sourceCtxIdx, sourceTotal)
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

func asciiDocRelativeIndexDistance(targetIdx, targetTotal, sourceIdx, sourceTotal int) float64 {
	if targetTotal <= 1 || sourceTotal <= 1 {
		return 0
	}
	targetPos := float64(targetIdx) / float64(targetTotal-1)
	sourcePos := float64(sourceIdx) / float64(sourceTotal-1)
	return math.Abs(targetPos - sourcePos)
}

func takeAsciiDocFallbackSpan(targetDoc asciiDocDocument, targetPartUsed []bool, startAt int, sourceCtx asciiDocKeyContext) (string, int, bool) {
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
		b.WriteString(expandAsciiDocPlaceholders(targetDoc.parts[i].source, targetDoc.parts[i].placeholders))
	}
	nextCursor := startAt
	if spanEnd > nextCursor {
		nextCursor = spanEnd
	}
	return b.String(), nextCursor, true
}

func LineForAsciiDocKey(content []byte, key string) int {
	doc, _ := parseAsciiDocDocument(stripBOM(content))
	line := 1
	for _, part := range doc.parts {
		if part.key == key {
			return line
		}
		line += strings.Count(part.literal, "\n")
	}
	return 0
}

func IsAsciiDocDocumentExtension(path string) bool {
	switch strings.ToLower(filepath.Ext(strings.TrimSpace(path))) {
	case ".adoc", ".asciidoc", ".asc":
		return true
	default:
		return false
	}
}

func ParseAsciiDocDocumentIR(content []byte) ParsedDocument {
	doc, _ := parseAsciiDocDocument(stripBOM(content))
	return parsedDocumentFromAsciiDoc(doc)
}

func parsedDocumentFromAsciiDoc(doc asciiDocDocument) ParsedDocument {
	out := ParsedDocument{
		Format: DocumentFormatAsciiDoc,
		Parts:  make([]DocumentPart, 0, len(doc.parts)),
		Blocks: make([]DocumentBlock, 0),
	}
	for _, part := range doc.parts {
		if part.key == "" {
			if part.literal == "" {
				continue
			}
			out.Parts = append(out.Parts, DocumentPart{Literal: part.literal})
			continue
		}
		block := DocumentBlock{
			ID:          part.key,
			Path:        part.path,
			Fingerprint: part.fingerprint,
			Kind:        DocumentBlockKindBody,
			Text:        part.source,
		}
		out.Blocks = append(out.Blocks, block)
		out.Parts = append(out.Parts, DocumentPart{BlockID: part.key})
	}
	return out
}

func AlignAsciiDocSourceRevisions(previous, current []byte) map[string]string {
	prevDoc := ParseAsciiDocDocumentIR(previous)
	currDoc := ParseAsciiDocDocumentIR(current)
	return alignDocumentBlocksByFingerprint(prevDoc.Blocks, currDoc.Blocks)
}
