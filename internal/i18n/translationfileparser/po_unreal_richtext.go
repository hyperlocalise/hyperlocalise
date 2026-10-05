package translationfileparser

import (
	"fmt"
	"regexp"
	"slices"
	"strconv"
	"strings"
)

const (
	unrealRichTextTagLimit       = 1000
	unrealRichTextSentinelMarker = "\x1eHLUEPH_"
)

var unrealRichTextPlaceholderPattern = regexp.MustCompile(`\x1eHLUEPH_[A-F0-9]+_[0-9]+\x1f`)

type unrealTagSpan struct {
	start int
	end   int
}

func protectUnrealRichTextValue(s string) string {
	if !strings.Contains(s, "<") {
		return s
	}
	protected, _ := protectUnrealRichTextLimited(s, unrealRichTextTagLimit)
	return protected
}

func protectUnrealRichTextLimited(s string, limit int) (string, map[string]string) {
	if limit <= 0 || !strings.Contains(s, "<") {
		return s, nil
	}
	spans := findUnrealRichTextSpans(s, limit)
	if len(spans) == 0 {
		return s, nil
	}

	placeholders := make(map[string]string, len(spans))
	var b strings.Builder
	b.Grow(len(s) + len(spans)*16)
	pos := 0
	for i, span := range spans {
		b.WriteString(s[pos:span.start])
		literal := s[span.start:span.end]
		ph := makeUnrealRichTextPlaceholder(i, literal)
		placeholders[ph] = literal
		b.WriteString(ph)
		pos = span.end
	}
	b.WriteString(s[pos:])
	return b.String(), placeholders
}

func findUnrealRichTextSpans(s string, limit int) []unrealTagSpan {
	spans := make([]unrealTagSpan, 0, 4)
	pendingStart, pendingEnd := -1, -1
	i := 0
	for i < len(s) {
		next := strings.IndexByte(s[i:], '<')
		if next < 0 {
			break
		}
		i += next

		if isUnrealRichTextClose(s, i) {
			if pendingStart >= 0 {
				if len(spans)+2 > limit {
					break
				}
				spans = append(spans, unrealTagSpan{start: pendingStart, end: pendingEnd}, unrealTagSpan{start: i, end: i + 3})
				pendingStart, pendingEnd = -1, -1
			} else {
				if len(spans)+1 > limit {
					break
				}
				spans = append(spans, unrealTagSpan{start: i, end: i + 3})
			}
			i += 3
			continue
		}

		end, selfClosing, ok := scanUnrealOpeningTag(s, i)
		if !ok {
			i++
			continue
		}
		if selfClosing {
			if len(spans)+1 > limit {
				break
			}
			spans = append(spans, unrealTagSpan{start: i, end: end})
			i = end
			continue
		}
		pendingStart, pendingEnd = i, end
		i = end
	}

	if len(spans) == 0 {
		return nil
	}
	slices.SortFunc(spans, func(a, b unrealTagSpan) int {
		return a.start - b.start
	})
	return spans
}

func isUnrealRichTextClose(s string, i int) bool {
	return i+2 < len(s) && s[i] == '<' && s[i+1] == '/' && s[i+2] == '>'
}

func scanUnrealOpeningTag(s string, start int) (end int, selfClosing bool, ok bool) {
	if start >= len(s) || s[start] != '<' {
		return 0, false, false
	}
	i := start + 1
	if i >= len(s) || s[i] == '/' || s[i] == '!' || s[i] == '?' {
		return 0, false, false
	}

	nameEnd, ok := scanUnrealTagName(s, i)
	if !ok {
		return 0, false, false
	}
	i = nameEnd

	for i < len(s) {
		switch s[i] {
		case '>':
			return i + 1, false, true
		case '/':
			if i+1 < len(s) && s[i+1] == '>' {
				return i + 2, true, true
			}
			return 0, false, false
		case ' ', '\t':
			for i < len(s) && (s[i] == ' ' || s[i] == '\t') {
				i++
			}
			if i >= len(s) {
				return 0, false, false
			}
			switch s[i] {
			case '>':
				return i + 1, false, true
			case '/':
				if i+1 < len(s) && s[i+1] == '>' {
					return i + 2, true, true
				}
				return 0, false, false
			}
			attrEnd, attrOK := scanUnrealAttribute(s, i)
			if !attrOK {
				return 0, false, false
			}
			i = attrEnd
		default:
			return 0, false, false
		}
	}
	return 0, false, false
}

func scanUnrealTagName(s string, i int) (int, bool) {
	if i >= len(s) {
		return 0, false
	}
	if s[i] == '{' {
		j := i + 1
		if j >= len(s) {
			return 0, false
		}
		if isUnrealASCIIDigit(s[j]) {
			for j < len(s) && isUnrealASCIIDigit(s[j]) {
				j++
			}
		} else if isUnrealPlaceholderNameStart(s[j]) {
			j++
			for j < len(s) && isUnrealPlaceholderNamePart(s[j]) {
				j++
			}
		} else {
			return 0, false
		}
		if j > i+1 && j < len(s) && s[j] == '}' {
			return j + 1, true
		}
		return 0, false
	}
	if !isUnrealNameStart(s[i]) {
		return 0, false
	}
	j := i + 1
	for j < len(s) && isUnrealNamePart(s[j]) {
		j++
	}
	return j, true
}

