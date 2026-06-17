package translationfileparser

import (
	"fmt"
	"slices"
	"strconv"
	"strings"
	"unicode/utf16"
	"unicode/utf8"
)

// JavaPropertiesParser parses Java .properties localization files.
type JavaPropertiesParser struct{}

type propertiesEntry struct {
	key         string
	sourceValue string
	valueStart  int
	valueEnd    int
	comments    []string
	line        int
}

type propertiesDocument struct {
	template string
	entries  []propertiesEntry
}

type propertiesLogicalLine struct {
	text string
	// rawStart and rawEnd are the byte offsets of the logical line in the raw template.
	rawStart int
	rawEnd   int
	// boundaryRaw maps indices in text back to raw byte offsets in the template.
	// It is optional and can be nil if the logical line has no escaped/continued content.
	boundaryRaw []int
	line        int
}

func (p JavaPropertiesParser) Parse(content []byte) (map[string]string, error) {
	values, _, err := p.ParseWithContext(content)
	if err != nil {
		return nil, err
	}
	return values, nil
}

func (p JavaPropertiesParser) ParseWithContext(content []byte) (map[string]string, map[string]string, error) {
	doc, err := parseJavaPropertiesDocument(content)
	if err != nil {
		return nil, nil, err
	}

	values := make(map[string]string, len(doc.entries))
	contextByKey := map[string]string{}
	for _, entry := range doc.entries {
		values[entry.key] = entry.sourceValue
		if len(entry.comments) == 0 {
			continue
		}
		context := strings.TrimSpace(strings.Join(entry.comments, "\n"))
		if context != "" {
			contextByKey[entry.key] = context
		}
	}
	if len(contextByKey) == 0 {
		contextByKey = nil
	}
	return values, contextByKey, nil
}

// MarshalJavaProperties preserves comments, key order, and key separators while
// replacing value literals. New keys are appended in sorted order.
func MarshalJavaProperties(template []byte, values map[string]string) ([]byte, error) {
	doc, err := parseJavaPropertiesDocument(template)
	if err != nil {
		return nil, err
	}
	return doc.render(values), nil
}

func parseJavaPropertiesDocument(content []byte) (propertiesDocument, error) {
	if !utf8.Valid(content) {
		return propertiesDocument{}, fmt.Errorf("properties decode: content must be valid UTF-8")
	}

	text := string(content)
	doc := propertiesDocument{template: text, entries: []propertiesEntry{}}
	seen := map[string]int{}
	var pendingComments []string
	currentLine := 1

	for pos := 0; pos < len(text); {
		contentStart, contentEnd, next := readPropertiesPhysicalLine(text, pos)
		rawLine := text[contentStart:contentEnd]
		first := firstPropertiesNonWhitespace(rawLine)
		if first >= len(rawLine) {
			pendingComments = nil
			currentLine += strings.Count(text[pos:next], "\n")
			pos = next
			continue
		}
		if rawLine[first] == '#' || rawLine[first] == '!' {
			pendingComments = append(pendingComments, strings.TrimSpace(rawLine[first+1:]))
			currentLine += strings.Count(text[pos:next], "\n")
			pos = next
			continue
		}

		logical, nextPos, err := readPropertiesLogicalLine(text, pos, currentLine)
		if err != nil {
			return propertiesDocument{}, err
		}
		entry, err := parseJavaPropertiesEntry(logical, pendingComments)
		if err != nil {
			return propertiesDocument{}, err
		}
		pendingComments = nil

		if previousLine, ok := seen[entry.key]; ok {
			return propertiesDocument{}, fmt.Errorf("line %d: duplicate properties key %q first defined on line %d", entry.line, entry.key, previousLine)
		}
		seen[entry.key] = entry.line
		doc.entries = append(doc.entries, entry)
		currentLine += strings.Count(text[pos:nextPos], "\n")
		pos = nextPos
	}

	return doc, nil
}

