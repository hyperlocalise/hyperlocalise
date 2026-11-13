package translationfileparser

import (
	"fmt"
	"slices"
	"strconv"
	"strings"
	"unicode/utf8"
)

// TOMLParser extracts string assignments from TOML locale files.
type TOMLParser struct{}

type tomlQuoteKind int

const (
	tomlQuoteBasic tomlQuoteKind = iota
	tomlQuoteLiteral
	tomlQuoteMLBasic
	tomlQuoteMLLiteral
)

type tomlEntry struct {
	flatKey     string
	sourceValue string
	valueStart  int
	valueEnd    int
	quote       tomlQuoteKind
}

type tomlDocument struct {
	template        string
	entries         []tomlEntry
	newline         string
	firstTableStart int
}

func (p TOMLParser) Parse(content []byte) (map[string]string, error) {
	values, _, err := p.ParseWithContext(content)
	if err != nil {
		return nil, err
	}
	return values, nil
}

func (p TOMLParser) ParseWithContext(content []byte) (map[string]string, map[string]string, error) {
	doc, err := parseTOMLDocument(content)
	if err != nil {
		return nil, nil, err
	}
	values := make(map[string]string, len(doc.entries))
	for _, entry := range doc.entries {
		values[entry.flatKey] = entry.sourceValue
	}
	return values, nil, nil
}

// MarshalTOML replaces string literals in place and appends new dotted keys.
func MarshalTOML(template []byte, values map[string]string) ([]byte, error) {
	doc, err := parseTOMLDocument(template)
	if err != nil {
		return nil, err
	}
	return doc.render(values), nil
}

func parseTOMLDocument(content []byte) (tomlDocument, error) {
	if !utf8.Valid(content) {
		return tomlDocument{}, fmt.Errorf("toml decode: content must be valid UTF-8")
	}
	text := string(content)
	doc := tomlDocument{
		template:        text,
		entries:         make([]tomlEntry, 0, 16),
		newline:         tomlNewline(text),
		firstTableStart: -1,
	}
	seen := make(map[string]struct{}, 16)
	pos := 0
	if strings.HasPrefix(text, "\ufeff") {
		pos = len("\ufeff")
	}
	currentTable := ""
	line := 1
	for pos < len(text) {
		pos = skipTOMLIdle(text, pos, &line)
		if pos >= len(text) {
			break
		}
		if text[pos] == '[' {
			if pos+1 < len(text) && text[pos+1] == '[' {
				return tomlDocument{}, fmt.Errorf("line %d: toml array-of-tables is not supported", line)
			}
			if doc.firstTableStart < 0 {
				doc.firstTableStart = pos
			}
			table, next, err := parseTOMLTableHeader(text, pos, line)
			if err != nil {
				return tomlDocument{}, err
			}
			currentTable = table
			pos = next
			continue
		}
		entries, next, err := parseTOMLKeyValue(text, pos, currentTable, line)
		if err != nil {
			return tomlDocument{}, err
		}
		for _, entry := range entries {
			if _, ok := seen[entry.flatKey]; ok {
				return tomlDocument{}, fmt.Errorf("line %d: duplicate toml key %q", line, entry.flatKey)
			}
			seen[entry.flatKey] = struct{}{}
			doc.entries = append(doc.entries, entry)
		}
		pos = next
	}
	return doc, nil
}

func (d tomlDocument) render(values map[string]string) []byte {
	seen := make(map[string]struct{}, len(d.entries)+len(values))
	for _, entry := range d.entries {
		seen[entry.flatKey] = struct{}{}
	}
	var b strings.Builder
	b.Grow(len(d.template))
	cursor := 0
	insertedExtras := false
	writeExtras := func() {
		if insertedExtras {
			return
		}
		insertedExtras = true
		extras := tomlAppendableExtraKeys(values, seen)
		if len(extras) == 0 {
			return
		}
		if b.Len() > 0 {
			out := b.String()
			if !strings.HasSuffix(out, "\n") && !strings.HasSuffix(out, "\r") {
				b.WriteString(d.newline)
			}
		}
		for _, key := range extras {
			seen[key] = struct{}{}
			b.WriteString(encodeTOMLDottedKey(key))
			b.WriteString(" = ")
			b.WriteString(encodeTOMLString(values[key], tomlQuoteBasic))
			b.WriteString(d.newline)
		}
	}

	for _, entry := range d.entries {
		if entry.valueStart < cursor || entry.valueEnd > len(d.template) {
			continue
		}
		if d.firstTableStart >= 0 && !insertedExtras && entry.valueStart >= d.firstTableStart {
			b.WriteString(d.template[cursor:d.firstTableStart])
			cursor = d.firstTableStart
			writeExtras()
		}
		b.WriteString(d.template[cursor:entry.valueStart])
		if translated, ok := values[entry.flatKey]; ok {
			seen[entry.flatKey] = struct{}{}
			b.WriteString(encodeTOMLString(translated, entry.quote))
		} else {
			b.WriteString(d.template[entry.valueStart:entry.valueEnd])
		}
		cursor = entry.valueEnd
	}
	if d.firstTableStart >= 0 && !insertedExtras && cursor <= d.firstTableStart {
		b.WriteString(d.template[cursor:d.firstTableStart])
		cursor = d.firstTableStart
		writeExtras()
	}
	b.WriteString(d.template[cursor:])
	if !insertedExtras {
		writeExtras()
	}
	return []byte(b.String())
}

