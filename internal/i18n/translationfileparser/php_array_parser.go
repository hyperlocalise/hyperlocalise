package translationfileparser

import (
	"bytes"
	"fmt"
	"strconv"
	"strings"
)

// PHPArrayParser parses PHP locale files that return a static array literal.
type PHPArrayParser struct{}

type phpArrayEntry struct {
	key          string
	sourceValue  string
	valueLiteral string
	valueStart   int
	valueEnd     int
	quote        byte
}

type phpArrayDocument struct {
	template string
	entries  []phpArrayEntry
}

type phpArrayScanner struct {
	text    string
	pos     int
	entries []phpArrayEntry
	seen    map[string]struct{}
}

type phpStringToken struct {
	decoded string
	raw     string
	start   int
	end     int
	quote   byte
}

func (p PHPArrayParser) Parse(content []byte) (map[string]string, error) {
	doc, err := parsePHPArrayDocument(content)
	if err != nil {
		return nil, err
	}

	out := make(map[string]string, len(doc.entries))
	for _, entry := range doc.entries {
		out[entry.key] = entry.sourceValue
	}
	return out, nil
}

// MarshalPHPArrayLocale preserves the PHP array template while replacing only
// supported static string value literals.
func MarshalPHPArrayLocale(template []byte, values map[string]string) ([]byte, error) {
	doc, err := parsePHPArrayDocument(template)
	if err != nil {
		return nil, err
	}
	return doc.render(values), nil
}

func (d phpArrayDocument) render(values map[string]string) []byte {
	if len(d.entries) == 0 {
		return []byte(d.template)
	}

	var b bytes.Buffer
	b.Grow(len(d.template))
	cursor := 0

	// Note: We assume d.entries are ordered by their position in the template
	// (valueStart), which is guaranteed by the linear scan in the parser.
	for _, entry := range d.entries {
		if entry.valueStart < cursor || entry.valueStart > len(d.template) || entry.valueEnd > len(d.template) {
			continue
		}
		b.WriteString(d.template[cursor:entry.valueStart])
		if translated, ok := values[entry.key]; ok {
			writePHPStringLiteral(&b, translated, entry.quote)
		} else {
			b.WriteString(entry.valueLiteral)
		}
		cursor = entry.valueEnd
	}
	b.WriteString(d.template[cursor:])
	return b.Bytes()
}

func parsePHPArrayDocument(content []byte) (phpArrayDocument, error) {
	// BOLT OPTIMIZATION: Hint capacity for entries and seen map based on content size.
	// Increased density hint from /64 to /32.
	capacity := len(content) / 32
	if capacity < 4 {
		capacity = 4
	}

	scanner := &phpArrayScanner{
		text:    string(content),
		entries: make([]phpArrayEntry, 0, capacity),
		seen:    make(map[string]struct{}, capacity),
	}

	if strings.HasPrefix(scanner.text, "\ufeff") {
		scanner.pos = len("\ufeff")
	}
	scanner.pos = skipPHPWhitespace(scanner.text, scanner.pos)
	if !strings.HasPrefix(scanner.text[scanner.pos:], "<?php") {
		return phpArrayDocument{}, fmt.Errorf("php locale array: expected <?php opening tag at line %d", lineNumberAt(scanner.text, scanner.pos))
	}
	scanner.pos += len("<?php")
	scanner.skipTrivia()

	if !scanner.consumeKeyword("return") {
		return phpArrayDocument{}, fmt.Errorf("php locale array: expected return statement at line %d; only files returning a static array literal are supported", lineNumberAt(scanner.text, scanner.pos))
	}
	scanner.skipTrivia()

	if err := scanner.parseArrayLiteral(""); err != nil {
		return phpArrayDocument{}, err
	}
	scanner.skipTrivia()

	if scanner.pos < len(scanner.text) && scanner.text[scanner.pos] == ';' {
		scanner.pos++
		scanner.skipTrivia()
	}
	if strings.HasPrefix(scanner.text[scanner.pos:], "?>") {
		scanner.pos += len("?>")
		scanner.pos = skipPHPWhitespace(scanner.text, scanner.pos)
	}
	if scanner.pos != len(scanner.text) {
		return phpArrayDocument{}, fmt.Errorf("php locale array: unsupported PHP code after return array at line %d", lineNumberAt(scanner.text, scanner.pos))
	}

	return phpArrayDocument{template: scanner.text, entries: scanner.entries}, nil
}

