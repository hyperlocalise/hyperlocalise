package segmentvalidate

import (
	"fmt"
	"sort"
	"strings"
	"unicode/utf8"
)

func validateProfileParity(source, translated string) error {
	if err := validateExtraPlaceholderParity(source, translated); err != nil {
		return err
	}
	if err := validateWhitespaceProfile(source, translated); err != nil {
		return err
	}
	return validateSpecialCharParity(source, translated)
}

var profileNBSPReplacer = strings.NewReplacer(
	"&nbsp;", "\u00a0",
	"&NBSP;", "\u00a0",
	"&Nbsp;", "\u00a0",
)

func normalizeProfileText(value string) string {
	if !strings.Contains(value, "&") {
		return value
	}
	return profileNBSPReplacer.Replace(value)
}

func validateWhitespaceProfile(source, translated string) error {
	sourceNorm := normalizeProfileText(source)
	targetNorm := normalizeProfileText(translated)

	sourceLeading, sourceTrailing := profileEdgeWhitespace(sourceNorm)
	targetLeading, targetTrailing := profileEdgeWhitespace(targetNorm)

	var parts []string
	if sourceLeading != targetLeading {
		parts = append(parts, "leading whitespace differs from source")
	}
	if sourceTrailing != targetTrailing {
		parts = append(parts, "trailing whitespace differs from source")
	}
	if countNBSP(sourceNorm) != countNBSP(targetNorm) {
		parts = append(parts, "non-breaking space count differs from source")
	}
	if len(parts) == 0 {
		return nil
	}

	return fmt.Errorf(
		"translation invariant violation: whitespace profile mismatch (%s) | %s",
		strings.Join(parts, "; "),
		formatInvariantDebugContext(source, translated),
	)
}

func profileEdgeWhitespace(value string) (leading, trailing string) {
	start := 0
	for start < len(value) {
		r, w := utf8.DecodeRuneInString(value[start:])
		if !isProfileEdgeWhitespace(r) {
			break
		}
		start += w
	}
	leading = value[:start]

	end := len(value)
	for end > start {
		r, w := utf8.DecodeLastRuneInString(value[start:end])
		if !isProfileEdgeWhitespace(r) {
			break
		}
		end -= w
	}
	trailing = value[end:]

	return leading, trailing
}

func isProfileEdgeWhitespace(r rune) bool {
	return r == '\u00a0' || r == ' ' || r == '\t' || r == '\r' || r == '\n'
}

func countNBSP(value string) int {
	return strings.Count(value, "\u00a0")
}

func validateSpecialCharParity(source, translated string) error {
	expected := extractSpecialCharLiterals(source)
	got := extractSpecialCharLiterals(translated)
	if stringSlicesEqual(expected, got) {
		return nil
	}
	return fmt.Errorf(
		"translation invariant violation: special character parity mismatch (expected %v, got %v) | %s",
		expected,
		got,
		formatInvariantDebugContext(source, translated),
	)
}

func extractSpecialCharLiterals(value string) []string {
	if value == "" {
		return nil
	}

	counts := make(map[string]int)
	for i := 0; i < len(value); {
		if value[i] != '\\' {
			i++
			continue
		}

		if token, width, ok := readSpecialCharLiteral(value, i); ok {
			counts[token]++
			i += width
			continue
		}
		i++
	}

	if len(counts) == 0 {
		return nil
	}

	out := make([]string, 0, len(counts))
	for token, count := range counts {
		for range count {
			out = append(out, token)
		}
	}
	sort.Strings(out)
	return out
}

func readSpecialCharLiteral(value string, start int) (token string, width int, ok bool) {
	if start >= len(value) || value[start] != '\\' {
		return "", 0, false
	}

	switch {
	case strings.HasPrefix(value[start:], `\r\n`):
		return `\r\n`, 4, true
	case strings.HasPrefix(value[start:], `\r`):
		return `\r`, 2, true
	case strings.HasPrefix(value[start:], `\n`):
		return `\n`, 2, true
	case strings.HasPrefix(value[start:], `\t`):
		return `\t`, 2, true
	}

	if strings.HasPrefix(value[start:], `\u`) || strings.HasPrefix(value[start:], `\U`) {
		prefixLen := 2
		hexLen := 4
		if value[start+1] == 'U' {
			hexLen = 8
		}
		if start+prefixLen+hexLen > len(value) {
			return "", 0, false
		}
		hex := value[start+prefixLen : start+prefixLen+hexLen]
		if !isHexDigits(hex) {
			return "", 0, false
		}
		return value[start : start+prefixLen+hexLen], prefixLen + hexLen, true
	}

	if strings.HasPrefix(value[start:], `\x`) {
		end := start + 2
		for end < len(value) && end < start+4 && isHexByte(value[end]) {
			end++
		}
		if end == start+2 {
			return "", 0, false
		}
		return value[start:end], end - start, true
	}

	return "", 0, false
}

func isHexDigits(value string) bool {
	for i := 0; i < len(value); {
		r, w := utf8.DecodeRuneInString(value[i:])
		if (r < '0' || r > '9') && (r < 'a' || r > 'f') && (r < 'A' || r > 'F') {
			return false
		}
		i += w
	}
	return len(value) > 0
}

func isHexByte(b byte) bool {
	return (b >= '0' && b <= '9') || (b >= 'a' && b <= 'f') || (b >= 'A' && b <= 'F')
}

// profileHasFormatTokens reports whether the segment contains profile-managed tokens.
func profileHasFormatTokens(source string) bool {
	return len(extractExtraPlaceholders(source)) > 0 ||
		len(extractSpecialCharLiterals(source)) > 0 ||
		hasProfileWhitespaceSignals(source)
}

func hasProfileWhitespaceSignals(source string) bool {
	normalized := normalizeProfileText(source)
	leading, trailing := profileEdgeWhitespace(normalized)
	return leading != "" || trailing != "" || countNBSP(normalized) > 0
}