func tomlAppendableExtraKeys(values map[string]string, seen map[string]struct{}) []string {
	var extra []string
	for key := range values {
		if _, ok := seen[key]; ok {
			continue
		}
		if !isTOMLAppendableKey(key) {
			continue
		}
		extra = append(extra, key)
	}
	slices.Sort(extra)
	return extra
}

func isTOMLAppendableKey(key string) bool {
	return key != "" && !strings.ContainsAny(key, "[]")
}

func encodeTOMLDottedKey(key string) string {
	parts := strings.Split(key, ".")
	for i, part := range parts {
		if !isTOMLBareKey(part) {
			parts[i] = encodeTOMLString(part, tomlQuoteBasic)
		}
	}
	return strings.Join(parts, ".")
}

func isTOMLBareKey(key string) bool {
	if key == "" {
		return false
	}
	for i := 0; i < len(key); i++ {
		if !isTOMLBareKeyChar(key[i]) {
			return false
		}
	}
	return true
}

func skipTOMLIdle(text string, pos int, line *int) int {
	for pos < len(text) {
		switch text[pos] {
		case ' ', '\t':
			pos++
		case '\n':
			*line++
			pos++
		case '\r':
			*line++
			if pos+1 < len(text) && text[pos+1] == '\n' {
				pos += 2
			} else {
				pos++
			}
		case '#':
			for pos < len(text) && text[pos] != '\n' && text[pos] != '\r' {
				pos++
			}
		default:
			return pos
		}
	}
	return pos
}

func parseTOMLTableHeader(text string, pos, line int) (string, int, error) {
	pos++
	key, next, err := parseTOMLKey(text, pos, line)
	if err != nil {
		return "", pos, err
	}
	pos = skipTOMLSpace(text, next)
	if pos >= len(text) || text[pos] != ']' {
		return "", pos, fmt.Errorf("line %d: unclosed toml table header", line)
	}
	pos++
	pos = skipTOMLSpace(text, pos)
	if pos < len(text) && text[pos] != '#' && text[pos] != '\n' && text[pos] != '\r' {
		return "", pos, fmt.Errorf("line %d: unexpected text after toml table header", line)
	}
	return key, pos, nil
}

func parseTOMLKeyValue(text string, pos int, table string, line int) ([]tomlEntry, int, error) {
	key, next, err := parseTOMLKey(text, pos, line)
	if err != nil {
		return nil, pos, err
	}
	pos = skipTOMLSpace(text, next)
	if pos >= len(text) || text[pos] != '=' {
		return nil, pos, fmt.Errorf("line %d: toml key %q must be followed by '='", line, key)
	}
	pos = skipTOMLSpace(text, pos+1)
	flat := joinTOMLKey(table, key)
	entries, next, err := parseTOMLValue(text, pos, flat, line)
	if err != nil {
		return nil, pos, err
	}
	return entries, next, nil
}

func parseTOMLKey(text string, pos, line int) (string, int, error) {
	var parts []string
	for {
		pos = skipTOMLSpace(text, pos)
		if pos >= len(text) {
			return "", pos, fmt.Errorf("line %d: expected toml key", line)
		}
		part, next, err := parseTOMLKeyPart(text, pos, line)
		if err != nil {
			return "", pos, err
		}
		parts = append(parts, part)
		pos = skipTOMLSpace(text, next)
		if pos < len(text) && text[pos] == '.' {
			pos++
			continue
		}
		return strings.Join(parts, "."), pos, nil
	}
}

func parseTOMLKeyPart(text string, pos, line int) (string, int, error) {
	if text[pos] == '"' || text[pos] == '\'' {
		value, _, end, _, err := parseTOMLString(text, pos, line)
		if err != nil {
			return "", pos, err
		}
		return value, end, nil
	}
	start := pos
	for pos < len(text) && isTOMLBareKeyChar(text[pos]) {
		pos++
	}
	if pos == start {
		return "", pos, fmt.Errorf("line %d: expected toml key", line)
	}
	return text[start:pos], pos, nil
}