func (s *phpArrayScanner) parseArrayLiteral(prefix string) error {
	closeByte, err := s.consumeArrayOpen()
	if err != nil {
		return err
	}

	for {
		s.skipTrivia()
		if s.pos >= len(s.text) {
			return fmt.Errorf("php locale array: unterminated array literal at line %d", lineNumberAt(s.text, s.pos))
		}
		if s.text[s.pos] == closeByte {
			s.pos++
			return nil
		}

		key, err := s.parseStringLiteral()
		if err != nil {
			return fmt.Errorf("php locale array: array keys must be quoted strings at line %d: %w", lineNumberAt(s.text, s.pos), err)
		}
		s.skipTrivia()
		if !strings.HasPrefix(s.text[s.pos:], "=>") {
			return fmt.Errorf("php locale array: expected => after key %q at line %d", key.decoded, lineNumberAt(s.text, s.pos))
		}
		s.pos += len("=>")
		s.skipTrivia()

		nextPath := key.decoded
		if prefix != "" {
			nextPath = prefix + "." + key.decoded
		}
		if err := s.parseArrayValue(nextPath); err != nil {
			return err
		}

		s.skipTrivia()
		if s.pos < len(s.text) && s.text[s.pos] == ',' {
			s.pos++
			continue
		}
		if s.pos < len(s.text) && s.text[s.pos] == closeByte {
			continue
		}
		return fmt.Errorf("php locale array: expected comma or array close at line %d", lineNumberAt(s.text, s.pos))
	}
}

func (s *phpArrayScanner) parseArrayValue(path string) error {
	if s.pos >= len(s.text) {
		return fmt.Errorf("php locale array: missing value for key %q", path)
	}

	switch {
	case s.text[s.pos] == '\'' || s.text[s.pos] == '"':
		value, err := s.parseStringLiteral()
		if err != nil {
			return err
		}
		key := path
		if _, ok := s.seen[key]; ok {
			return fmt.Errorf("php locale array: duplicate key %q", key)
		}
		s.seen[key] = struct{}{}
		s.entries = append(s.entries, phpArrayEntry{
			key:          key,
			sourceValue:  value.decoded,
			valueLiteral: value.raw,
			valueStart:   value.start,
			valueEnd:     value.end,
			quote:        value.quote,
		})
		return nil
	case s.startsArrayLiteral():
		return s.parseArrayLiteral(path)
	default:
		return fmt.Errorf("php locale array: unsupported value for key %q at line %d; only string literals and nested arrays are supported", path, lineNumberAt(s.text, s.pos))
	}
}

func (s *phpArrayScanner) consumeArrayOpen() (byte, error) {
	if s.pos < len(s.text) && s.text[s.pos] == '[' {
		s.pos++
		return ']', nil
	}
	if s.consumeKeyword("array") {
		s.skipTrivia()
		if s.pos >= len(s.text) || s.text[s.pos] != '(' {
			return 0, fmt.Errorf("php locale array: expected ( after array keyword at line %d", lineNumberAt(s.text, s.pos))
		}
		s.pos++
		return ')', nil
	}
	return 0, fmt.Errorf("php locale array: expected array literal at line %d", lineNumberAt(s.text, s.pos))
}

func (s *phpArrayScanner) startsArrayLiteral() bool {
	if s.pos < len(s.text) && s.text[s.pos] == '[' {
		return true
	}
	return s.hasKeywordAt("array", s.pos)
}