func scanUnrealAttribute(s string, i int) (int, bool) {
	if i >= len(s) || !isUnrealNameStart(s[i]) {
		return 0, false
	}
	j := i + 1
	for j < len(s) && isUnrealAttributeNamePart(s[j]) {
		j++
	}
	if j >= len(s) || s[j] != '=' {
		return 0, false
	}
	j++
	if j >= len(s) || s[j] != '"' {
		return 0, false
	}
	j++
	closeQuote := strings.IndexByte(s[j:], '"')
	if closeQuote < 0 {
		return 0, false
	}
	return j + closeQuote + 1, true
}

func isUnrealNameStart(b byte) bool {
	return (b >= 'A' && b <= 'Z') || (b >= 'a' && b <= 'z')
}

func isUnrealNamePart(b byte) bool {
	return isUnrealNameStart(b) || isUnrealASCIIDigit(b) || b == '.' || b == '-' || b == '_'
}

func isUnrealAttributeNamePart(b byte) bool {
	return isUnrealNameStart(b) || isUnrealASCIIDigit(b) || b == '_' || b == '-'
}

func isUnrealPlaceholderNameStart(b byte) bool {
	return isUnrealNameStart(b) || b == '_'
}

func isUnrealPlaceholderNamePart(b byte) bool {
	return isUnrealPlaceholderNameStart(b) || isUnrealASCIIDigit(b)
}

func isUnrealASCIIDigit(b byte) bool {
	return b >= '0' && b <= '9'
}

func makeUnrealRichTextPlaceholder(index int, literal string) string {
	var sb strings.Builder
	sb.Grow(len(unrealRichTextSentinelMarker) + len(literal)*2 + 8)
	sb.WriteString(unrealRichTextSentinelMarker)
	writeUnrealRichTextLiteralHex(&sb, literal)
	sb.WriteByte('_')
	sb.WriteString(strconv.Itoa(index))
	sb.WriteByte('\x1f')
	return sb.String()
}

func writeUnrealRichTextLiteralHex(sb *strings.Builder, literal string) {
	for i := 0; i < len(literal); i++ {
		b := literal[i]
		sb.WriteByte(hexDigits[b>>4])
		sb.WriteByte(hexDigits[b&0x0f])
	}
}

func decodeUnrealRichTextPlaceholder(token string) (string, bool) {
	if !strings.HasPrefix(token, unrealRichTextSentinelMarker) || !strings.HasSuffix(token, "\x1f") {
		return "", false
	}
	body := token[len(unrealRichTextSentinelMarker) : len(token)-1]
	us := strings.LastIndexByte(body, '_')
	if us <= 0 {
		return "", false
	}
	return decodeUnrealRichTextLiteralHex(body[:us])
}

func decodeUnrealRichTextLiteralHex(hex string) (string, bool) {
	if len(hex) == 0 || len(hex)%2 != 0 {
		return "", false
	}
	out := make([]byte, len(hex)/2)
	for i := 0; i < len(out); i++ {
		hi, ok := unhexUnrealRichTextNibble(hex[i*2])
		if !ok {
			return "", false
		}
		lo, ok := unhexUnrealRichTextNibble(hex[i*2+1])
		if !ok {
			return "", false
		}
		out[i] = hi<<4 | lo
	}
	return string(out), true
}

func unhexUnrealRichTextNibble(b byte) (byte, bool) {
	switch {
	case b >= '0' && b <= '9':
		return b - '0', true
	case b >= 'A' && b <= 'F':
		return b - 'A' + 10, true
	case b >= 'a' && b <= 'f':
		return b - 'a' + 10, true
	default:
		return 0, false
	}
}

func expandUnrealRichTextPlaceholders(rendered string) string {
	if !strings.Contains(rendered, unrealRichTextSentinelMarker) {
		return rendered
	}
	return unrealRichTextPlaceholderPattern.ReplaceAllStringFunc(rendered, func(token string) string {
		literal, ok := decodeUnrealRichTextPlaceholder(token)
		if !ok {
			return token
		}
		return literal
	})
}

func poValuesHaveUnrealPlaceholders(values map[string]string) bool {
	for _, value := range values {
		if strings.Contains(value, unrealRichTextSentinelMarker) {
			return true
		}
	}
	return false
}

func expandPOUnrealRichTextValues(values map[string]string) map[string]string {
	if !poValuesHaveUnrealPlaceholders(values) {
		return values
	}
	expanded := make(map[string]string, len(values))
	for key, value := range values {
		expanded[key] = expandUnrealRichTextPlaceholders(value)
	}
	return expanded
}

// UnrealRichTextPlaceholderTokens returns sorted Unreal rich-text sentinel tokens.
func UnrealRichTextPlaceholderTokens(s string) []string {
	if !strings.Contains(s, unrealRichTextSentinelMarker) {
		return nil
	}
	matches := unrealRichTextPlaceholderPattern.FindAllString(s, -1)
	slices.Sort(matches)
	return matches
}

// ValidateUnrealRichTextPlaceholders returns an error if the multiset of Unreal
// rich-text placeholder tokens in translated differs from source.
func ValidateUnrealRichTextPlaceholders(source, translated string) error {
	if !strings.Contains(source, unrealRichTextSentinelMarker) && !strings.Contains(translated, unrealRichTextSentinelMarker) {
		return nil
	}
	src := UnrealRichTextPlaceholderTokens(source)
	tgt := UnrealRichTextPlaceholderTokens(translated)
	if slices.Equal(src, tgt) {
		return nil
	}
	return fmt.Errorf("unreal rich text placeholder mismatch: expected %d token(s), got %d (source tokens %v vs candidate %v)", len(src), len(tgt), src, tgt)
}