func parseTOMLValue(text string, pos int, key string, line int) ([]tomlEntry, int, error) {
	if pos >= len(text) {
		return nil, pos, fmt.Errorf("line %d: toml key %q is missing a value", line, key)
	}
	switch text[pos] {
	case '"', '\'':
		value, quote, end, literalStart, err := parseTOMLString(text, pos, line)
		if err != nil {
			return nil, pos, err
		}
		return []tomlEntry{{
			flatKey:     key,
			sourceValue: value,
			valueStart:  literalStart,
			valueEnd:    end,
			quote:       quote,
		}}, end, nil
	case '[':
		return parseTOMLStringArray(text, pos, key, line)
	case '{':
		return parseTOMLInlineTable(text, pos, key, line)
	default:
		end := pos
		for end < len(text) && text[end] != '#' && text[end] != '\n' && text[end] != '\r' {
			end++
		}
		return nil, end, nil
	}
}

func parseTOMLStringArray(text string, pos int, key string, line int) ([]tomlEntry, int, error) {
	pos++
	var entries []tomlEntry
	index := 0
	for {
		pos = skipTOMLIdle(text, pos, &line)
		if pos >= len(text) {
			return nil, pos, fmt.Errorf("line %d: unclosed toml array for %q", line, key)
		}
		if text[pos] == ']' {
			return entries, pos + 1, nil
		}
		switch text[pos] {
		case '"', '\'':
			value, quote, end, literalStart, err := parseTOMLString(text, pos, line)
			if err != nil {
				return nil, pos, err
			}
			entries = append(entries, tomlEntry{
				flatKey:     key + "[" + strconv.Itoa(index) + "]",
				sourceValue: value,
				valueStart:  literalStart,
				valueEnd:    end,
				quote:       quote,
			})
			index++
			pos = skipTOMLIdle(text, end, &line)
		case '[':
			child, next, err := parseTOMLStringArray(text, pos, key+"["+strconv.Itoa(index)+"]", line)
			if err != nil {
				return nil, pos, err
			}
			entries = append(entries, child...)
			index++
			pos = skipTOMLIdle(text, next, &line)
		case '{':
			child, next, err := parseTOMLInlineTable(text, pos, key+"["+strconv.Itoa(index)+"]", line)
			if err != nil {
				return nil, pos, err
			}
			entries = append(entries, child...)
			index++
			pos = skipTOMLIdle(text, next, &line)
		default:
			next, err := skipTOMLValue(text, pos, &line)
			if err != nil {
				return nil, pos, err
			}
			index++
			pos = skipTOMLIdle(text, next, &line)
		}
		if pos >= len(text) {
			return nil, pos, fmt.Errorf("line %d: unclosed toml array for %q", line, key)
		}
		if text[pos] == ',' {
			pos++
			continue
		}
		if text[pos] == ']' {
			return entries, pos + 1, nil
		}
		return nil, pos, fmt.Errorf("line %d: expected ',' or ']' in toml array %q", line, key)
	}
}

func skipTOMLValue(text string, pos int, line *int) (int, error) {
	if pos >= len(text) {
		return pos, fmt.Errorf("line %d: toml value is missing", *line)
	}
	switch text[pos] {
	case '"', '\'':
		_, _, end, _, err := parseTOMLString(text, pos, *line)
		return end, err
	case '[':
		return skipTOMLArray(text, pos, line)
	case '{':
		return skipTOMLInlineTableValue(text, pos, line)
	default:
		end := pos
		for end < len(text) {
			ch := text[end]
			if ch == ',' || ch == ']' || ch == '}' || ch == '#' || ch == '\n' || ch == '\r' {
				break
			}
			end++
		}
		if end == pos {
			return pos, fmt.Errorf("line %d: expected toml value", *line)
		}
		return end, nil
	}
}

func skipTOMLArray(text string, pos int, line *int) (int, error) {
	pos++
	for {
		pos = skipTOMLIdle(text, pos, line)
		if pos >= len(text) {
			return pos, fmt.Errorf("line %d: unclosed toml array", *line)
		}
		if text[pos] == ']' {
			return pos + 1, nil
		}
		next, err := skipTOMLValue(text, pos, line)
		if err != nil {
			return pos, err
		}
		pos = skipTOMLIdle(text, next, line)
		if pos >= len(text) {
			return pos, fmt.Errorf("line %d: unclosed toml array", *line)
		}
		if text[pos] == ',' {
			pos++
			continue
		}
		if text[pos] == ']' {
			return pos + 1, nil
		}
		return pos, fmt.Errorf("line %d: expected ',' or ']' in toml array", *line)
	}
}

