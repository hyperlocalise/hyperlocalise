package translationfileparser

import (
	"bytes"
	"fmt"
	"strconv"
	"strings"
	"unicode/utf16"
)

// AppleStringsParser parses Apple .strings localization files.
type AppleStringsParser struct{}

var appleStringsEscaper = strings.NewReplacer(
	"\\", "\\\\",
	"\n", "\\n",
	"\r", "\\r",
	"\t", "\\t",
	"\"", "\\\"",
)

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
	return doc.render(values)
}

func (d stringsDocument) render(values map[string]string) ([]byte, error) {
	if len(d.entries) == 0 {
		return []byte(d.template), nil
	}

	// BOLT OPTIMIZATION: Removed redundant clones and slices.SortFunc.
	// Entries are naturally collected in document order during parsing.
	entries := d.entries

	var b bytes.Buffer
	b.Grow(len(d.template))
	cursor := 0
	for _, entry := range entries {
		if entry.valueStart < cursor {
			return nil, fmt.Errorf("apple strings render: overlapping or out-of-order replacement for key %q", entry.key)
		}
		if entry.valueStart > len(d.template) || entry.valueEnd > len(d.template) {
			return nil, fmt.Errorf("apple strings render: invalid replacement span for key %q", entry.key)
		}
		b.WriteString(d.template[cursor:entry.valueStart])
		if translated, ok := values[entry.key]; ok {
			// BOLT OPTIMIZATION: Write quoted strings directly to the buffer to avoid
			// intermediate string allocations and concatenations.
			b.WriteByte('"')
			_, _ = appleStringsEscaper.WriteString(&b, translated)
			b.WriteByte('"')
		} else {
			b.WriteString(entry.valueLiteral)
		}
		cursor = entry.valueEnd
	}
	b.WriteString(d.template[cursor:])
	return b.Bytes(), nil
}

func parseStringsDocument(content []byte) (stringsDocument, error) {
	text := string(content)
	// BOLT OPTIMIZATION: Hint entries capacity based on content size.
	// Typically an Apple strings entry is at least 40 bytes.
	doc := stringsDocument{template: text, entries: make([]stringsEntry, 0, len(content)/40)}

	currentLine := 1
	i := 0
	for i < len(text) {
		var lines int
		next, lines, err := skipStringsTrivia(text, i)
		if err != nil {
			return stringsDocument{}, err
		}
		currentLine += lines
		i = next
		if i >= len(text) {
			break
		}

		keyToken, next, lines, err := parseStringsQuotedToken(text, i)
		if err != nil {
			return stringsDocument{}, err
		}
		currentLine += lines
		i = next

		wsNext, wsLines := skipStringsWhitespace(text, i)
		currentLine += wsLines
		i = wsNext

		if i >= len(text) || text[i] != '=' {
			return stringsDocument{}, fmt.Errorf("line %d: expected '=' after key", currentLine)
		}
		i++
		wsNext, wsLines = skipStringsWhitespace(text, i)
		currentLine += wsLines
		i = wsNext

		valueToken, next, lines, err := parseStringsQuotedToken(text, i)
		if err != nil {
			return stringsDocument{}, err
		}
		currentLine += lines
		i = next

		wsNext, wsLines = skipStringsWhitespace(text, i)
		currentLine += wsLines
		i = wsNext

		if i >= len(text) || text[i] != ';' {
			return stringsDocument{}, fmt.Errorf("line %d: expected ';' after value", currentLine)
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

func parseStringsQuotedToken(text string, start int) (stringsQuotedToken, int, int, error) {
	if start >= len(text) || text[start] != '"' {
		return stringsQuotedToken{}, start, 0, fmt.Errorf("line %d: expected quoted string", lineNumberAt(text, start))
	}

	lines := 0
	i := start + 1
	for i < len(text) {
		if text[i] == '\n' {
			lines++
		}
		if text[i] == '\\' {
			if i+1 < len(text) && text[i+1] == '\n' {
				lines++
			}
			i += 2
			continue
		}
		if text[i] == '"' {
			raw := text[start : i+1]
			decoded, err := decodeAppleStringsQuoted(raw)
			if err != nil {
				return stringsQuotedToken{}, start, lines, fmt.Errorf("line %d: %w", lineNumberAt(text, start), err)
			}
			return stringsQuotedToken{decoded: decoded, raw: raw, start: start, end: i + 1}, i + 1, lines, nil
		}
		i++
	}

	return stringsQuotedToken{}, start, lines, fmt.Errorf("line %d: unterminated quoted string", lineNumberAt(text, start))
}

func decodeAppleStringsQuoted(raw string) (string, error) {
	if len(raw) < 2 || raw[0] != '"' || raw[len(raw)-1] != '"' {
		return "", fmt.Errorf("expected quoted string")
	}

	// BOLT OPTIMIZATION: Fast-path for strings without escapes to avoid
	// strings.Builder allocations and byte-by-byte iteration.
	if !strings.Contains(raw, "\\") {
		return strings.Clone(raw[1 : len(raw)-1]), nil
	}

	var b strings.Builder
	b.Grow(len(raw))
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

func skipStringsTrivia(text string, start int) (int, int, error) {
	lines := 0
	i, l := skipStringsWhitespace(text, start)
	lines += l
	for i < len(text) {
		if i+1 < len(text) && text[i] == '/' && text[i+1] == '/' {
			i += 2
			for i < len(text) && text[i] != '\n' {
				i++
			}
			i, l = skipStringsWhitespace(text, i)
			lines += l
			continue
		}
		if i+1 < len(text) && text[i] == '/' && text[i+1] == '*' {
			end := strings.Index(text[i+2:], "*/")
			if end < 0 {
				return start, lines, fmt.Errorf("line %d: unterminated block comment", lineNumberAt(text, i))
			}
			comment := text[i : i+2+end+2]
			lines += strings.Count(comment, "\n")
			i = i + 2 + end + 2
			i, l = skipStringsWhitespace(text, i)
			lines += l
			continue
		}
		break
	}
	return i, lines, nil
}

func skipStringsWhitespace(text string, start int) (int, int) {
	lines := 0
	i := start
	for i < len(text) {
		switch text[i] {
		case '\n':
			lines++
			i++
		case ' ', '\r', '\t':
			i++
		default:
			return i, lines
		}
	}
	return i, lines
}

func lineNumberAt(text string, idx int) int {
	if idx <= 0 {
		return 1
	}
	if idx > len(text) {
		idx = len(text)
	}
	// BOLT OPTIMIZATION: Use strings.Count for faster newline counting.
	return 1 + strings.Count(text[:idx], "\n")
}
