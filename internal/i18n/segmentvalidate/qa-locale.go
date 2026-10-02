package segmentvalidate

import (
	"slices"
	"strings"
	"unicode"
)

// This check compares digit values, not glyphs. Unsupported numeral systems are
// omitted so the check never claims a mismatch it cannot interpret.
var digitZeros = []rune{'0', 0x0660, 0x06f0, 0x0966, 0x09e6, 0x0a66, 0x0ae6, 0x0b66, 0x0be6, 0x0c66, 0x0ce6, 0x0d66, 0x0e50, 0x0ed0, 0x1040, 0xff10}

func numeralSequence(value string) ([]rune, bool) {
	out := []rune{}
	for _, r := range value {
		if !unicode.IsDigit(r) {
			continue
		}
		found := false
		for _, zero := range digitZeros {
			if r >= zero && r <= zero+9 {
				out = append(out, '0'+r-zero)
				found = true
				break
			}
		}
		if !found {
			return nil, false
		}
	}
	return out, true
}

func numberMismatchCheck(source, target string) (Check, bool) {
	if strings.TrimSpace(target) == "" {
		return Check{}, false
	}
	expected, sourceSupported := numeralSequence(source)
	actual, targetSupported := numeralSequence(target)
	if !sourceSupported || !targetSupported || slices.Equal(expected, actual) {
		return Check{}, false
	}
	return Check{
		ID: "qa-numbers-mismatch", Label: "Numbers", Status: StatusWarn,
		Message: "The numbers in the translation differ from the source.", Category: "qa",
	}, true
}

func equivalentTerminalPunctuation(r rune) rune {
	switch r {
	case '。', '｡':
		return '.'
	case '？', '؟':
		return '?'
	case '؛', ';':
		return ';'
	case '！':
		return '!'
	case '…':
		return '…'
	default:
		return r
	}
}

func terminalPunctuation(value string) rune {
	value = strings.TrimSpace(value)
	if value == "" {
		return 0
	}
	runes := []rune(value)
	last := equivalentTerminalPunctuation(runes[len(runes)-1])
	if strings.ContainsRune(".?!:;…", last) {
		return last
	}
	return 0
}

func punctuationMismatchCheck(source, target string) (Check, bool) {
	if strings.TrimSpace(target) == "" {
		return Check{}, false
	}
	expected, actual := terminalPunctuation(source), terminalPunctuation(target)
	if expected == 0 || expected == actual {
		return Check{}, false
	}
	return Check{
		ID: "qa-punctuation-mismatch", Label: "Punctuation", Status: StatusWarn,
		Message: "The ending punctuation differs from the source.", Category: "qa",
	}, true
}

func firstLetter(value string) rune {
	for _, r := range strings.TrimSpace(value) {
		if unicode.IsLetter(r) {
			return r
		}
	}
	return 0
}

func caseMismatchCheck(source, target, locale string) (Check, bool) {
	// This conservative rule applies only to languages with comparable Latin
	// sentence capitalization. Other scripts and Turkish/Azeri case conventions
	// need separate rules.
	language := strings.ToLower(strings.Split(strings.ReplaceAll(locale, "_", "-"), "-")[0])
	if !slices.Contains([]string{"en", "de", "es", "fr", "it", "nl", "pt", "sv", "no", "da"}, language) {
		return Check{}, false
	}
	firstSource, firstTarget := firstLetter(source), firstLetter(target)
	if firstSource == 0 || firstTarget == 0 || !unicode.In(firstSource, unicode.Latin) || !unicode.In(firstTarget, unicode.Latin) {
		return Check{}, false
	}
	if unicode.IsUpper(firstSource) == unicode.IsUpper(firstTarget) {
		return Check{}, false
	}
	return Check{
		ID: "qa-character-case-mismatch", Label: "Capitalization", Status: StatusWarn,
		Message: "The translation starts with different capitalization than the source.", Category: "qa",
	}, true
}
