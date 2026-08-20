package spellcheck

import (
	"regexp"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/segmentvalidate"
)

// UUIDs are skipped explicitly to avoid fragmenting them into meaningless single-letter tokens.
var uuidPattern = regexp.MustCompile(`(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b`)

var bareURLPattern = regexp.MustCompile(`(?i)^(?:https?://|www\.)\S+`)

const urlTrailingCutset = ".,;:!?\"')]"

// scanWords appends user-visible words in source order, using rendered
// spelling for decoded entities.
func scanWords(fragment string, out []string) []string {
	for i := 0; i < len(fragment); {
		ch := fragment[i]

		switch ch {
		case '%', '$':
			if end, ok := scanPrintfPlaceholder(fragment, i); ok {
				i = end
				continue
			}
		case ']':
			if end, ok := scanMarkdownLinkTail(fragment, i+1); ok {
				i = end
				continue
			}
		case '&':
			if decoded, end, ok := scanEntity(fragment, i); ok {
				if isAllWordChars(decoded) {
					token, runEnd := scanWordRun(fragment, i)
					out = append(out, token)
					i = runEnd
					continue
				}
				i = end
				continue
			}
		}

		if isHexDigitByte(ch) {
			if end, ok := scanUUID(fragment, i); ok {
				i = end
				continue
			}
		}
		if ch == 'h' || ch == 'H' || ch == 'w' || ch == 'W' {
			if end, ok := scanBareURL(fragment, i); ok {
				i = end
				continue
			}
		}

		r, size := utf8.DecodeRuneInString(fragment[i:])
		if isWordChar(r) {
			token, end := scanWordRun(fragment, i)
			out = append(out, token)
			i = end
			continue
		}
		i += size
	}
	return out
}

func scanPrintfPlaceholder(fragment string, start int) (int, bool) {
	loc := segmentvalidate.ExtraPlaceholderPattern.FindStringIndex(fragment[start:])
	if loc == nil || loc[0] != 0 {
		return 0, false
	}
	if fragment[start] == '%' && segmentvalidate.IsEscapedPercentAt(fragment, start) {
		return 0, false
	}
	return start + loc[1], true
}

func scanUUID(fragment string, start int) (int, bool) {
	loc := uuidPattern.FindStringIndex(fragment[start:])
	if loc == nil || loc[0] != 0 {
		return 0, false
	}
	return start + loc[1], true
}

func scanBareURL(fragment string, start int) (int, bool) {
	match := bareURLPattern.FindString(fragment[start:])
	if match == "" {
		return 0, false
	}
	trimmed := strings.TrimRight(match, urlTrailingCutset)
	if trimmed == "" {
		return 0, false
	}
	return start + len(trimmed), true
}

func scanMarkdownLinkTail(fragment string, start int) (int, bool) {
	if start >= len(fragment) {
		return 0, false
	}
	switch fragment[start] {
	case '(':
		return scanBalancedTail(fragment, start, '(', ')')
	case '[':
		return scanBalancedTail(fragment, start, '[', ']')
	default:
		return 0, false
	}
}

func scanBalancedTail(fragment string, start int, open, close byte) (int, bool) {
	depth := 1
	for i := start + 1; i < len(fragment); i++ {
		switch fragment[i] {
		case '\\':
			if i+1 < len(fragment) {
				i++
			}
		case open:
			depth++
		case close:
			depth--
			if depth == 0 {
				return i + 1, true
			}
		}
	}
	return 0, false
}

func isWordChar(r rune) bool {
	return unicode.IsLetter(r) || unicode.IsMark(r)
}

func isApostrophe(r rune) bool {
	switch r {
	case '\'', '\u2019', '\u02BC', '\u02BB':
		return true
	default:
		return false
	}
}

func isHyphen(r rune) bool {
	switch r {
	case '-', '\u2010', '\u2011':
		return true
	default:
		return false
	}
}

func isHexDigitByte(ch byte) bool {
	return (ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f') || (ch >= 'A' && ch <= 'F')
}

// scanWordRun returns one maximal word token, decoding recognized entities
// that form part of the word.
func scanWordRun(fragment string, start int) (string, int) {
	i := start
	litStart := start
	var b strings.Builder

	for i < len(fragment) {
		if fragment[i] == '&' {
			decoded, end, ok := scanEntity(fragment, i)
			if !ok {
				break
			}
			if isAllWordChars(decoded) {
				b.WriteString(fragment[litStart:i])
				b.WriteString(decoded)
				i = end
				litStart = i
				continue
			}
			if i > start {
				if r, single := decodedSingleRune(decoded); single && (isApostrophe(r) || isHyphen(r)) {
					nr, nsize := utf8.DecodeRuneInString(fragment[end:])
					if nsize > 0 && isWordChar(nr) {
						b.WriteString(fragment[litStart:i])
						b.WriteRune(r)
						i = end
						litStart = i
						continue
					}
				}
			}
			break
		}

		r, size := utf8.DecodeRuneInString(fragment[i:])
		if isWordChar(r) {
			i += size
			continue
		}
		if isApostrophe(r) || isHyphen(r) {
			nr, nsize := utf8.DecodeRuneInString(fragment[i+size:])
			if nsize > 0 && isWordChar(nr) {
				i += size
				continue
			}
		}
		break
	}

	if litStart == start {
		return fragment[start:i], i
	}
	b.WriteString(fragment[litStart:i])
	return b.String(), i
}
