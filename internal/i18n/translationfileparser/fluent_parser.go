package translationfileparser

import (
	"fmt"
	"slices"
	"strings"
	"unicode/utf8"
)

// FluentParser parses Mozilla Fluent .ftl localization files.
//
// The supported subset is intentionally conservative: message values,
// message attributes, multiline values, and select/plural patterns are treated
// as complete translation units. Term definitions are rejected so unsupported
// Fluent constructs do not get silently rewritten.
type FluentParser struct{}

type fluentLine struct {
	start int
	end   int
	text  string
}

type fluentEntry struct {
	key                string
	sourceValue        string
	context            string
	valueStart         int
	valueEnd           int
	blockValue         bool
	continuationIndent string
}

type fluentDocument struct {
	template   string
	entries    []fluentEntry
	messageIDs map[string]struct{}
}

func (p FluentParser) Parse(content []byte) (map[string]string, error) {
	values, _, err := p.ParseWithContext(content)
	if err != nil {
		return nil, err
	}
	return values, nil
}

func (p FluentParser) ParseWithContext(content []byte) (map[string]string, map[string]string, error) {
	doc, err := parseFluentDocument(content)
	if err != nil {
		return nil, nil, err
	}

	values := map[string]string{}
	contextByKey := map[string]string{}
	for _, entry := range doc.entries {
		values[entry.key] = entry.sourceValue
		if strings.TrimSpace(entry.context) != "" {
			contextByKey[entry.key] = entry.context
		}
	}
	if len(contextByKey) == 0 {
		return values, nil, nil
	}
	return values, contextByKey, nil
}

func MarshalFluent(template []byte, values map[string]string) ([]byte, error) {
	doc, err := parseFluentDocument(template)
	if err != nil {
		return nil, err
	}
	return doc.render(values)
}

func (d fluentDocument) render(values map[string]string) ([]byte, error) {
	entries := append([]fluentEntry(nil), d.entries...)
	slices.SortFunc(entries, func(a, b fluentEntry) int {
		if a.valueStart < b.valueStart {
			return -1
		}
		if a.valueStart > b.valueStart {
			return 1
		}
		return strings.Compare(a.key, b.key)
	})

	templateKeys := make(map[string]struct{}, len(entries)+len(d.messageIDs))
	for messageID := range d.messageIDs {
		templateKeys[messageID] = struct{}{}
	}
	var b strings.Builder
	// BOLT OPTIMIZATION: Pre-grow the builder to avoid repeated re-allocations.
	b.Grow(len(d.template))
	hasRendered := false
	renderedTrailingNewlines := 0
	writeRenderedString := func(value string) {
		b.WriteString(value)
		if len(value) == 0 {
			return
		}
		hasRendered = true
		trailingNewlines := 0
		for i := len(value) - 1; i >= 0 && value[i] == '\n'; i-- {
			trailingNewlines++
		}
		if trailingNewlines == len(value) {
			renderedTrailingNewlines += trailingNewlines
		} else {
			renderedTrailingNewlines = trailingNewlines
		}
	}
	cursor := 0
	for _, entry := range entries {
		templateKeys[entry.key] = struct{}{}
		if entry.valueStart < cursor || entry.valueStart > len(d.template) || entry.valueEnd > len(d.template) {
			continue
		}
		writeRenderedString(d.template[cursor:entry.valueStart])
		if translated, ok := values[entry.key]; ok {
			writeRenderedString(encodeFluentValue(translated, entry.continuationIndent, entry.blockValue))
		} else {
			writeRenderedString(d.template[entry.valueStart:entry.valueEnd])
		}
		cursor = entry.valueEnd
	}
	writeRenderedString(d.template[cursor:])

	if err := appendMissingFluentEntries(&b, values, templateKeys, hasRendered, renderedTrailingNewlines); err != nil {
		return nil, err
	}

	return []byte(b.String()), nil
}

