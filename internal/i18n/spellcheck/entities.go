package spellcheck

import (
	"html"
	"regexp"
	"unicode/utf8"
)

var namedEntityPattern = regexp.MustCompile(`^&[A-Za-z][A-Za-z0-9]{0,31};`)
var numericEntityPattern = regexp.MustCompile(`(?i)^&#(?:[0-9]{1,7}|x[0-9a-f]{1,6});`)

func scanEntity(fragment string, start int) (decoded string, end int, ok bool) {
	if candidate := namedEntityPattern.FindString(fragment[start:]); candidate != "" {
		if decoded, ok := decodeWholeNamedEntity(candidate); ok {
			return decoded, start + len(candidate), true
		}
		return "", 0, false
	}
	if candidate := numericEntityPattern.FindString(fragment[start:]); candidate != "" {
		decoded := html.UnescapeString(candidate)
		if decoded == candidate {
			return "", 0, false
		}
		return decoded, start + len(candidate), true
	}
	return "", 0, false
}

// html.UnescapeString can decode legacy entity prefixes without a semicolon,
// so verify that the full named entity was consumed.
func decodeWholeNamedEntity(candidate string) (string, bool) {
	fullDecode := html.UnescapeString(candidate)
	prefixDecode := html.UnescapeString(candidate[:len(candidate)-1]) + ";"
	if fullDecode == prefixDecode {
		return "", false
	}
	return fullDecode, true
}

func isAllWordChars(s string) bool {
	if s == "" {
		return false
	}
	for _, r := range s {
		if !isWordChar(r) {
			return false
		}
	}
	return true
}

func decodedSingleRune(s string) (rune, bool) {
	r, size := utf8.DecodeRuneInString(s)
	if size == 0 || size != len(s) {
		return 0, false
	}
	return r, true
}
