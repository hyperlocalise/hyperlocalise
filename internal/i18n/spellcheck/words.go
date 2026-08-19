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

// scanWords appends spell-checkable words in source order, preserving their exact spelling.
func scanWords(fragment string, out []string) []string {
	for i := 0; i < len(fragment); {
		ch := fragment[i]

		switch ch {
		case '%', '$':
			if end, ok := scanPrintfPlaceholder(fragment, i); ok {
				i = end
				continue
			}
		case '{':
			if end, ok := scanStrayBraces(fragment, i); ok {
				i = end
				continue
			}
		case ']':
			if end, ok := scanMarkdownLinkTail(fragment, i+1); ok {
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
			end := scanWordRun(fragment, i)
			out = append(out, fragment[i:end])
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

// scanStrayBraces skips a balanced {...} span.
func scanStrayBraces(fragment string, start int) (int, bool) {
	depth := 0
	for i := start; i < len(fragment); i++ {
		switch fragment[i] {
		case '{':
			depth++
		case '}':
			depth--
			if depth == 0 {
				return i + 1, true
			}
		}
	}
	return 0, false
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

// scanMarkdownLinkTail skips a Markdown link destination or reference label
// immediately following ']'.
func scanMarkdownLinkTail(fragment string, start int) (int, bool) {
	if start >= len(fragment) {
		return 0, false
	}
	switch fragment[start] {
	case '(':
		return scanBalancedTail(fragment, start, ')')
	case '[':
		return scanBalancedTail(fragment, start, ']')
	default:
		return 0, false
	}
}

func scanBalancedTail(fragment string, start int, close byte) (int, bool) {
	idx := strings.IndexByte(fragment[start+1:], close)
	if idx < 0 {
		return 0, false
	}
	return start + 1 + idx + 1, true
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
	case '-', '\u2011':
		return true
	default:
		return false
	}
}

func isHexDigitByte(ch byte) bool {
	return (ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f') || (ch >= 'A' && ch <= 'F')
}

// scanWordRun includes apostrophes and hyphens only when they occur
// between word characters.
func scanWordRun(fragment string, start int) int {
	i := start
	for i < len(fragment) {
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
	return i
}