func parseFluentDocument(content []byte) (fluentDocument, error) {
	if !utf8.Valid(content) {
		return fluentDocument{}, fmt.Errorf("fluent: content must be valid UTF-8")
	}

	text := string(content)
	lines := scanFluentLines(text)
	doc := fluentDocument{template: text, entries: []fluentEntry{}, messageIDs: map[string]struct{}{}}
	seen := map[string]struct{}{}
	pendingComments := []string{}
	parentID := ""
	parentContext := ""

	for i := 0; i < len(lines); {
		line := lines[i]
		trimmed := strings.TrimSpace(line.text)
		if trimmed == "" {
			pendingComments = nil
			parentID = ""
			parentContext = ""
			i++
			continue
		}
		if isFluentComment(trimmed) {
			if fluentCommentLevel(trimmed) == 1 {
				pendingComments = append(pendingComments, fluentCommentText(trimmed))
			} else {
				pendingComments = nil
			}
			parentID = ""
			parentContext = ""
			i++
			continue
		}

		if fluentLineIndented(line.text) {
			attrID, valueStart, ok := parseFluentAttributeHeader(line)
			if !ok {
				return fluentDocument{}, fmt.Errorf("line %d: unexpected indented Fluent line", lineNumberAt(text, line.start))
			}
			if parentID == "" {
				return fluentDocument{}, fmt.Errorf("line %d: Fluent attribute %q has no parent message", lineNumberAt(text, line.start), attrID)
			}
			key := parentID + "." + attrID
			entry, next, err := parseFluentEntryValue(text, lines, i, valueStart, key, parentContext, fluentAttributeContinuationIndent(line.text))
			if err != nil {
				return fluentDocument{}, err
			}
			if err := addFluentEntry(&doc, seen, entry); err != nil {
				return fluentDocument{}, err
			}
			i = next
			continue
		}

		if strings.HasPrefix(trimmed, "-") {
			return fluentDocument{}, fmt.Errorf("line %d: Fluent terms are not supported", lineNumberAt(text, line.start))
		}

		messageID, valueStart, ok := parseFluentMessageHeader(line)
		if !ok {
			return fluentDocument{}, fmt.Errorf("line %d: expected Fluent message assignment", lineNumberAt(text, line.start))
		}
		if _, ok := doc.messageIDs[messageID]; ok {
			return fluentDocument{}, fmt.Errorf("line %d: duplicate Fluent message id %q", lineNumberAt(text, line.start), messageID)
		}
		doc.messageIDs[messageID] = struct{}{}
		context := formatFluentComments(pendingComments)
		pendingComments = nil
		parentID = messageID
		parentContext = context

		entry, next, err := parseFluentEntryValue(text, lines, i, valueStart, messageID, context, "    ")
		if err != nil {
			return fluentDocument{}, err
		}
		if entry.sourceValue != "" || !nextLineIsFluentAttribute(lines, next) {
			if err := addFluentEntry(&doc, seen, entry); err != nil {
				return fluentDocument{}, err
			}
		}
		i = next
	}

	return doc, nil
}

func addFluentEntry(doc *fluentDocument, seen map[string]struct{}, entry fluentEntry) error {
	if _, ok := seen[entry.key]; ok {
		return fmt.Errorf("fluent: duplicate entry key %q", entry.key)
	}
	if err := validateFluentValue(entry.key, entry.sourceValue); err != nil {
		return err
	}
	seen[entry.key] = struct{}{}
	doc.entries = append(doc.entries, entry)
	return nil
}

func parseFluentEntryValue(text string, lines []fluentLine, index, valueStart int, key, context, continuationIndent string) (fluentEntry, int, error) {
	valueEnd, next := fluentValueSpan(lines, index, valueStart)
	raw := ""
	if valueStart <= valueEnd {
		raw = text[valueStart:valueEnd]
	}
	sourceValue := normalizeFluentValue(raw)
	blockValue := strings.HasPrefix(raw, "\n") || strings.HasPrefix(raw, "\r\n")
	return fluentEntry{
		key:                key,
		sourceValue:        sourceValue,
		context:            context,
		valueStart:         valueStart,
		valueEnd:           valueEnd,
		blockValue:         blockValue,
		continuationIndent: continuationIndent,
	}, next, nil
}

