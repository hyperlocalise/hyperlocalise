package translationfileparser

import (
	"fmt"
	"slices"
	"strings"
	"unicode/utf8"
)

// INIParser parses Windows-style INI localization files.
type INIParser struct{}

type iniEntry struct {
	flatKey     string
	section     string
	sourceValue string
	valueStart  int
	valueEnd    int
	comments    []string
	quote       byte
	line        int
}

type iniDocument struct {
	template   string
	entries    []iniEntry
	sections   []string
	insertAt   map[string]int
	hasSection map[string]bool
}

func (p INIParser) Parse(content []byte) (map[string]string, error) {
	values, _, err := p.ParseWithContext(content)
	if err != nil {
		return nil, err
	}
	return values, nil
}

func (p INIParser) ParseWithContext(content []byte) (map[string]string, map[string]string, error) {
	doc, err := parseINIDocument(content)
	if err != nil {
		return nil, nil, err
	}

	values := make(map[string]string, len(doc.entries))
	contextByKey := make(map[string]string, len(doc.entries))
	for _, entry := range doc.entries {
		values[entry.flatKey] = entry.sourceValue
		if context := formatPropertiesComments(entry.comments); context != "" {
			contextByKey[entry.flatKey] = context
		}
	}
	if len(contextByKey) == 0 {
		contextByKey = nil
	}
	return values, contextByKey, nil
}

// MarshalINI preserves comments, section order, and key order while replacing
// value literals. New keys are appended to matching sections, or to new
// sections created at the end of the file.
func MarshalINI(template []byte, values map[string]string) ([]byte, error) {
	doc, err := parseINIDocument(template)
	if err != nil {
		return nil, err
	}
	return doc.render(values), nil
}

func parseINIDocument(content []byte) (iniDocument, error) {
	if !utf8.Valid(content) {
		return iniDocument{}, fmt.Errorf("ini decode: content must be valid UTF-8")
	}

	text := string(content)
	doc := iniDocument{
		template:   text,
		entries:    make([]iniEntry, 0, 16),
		sections:   nil,
		insertAt:   map[string]int{"": 0},
		hasSection: map[string]bool{"": true},
	}
	seen := make(map[string]int, 16)
	var pendingComments []string
	pendingCommentStart := -1
	currentSection := ""
	currentLine := 1
	firstSectionStart := -1

	for pos := 0; pos < len(text); {
		contentStart, contentEnd, next := readINIPhysicalLine(text, pos)
		rawLine := text[contentStart:contentEnd]
		first := firstININonWhitespace(rawLine, pos == 0)
		lineNumber := currentLine
		currentLine += countINILines(text[pos:next])

		if first >= len(rawLine) {
			pendingComments = nil
			pendingCommentStart = -1
			pos = next
			continue
		}

		switch rawLine[first] {
		case ';', '#':
			comment := rawLine[first+1:]
			if len(comment) > 0 && (comment[0] == ' ' || comment[0] == '\t') {
				comment = comment[1:]
			}
			if pendingCommentStart < 0 {
				pendingCommentStart = contentStart
			}
			pendingComments = append(pendingComments, comment)
			pos = next
			continue
		case '[':
			section, err := parseINISectionName(rawLine[first:], lineNumber)
			if err != nil {
				return iniDocument{}, err
			}
			if firstSectionStart < 0 {
				firstSectionStart = contentStart
				if !hasINIEntriesInSection(doc.entries, "") {
					insertAt := contentStart
					if pendingCommentStart >= 0 {
						insertAt = pendingCommentStart
					}
					doc.insertAt[""] = iniGlobalInsertOffset(text, insertAt)
				}
			}
			currentSection = section
			if !doc.hasSection[section] {
				doc.hasSection[section] = true
				doc.sections = append(doc.sections, section)
			}
			doc.insertAt[section] = next
			pos = next
			continue
		}

		entry, err := parseINIEntry(text, contentStart, contentEnd, first, currentSection, pendingComments, lineNumber)
		if err != nil {
			return iniDocument{}, err
		}
		pendingComments = nil
		pendingCommentStart = -1

		if previousLine, ok := seen[entry.flatKey]; ok {
			return iniDocument{}, fmt.Errorf("line %d: duplicate ini key %q first defined on line %d", entry.line, entry.flatKey, previousLine)
		}
		seen[entry.flatKey] = entry.line
		doc.entries = append(doc.entries, entry)
		doc.insertAt[currentSection] = next
		pos = next
	}

	if firstSectionStart < 0 && len(text) > 0 {
		doc.insertAt[""] = len(text)
	}
	return doc, nil
}