func parseJavaPropertiesEntry(line propertiesLogicalLine, comments []string) (propertiesEntry, error) {
	text := line.text
	pos := 0
	if strings.HasPrefix(text, "\ufeff") {
		pos = len("\ufeff")
	}
	pos = skipPropertiesWhitespace(text, pos)
	keyStart := pos
	keyEnd := -1
	escaped := false

	for pos < len(text) {
		ch := text[pos]
		if escaped {
			escaped = false
			pos++
			continue
		}
		if ch == '\\' {
			escaped = true
			pos++
			continue
		}
		if ch == '=' || ch == ':' {
			keyEnd = pos
			pos++
			break
		}
		if isPropertiesWhitespace(ch) {
			keyEnd = pos
			pos = skipPropertiesWhitespace(text, pos)
			if pos < len(text) && (text[pos] == '=' || text[pos] == ':') {
				pos++
			}
			break
		}
		pos++
	}
	if escaped {
		return propertiesEntry{}, fmt.Errorf("line %d: dangling escape in key", line.line)
	}
	if keyEnd < 0 {
		keyEnd = len(text)
		pos = len(text)
	}

	valueStart := skipPropertiesWhitespace(text, pos)
	key, err := decodeJavaPropertiesEscapes(text[keyStart:keyEnd])
	if err != nil {
		return propertiesEntry{}, fmt.Errorf("line %d: decode key: %w", line.line, err)
	}
	if key == "" {
		return propertiesEntry{}, fmt.Errorf("line %d: properties key must not be empty", line.line)
	}

	value, err := decodeJavaPropertiesEscapes(text[valueStart:])
	if err != nil {
		return propertiesEntry{}, fmt.Errorf("line %d: decode value for key %q: %w", line.line, key, err)
	}

	valueStartRaw := line.rawStart + valueStart
	if line.boundaryRaw != nil {
		valueStartRaw = line.boundaryRaw[valueStart]
	}

	return propertiesEntry{
		key:         key,
		sourceValue: value,
		valueStart:  valueStartRaw,
		valueEnd:    line.rawEnd,
		comments:    slices.Clone(comments),
		line:        line.line,
	}, nil
}

func (d propertiesDocument) render(values map[string]string) []byte {
	// BOLT OPTIMIZATION: Removed redundant slices.Clone and slices.SortFunc.
	// Since entries are parsed sequentially, they are already sorted by
	// their position in the template.
	entries := d.entries

	var b strings.Builder
	seen := make(map[string]struct{}, len(values))
	cursor := 0
	for _, entry := range entries {
		if entry.valueStart < cursor || entry.valueStart > len(d.template) || entry.valueEnd > len(d.template) {
			continue
		}

		b.WriteString(d.template[cursor:entry.valueStart])
		if value, ok := values[entry.key]; ok {
			seen[entry.key] = struct{}{}
			b.WriteString(encodeJavaPropertiesValue(value))
		} else {
			b.WriteString(d.template[entry.valueStart:entry.valueEnd])
		}
		cursor = entry.valueEnd
	}
	b.WriteString(d.template[cursor:])

	missing := make([]string, 0, len(values)-len(seen))
	for key := range values {
		if _, ok := seen[key]; ok {
			continue
		}
		missing = append(missing, key)
	}
	slices.Sort(missing)
	if len(missing) == 0 {
		return []byte(b.String())
	}

	rendered := b.String()
	var out strings.Builder
	out.WriteString(rendered)
	if rendered != "" && !strings.HasSuffix(rendered, "\n") && !strings.HasSuffix(rendered, "\r") {
		out.WriteByte('\n')
	}
	for _, key := range missing {
		out.WriteString(encodeJavaPropertiesKey(key))
		out.WriteByte('=')
		out.WriteString(encodeJavaPropertiesValue(values[key]))
		out.WriteByte('\n')
	}
	return []byte(out.String())
}