func fluentValueSpan(lines []fluentLine, index, valueStart int) (int, int) {
	if index >= len(lines) {
		return valueStart, index
	}
	valueEnd := lines[index].end

	next := index + 1
	for next < len(lines) {
		line := lines[next]
		trimmed := strings.TrimSpace(line.text)
		if trimmed == "" {
			break
		}
		if !fluentLineIndented(line.text) {
			break
		}
		if _, _, ok := parseFluentAttributeHeader(line); ok {
			break
		}
		valueEnd = line.end
		next++
	}

	return valueEnd, next
}

func scanFluentLines(text string) []fluentLine {
	// BOLT OPTIMIZATION: Pre-allocate lines slice based on newline count.
	lines := make([]fluentLine, 0, strings.Count(text, "\n")+1)
	for start := 0; start < len(text); {
		next := strings.IndexByte(text[start:], '\n')
		lineEnd := len(text)
		after := len(text)
		if next >= 0 {
			lineEnd = start + next
			after = lineEnd + 1
		}
		end := lineEnd
		if end > start && text[end-1] == '\r' {
			end--
		}
		lines = append(lines, fluentLine{
			start: start,
			end:   end,
			text:  text[start:end],
		})
		start = after
	}
	return lines
}

func parseFluentMessageHeader(line fluentLine) (string, int, bool) {
	if fluentLineIndented(line.text) {
		return "", 0, false
	}
	id, next, ok := parseFluentIdentifierAt(line.text, 0)
	if !ok {
		return "", 0, false
	}
	next = skipFluentInlineWhitespace(line.text, next)
	if next >= len(line.text) || line.text[next] != '=' {
		return "", 0, false
	}
	valueOffset := skipFluentInlineWhitespace(line.text, next+1)
	return id, line.start + valueOffset, true
}

func parseFluentAttributeHeader(line fluentLine) (string, int, bool) {
	offset := fluentIndentWidth(line.text)
	if offset >= len(line.text) || line.text[offset] != '.' {
		return "", 0, false
	}
	id, next, ok := parseFluentIdentifierAt(line.text, offset+1)
	if !ok {
		return "", 0, false
	}
	next = skipFluentInlineWhitespace(line.text, next)
	if next >= len(line.text) || line.text[next] != '=' {
		return "", 0, false
	}
	valueOffset := skipFluentInlineWhitespace(line.text, next+1)
	return id, line.start + valueOffset, true
}

func parseFluentIdentifierAt(line string, start int) (string, int, bool) {
	if start >= len(line) || !isFluentIdentifierStart(line[start]) {
		return "", start, false
	}
	i := start + 1
	for i < len(line) && isFluentIdentifierPart(line[i]) {
		i++
	}
	return line[start:i], i, true
}

func isValidFluentIdentifier(id string) bool {
	parsed, next, ok := parseFluentIdentifierAt(id, 0)
	return ok && next == len(id) && parsed == id
}

