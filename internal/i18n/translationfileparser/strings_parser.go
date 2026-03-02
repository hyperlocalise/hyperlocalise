package translationfileparser

import (
	"fmt"
	"sort"
	"strconv"
	"strings"
	"unicode/utf16"
)

// AppleStringsParser parses Apple .strings localization files.
type AppleStringsParser struct{}

type stringsEntry struct {
	key          string
	sourceValue  string
	valueLiteral string
	valueStart   int
	valueEnd     int
}

type stringsDocument struct {
	template string
	entries  []stringsEntry
}

func (p AppleStringsParser) Parse(content []byte) (map[string]string, error) {
	doc, err := parseStringsDocument(content)
	if err != nil {
		return nil, err
	}
	out := map[string]string{}
	for _, entry := range doc.entries {
		out[entry.key] = entry.sourceValue
	}
	return out, nil
}

func MarshalAppleStrings(template []byte, values map[string]string) ([]byte, error) {
	doc, err := parseStringsDocument(template)
	if err != nil {
		return nil, err
	}
	return doc.render(values), nil
}

func (d stringsDocument) render(values map[string]string) []byte {
	if len(d.entries) == 0 {
		return []byte(d.template)
	}

	entries := append([]stringsEntry(nil), d.entries...)
	sort.Slice(entries, func(i, j int) bool { return entries[i].valueStart < entries[j].valueStart })

	var b strings.Builder
	cursor := 0
	for _, entry := range entries {
		if entry.valueStart < cursor || entry.valueStart > len(d.template) || entry.valueEnd > len(d.template) {
			continue
		}
		b.WriteString(d.template[cursor:entry.valueStart])
		if translated, ok := values[entry.key]; ok {
			b.WriteString(encodeAppleStringsQuoted(translated))
		} else {
			b.WriteString(entry.valueLiteral)
		}
		cursor = entry.valueEnd
	}
	b.WriteString(d.template[cursor:])
	return []byte(b.String())
}

func parseStringsDocument(content []byte) (stringsDocument, error) {
	text := string(content)
	doc := stringsDocument{template: text, entries: []stringsEntry{}}

	i := 0
	for i < len(text) {
		next, err := skipStringsTrivia(text, i)
		if err != nil {
			return stringsDocument{}, err
		}
		i = next
		if i >= len(text) {
			break
		}

		keyToken, next, err := parseStringsQuotedToken(text, i)
		if err != nil {
			return stringsDocument{}, err
		}
		i = next

		i = skipStringsWhitespace(text, i)
		if i >= len(text) || text[i] != '=' {
			return stringsDocument{}, fmt.Errorf("line %d: expected '=' after key", lineNumberAt(text, i))
		}
		i++
		i = skipStringsWhitespace(text, i)

		valueToken, next, err := parseStringsQuotedToken(text, i)
		if err != nil {
			return stringsDocument{}, err
		}
		i = next
		i = skipStringsWhitespace(text, i)
		if i >= len(text) || text[i] != ';' {
			return stringsDocument{}, fmt.Errorf("line %d: expected ';' after value", lineNumberAt(text, i))
		}
		i++

		doc.entries = append(doc.entries, stringsEntry{
			key:          keyToken.decoded,
			sourceValue:  valueToken.decoded,
			valueLiteral: valueToken.raw,
			valueStart:   valueToken.start,
			valueEnd:     valueToken.end,
		})
	}

	return doc, nil
}

type stringsQuotedToken struct {
	decoded string
	raw     string
	start   int
	end     int
}

func parseStringsQuotedToken(text string, start int) (stringsQuotedToken, int, error) {
	if start >= len(text) || text[start] != '"' {
		return stringsQuotedToken{}, start, fmt.Errorf("line %d: expected quoted string", lineNumberAt(text, start))
	}

	i := start + 1
	for i < len(text) {
		if text[i] == '\\' {
			i += 2
			continue
		}
		if text[i] == '"' {
			raw := text[start : i+1]
			decoded, err := decodeAppleStringsQuoted(raw)
			if err != nil {
				return stringsQuotedToken{}, start, fmt.Errorf("line %d: %w", lineNumberAt(text, start), err)
			}
			return stringsQuotedToken{decoded: decoded, raw: raw, start: start, end: i + 1}, i + 1, nil
		}
		i++
	}

	return stringsQuotedToken{}, start, fmt.Errorf("line %d: unterminated quoted string", lineNumberAt(text, start))
}