func skipTOMLInlineTableValue(text string, pos int, line *int) (int, error) {
	pos++
	for {
		pos = skipTOMLSpace(text, pos)
		if pos >= len(text) {
			return pos, fmt.Errorf("line %d: unclosed toml inline table", *line)
		}
		if text[pos] == '}' {
			return pos + 1, nil
		}
		_, next, err := parseTOMLKey(text, pos, *line)
		if err != nil {
			return pos, err
		}
		pos = skipTOMLSpace(text, next)
		if pos >= len(text) || text[pos] != '=' {
			return pos, fmt.Errorf("line %d: toml inline table key must be followed by '='", *line)
		}
		pos = skipTOMLSpace(text, pos+1)
		next, err = skipTOMLValue(text, pos, line)
		if err != nil {
			return pos, err
		}
		pos = skipTOMLSpace(text, next)
		if pos >= len(text) {
			return pos, fmt.Errorf("line %d: unclosed toml inline table", *line)
		}
		if text[pos] == ',' {
			pos++
			continue
		}
		if text[pos] == '}' {
			return pos + 1, nil
		}
		return pos, fmt.Errorf("line %d: expected ',' or '}' in toml inline table", *line)
	}
}

func parseTOMLInlineTable(text string, pos int, key string, line int) ([]tomlEntry, int, error) {
	pos++
	var entries []tomlEntry
	for {
		pos = skipTOMLSpace(text, pos)
		if pos >= len(text) {
			return nil, pos, fmt.Errorf("line %d: unclosed toml inline table for %q", line, key)
		}
		if text[pos] == '}' {
			return entries, pos + 1, nil
		}
		localKey, next, err := parseTOMLKey(text, pos, line)
		if err != nil {
			return nil, pos, err
		}
		pos = skipTOMLSpace(text, next)
		if pos >= len(text) || text[pos] != '=' {
			return nil, pos, fmt.Errorf("line %d: toml inline table key %q must be followed by '='", line, localKey)
		}
		pos = skipTOMLSpace(text, pos+1)
		child, next, err := parseTOMLValue(text, pos, joinTOMLKey(key, localKey), line)
		if err != nil {
			return nil, pos, err
		}
		entries = append(entries, child...)
		pos = skipTOMLSpace(text, next)
		if pos >= len(text) {
			return nil, pos, fmt.Errorf("line %d: unclosed toml inline table for %q", line, key)
		}
		if text[pos] == ',' {
			pos++
			continue
		}
		if text[pos] == '}' {
			return entries, pos + 1, nil
		}
		return nil, pos, fmt.Errorf("line %d: expected ',' or '}' in toml inline table %q", line, key)
	}
}

func parseTOMLString(text string, pos, line int) (string, tomlQuoteKind, int, int, error) {
	if pos+2 < len(text) && text[pos:pos+3] == `"""` {
		value, end, err := decodeTOMLMultiline(text, pos+3, '"', line)
		return value, tomlQuoteMLBasic, end, pos, err
	}
	if pos+2 < len(text) && text[pos:pos+3] == `'''` {
		value, end, err := decodeTOMLMultiline(text, pos+3, '\'', line)
		return value, tomlQuoteMLLiteral, end, pos, err
	}
	if text[pos] == '"' {
		value, end, err := decodeTOMLQuoted(text, pos+1, '"', true, line)
		return value, tomlQuoteBasic, end, pos, err
	}
	value, end, err := decodeTOMLQuoted(text, pos+1, '\'', false, line)
	return value, tomlQuoteLiteral, end, pos, err
}

func decodeTOMLQuoted(text string, pos int, quote byte, escape bool, line int) (string, int, error) {
	var b strings.Builder
	for pos < len(text) {
		ch := text[pos]
		if ch == quote {
			return b.String(), pos + 1, nil
		}
		if ch == '\n' || ch == '\r' {
			return "", pos, fmt.Errorf("line %d: unterminated toml string", line)
		}
		if escape && ch == '\\' {
			decoded, next, err := decodeTOMLEscape(text, pos+1, line)
			if err != nil {
				return "", pos, err
			}
			b.WriteString(decoded)
			pos = next
			continue
		}
		b.WriteByte(ch)
		pos++
	}
	return "", pos, fmt.Errorf("line %d: unterminated toml string", line)
}