func isFluentIdentifierStart(ch byte) bool {
	return (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z')
}

func isFluentIdentifierPart(ch byte) bool {
	return isFluentIdentifierStart(ch) || (ch >= '0' && ch <= '9') || ch == '_' || ch == '-'
}

func skipFluentInlineWhitespace(line string, start int) int {
	i := start
	for i < len(line) && (line[i] == ' ' || line[i] == '\t') {
		i++
	}
	return i
}

func fluentLineIndented(line string) bool {
	return len(line) > 0 && (line[0] == ' ' || line[0] == '\t')
}

func fluentIndentWidth(line string) int {
	i := 0
	for i < len(line) && (line[i] == ' ' || line[i] == '\t') {
		i++
	}
	return i
}

func fluentAttributeContinuationIndent(line string) string {
	indent := line[:fluentIndentWidth(line)]
	if indent == "" {
		indent = "    "
	}
	return indent + "    "
}

func nextLineIsFluentAttribute(lines []fluentLine, index int) bool {
	if index >= len(lines) {
		return false
	}
	_, _, ok := parseFluentAttributeHeader(lines[index])
	return ok
}

func isFluentComment(trimmed string) bool {
	return strings.HasPrefix(trimmed, "#")
}

func fluentCommentLevel(trimmed string) int {
	level := 0
	for level < len(trimmed) && trimmed[level] == '#' {
		level++
	}
	return level
}

func fluentCommentText(trimmed string) string {
	return strings.TrimSpace(strings.TrimLeft(trimmed, "#"))
}

func formatFluentComments(comments []string) string {
	// BOLT OPTIMIZATION: Use strings.Builder to avoid intermediate slice and Join.
	var b strings.Builder
	first := true
	for _, comment := range comments {
		clean := strings.TrimSpace(comment)
		if clean == "" {
			continue
		}
		if !first {
			b.WriteByte('\n')
		}
		b.WriteString(clean)
		first = false
	}
	return b.String()
}

func normalizeFluentValue(raw string) string {
	// BOLT OPTIMIZATION: Fast-path for single-line values.
	if !strings.ContainsAny(raw, "\n\r") {
		return strings.TrimRight(raw, " \t")
	}

	raw = strings.ReplaceAll(raw, "\r\n", "\n")
	raw = strings.ReplaceAll(raw, "\r", "\n")
	lines := strings.Split(raw, "\n")
	for len(lines) > 0 && strings.TrimSpace(lines[0]) == "" {
		lines = lines[1:]
	}
	for len(lines) > 0 && strings.TrimSpace(lines[len(lines)-1]) == "" {
		lines = lines[:len(lines)-1]
	}
	// Inline multiline values start beside "=", so derive structural indent
	// from continuation lines and let encodeFluentValue add it back once.
	indentFrom := 0
	if len(lines) > 1 && !fluentLineIndented(lines[0]) {
		indentFrom = 1
	}

	commonIndent := -1
	for _, line := range lines[indentFrom:] {
		if strings.TrimSpace(line) == "" {
			continue
		}
		indent := len(line) - len(strings.TrimLeft(line, " \t"))
		if commonIndent < 0 || indent < commonIndent {
			commonIndent = indent
		}
	}
	if commonIndent < 0 {
		commonIndent = 0
	}

	if indentFrom > 0 {
		lines[0] = strings.TrimRight(lines[0], " \t")
	}
	for i := indentFrom; i < len(lines); i++ {
		line := lines[i]
		if len(line) >= commonIndent {
			lines[i] = strings.TrimRight(line[commonIndent:], " \t")
		} else {
			lines[i] = strings.TrimRight(line, " \t")
		}
	}
	return strings.Join(lines, "\n")
}

func validateFluentValue(key, value string) error {
	if fluentValueReferencesTerm(value) {
		return fmt.Errorf("fluent key %q references a term, which is not supported", key)
	}
	return nil
}

func fluentValueReferencesTerm(value string) bool {
	for i := 0; i < len(value); i++ {
		if value[i] != '{' {
			continue
		}

		j := i + 1
		for j < len(value) && (value[j] == ' ' || value[j] == '\t') {
			j++
		}
		if j < len(value) && value[j] == '-' {
			return true
		}
	}
	return false
}

func encodeFluentValue(value, continuationIndent string, blockValue bool) string {
	// BOLT OPTIMIZATION: Use strings.Builder to avoid multiple ReplaceAll, TrimRight,
	// Split, and Join allocations.
	if continuationIndent == "" {
		continuationIndent = "    "
	}

	// BOLT OPTIMIZATION: Match original behavior of trimming trailing newlines.
	value = strings.TrimRight(value, "\n\r")

	// Fast-path for single-line values.
	if !strings.ContainsAny(value, "\n\r") {
		if value == "" {
			return ""
		}
		if blockValue {
			return "\n" + continuationIndent + value
		}
		return value
	}

	var b strings.Builder
	b.Grow(len(value) + (strings.Count(value, "\n")+1)*len(continuationIndent) + 1)

	if blockValue {
		b.WriteByte('\n')
		b.WriteString(continuationIndent)
	}

	first := true
	s := value
	for {
		var line string
		idx := strings.IndexAny(s, "\n\r")
		if idx < 0 {
			line = s
		} else {
			line = s[:idx]
		}

		if !first {
			b.WriteByte('\n')
			b.WriteString(continuationIndent)
		}
		b.WriteString(line)
		first = false

		if idx < 0 {
			break
		}
		if s[idx] == '\r' && idx+1 < len(s) && s[idx+1] == '\n' {
			s = s[idx+2:]
		} else {
			s = s[idx+1:]
		}
		if s == "" {
			break
		}
	}

	return b.String()
}

func appendMissingFluentEntries(b *strings.Builder, values map[string]string, templateKeys map[string]struct{}, hasRendered bool, trailingNewlines int) error {
	messageKeys := []string{}
	attrsByParent := map[string][]string{}

	for key := range values {
		if _, ok := templateKeys[key]; ok {
			continue
		}
		parent, attr, ok := splitFluentAttributeKey(key)
		if ok {
			if _, parentExists := templateKeys[parent]; parentExists {
				return fmt.Errorf("fluent marshal: cannot append missing attribute %q because parent message %q already exists in template", key, parent)
			}
			attrsByParent[parent] = append(attrsByParent[parent], attr)
			continue
		}
		if !isValidFluentIdentifier(key) {
			return fmt.Errorf("fluent marshal: invalid message id %q", key)
		}
		messageKeys = append(messageKeys, key)
	}

	if len(messageKeys) == 0 && len(attrsByParent) == 0 {
		return nil
	}
	if hasRendered && trailingNewlines < 2 {
		for i := trailingNewlines; i < 2; i++ {
			b.WriteByte('\n')
		}
	}

	topLevel := make([]string, 0, len(messageKeys)+len(attrsByParent))
	hasMessage := make(map[string]struct{}, len(messageKeys))
	for _, key := range messageKeys {
		topLevel = append(topLevel, key)
		hasMessage[key] = struct{}{}
	}
	for parent := range attrsByParent {
		if _, ok := hasMessage[parent]; ok {
			continue
		}
		topLevel = append(topLevel, parent)
	}
	slices.Sort(topLevel)
	for index, parent := range topLevel {
		if index > 0 {
			b.WriteByte('\n')
		}
		if !isValidFluentIdentifier(parent) {
			return fmt.Errorf("fluent marshal: invalid message id %q", parent)
		}
		if _, ok := hasMessage[parent]; ok {
			writeFluentMessage(b, parent, values[parent])
		} else {
			b.WriteString(parent)
			b.WriteString(" =\n")
		}
		attrs := attrsByParent[parent]
		slices.Sort(attrs)
		for _, attr := range attrs {
			writeFluentAttribute(b, attr, values[parent+"."+attr])
		}
	}

	return nil
}

func splitFluentAttributeKey(key string) (string, string, bool) {
	parent, attr, ok := strings.Cut(key, ".")
	if !ok || parent == "" || attr == "" || strings.Contains(attr, ".") {
		return "", "", false
	}
	if !isValidFluentIdentifier(parent) || !isValidFluentIdentifier(attr) {
		return "", "", false
	}
	return parent, attr, true
}

func writeFluentMessage(b *strings.Builder, key, value string) {
	if strings.Contains(value, "\n") {
		b.WriteString(key)
		b.WriteString(" =")
		b.WriteString(encodeFluentValue(value, "    ", true))
		b.WriteByte('\n')
		return
	}
	b.WriteString(key)
	b.WriteString(" = ")
	b.WriteString(value)
	b.WriteByte('\n')
}

func writeFluentAttribute(b *strings.Builder, attr, value string) {
	if strings.Contains(value, "\n") {
		b.WriteString("    .")
		b.WriteString(attr)
		b.WriteString(" =")
		b.WriteString(encodeFluentValue(value, "        ", true))
		b.WriteByte('\n')
		return
	}
	b.WriteString("    .")
	b.WriteString(attr)
	b.WriteString(" = ")
	b.WriteString(value)
	b.WriteByte('\n')
}