func hasINIEntriesInSection(entries []iniEntry, section string) bool {
	for _, entry := range entries {
		if entry.section == section {
			return true
		}
	}
	return false
}

func parseINISectionName(line string, lineNumber int) (string, error) {
	closeIdx := strings.IndexByte(line, ']')
	if closeIdx < 0 {
		return "", fmt.Errorf("line %d: unclosed ini section header", lineNumber)
	}
	name := strings.TrimSpace(line[1:closeIdx])
	if name == "" {
		return "", fmt.Errorf("line %d: ini section name must not be empty", lineNumber)
	}
	rest := strings.TrimSpace(line[closeIdx+1:])
	if rest != "" && rest[0] != ';' && rest[0] != '#' {
		return "", fmt.Errorf("line %d: unexpected text after ini section header", lineNumber)
	}
	return name, nil
}

func parseINIEntry(text string, lineStart, lineEnd, first int, section string, comments []string, lineNumber int) (iniEntry, error) {
	pos := lineStart + first
	keyStart := pos
	sep := -1
	for i := pos; i < lineEnd; i++ {
		ch := text[i]
		if ch == '=' || ch == ':' {
			sep = i
			break
		}
	}
	if sep < 0 {
		return iniEntry{}, fmt.Errorf("line %d: ini entry must use '=' or ':'", lineNumber)
	}

	key := strings.TrimSpace(text[keyStart:sep])
	if key == "" {
		return iniEntry{}, fmt.Errorf("line %d: ini key must not be empty", lineNumber)
	}

	valuePos := skipINIWhitespace(text, sep+1, lineEnd)
	var (
		quote       byte
		sourceValue string
		valueStart  int
		valueEnd    int
	)

	if valuePos < lineEnd && (text[valuePos] == '"' || text[valuePos] == '\'') {
		decoded, end, err := decodeINIQuoted(text, valuePos, lineEnd, lineNumber)
		if err != nil {
			return iniEntry{}, err
		}
		if rest := skipINIWhitespace(text, end, lineEnd); rest < lineEnd && text[rest] != ';' && text[rest] != '#' {
			return iniEntry{}, fmt.Errorf("line %d: unexpected text after ini quoted value", lineNumber)
		}
		quote = text[valuePos]
		sourceValue = decoded
		valueStart = valuePos
		valueEnd = end
	} else {
		inline := indexINIInlineComment(text, sep+1, lineEnd)
		rawEnd := lineEnd
		if inline >= 0 {
			rawEnd = inline
		}
		rawValue := text[valuePos:rawEnd]
		sourceValue = strings.TrimRight(rawValue, " \t")
		valueStart = valuePos
		valueEnd = valuePos + len(sourceValue)
		if sourceValue == "" && inline >= 0 {
			valueStart = sep + 1
			valueEnd = sep + 1
		}
	}

	var commentsClone []string
	if len(comments) > 0 {
		commentsClone = slices.Clone(comments)
	}

	return iniEntry{
		flatKey:     joinINIKey(section, key),
		section:     section,
		sourceValue: sourceValue,
		valueStart:  valueStart,
		valueEnd:    valueEnd,
		comments:    commentsClone,
		quote:       quote,
		line:        lineNumber,
	}, nil
}