func decodeTOMLMultiline(text string, pos int, quote byte, line int) (string, int, error) {
	if pos < len(text) && (text[pos] == '\n' || text[pos] == '\r') {
		if text[pos] == '\r' && pos+1 < len(text) && text[pos+1] == '\n' {
			pos += 2
		} else {
			pos++
		}
	}
	var b strings.Builder
	escape := quote == '"'
	for pos < len(text) {
		if pos+2 < len(text) && text[pos] == quote && text[pos+1] == quote && text[pos+2] == quote {
			return b.String(), pos + 3, nil
		}
		ch := text[pos]
		if escape && ch == '\\' {
			if pos+1 < len(text) && (text[pos+1] == '\n' || text[pos+1] == '\r') {
				pos++
				for pos < len(text) && (text[pos] == ' ' || text[pos] == '\t' || text[pos] == '\n' || text[pos] == '\r') {
					pos++
				}
				continue
			}
			decoded, next, err := decodeTOMLEscape(text, pos+1, line)
			if err != nil {
				return "", pos, err
			}
			b.WriteString(decoded)
			pos = next
			continue
		}
		b.WriteByte(ch)
		pos++
	}
	return "", pos, fmt.Errorf("line %d: unterminated toml multiline string", line)
}

func decodeTOMLEscape(text string, pos, line int) (string, int, error) {
	if pos >= len(text) {
		return "", pos, fmt.Errorf("line %d: unterminated toml escape", line)
	}
	switch text[pos] {
	case 'b':
		return "\b", pos + 1, nil
	case 't':
		return "\t", pos + 1, nil
	case 'n':
		return "\n", pos + 1, nil
	case 'f':
		return "\f", pos + 1, nil
	case 'r':
		return "\r", pos + 1, nil
	case '"', '\\':
		return string(text[pos]), pos + 1, nil
	case 'u':
		return decodeTOMLUnicode(text, pos+1, 4, line)
	case 'U':
		return decodeTOMLUnicode(text, pos+1, 8, line)
	default:
		return "", pos, fmt.Errorf("line %d: unsupported toml escape \\%c", line, text[pos])
	}
}

func decodeTOMLUnicode(text string, pos, width, line int) (string, int, error) {
	if pos+width > len(text) {
		return "", pos, fmt.Errorf("line %d: unterminated toml unicode escape", line)
	}
	value, err := strconv.ParseUint(text[pos:pos+width], 16, 32)
	if err != nil {
		return "", pos, fmt.Errorf("line %d: invalid toml unicode escape: %w", line, err)
	}
	if value > utf8.MaxRune || !utf8.ValidRune(rune(value)) {
		return "", pos, fmt.Errorf("line %d: toml unicode escape %q is not a valid unicode scalar value", line, text[pos:pos+width])
	}
	return string(rune(value)), pos + width, nil
}

func encodeTOMLString(value string, quote tomlQuoteKind) string {
	switch quote {
	case tomlQuoteLiteral:
		if !strings.ContainsAny(value, "'\n\r") {
			return "'" + value + "'"
		}
	case tomlQuoteMLLiteral:
		if !strings.Contains(value, "'''") {
			return "'''\n" + value + "'''"
		}
	case tomlQuoteMLBasic:
		return `"""` + "\n" + escapeTOMLBasic(value) + `"""`
	}
	return `"` + escapeTOMLBasic(value) + `"`
}

func escapeTOMLBasic(value string) string {
	var b strings.Builder
	b.Grow(len(value))
	for _, r := range value {
		switch r {
		case '\\':
			b.WriteString(`\\`)
		case '"':
			b.WriteString(`\"`)
		case '\n':
			b.WriteString(`\n`)
		case '\r':
			b.WriteString(`\r`)
		case '\t':
			b.WriteString(`\t`)
		case '\b':
			b.WriteString(`\b`)
		case '\f':
			b.WriteString(`\f`)
		default:
			if r < 0x20 {
				b.WriteString(`\u00`)
				b.WriteString(strconv.FormatInt(int64(r), 16))
			} else {
				b.WriteRune(r)
			}
		}
	}
	return b.String()
}

func joinTOMLKey(table, key string) string {
	if table == "" {
		return key
	}
	if key == "" {
		return table
	}
	return table + "." + key
}

func skipTOMLSpace(text string, pos int) int {
	for pos < len(text) && (text[pos] == ' ' || text[pos] == '\t') {
		pos++
	}
	return pos
}

func isTOMLBareKeyChar(ch byte) bool {
	return ch == '_' || ch == '-' ||
		(ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9')
}

func tomlNewline(template string) string {
	if strings.Contains(template, "\r\n") {
		return "\r\n"
	}
	return "\n"
}
