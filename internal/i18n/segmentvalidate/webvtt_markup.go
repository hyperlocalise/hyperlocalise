package segmentvalidate

import (
	"slices"
	"strings"
	"unicode"
	"unicode/utf8"
)

func webvttCueMarkupMismatch(source, translated string) bool {
	if source == translated {
		return false
	}
	return !slices.Equal(collectWebVTTCueMarkup(source), collectWebVTTCueMarkup(translated))
}

func collectWebVTTCueMarkup(s string) []string {
	numTags := strings.Count(s, "<")
	if numTags == 0 {
		return nil
	}
	out := make([]string, 0, numTags)
	for i := 0; i < len(s); {
		idx := strings.IndexByte(s[i:], '<')
		if idx < 0 {
			break
		}
		i += idx
		end := strings.IndexByte(s[i:], '>')
		if end < 0 {
			break
		}
		raw := s[i : i+end+1]
		i += end + 1
		if token, ok := normalizeWebVTTCueMarkup(raw); ok {
			out = append(out, token)
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func normalizeWebVTTCueMarkup(raw string) (string, bool) {
	if len(raw) < 3 || raw[0] != '<' || raw[len(raw)-1] != '>' {
		return "", false
	}
	inner := strings.Join(strings.Fields(strings.ToLower(raw[1:len(raw)-1])), " ")
	if inner == "" {
		return "", false
	}
	name := strings.TrimPrefix(inner, "/")
	if name == "" {
		return "", false
	}
	first, _ := utf8.DecodeRuneInString(name)
	if unicode.IsLetter(first) {
		return inner, true
	}
	if isWebVTTCueTimestampToken(name) {
		return inner, true
	}
	return "", false
}

func isWebVTTCueTimestampToken(inner string) bool {
	if inner == "" || inner[0] < '0' || inner[0] > '9' {
		return false
	}
	hasColon := false
	for i := 0; i < len(inner); i++ {
		ch := inner[i]
		switch {
		case ch == ':':
			hasColon = true
		case ch >= '0' && ch <= '9', ch == '.', ch == ',':
		default:
			return false
		}
	}
	return hasColon
}