func (s *phpArrayScanner) parseStringLiteral() (phpStringToken, error) {
	if s.pos >= len(s.text) || (s.text[s.pos] != '\'' && s.text[s.pos] != '"') {
		return phpStringToken{}, fmt.Errorf("expected string literal")
	}

	quote := s.text[s.pos]
	start := s.pos
	i := start + 1

	stopChars := "\\" + string(quote)
	if quote == '"' {
		stopChars += "$"
	}

	// BOLT OPTIMIZATION: Fast-path for simple strings without escapes or interpolation.
	// This avoids strings.Builder allocations for the common case.
	idx := strings.IndexAny(s.text[i:], stopChars)
	if idx >= 0 && s.text[i+idx] == quote {
		end := i + idx + 1
		raw := s.text[start:end]
		s.pos = end
		return phpStringToken{
			decoded: s.text[i : i+idx],
			raw:     raw,
			start:   start,
			end:     end,
			quote:   quote,
		}, nil
	}

	var b strings.Builder
	// BOLT OPTIMIZATION: Use a conservative hint for strings with escapes.
	if remaining := len(s.text) - i; remaining > 0 {
		if remaining > 1024 {
			b.Grow(1024)
		} else {
			b.Grow(remaining)
		}
	}
	for i < len(s.text) {
		idx := strings.IndexAny(s.text[i:], stopChars)
		if idx < 0 {
			break
		}
		if idx > 0 {
			b.WriteString(s.text[i : i+idx])
			i += idx
		}

		ch := s.text[i]
		if ch == quote {
			end := i + 1
			raw := s.text[start:end]
			s.pos = end
			return phpStringToken{decoded: b.String(), raw: raw, start: start, end: end, quote: quote}, nil
		}
		if quote == '"' && ch == '$' {
			return phpStringToken{}, fmt.Errorf("php locale array: dynamic interpolation is not supported in double-quoted strings at line %d", lineNumberAt(s.text, i))
		}

		// Must be backslash
		if i+1 >= len(s.text) {
			return phpStringToken{}, fmt.Errorf("php locale array: dangling string escape at line %d", lineNumberAt(s.text, i))
		}
		escaped := s.text[i+1]
		i += 2
		if quote == '\'' {
			switch escaped {
			case '\\', '\'':
				b.WriteByte(escaped)
			default:
				b.WriteByte('\\')
				b.WriteByte(escaped)
			}
			continue
		}

		switch escaped {
		case 'n':
			b.WriteByte('\n')
		case 'r':
			b.WriteByte('\r')
		case 't':
			b.WriteByte('\t')
		case 'v':
			b.WriteByte('\v')
		case 'e':
			b.WriteByte(0x1b)
		case 'f':
			b.WriteByte('\f')
		case '\\', '"', '$':
			b.WriteByte(escaped)
		case 'x':
			v, consumed, ok := readPHPHexEscape(s.text, i)
			if !ok {
				b.WriteByte('\\')
				b.WriteByte('x')
				continue
			}
			b.WriteByte(v)
			i += consumed
		case 'u':
			if i >= len(s.text) || s.text[i] != '{' {
				b.WriteByte('\\')
				b.WriteByte('u')
				continue
			}
			end := strings.IndexByte(s.text[i+1:], '}')
			if end < 0 {
				return phpStringToken{}, fmt.Errorf("php locale array: unterminated unicode escape at line %d", lineNumberAt(s.text, i-2))
			}
			hex := s.text[i+1 : i+1+end]
			v, err := strconv.ParseUint(hex, 16, 32)
			if err != nil || v > 0x10FFFF {
				return phpStringToken{}, fmt.Errorf("php locale array: invalid unicode escape at line %d", lineNumberAt(s.text, i-2))
			}
			b.WriteRune(rune(v))
			i += end + 2
		default:
			if isPHPOctalDigit(escaped) {
				v, consumed, err := readPHPOctalEscape(s.text, i-1)
				if err != nil {
					return phpStringToken{}, fmt.Errorf("php locale array: invalid octal escape at line %d", lineNumberAt(s.text, i-2))
				}
				b.WriteByte(v)
				i += consumed - 1
				continue
			}
			b.WriteByte('\\')
			b.WriteByte(escaped)
		}
	}

	return phpStringToken{}, fmt.Errorf("php locale array: unterminated string literal at line %d", lineNumberAt(s.text, start))
}