func decodeINIQuoted(text string, start, end, lineNumber int) (string, int, error) {
	quote := text[start]
	var b strings.Builder
	escaped := false
	for i := start + 1; i < end; i++ {
		ch := text[i]
		if escaped {
			switch ch {
			case 'n':
				b.WriteByte('\n')
			case 't':
				b.WriteByte('\t')
			case 'r':
				b.WriteByte('\r')
			case '\\', '"', '\'':
				b.WriteByte(ch)
			default:
				b.WriteByte('\\')
				b.WriteByte(ch)
			}
			escaped = false
			continue
		}
		if ch == '\\' {
			escaped = true
			continue
		}
		if ch == quote {
			return b.String(), i + 1, nil
		}
		b.WriteByte(ch)
	}
	return "", start, fmt.Errorf("line %d: unclosed ini quoted value", lineNumber)
}

// indexINIInlineComment returns the start of an inline `;` or `#` comment.
// start must be the first byte after `=` or `:`. A delimiter there is a value,
// not a comment; the same delimiter after whitespace is a comment, including
// when the value is empty.
func indexINIInlineComment(text string, start, end int) int {
	for i := start; i < end; i++ {
		ch := text[i]
		if ch != ';' && ch != '#' {
			continue
		}
		if i == start {
			continue
		}
		prev := text[i-1]
		if prev == ' ' || prev == '\t' {
			return i
		}
	}
	return -1
}

func (d iniDocument) render(values map[string]string) []byte {
	newline := iniNewline(d.template)
	seen := make(map[string]struct{}, len(values))

	type edit struct {
		start int
		end   int
		text  string
		order int
	}
	edits := make([]edit, 0, len(d.entries)+4)
	for _, entry := range d.entries {
		if value, ok := values[entry.flatKey]; ok {
			seen[entry.flatKey] = struct{}{}
			edits = append(edits, edit{
				start: entry.valueStart,
				end:   entry.valueEnd,
				text:  encodeINIValue(value, entry.quote),
			})
		}
	}

	missingBySection := make(map[string][]string)
	knownSections := append([]string{""}, d.sections...)
	newSectionSet := make(map[string]struct{})
	for key := range values {
		if _, ok := seen[key]; ok {
			continue
		}
		section, localKey := splitINIKey(key, knownSections)
		if !d.hasSection[section] {
			newSectionSet[section] = struct{}{}
		}
		missingBySection[section] = append(missingBySection[section], localKey)
	}
	for section := range missingBySection {
		slices.Sort(missingBySection[section])
	}

	insertOrder := 1
	for _, section := range knownSections {
		keys := missingBySection[section]
		if len(keys) == 0 || !d.hasSection[section] {
			continue
		}
		at := d.insertAt[section]
		edits = append(edits, edit{
			start: at,
			end:   at,
			text:  formatINIEntries(section, keys, values, newline, false),
			order: insertOrder,
		})
		insertOrder++
	}

	newSections := make([]string, 0, len(newSectionSet))
	for section := range newSectionSet {
		newSections = append(newSections, section)
	}
	slices.Sort(newSections)
	if len(newSections) > 0 {
		var b strings.Builder
		if d.template != "" && !strings.HasSuffix(d.template, "\n") && !strings.HasSuffix(d.template, "\r") {
			b.WriteString(newline)
		}
		for _, section := range newSections {
			b.WriteString(formatINIEntries(section, missingBySection[section], values, newline, true))
		}
		edits = append(edits, edit{
			start: len(d.template),
			end:   len(d.template),
			text:  b.String(),
			order: insertOrder,
		})
	}

	slices.SortFunc(edits, func(a, b edit) int {
		if a.start != b.start {
			return a.start - b.start
		}
		if a.end != b.end {
			return a.end - b.end
		}
		return a.order - b.order
	})

	var out strings.Builder
	out.Grow(len(d.template))
	cursor := 0
	for _, e := range edits {
		if e.start < cursor || e.start > len(d.template) || e.end > len(d.template) {
			continue
		}
		out.WriteString(d.template[cursor:e.start])
		if e.start == e.end && e.order > 0 {
			out.WriteString(iniInsertionPrefix(d.template, e.start, newline))
		}
		out.WriteString(e.text)
		cursor = e.end
	}
	out.WriteString(d.template[cursor:])
	return []byte(out.String())
}