func decodeAppleStringsQuoted(raw string) (string, error) {
	if len(raw) < 2 || raw[0] != '"' || raw[len(raw)-1] != '"' {
		return "", fmt.Errorf("expected quoted string")
	}

	var b strings.Builder
	for i := 1; i < len(raw)-1; i++ {
		ch := raw[i]
		if ch != '\\' {
			b.WriteByte(ch)
			continue
		}
		if i+1 >= len(raw)-1 {
			return "", fmt.Errorf("dangling escape")
		}
		i++
		switch raw[i] {
		case 'n':
			b.WriteByte('\n')
		case 'r':
			b.WriteByte('\r')
		case 't':
			b.WriteByte('\t')
		case '"':
			b.WriteByte('"')
		case '\\':
			b.WriteByte('\\')
		case 'u':
			if i+4 >= len(raw)-1 {
				return "", fmt.Errorf("invalid \\u escape")
			}
			hex := raw[i+1 : i+5]
			v, err := strconv.ParseUint(hex, 16, 16)
			if err != nil {
				return "", fmt.Errorf("invalid \\u escape")
			}
			b.WriteRune(rune(v))
			i += 4
		case 'U':
			if i+4 >= len(raw)-1 {
				return "", fmt.Errorf("invalid \\U escape")
			}
			hex := raw[i+1 : i+5]
			v, err := strconv.ParseUint(hex, 16, 16)
			if err != nil {
				return "", fmt.Errorf("invalid \\U escape")
			}
			i += 4
			r := rune(v)
			if utf16.IsSurrogate(r) {
				if i+6 >= len(raw)-1 || raw[i+1] != '\\' || raw[i+2] != 'U' {
					return "", fmt.Errorf("invalid surrogate pair")
				}
				hex2 := raw[i+3 : i+7]
				v2, err := strconv.ParseUint(hex2, 16, 16)
				if err != nil {
					return "", fmt.Errorf("invalid surrogate pair")
				}
				i += 6
				r = utf16.DecodeRune(r, rune(v2))
			}
			b.WriteRune(r)
		default:
			b.WriteByte(raw[i])
		}
	}
	return b.String(), nil
}

func encodeAppleStringsQuoted(s string) string {
	escaped := strings.NewReplacer(
		"\\", "\\\\",
		"\n", "\\n",
		"\r", "\\r",
		"\t", "\\t",
		"\"", "\\\"",
	).Replace(s)
	return "\"" + escaped + "\""
}

func skipStringsTrivia(text string, start int) (int, error) {
	i := skipStringsWhitespace(text, start)
	for i < len(text) {
		if i+1 < len(text) && text[i] == '/' && text[i+1] == '/' {
			i += 2
			for i < len(text) && text[i] != '\n' {
				i++
			}
			i = skipStringsWhitespace(text, i)
			continue
		}
		if i+1 < len(text) && text[i] == '/' && text[i+1] == '*' {
			end := strings.Index(text[i+2:], "*/")
			if end < 0 {
				return start, fmt.Errorf("line %d: unterminated block comment", lineNumberAt(text, i))
			}
			i = i + 2 + end + 2
			i = skipStringsWhitespace(text, i)
			continue
		}
		break
	}
	return i, nil
}

func skipStringsWhitespace(text string, start int) int {
	i := start
	for i < len(text) {
		switch text[i] {
		case ' ', '\n', '\r', '\t':
			i++
		default:
			return i
		}
	}
	return i
}

func lineNumberAt(text string, idx int) int {
	if idx < 0 {
		return 1
	}
	if idx > len(text) {
		idx = len(text)
	}
	line := 1
	for i := 0; i < idx; i++ {
		if text[i] == '\n' {
			line++
		}
	}
	return line
}