func readPropertiesLogicalLine(text string, start int, lineNumber int) (propertiesLogicalLine, int, error) {
	contentStart, contentEnd, next := readPropertiesPhysicalLine(text, start)
	continued := propertiesLineContinues(text[contentStart:contentEnd])

	// Fast-path: Single-line properties without continuations (the common case)
	// avoid strings.Builder and boundaryRaw slice allocations.
	if !continued {
		return propertiesLogicalLine{
			text:        text[contentStart:contentEnd],
			rawStart:    contentStart,
			rawEnd:      contentEnd,
			boundaryRaw: nil,
			line:        lineNumber,
		}, next, nil
	}

	var b strings.Builder
	boundaryRaw := []int{contentStart}
	pos := start
	firstPhysicalLine := true

	for {
		// Use the already-calculated physical line bounds for the first iteration
		// to avoid redundant scanning.
		var pStart, pEnd, pNext int
		if firstPhysicalLine {
			pStart, pEnd, pNext = contentStart, contentEnd, next
		} else {
			pStart, pEnd, pNext = readPropertiesPhysicalLine(text, pos)
		}

		appendStart := pStart
		if !firstPhysicalLine {
			appendStart = skipPropertiesPhysicalWhitespace(text, appendStart, pEnd)
		}
		appendEnd := pEnd
		continued := propertiesLineContinues(text[pStart:pEnd])
		if continued {
			appendEnd--
		}
		appendPropertiesRawSpan(&b, &boundaryRaw, text, appendStart, appendEnd)

		if !continued {
			return propertiesLogicalLine{
				text:        b.String(),
				rawStart:    start,
				rawEnd:      pEnd,
				boundaryRaw: boundaryRaw,
				line:        lineNumber,
			}, pNext, nil
		}

		if pNext >= len(text) {
			// Accurately report the line where the dangling continuation was found.
			errLine := lineNumber + strings.Count(text[start:pEnd], "\n")
			return propertiesLogicalLine{}, pNext, fmt.Errorf("line %d: continuation escape at end of file", errLine)
		}

		pos = pNext
		firstPhysicalLine = false
	}
}

func readPropertiesPhysicalLine(text string, start int) (int, int, int) {
	// BOLT OPTIMIZATION: Use strings.IndexAny to skip ahead to the next newline
	// instead of byte-by-byte iteration.
	idx := strings.IndexAny(text[start:], "\n\r")
	if idx < 0 {
		return start, len(text), len(text)
	}
	end := start + idx
	i := end
	if i < len(text) {
		if text[i] == '\r' && i+1 < len(text) && text[i+1] == '\n' {
			i += 2
		} else {
			i++
		}
	}
	return start, end, i
}

func appendPropertiesRawSpan(b *strings.Builder, boundaryRaw *[]int, text string, start, end int) {
	for i := start; i < end; i++ {
		b.WriteByte(text[i])
		*boundaryRaw = append(*boundaryRaw, i+1)
	}
}

func propertiesLineContinues(raw string) bool {
	count := 0
	for i := len(raw) - 1; i >= 0 && raw[i] == '\\'; i-- {
		count++
	}
	return count%2 == 1
}

func firstPropertiesNonWhitespace(raw string) int {
	i := 0
	if strings.HasPrefix(raw, "\ufeff") {
		i = len("\ufeff")
	}
	for i < len(raw) && isPropertiesWhitespace(raw[i]) {
		i++
	}
	return i
}

func skipPropertiesWhitespace(s string, start int) int {
	i := start
	for i < len(s) && isPropertiesWhitespace(s[i]) {
		i++
	}
	return i
}

func skipPropertiesPhysicalWhitespace(s string, start, end int) int {
	i := start
	for i < end && isPropertiesWhitespace(s[i]) {
		i++
	}
	return i
}

func isPropertiesWhitespace(ch byte) bool {
	return ch == ' ' || ch == '\t' || ch == '\f'
}

func decodeJavaPropertiesEscapes(raw string) (string, error) {
	// BOLT OPTIMIZATION: Fast-path for strings without escapes to avoid
	// strings.Builder allocations and byte-by-byte iteration.
	if !strings.Contains(raw, "\\") {
		return strings.Clone(raw), nil
	}

	var b strings.Builder
	b.Grow(len(raw))
	for i := 0; i < len(raw); i++ {
		ch := raw[i]
		if ch != '\\' {
			b.WriteByte(ch)
			continue
		}
		i++
		if i >= len(raw) {
			return "", fmt.Errorf("dangling escape")
		}
		switch raw[i] {
		case 't':
			b.WriteByte('\t')
		case 'n':
			b.WriteByte('\n')
		case 'r':
			b.WriteByte('\r')
		case 'f':
			b.WriteByte('\f')
		case 'u':
			r, next, err := decodeJavaPropertiesUnicodeEscape(raw, i)
			if err != nil {
				return "", err
			}
			b.WriteRune(r)
			i = next
		default:
			b.WriteByte(raw[i])
		}
	}
	return b.String(), nil
}