func (s *phpArrayScanner) skipTrivia() {
	s.pos = skipPHPTrivia(s.text, s.pos)
}

func (s *phpArrayScanner) consumeKeyword(keyword string) bool {
	if !s.hasKeywordAt(keyword, s.pos) {
		return false
	}
	s.pos += len(keyword)
	return true
}

func (s *phpArrayScanner) hasKeywordAt(keyword string, pos int) bool {
	if pos < 0 || pos+len(keyword) > len(s.text) || !strings.EqualFold(s.text[pos:pos+len(keyword)], keyword) {
		return false
	}
	beforeOK := pos == 0 || !isPHPIdentifierByte(s.text[pos-1])
	after := pos + len(keyword)
	afterOK := after >= len(s.text) || !isPHPIdentifierByte(s.text[after])
	return beforeOK && afterOK
}

func skipPHPTrivia(text string, start int) int {
	i := skipPHPWhitespace(text, start)
	for i < len(text) {
		if text[i] == '#' {
			i++
			for i < len(text) && text[i] != '\n' {
				i++
			}
		} else if i+1 < len(text) && text[i] == '/' {
			switch text[i+1] {
			case '/':
				i += 2
				for i < len(text) && text[i] != '\n' {
					i++
				}
			case '*':
				end := strings.Index(text[i+2:], "*/")
				if end < 0 {
					return i
				}
				i = i + 2 + end + 2
			default:
				return i
			}
		} else {
			return i
		}
		i = skipPHPWhitespace(text, i)
	}
	return i
}

func skipPHPWhitespace(text string, start int) int {
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

func isPHPIdentifierByte(ch byte) bool {
	return ch == '_' || ch >= 'a' && ch <= 'z' || ch >= 'A' && ch <= 'Z' || ch >= '0' && ch <= '9'
}

func readPHPHexEscape(text string, start int) (byte, int, bool) {
	if start >= len(text) || !isPHPHex(text[start]) {
		return 0, 0, false
	}
	end := start + 1
	if end < len(text) && isPHPHex(text[end]) {
		end++
	}
	v, _ := strconv.ParseUint(text[start:end], 16, 8)
	return byte(v), end - start, true
}

func isPHPHex(ch byte) bool {
	return ch >= '0' && ch <= '9' || ch >= 'a' && ch <= 'f' || ch >= 'A' && ch <= 'F'
}

func readPHPOctalEscape(text string, start int) (byte, int, error) {
	end := start
	for end < len(text) && end-start < 3 && isPHPOctalDigit(text[end]) {
		end++
	}
	if end == start {
		return 0, 0, fmt.Errorf("missing octal digits")
	}
	v, err := strconv.ParseUint(text[start:end], 8, 16)
	if err != nil {
		return 0, 0, fmt.Errorf("octal escape out of byte range")
	}
	return byte(v), end - start, nil
}

func isPHPOctalDigit(ch byte) bool {
	return ch >= '0' && ch <= '7'
}

var (
	phpDoubleQuoteReplacer = strings.NewReplacer(
		"\\", "\\\\",
		"\n", "\\n",
		"\r", "\\r",
		"\t", "\\t",
		"\v", "\\v",
		"\x1b", "\\e",
		"\f", "\\f",
		"\"", "\\\"",
		"$", "\\$",
	)
	phpSingleQuoteReplacer = strings.NewReplacer(
		"\\", "\\\\",
		"'", "\\'",
	)
)

func writePHPStringLiteral(b *bytes.Buffer, value string, quote byte) {
	b.WriteByte(quote)
	if quote == '"' {
		_, _ = phpDoubleQuoteReplacer.WriteString(b, value)
	} else {
		_, _ = phpSingleQuoteReplacer.WriteString(b, value)
	}
	b.WriteByte(quote)
}