func formatINIEntries(section string, keys []string, values map[string]string, newline string, writeHeader bool) string {
	var b strings.Builder
	if writeHeader && section != "" {
		b.WriteByte('[')
		b.WriteString(section)
		b.WriteByte(']')
		b.WriteString(newline)
	}
	for _, key := range keys {
		b.WriteString(key)
		b.WriteByte('=')
		b.WriteString(encodeINIValue(values[joinINIKey(section, key)], 0))
		b.WriteString(newline)
	}
	return b.String()
}

func iniGlobalInsertOffset(text string, contentStart int) int {
	if contentStart == 0 && strings.HasPrefix(text, "\ufeff") {
		return len("\ufeff")
	}
	return contentStart
}

func iniInsertionPrefix(template string, at int, newline string) string {
	if at <= 0 || at > len(template) {
		return ""
	}
	if at == len("\ufeff") && strings.HasPrefix(template, "\ufeff") {
		return ""
	}
	prev := template[at-1]
	if prev == '\n' || prev == '\r' {
		return ""
	}
	return newline
}

func joinINIKey(section, key string) string {
	if section == "" {
		return key
	}
	return section + "." + key
}

func splitINIKey(flat string, knownSections []string) (string, string) {
	best := ""
	for _, section := range knownSections {
		if section == "" {
			continue
		}
		prefix := section + "."
		if strings.HasPrefix(flat, prefix) && len(section) >= len(best) {
			if rest := flat[len(prefix):]; rest != "" {
				best = section
			}
		}
	}
	if best != "" {
		return best, flat[len(best)+1:]
	}
	if idx := strings.LastIndex(flat, "."); idx > 0 && idx < len(flat)-1 {
		return flat[:idx], flat[idx+1:]
	}
	return "", flat
}

func encodeINIValue(value string, quote byte) string {
	if quote == '"' || quote == '\'' {
		return encodeINIQuoted(value, quote)
	}
	if iniValueNeedsQuotes(value) {
		return encodeINIQuoted(value, '"')
	}
	return value
}

func iniValueNeedsQuotes(value string) bool {
	if value == "" {
		return false
	}
	if strings.TrimSpace(value) != value {
		return true
	}
	if strings.ContainsAny(value, "\n\r;#") {
		return true
	}
	return strings.HasPrefix(value, `"`) || strings.HasPrefix(value, "'")
}

func encodeINIQuoted(value string, quote byte) string {
	var b strings.Builder
	b.Grow(len(value) + 2)
	b.WriteByte(quote)
	for _, r := range value {
		switch r {
		case '\\':
			b.WriteString(`\\`)
		case '\n':
			b.WriteString(`\n`)
		case '\t':
			b.WriteString(`\t`)
		case '\r':
			b.WriteString(`\r`)
		case '"':
			if quote == '"' {
				b.WriteString(`\"`)
			} else {
				b.WriteRune(r)
			}
		case '\'':
			if quote == '\'' {
				b.WriteString(`\'`)
			} else {
				b.WriteRune(r)
			}
		default:
			b.WriteRune(r)
		}
	}
	b.WriteByte(quote)
	return b.String()
}

func iniNewline(template string) string {
	if strings.Contains(template, "\r\n") {
		return "\r\n"
	}
	return "\n"
}

func readINIPhysicalLine(text string, start int) (int, int, int) {
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

func firstININonWhitespace(raw string, stripBOM bool) int {
	i := 0
	if stripBOM && strings.HasPrefix(raw, "\ufeff") {
		i = len("\ufeff")
	}
	for i < len(raw) && (raw[i] == ' ' || raw[i] == '\t') {
		i++
	}
	return i
}

func skipINIWhitespace(s string, start, end int) int {
	i := start
	for i < end && (s[i] == ' ' || s[i] == '\t') {
		i++
	}
	return i
}

func countINILines(s string) int {
	if !strings.ContainsAny(s, "\r\n") {
		return 0
	}
	lines := 0
	for i := 0; i < len(s); i++ {
		switch s[i] {
		case '\n':
			lines++
		case '\r':
			if i+1 < len(s) && s[i+1] == '\n' {
				i++
			}
			lines++
		}
	}
	return lines
}