func decodeJavaPropertiesUnicodeEscape(raw string, escapeIndex int) (rune, int, error) {
	if escapeIndex+4 >= len(raw) {
		return 0, escapeIndex, fmt.Errorf("invalid \\u escape")
	}
	value, err := strconv.ParseUint(raw[escapeIndex+1:escapeIndex+5], 16, 16)
	if err != nil {
		return 0, escapeIndex, fmt.Errorf("invalid \\u escape")
	}
	next := escapeIndex + 4
	r := rune(value)
	if !utf16.IsSurrogate(r) {
		return r, next, nil
	}
	if r < 0xD800 || r > 0xDBFF {
		return 0, escapeIndex, fmt.Errorf("invalid low surrogate without high surrogate")
	}
	if next+6 >= len(raw) || raw[next+1] != '\\' || raw[next+2] != 'u' {
		return 0, escapeIndex, fmt.Errorf("invalid surrogate pair")
	}
	nextValue, err := strconv.ParseUint(raw[next+3:next+7], 16, 16)
	if err != nil {
		return 0, escapeIndex, fmt.Errorf("invalid surrogate pair")
	}
	nextRune := rune(nextValue)
	if nextRune < 0xDC00 || nextRune > 0xDFFF {
		return 0, escapeIndex, fmt.Errorf("invalid surrogate pair")
	}
	return utf16.DecodeRune(r, nextRune), next + 6, nil
}

func encodeJavaPropertiesKey(s string) string {
	var b strings.Builder
	for _, r := range s {
		switch r {
		case ' ':
			b.WriteString(`\ `)
		case '\\':
			b.WriteString(`\\`)
		case '=', ':', '#', '!':
			b.WriteByte('\\')
			b.WriteRune(r)
		case '\t':
			b.WriteString(`\t`)
		case '\n':
			b.WriteString(`\n`)
		case '\r':
			b.WriteString(`\r`)
		case '\f':
			b.WriteString(`\f`)
		default:
			if !writeJavaPropertiesEscapedRune(&b, r) {
				b.WriteRune(r)
			}
		}
	}
	return b.String()
}

func encodeJavaPropertiesValue(s string) string {
	var b strings.Builder
	leadingSpace := true
	for _, r := range s {
		switch r {
		case ' ':
			if leadingSpace {
				b.WriteString(`\ `)
			} else {
				b.WriteRune(r)
			}
			continue
		case '\\':
			b.WriteString(`\\`)
		case '\t':
			b.WriteString(`\t`)
		case '\n':
			b.WriteString(`\n`)
		case '\r':
			b.WriteString(`\r`)
		case '\f':
			b.WriteString(`\f`)
		default:
			if !writeJavaPropertiesEscapedRune(&b, r) {
				b.WriteRune(r)
			}
		}
		leadingSpace = false
	}
	return b.String()
}

func writeJavaPropertiesEscapedRune(b *strings.Builder, r rune) bool {
	if r < 0x20 {
		// BOLT OPTIMIZATION: Use manual hex encoding instead of fmt.Fprintf to avoid reflection.
		b.WriteString(`\u`)
		b.WriteByte(hexDigits[(r>>12)&0xF])
		b.WriteByte(hexDigits[(r>>8)&0xF])
		b.WriteByte(hexDigits[(r>>4)&0xF])
		b.WriteByte(hexDigits[r&0xF])
		return true
	}
	if r > 0xFFFF {
		hi, lo := utf16.EncodeRune(r)
		// BOLT OPTIMIZATION: Use manual hex encoding instead of fmt.Fprintf to avoid reflection.
		b.WriteString(`\u`)
		b.WriteByte(hexDigits[(hi>>12)&0xF])
		b.WriteByte(hexDigits[(hi>>8)&0xF])
		b.WriteByte(hexDigits[(hi>>4)&0xF])
		b.WriteByte(hexDigits[hi&0xF])
		b.WriteString(`\u`)
		b.WriteByte(hexDigits[(lo>>12)&0xF])
		b.WriteByte(hexDigits[(lo>>8)&0xF])
		b.WriteByte(hexDigits[(lo>>4)&0xF])
		b.WriteByte(hexDigits[lo&0xF])
		return true
	}
	return false
}
