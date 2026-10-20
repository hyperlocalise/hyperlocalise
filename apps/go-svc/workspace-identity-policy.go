package main

import (
	_ "embed"
	"strings"
	"unicode"
	"unicode/utf8"

	"golang.org/x/text/unicode/norm"
)

// English profanity list embedded for workspace identity validation.
//
//go:embed workspace-identity-profanity-en.txt
var workspaceIdentityProfanityList string

var workspaceIdentityProfaneWords = parseWorkspaceIdentityProfanityList(workspaceIdentityProfanityList)

var reservedWorkspaceIdentityTokens = map[string]struct{}{
	"demo": {}, "example": {}, "placeholder": {}, "sample": {}, "test": {}, "testing": {},
}

func parseWorkspaceIdentityProfanityList(raw string) []string {
	var words []string
	for line := range strings.SplitSeq(raw, "\n") {
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		words = append(words, line)
	}
	return words
}

func isAllowedWorkspaceIdentity(value string) bool {
	normalized := jsToLower(norm.NFKC.String(value))
	return !hasReservedWorkspaceIdentityToken(normalized) && !containsWorkspaceIdentityProfanity(normalized)
}

func jsToLower(value string) string {
	if !strings.ContainsRune(value, '\u0130') {
		return strings.ToLower(value)
	}
	var b strings.Builder
	for _, r := range value {
		if r == '\u0130' {
			b.WriteString("i\u0307")
			continue
		}
		b.WriteRune(unicode.ToLower(r))
	}
	return b.String()
}

func hasReservedWorkspaceIdentityToken(value string) bool {
	start := -1
	for i := 0; i <= len(value); i++ {
		if i < len(value) && (value[i] >= 'a' && value[i] <= 'z' || value[i] >= '0' && value[i] <= '9') {
			if start < 0 {
				start = i
			}
			continue
		}
		if start >= 0 {
			if _, ok := reservedWorkspaceIdentityTokens[value[start:i]]; ok {
				return true
			}
			start = -1
		}
	}
	return false
}

func isProfanityWordRune(r rune) bool {
	return unicode.IsLetter(r) || unicode.IsNumber(r) || unicode.IsMark(r)
}

func containsWorkspaceIdentityProfanity(text string) bool {
	prev := utf8.RuneError
	for p := 0; p < len(text); {
		if p == 0 || !isProfanityWordRune(prev) {
			for _, word := range workspaceIdentityProfaneWords {
				end, ok := foldPrefixEnd(text[p:], word)
				if !ok {
					continue
				}
				if next, _ := utf8.DecodeRuneInString(text[p+end:]); p+end == len(text) || !isProfanityWordRune(next) {
					return true
				}
			}
		}
		r, size := utf8.DecodeRuneInString(text[p:])
		prev = r
		p += size
	}
	return false
}

func foldPrefixEnd(text, word string) (int, bool) {
	i := 0
	for _, wr := range word {
		if i >= len(text) {
			return 0, false
		}
		tr, size := utf8.DecodeRuneInString(text[i:])
		if tr != wr && !runesEqualFold(tr, wr) {
			return 0, false
		}
		i += size
	}
	return i, true
}

func runesEqualFold(a, b rune) bool {
	for f := unicode.SimpleFold(a); f != a; f = unicode.SimpleFold(f) {
		if f == b {
			return true
		}
	}
	return false
}
